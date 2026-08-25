/**
 * Server AI helper — ใช้ซ้ำระหว่าง /api/steps/image-analyze และ /api/steps/batch-upload
 * วิเคราะห์ภาพก้าวเดิน: อ่าน Steps + วันที่ในภาพ + ความมั่นใจ + alertReasons
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'stealth/ox-alpha';
const OPENROUTER_MODEL_2 = process.env.OPENROUTER_MODEL_2 || 'google/gemma-4-26b-a4b-it:free';
const MIN_CONFIDENCE = 0.8;
const MAX_REASONABLE_STEPS = 200000;

async function callOpenRouterWithModel(prompt: string, data: string, mime: string, model: string): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : 'https://lpwellbeing2569.vercel.app',
      'X-Title': 'LPWellbeing Steps',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } }] }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${model} error: ${res.status} ${t.slice(0,300)}`);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content || '';
}
async function callOpenRouter(prompt: string, data: string, mime: string): Promise<string> {
  try { return await callOpenRouterWithModel(prompt, data, mime, OPENROUTER_MODEL); } catch (e) {
    const msg = String(e);
    if ((msg.includes('429')||msg.includes('500')) && OPENROUTER_MODEL_2 && OPENROUTER_MODEL_2!==OPENROUTER_MODEL) {
      return await callOpenRouterWithModel(prompt, data, mime, OPENROUTER_MODEL_2);
    }
    throw e;
  }
}
async function callGemini(prompt: string, data: string, mime: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data } }] }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  if (!res.ok) { const t = await res.text().catch(()=> ''); const e:any = new Error(`Gemini ${res.status} ${t.slice(0,300)}`); e.status=res.status; throw e; }
  const j = await res.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
function extractBase64(imageBase64: string): { data: string; mime: string } {
  const m = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { data: m[2], mime: m[1] };
  return { data: imageBase64, mime: 'image/jpeg' };
}
function parseJson(text: string) {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const brace = s.match(/\{[\s\S]*\}/);
  if (brace) s = brace[0];
  try {
    const p = JSON.parse(s);
    return { steps: typeof p.steps==='number'? p.steps : p.steps!=null? Number(p.steps): null, dateInImage: p.dateInImage? String(p.dateInImage): null, dateRaw: p.dateRaw? String(p.dateRaw): null, dateMatch: typeof p.dateMatch==='boolean'? p.dateMatch: null, confidence: typeof p.confidence==='number'? p.confidence: Number(p.confidence)||0, notes: p.notes? String(p.notes): '' };
  } catch { return { steps: null, dateInImage:null, dateRaw:null, dateMatch:null, confidence:0, notes: text.slice(0,200)}; }
}

export interface AiResult {
  steps: number|null; dateInImage: string|null; dateRaw: string|null; dateMatch: boolean|null; confidence: number; notes: string; alert: boolean; alertReasons: string[]; provider: 'gemini'|'openrouter'; model: string;
}

export async function analyzeStepsImage(imageBase64: string, expectedDate: string, preferredProvider: string = 'auto'): Promise<AiResult> {
  const { data, mime } = extractBase64(imageBase64);
  const prompt = `คุณคือผู้ช่วยอ่านภาพสำหรับโครงการ "นับก้าวเดิน" วิเคราะห์ภาพแคปหน้าจอแอปนับก้าวแล้วตอบเป็น JSON เท่านั้น\nโจทย์:\n1. อ่านจำนวนก้าวทั้งหมด (total steps) ที่แสดงในภาพ\n2. หาวันที่ที่แสดงในภาพ แปลงเป็น ISO yyyy-MM-dd (ค.ศ.) ถ้าไม่มีให้ null\n3. วันที่ในภาพตรงกับ "${expectedDate}" หรือไม่\n4. ให้คะแนนความมั่นใจ 0.0-1.0\nตอบเฉพาะ JSON: {"steps": <int|null>, "dateInImage": "<yyyy-MM-dd|null>", "dateRaw": "<string|null>", "dateMatch": <true|false|null>, "confidence": <0-1>, "notes": "<ไทย>"}`;
  const hint = preferredProvider.toLowerCase();
  let text=''; let finalProvider:'gemini'|'openrouter'='gemini'; let finalModel=GEMINI_MODEL; let usedFallback=false;
  async function route(){
    if(hint==='auto'||hint===''){
      if(!GEMINI_API_KEY && OPENROUTER_API_KEY){ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; return; }
      try{ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; } catch(e:any){ if(e?.status===429 && OPENROUTER_API_KEY){ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; } else throw e; }
      return;
    }
    if(hint==='gemini'){ try{ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; } catch(e:any){ if((e?.status===429||e?.status===500)&&OPENROUTER_API_KEY){ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; } else throw e; } return; }
    if(hint==='openrouter'){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; } catch(e:any){ const msg=String(e); if((msg.includes('429')||msg.includes('500'))&&OPENROUTER_MODEL_2){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL_2); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL_2; usedFallback=true; return; }catch{}} if(GEMINI_API_KEY){ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; usedFallback=true; } else throw e; } return; }
    if(hint==='openrouter2'||hint==='gemma'){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL_2); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL_2; } catch(e:any){ if(GEMINI_API_KEY){ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; usedFallback=true; } else throw e; } return; }
    try{ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; } catch{ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; }
  }
  await route();
  const parsed = parseJson(text);
  if(usedFallback) parsed.notes = `[fallback:${finalModel}] ` + (parsed.notes||'');
  const alertReasons:string[]=[];
  const steps=parsed.steps;
  if(steps===null||Number.isNaN(steps)) alertReasons.push('อ่านจำนวนก้าวจากภาพไม่ได้');
  else if(steps<=0) alertReasons.push('จำนวนก้าวไม่สมเหตุสมผล');
  else if(steps>MAX_REASONABLE_STEPS) alertReasons.push(`จำนวนก้าวสูงผิดปกติ (${steps.toLocaleString()})`);
  if(parsed.dateMatch===false) alertReasons.push('วันที่ในภาพไม่ตรงกับวันที่บันทึก');
  else if(parsed.dateMatch===null) alertReasons.push('ไม่พบวันที่ในภาพ / อ่านวันที่ไม่ชัดเจน');
  const conf = typeof parsed.confidence==='number'? parsed.confidence:0;
  if(conf<MIN_CONFIDENCE) alertReasons.push(`AI อ่านไม่ชัดเจน (ความมั่นใจ ${Math.round(conf*100)}%)`);
  return { steps: steps??null, dateInImage: parsed.dateInImage, dateRaw: parsed.dateRaw, dateMatch: parsed.dateMatch, confidence: conf, notes: parsed.notes||'', alert: alertReasons.length>0, alertReasons, provider: finalProvider, model: finalModel };
}
