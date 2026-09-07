/**
 * Server AI helper — ใช้ซ้ำระหว่าง /api/steps/image-analyze และ /api/steps/batch-upload
 * วิเคราะห์ภาพก้าวเดิน: อ่าน Steps + วันที่ในภาพ + ความมั่นใจ + alertReasons
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
function isGeminiKeyValid(): boolean {
  const k = GEMINI_API_KEY.trim();
  return k.startsWith('AIza') && k.length > 30;
}
const HAS_VALID_GEMINI = isGeminiKeyValid();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free';
const OPENROUTER_MODEL_2 = process.env.OPENROUTER_MODEL_2 || 'google/gemma-3-27b-it:free';
const OPENROUTER_MODEL_3 = process.env.OPENROUTER_MODEL_3 || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
const MIN_CONFIDENCE = 0.8;
const MAX_REASONABLE_STEPS = 200000;

async function callOpenRouterWithModel(prompt: string, data: string, mime: string, model: string): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');
  const isNemotron = model.includes('nemotron');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : 'https://lpwellbeing2569.vercel.app',
      'X-Title': 'LPWellbeing Steps',
    },
    // เพิ่ม timeout กัน abort เร็ว — free model ช้า 20-30s ได้, Nemotron reasoning ช้าสุด
    signal: AbortSignal.timeout(isNemotron ? 45000 : 30000),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } }] }],
      response_format: { type: 'json_object' },
      max_tokens: isNemotron ? 1024 : 2048,
      ...(isNemotron ? { reasoning: { effort: 'low' } } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${model} error: ${res.status} ${t.slice(0,500)}`);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content || '';
}
function isRetryableOpenRouterError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('402')||m.includes('404')||m.includes('429')||m.includes('500')||m.includes('502')||m.includes('503')||m.includes('aborted')||m.includes('timeout')||m.includes('timed out')||m.includes('aborterror');
}
async function callOpenRouter(prompt: string, data: string, mime: string): Promise<string> {
  try { return await callOpenRouterWithModel(prompt, data, mime, OPENROUTER_MODEL); } catch (e) {
    const msg = String(e);
    if (isRetryableOpenRouterError(msg) && OPENROUTER_MODEL_2 && OPENROUTER_MODEL_2!==OPENROUTER_MODEL) {
      try { return await callOpenRouterWithModel(prompt, data, mime, OPENROUTER_MODEL_2); } catch (e2) {
        const msg2 = String(e2);
        if (isRetryableOpenRouterError(msg2) && OPENROUTER_MODEL_3 && OPENROUTER_MODEL_3!==OPENROUTER_MODEL && OPENROUTER_MODEL_3!==OPENROUTER_MODEL_2) {
          return await callOpenRouterWithModel(prompt, data, mime, OPENROUTER_MODEL_3);
        }
        throw e2;
      }
    }
    if (isRetryableOpenRouterError(msg) && OPENROUTER_MODEL_3 && OPENROUTER_MODEL_3!==OPENROUTER_MODEL) {
      return await callOpenRouterWithModel(prompt, data, mime, OPENROUTER_MODEL_3);
    }
    throw e;
  }
}
async function callGemini(prompt: string, data: string, mime: string): Promise<string> {
  if (!GEMINI_API_KEY || !HAS_VALID_GEMINI) throw new Error('GEMINI_API_KEY not configured or invalid');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
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

export const AUTO_APPROVE_CONFIDENCE = 0.8;
export function isAutoApprovable(aiSteps: number | null, formSteps: number, dateMatch: boolean | null, confidence: number): boolean {
  if (aiSteps == null || Number.isNaN(aiSteps)) return false;
  if (aiSteps !== Number(formSteps)) return false;
  if (dateMatch !== true) return false;
  if (confidence < AUTO_APPROVE_CONFIDENCE) return false;
  return true;
}

export async function analyzeStepsImage(imageBase64: string, expectedDate: string, preferredProvider: string = 'auto'): Promise<AiResult> {
  const { data, mime } = extractBase64(imageBase64);
  const currentYear = new Date().getFullYear(); // ค.ศ. ปัจจุบัน
  const currentYearBE = currentYear + 543;
  const prompt = `คุณคือผู้ช่วยตรวจสอบภาพสำหรับโครงการ "นับก้าวเดิน" วิเคราะห์ภาพแคปหน้าจอแอปนับก้าวแล้วตอบเป็น JSON เท่านั้น\nโจทย์:\n1. อ่านจำนวนก้าวทั้งหมด (total steps) ที่แสดงในภาพ — ดูตัวเลขที่ใหญ่/เด่นที่สุดที่ระบุจำนวนก้าว ต้องอ่านเป็นจำนวนเต็มตรงตัว อย่าปัดเศษ\n2. หาวันที่ที่แสดงในภาพ แปลงเป็น ISO yyyy-MM-dd (ค.ศ.) ถ้าไม่มีให้ null — รองรับรูปแบบ "31 Jul", "07/31/2026", "31 ก.ค. 2569" ฯลฯ\n   กติกาเรื่องปี: แอปส่วนใหญ่ไม่แสดงปีถ้าเป็นปีปัจจุบัน — ถ้าเห็นเฉพาะวัน+เดือน (เช่น "15 ส.ค.", "Aug 15", "31 Jul") โดยไม่มีเลขปี ให้ถือว่าเป็นปีปัจจุบัน ${currentYear} (ค.ศ.) / ${currentYearBE} (พ.ศ.) แล้วแปลงเป็น ${currentYear}-MM-dd\n   ถ้าเห็นเลขปี ให้เทียบ พ.ศ./ค.ศ.: ถ้าปี >= 2400 ให้ถือเป็น พ.ศ. ลบ 543 เป็น ค.ศ. (เช่น 2569 → 2026) ถ้าปี < 2400 ถือเป็น ค.ศ. ตรงๆ\n3. วันที่ในภาพตรงกับ "${expectedDate}" (yyyy-MM-dd) หรือไม่ — ต้องตรง 100% จึง dateMatch=true (เทียบแบบปี ค.ศ. แล้ว)\n4. ตรวจสอบความผิดปกติ: ภาพตัดต่อ/แก้ไขตัวเลข/ซ้อนฟอนต์แปลก/ขอบเบลอ/เงาซ้ำ/ตัวเลขไม่ตรงฟอนต์ระบบ — ถ้าสงสัยให้ระบุใน notes และลด confidence เหลือ 0.3-0.6\n5. ให้คะแนนความมั่นใจ 0.0-1.0 — 1.0=มั่นใจสูงมาก ตัวเลข+วันที่ชัดเจนตรงกัน, <0.8=มีข้อสงสัยเล็กน้อย\nตอบเฉพาะ JSON: {"steps": <int|null>, "dateInImage": "<yyyy-MM-dd|null>", "dateRaw": "<string|null>", "dateMatch": <true|false|null>, "confidence": <0-1>, "notes": "<ไทย สั้นๆ ระบุสิ่งที่เห็นและข้อสงสัย>"} \nกติกา Auto-Approve: ถ้าตัวเลขชัดและวันที่ตรงกัน 100% และไม่มีร่องรอยตัดต่อ ให้ confidence >=0.9 และ notes ระบุว่า "ชัดเจน ตรงกัน — พร้อมอนุมัติอัตโนมัติ"; ถ้ามีข้อสงสัยใดๆ ให้ confidence <0.8 พร้อมเหตุผลใน notes เพื่อส่งตรวจมือ`;
  const hint = preferredProvider.toLowerCase();
  let text=''; let finalProvider:'gemini'|'openrouter'='gemini'; let finalModel=GEMINI_MODEL; let usedFallback=false;
  async function route(){
    if(hint==='auto'||hint===''){
      if(!HAS_VALID_GEMINI && OPENROUTER_API_KEY){ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; return; }
      if(!HAS_VALID_GEMINI){ throw new Error('GEMINI_API_KEY invalid and no OpenRouter key'); }
      try{ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; } catch(e:any){ const s=e?.status||0; const em=String(e).toLowerCase(); if(((s===402||s===404||s===429||s===500||s===502||s===503) || isRetryableOpenRouterError(em)) && OPENROUTER_API_KEY){ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; } else throw e; }
      return;
    }
    if(hint==='gemini'){ 
      if(!HAS_VALID_GEMINI && OPENROUTER_API_KEY){ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; return; }
      try{ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; } catch(e:any){ const s=e?.status||0; const em=String(e).toLowerCase(); if(((s===402||s===404||s===429||s===500||s===502||s===503) || isRetryableOpenRouterError(em))&&OPENROUTER_API_KEY){ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; } else throw e; } return; }
    if(hint==='openrouter'){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; } catch(e:any){ const msg=String(e); if(isRetryableOpenRouterError(msg)&&OPENROUTER_MODEL_2){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL_2); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL_2; usedFallback=true; return; }catch(e2:any){ const m2=String(e2); if(isRetryableOpenRouterError(m2)&&OPENROUTER_MODEL_3){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL_3); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL_3; usedFallback=true; return; }catch{}} }} if(isRetryableOpenRouterError(msg)&&OPENROUTER_MODEL_3){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL_3); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL_3; usedFallback=true; return; }catch{}} if(HAS_VALID_GEMINI){ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; usedFallback=true; } else throw e; } return; }
    if(hint==='openrouter2'||hint==='gemma'){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL_2); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL_2; } catch(e:any){ const m=String(e); if(isRetryableOpenRouterError(m)&&OPENROUTER_MODEL_3){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL_3); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL_3; usedFallback=true; return; }catch{}} if(HAS_VALID_GEMINI){ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; usedFallback=true; } else throw e; } return; }
    if(hint==='openrouter3'||hint==='nemotron'){ try{ text=await callOpenRouterWithModel(prompt,data,mime,OPENROUTER_MODEL_3); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL_3; } catch(e:any){ if(HAS_VALID_GEMINI){ text=await callGemini(prompt,data,mime); finalProvider='gemini'; finalModel=GEMINI_MODEL; usedFallback=true; } else throw e; } return; }
    if(!HAS_VALID_GEMINI){ text=await callOpenRouter(prompt,data,mime); finalProvider='openrouter'; finalModel=OPENROUTER_MODEL; usedFallback=true; return; }
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
