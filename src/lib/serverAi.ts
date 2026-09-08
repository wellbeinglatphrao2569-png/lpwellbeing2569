/**
 * Server AI helper — Typhoon OCR เดี่ยว (ฟรี)
 * วิเคราะห์ภาพก้าวเดิน: อ่าน Steps + วันที่ในภาพ + ความมั่นใจ + alertReasons
 * ใช้ api.opentyphoon.ai/v1/chat/completions model typhoon-ocr (fallback preview)
 */
const TYPHOON_API_KEY = process.env.TYPHOON_API_KEY || process.env.TYPHOON_OCR_API_KEY || '';
const TYPHOON_MODEL = process.env.TYPHOON_OCR_MODEL || 'typhoon-ocr';
const TYPHOON_MODEL_FALLBACK = process.env.TYPHOON_OCR_MODEL_FALLBACK || 'typhoon-ocr-preview';
const MIN_CONFIDENCE = 0.8;
const MAX_REASONABLE_STEPS = 200000;

function isRetryableTyphoon(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('429')||m.includes('500')||m.includes('502')||m.includes('503')||m.includes('404')||m.includes('aborted')||m.includes('timeout')||m.includes('timed out')||m.includes('aborterror');
}

async function callTyphoonOCRWithModel(prompt: string, data: string, mime: string, model: string): Promise<string> {
  if (!TYPHOON_API_KEY) throw new Error('TYPHOON_API_KEY not configured');
  const res = await fetch('https://api.opentyphoon.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TYPHOON_API_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } }] }],
      max_tokens: 2048,
      temperature: 0.1,
      top_p: 0.6,
      repetition_penalty: 1.2,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Typhoon ${model} error: ${res.status} ${t.slice(0,500)}`);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content || '';
}

async function callTyphoonOCR(prompt: string, data: string, mime: string): Promise<string> {
  try {
    return await callTyphoonOCRWithModel(prompt, data, mime, TYPHOON_MODEL);
  } catch (e) {
    const msg = String(e);
    if (isRetryableTyphoon(msg) && TYPHOON_MODEL_FALLBACK && TYPHOON_MODEL_FALLBACK !== TYPHOON_MODEL) {
      return await callTyphoonOCRWithModel(prompt, data, mime, TYPHOON_MODEL_FALLBACK);
    }
    throw e;
  }
}

function extractBase64(imageBase64: string): { data: string; mime: string } {
  const m = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { data: m[2], mime: m[1] };
  return { data: imageBase64, mime: 'image/jpeg' };
}
function parseJson(text: string) {
  let s = text.trim();
  // Typhoon OCR v1.5 อาจคืน {natural_text: "markdown"} ให้ดึงออกก่อน
  try {
    const j = JSON.parse(s);
    if (j && typeof j.natural_text === 'string') s = j.natural_text;
    else if (j && typeof j.steps !== 'undefined') {
      // already JSON like {steps,...}
      return { steps: typeof j.steps==='number'? j.steps : j.steps!=null? Number(j.steps): null, dateInImage: j.dateInImage? String(j.dateInImage): null, dateRaw: j.dateRaw? String(j.dateRaw): null, dateMatch: typeof j.dateMatch==='boolean'? j.dateMatch: null, confidence: typeof j.confidence==='number'? j.confidence: Number(j.confidence)||0, notes: j.notes? String(j.notes): '' };
    }
  } catch {}
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const brace = s.match(/\{[\s\S]*\}/);
  if (brace) s = brace[0];
  try {
    const p = JSON.parse(s);
    return { steps: typeof p.steps==='number'? p.steps : p.steps!=null? Number(p.steps): null, dateInImage: p.dateInImage? String(p.dateInImage): null, dateRaw: p.dateRaw? String(p.dateRaw): null, dateMatch: typeof p.dateMatch==='boolean'? p.dateMatch: null, confidence: typeof p.confidence==='number'? p.confidence: Number(p.confidence)||0, notes: p.notes? String(p.notes): '' };
  } catch { return { steps: null, dateInImage:null, dateRaw:null, dateMatch:null, confidence:0, notes: s.slice(0,300)}; }
}
function extractStepsFromOcrText(text: string): number | null {
  const cleaned = text.replace(/<[^>]*>/g, ' ');
  // หาเลขใกล้คำว่า ก้าว/steps
  const nearStepRegex = /(\d{1,3}(?:,\d{3})*|\d{3,6})\s*(?:ก้าว|steps?|เดิน)/gi;
  let m; const candidates: number[] = [];
  while ((m = nearStepRegex.exec(cleaned)) !== null) {
    const n = Number(m[1].replace(/,/g, ''));
    if (n > 0 && n <= 200000) candidates.push(n);
  }
  if (candidates.length > 0) return Math.max(...candidates);
  // fallback: เลขใหญ่สุดที่ไม่ใช่ปี
  const allNums = [...cleaned.matchAll(/\b\d{1,3}(?:,\d{3})*\b|\b\d{3,6}\b/g)].map(x=> Number(x[0].replace(/,/g,''))).filter(n=> n>0 && n<=200000 && n!==2026 && n!==2569 && n!==2025 && n!==2568);
  if (allNums.length>0) return Math.max(...allNums);
  return null;
}
function extractDateFromOcrText(text: string, expectedDate: string): { dateInImage: string|null, dateRaw: string|null, dateMatch: boolean|null } {
  const lower = text.toLowerCase();
  // TODAY/Yesterday -> ไม่มีวันที่
  if (/\b(today|yesterday)\b/.test(lower) || text.includes('เมื่อวาน') || /\bวันนี้\b/.test(text)) {
    const raw = lower.includes('yesterday') || text.includes('เมื่อวาน') ? 'Yesterday' : 'TODAY';
    return { dateInImage: null, dateRaw: raw, dateMatch: null };
  }
  const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const thaiMonthMap: Record<string,number> = {'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12,'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9,'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12};
  // ลองหาไทย "31 ส.ค. 2569" หรือ "31 ส.ค."
  let dateRaw: string|null = null; let dateInImage: string|null = null;
  const thaiRegex = /(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{4})?/g;
  let tm;
  while ((tm = thaiRegex.exec(text)) !== null) {
    const d = Number(tm[1]); const mName = tm[2]; const yRaw = tm[3] ? Number(tm[3]) : null;
    const month = thaiMonthMap[mName]; if (!month) continue;
    let year = new Date().getFullYear();
    if (yRaw) { year = yRaw >= 2400 ? yRaw - 543 : yRaw; dateRaw = `${d} ${mName} ${tm[3]}`; } else { dateRaw = `${d} ${mName}`; }
    dateInImage = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    break;
  }
  if (!dateInImage) {
    const engRegex = /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*(\d{4})?/gi;
    let em;
    while ((em = engRegex.exec(text)) !== null) {
      const d = Number(em[1]); const monStr = em[2].toLowerCase(); const yRaw = em[3] ? Number(em[3]) : null;
      const map: Record<string,number> = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
      const month = map[monStr.slice(0,3)]; if(!month) continue;
      let year = new Date().getFullYear();
      if (yRaw) { year = yRaw >= 2400 ? yRaw-543 : yRaw; dateRaw = em[0]; } else { dateRaw = `${em[1]} ${em[2]}`; }
      dateInImage = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      break;
    }
  }
  if (!dateInImage) {
    const slashRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
    let sm;
    while ((sm = slashRegex.exec(text)) !== null) {
      let d = Number(sm[1]); let m = Number(sm[2]); let y = Number(sm[3]);
      // รองรับ mm/dd/yyyy vs dd/mm/yyyy — ลองเดาแบบ dd/mm
      if (m>12 && d<=12) { const tmp=d; d=m; m=tmp; }
      if (y >= 2400) y-=543;
      if (m>=1 && m<=12 && d>=1 && d<=31) {
        dateRaw = sm[0]; dateInImage = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        break;
      }
    }
  }
  if (!dateInImage) return { dateInImage: null, dateRaw: dateRaw, dateMatch: null };
  const dateMatch = dateInImage === expectedDate;
  return { dateInImage, dateRaw: dateRaw || dateInImage, dateMatch };
}

export interface AiResult {
  steps: number|null; dateInImage: string|null; dateRaw: string|null; dateMatch: boolean|null; confidence: number; notes: string; alert: boolean; alertReasons: string[]; provider: 'typhoon'; model: string;
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
  const currentYear = new Date().getFullYear();
  const currentYearBE = currentYear + 543;
  const prompt = `คุณคือผู้ช่วยตรวจสอบภาพสำหรับโครงการ "นับก้าวเดิน" วิเคราะห์ภาพแคปหน้าจอแอปนับก้าวอย่างละเอียด ใช้เวลาตรวจสอบอย่างรอบคอบ แล้วตอบเป็น JSON เท่านั้น\nโจทย์:\n1. อ่านจำนวนก้าวทั้งหมด (total steps) ที่แสดงในภาพอย่างละเอียด — ดูตัวเลขที่ใหญ่/เด่นที่สุดที่ระบุจำนวนก้าว แยกแยะระหว่างก้าวรวมทั้งวัน vs ก้าวเป้าหมาย/เฉลี่ย ต้องอ่านเป็นจำนวนเต็มตรงตัว อย่าปัดเศษ ตรวจตัวเลขไทย-อารบิกและเครื่องหมายจุลภาคให้ครบ\n2. หาวันที่ที่แสดงในภาพ แปลงเป็น ISO yyyy-MM-dd (ค.ศ.) อย่างระมัดระวัง — รองรับรูปแบบ "31 Jul", "07/31/2026", "31 ก.ค. 2569" ฯลฯ\n   กติกาเรื่องปี: แอปส่วนใหญ่ไม่แสดงปีถ้าเป็นปีปัจจุบัน — ถ้าเห็นเฉพาะวัน+เดือน (เช่น "15 ส.ค.", "Aug 15", "31 Jul") โดยไม่มีเลขปี ให้ถือว่าเป็นปีปัจจุบัน ${currentYear} (ค.ศ.) / ${currentYearBE} (พ.ศ.) แล้วแปลงเป็น ${currentYear}-MM-dd\n   ถ้าเห็นเลขปี ให้เทียบ พ.ศ./ค.ศ.: ถ้าปี >= 2400 ให้ถือเป็น พ.ศ. ลบ 543 เป็น ค.ศ. (เช่น 2569 → 2026) ถ้าปี < 2400 ถือเป็น ค.ศ. ตรงๆ\n   กติกา TODAY/Yesterday: ถ้าภาพแสดงคำว่า TODAY, Today, YESTERDAY, Yesterday, เมื่อวาน, เมื่อวานนี้, วันนี้, Today/Yesterday (relative date) โดยไม่มีวันที่แบบระบุวันเดือนปีที่ชัดเจน ให้ถือว่าไม่มีวันที่ (dateInImage=null, dateRaw="TODAY"/"Yesterday"/คำที่เห็น, dateMatch=null) และลด confidence เหลือ 0.4-0.6 พร้อมระบุใน notes ว่า "พบคำว่า TODAY/Yesterday — ไม่มีวันที่ชัดเจน รอเจ้าหน้าที่ นสส. ต่างฝ่ายตรวจสอบ"\n3. วันที่ในภาพตรงกับ "${expectedDate}" (yyyy-MM-dd) หรือไม่ — ต้องตรง 100% จึง dateMatch=true (เทียบแบบปี ค.ศ. แล้ว) ถ้าเป็น TODAY/Yesterday ให้ dateMatch=null เสมอ\n4. ตรวจสอบความผิดปกติ: ภาพตัดต่อ/แก้ไขตัวเลข/ซ้อนฟอนต์แปลก/ขอบเบลอ/เงาซ้ำ/ตัวเลขไม่ตรงฟอนต์ระบบ — ถ้าสงสัยให้ระบุใน notes และลด confidence เหลือ 0.3-0.6\n5. ให้คะแนนความมั่นใจ 0.0-1.0 — 1.0=มั่นใจสูงมาก ตัวเลข+วันที่ชัดเจนตรงกัน, <0.8=มีข้อสงสัยเล็กน้อย ถ้าเป็น TODAY/Yesterday หรืออ่านวันที่ไม่ได้ให้ confidence 0.4-0.6\nตอบเฉพาะ JSON: {"steps": <int|null>, "dateInImage": "<yyyy-MM-dd|null>", "dateRaw": "<string|null>", "dateMatch": <true|false|null>, "confidence": <0-1>, "notes": "<ไทย สั้นๆ ระบุสิ่งที่เห็นและข้อสงสัย>"} \nกติกา Auto-Approve: ถ้าตัวเลขชัดและวันที่ตรงกัน 100% และไม่มีร่องรอยตัดต่อ ให้ confidence >=0.9 และ notes ระบุว่า "ชัดเจน ตรงกัน — พร้อมอนุมัติอัตโนมัติ"; ถ้ามีข้อสงสัยใดๆ หรือเป็น TODAY/Yesterday ให้ confidence <0.8 พร้อมเหตุผลใน notes เพื่อส่งตรวจมือ`;
  const hint = preferredProvider.toLowerCase();
  let text = '';
  let finalModel = TYPHOON_MODEL;
  let usedFallback = false;

  // Typhoon เดี่ยว — ทุก hint วิ่งบน Typhoon OCR (fallback preview ถ้า 429/timeout)
  if (hint === 'typhoon-ocr-preview' || hint === 'preview') {
    try {
      text = await callTyphoonOCRWithModel(prompt, data, mime, TYPHOON_MODEL_FALLBACK);
      finalModel = TYPHOON_MODEL_FALLBACK;
    } catch (e) {
      text = await callTyphoonOCRWithModel(prompt, data, mime, TYPHOON_MODEL);
      finalModel = TYPHOON_MODEL;
      usedFallback = true;
    }
  } else {
    try {
      text = await callTyphoonOCR(prompt, data, mime);
      finalModel = TYPHOON_MODEL;
      // ถ้าได้ข้อความแต่ไม่ใช่ JSON ให้ลอง fallback เผื่อโมเดลรองให้ผลดีกว่า
      if (!text || !text.includes('steps')) {
        // still accept, parse will handle
      }
    } catch (e: any) {
      // auto fallback already handled in callTyphoonOCR, if still fail try preview directly
      const msg = String(e);
      if (isRetryableTyphoon(msg) && TYPHOON_MODEL_FALLBACK !== TYPHOON_MODEL) {
        text = await callTyphoonOCRWithModel(prompt, data, mime, TYPHOON_MODEL_FALLBACK);
        finalModel = TYPHOON_MODEL_FALLBACK;
        usedFallback = true;
      } else throw e;
    }
  }

  let parsed = parseJson(text);
  if (usedFallback) parsed.notes = `[fallback:${finalModel}] ` + (parsed.notes||'');
  // Fallback: ถ้า Typhoon คืน markdown (natural_text) ไม่ใช่ JSON ให้ดึงก้าว/วันที่จาก OCR text โดยตรง
  if ((parsed.steps === null || parsed.dateInImage === null) && text) {
    let ocrText = text;
    try { const j = JSON.parse(text); if (j && typeof j.natural_text === 'string') ocrText = j.natural_text; } catch {}
    const clean = ocrText.replace(/```/g, '');
    if (parsed.steps === null) {
      const s = extractStepsFromOcrText(clean);
      if (s !== null) { parsed.steps = s; parsed.notes = (parsed.notes ? parsed.notes + ' | ' : '') + `OCR ดึงก้าว ${s.toLocaleString()} จากข้อความ`; if (parsed.confidence === 0) parsed.confidence = 0.65; }
    }
    if (parsed.dateInImage === null) {
      const d = extractDateFromOcrText(clean, expectedDate);
      if (d.dateRaw) {
        parsed.dateInImage = d.dateInImage;
        parsed.dateRaw = d.dateRaw;
        parsed.dateMatch = d.dateMatch;
        if (d.dateMatch === null && d.dateRaw && /today|yesterday|เมื่อวาน|วันนี้/i.test(d.dateRaw)) {
          parsed.notes = (parsed.notes ? parsed.notes + ' | ' : '') + 'พบคำว่า TODAY/Yesterday — ไม่มีวันที่ชัดเจน รอเจ้าหน้าที่ นสส. ต่างฝ่ายตรวจสอบ';
          if (parsed.confidence === 0 || parsed.confidence > 0.6) parsed.confidence = 0.5;
        } else if (d.dateInImage && parsed.confidence === 0) parsed.confidence = 0.65;
      }
    }
  }
  const alertReasons: string[] = [];
  const steps = parsed.steps;
  if (steps === null || Number.isNaN(steps)) alertReasons.push('อ่านจำนวนก้าวจากภาพไม่ได้');
  else if (steps <= 0) alertReasons.push('จำนวนก้าวไม่สมเหตุสมผล');
  else if (steps > MAX_REASONABLE_STEPS) alertReasons.push(`จำนวนก้าวสูงผิดปกติ (${steps.toLocaleString()})`);
  if (parsed.dateMatch === false) alertReasons.push('วันที่ในภาพไม่ตรงกับวันที่บันทึก');
  else if (parsed.dateMatch === null) alertReasons.push('ไม่พบวันที่ในภาพ / อ่านวันที่ไม่ชัดเจน');
  const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  if (conf < MIN_CONFIDENCE) alertReasons.push(`AI อ่านไม่ชัดเจน (ความมั่นใจ ${Math.round(conf * 100)}%)`);
  return { steps: steps ?? null, dateInImage: parsed.dateInImage, dateRaw: parsed.dateRaw, dateMatch: parsed.dateMatch, confidence: conf, notes: parsed.notes || '', alert: alertReasons.length > 0, alertReasons, provider: 'typhoon', model: finalModel };
}
