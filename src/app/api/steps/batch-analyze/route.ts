/**
 * AI — อ่านจำนวนก้าวจากภาพแบบกลุ่ม (Batch) ใช้ Typhoon OCR เดี่ยว
 * POST /api/steps/batch-analyze
 * Body: { images: [{ imageBase64, expectedDate, preferredProvider?: "typhoon"|"auto", preferredModel?: string }] }
 */
import { NextRequest, NextResponse } from 'next/server';

const TYPHOON_API_KEY = process.env.TYPHOON_API_KEY || process.env.TYPHOON_OCR_API_KEY || '';
const TYPHOON_MODEL = process.env.TYPHOON_OCR_MODEL || 'typhoon-ocr';
const TYPHOON_MODEL_FALLBACK = process.env.TYPHOON_OCR_MODEL_FALLBACK || 'typhoon-ocr-preview';
const MIN_CONFIDENCE = 0.8;
const MAX_REASONABLE_STEPS = 200000;
const MAX_IMAGES = 49;

function isRetryableTyphoon(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('429')||m.includes('500')||m.includes('502')||m.includes('503')||m.includes('404')||m.includes('aborted')||m.includes('timeout')||m.includes('timed out')||m.includes('aborterror');
}

async function callTyphoonOCRWithModelBatch(prompt: string, data: string, mime: string, model: string): Promise<string> {
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
    const errText = await res.text().catch(() => '');
    console.error(`Typhoon API error (batch ${model}):`, res.status, errText.slice(0, 500));
    throw new Error(`Typhoon API error (${model}): ${res.status}`);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content || '';
  return text;
}

async function callTyphoonOCRForBatch(prompt: string, data: string, mime: string): Promise<string> {
  try {
    return await callTyphoonOCRWithModelBatch(prompt, data, mime, TYPHOON_MODEL);
  } catch (e) {
    const msg = String(e);
    if (isRetryableTyphoon(msg) && TYPHOON_MODEL_FALLBACK && TYPHOON_MODEL_FALLBACK !== TYPHOON_MODEL) {
      console.warn(`Typhoon ${TYPHOON_MODEL} failed in batch (${msg}) — fallback to ${TYPHOON_MODEL_FALLBACK}`);
      return await callTyphoonOCRWithModelBatch(prompt, data, mime, TYPHOON_MODEL_FALLBACK);
    }
    throw e;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function extractBase64(imageBase64: string): { data: string; mime: string } {
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { data: match[2], mime: match[1] };
  return { data: imageBase64, mime: 'image/jpeg' };
}

function parseGeminiJson(text: string) {
  let jsonStr = text.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();
  const brace = jsonStr.match(/\{[\s\S]*\}/);
  if (brace) jsonStr = brace[0];
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      steps: typeof parsed.steps === 'number' ? parsed.steps : parsed.steps != null ? Number(parsed.steps) : null,
      dateInImage: parsed.dateInImage ? String(parsed.dateInImage) : null,
      dateRaw: parsed.dateRaw ? String(parsed.dateRaw) : null,
      dateMatch: typeof parsed.dateMatch === 'boolean' ? parsed.dateMatch : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence) || 0,
      notes: parsed.notes ? String(parsed.notes) : '',
    };
  } catch {
    return { steps: null, dateInImage: null, dateRaw: null, dateMatch: null, confidence: 0, notes: text.slice(0, 200) };
  }
}

async function analyzeOneImage(imageBase64: string, expectedDate: string, hintInput: string = 'auto', explicitModel: string = '') {
  const { data, mime } = extractBase64(imageBase64);
  const hint = String(hintInput || 'auto').toLowerCase();
  const currentYearB = new Date().getFullYear();
  const currentYearBE_B = currentYearB + 543;
  const prompt = `คุณคือผู้ช่วยตรวจสอบภาพสำหรับโครงการส่งเสริมสุขภาพ "นับก้าวเดิน" วิเคราะห์ภาพแคปหน้าจอแอปนับก้าว (step counter) อย่างละเอียด ใช้เวลาตรวจสอบอย่างรอบคอบ แล้วตอบเป็น JSON เท่านั้น

โจทย์:
1. อ่านจำนวนก้าวทั้งหมด (total steps) ที่แสดงในภาพอย่างละเอียด — ดูตัวเลขที่ใหญ่และโดดเด่นที่สุดที่ระบุว่าเป็นจำนวนก้าว แยกแยะระหว่างก้าวรวมทั้งวัน vs ก้าวเป้าหมาย/เฉลี่ย ต้องอ่านเป็นจำนวนเต็มตรงตัว ตรวจตัวเลขไทย-อารบิกและจุลภาคให้ครบ
2. หาวันที่ที่แสดงในภาพอย่างระมัดระวัง วันที่อาจอยู่ในรูปแบบ เช่น "31 Jul", "07/31/2026", "31/07/2026", "31 ก.ค. 2569" (พ.ศ.ไทย), "Wed, Jul 31" เป็นต้น ถ้าภาพแสดงวันที่ ให้แปลงเป็น ISO yyyy-MM-dd (ปี ค.ศ.) ถ้าไม่มีวันที่ชัดเจนในภาพ ให้ dateInImage เป็น null
   กติกาเรื่องปี: แอปส่วนใหญ่ไม่แสดงปีถ้าเป็นปีปัจจุบัน — ถ้าเห็นเฉพาะวัน+เดือน (เช่น "15 ส.ค.", "Aug 15", "31 Jul") โดยไม่มีเลขปี ให้ถือว่าเป็นปีปัจจุบัน ${currentYearB} (ค.ศ.) / ${currentYearBE_B} (พ.ศ.) แล้วแปลงเป็น ${currentYearB}-MM-dd
   ถ้าเห็นเลขปี ให้เทียบ พ.ศ./ค.ศ.: ปี >= 2400 ถือเป็น พ.ศ. ลบ 543 เป็น ค.ศ. (เช่น 2569 → 2026) ปี < 2400 ถือเป็น ค.ศ. ตรงๆ
   กติกา TODAY/Yesterday: ถ้าภาพแสดงคำว่า TODAY, Today, YESTERDAY, Yesterday, เมื่อวาน, เมื่อวานนี้, วันนี้ โดยไม่มีวันที่แบบระบุวันเดือนปีที่ชัดเจน ให้ถือว่าไม่มีวันที่ (dateInImage=null, dateRaw="TODAY"/คำที่เห็น, dateMatch=null) และลด confidence เหลือ 0.4-0.6 พร้อมระบุใน notes ว่า "พบคำว่า TODAY/Yesterday — ไม่มีวันที่ชัดเจน รอเจ้าหน้าที่ นสส. ต่างฝ่ายตรวจสอบ"
3. พิจารณาว่าวันที่ในภาพตรงกับวันที่ที่คาดหวัง "${expectedDate}" (yyyy-MM-dd) หรือไม่ (เทียบปี ค.ศ. แล้ว) ถ้าเป็น TODAY/Yesterday ให้ dateMatch=null เสมอ
4. ให้คะแนนความมั่นใจ 0.0-1.0 อย่างรอบคอบ — 1.0=มั่นใจสูงมาก ตัวเลข+วันที่ชัดเจนตรงกัน ไม่มีร่องรอยตัดต่อ, <0.8=มีข้อสงสัยเล็กน้อย ถ้าเป็น TODAY/Yesterday หรืออ่านวันที่ไม่ได้ให้ 0.4-0.6
5. ตรวจสอบความผิดปกติ: ภาพตัดต่อ/แก้ไขตัวเลข/ซ้อนฟอนต์แปลก/ขอบเบลอ/เงาซ้ำ/ตัวเลขไม่ตรงฟอนต์ระบบ — ถ้าสงสัยให้ระบุใน notes และลด confidence เหลือ 0.3-0.6
6. หากไม่พบวันที่ชัดเจน ให้เดาว่าวันที่น่าจะเป็นไปได้ที่สุดจากภาพ และหมายเหตุว่า "จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง"

ตอบเฉพาะ JSON object (ห้ามมี markdown) ตาม schema นี้:
{
  "steps": <integer หรือ null>,
  "dateInImage": "<yyyy-MM-dd หรือ null>",
  "dateRaw": "<ข้อความวันที่ที่เห็นในภาพ หรือ null>",
  "dateMatch": <true|false|null>,
  "confidence": <0.0-1.0>,
  "notes": "<หมายเหตุสั้นๆ ภาษาไทยว่ามองเห็นอะไรในภาพ และข้อสงสัยด้านการตัดต่อถ้ามี>"
}`;

  let text = '';
  let finalProvider: 'typhoon' = 'typhoon';
  let finalModel = TYPHOON_MODEL;
  let usedFallback = false;
  try {
    // Typhoon เดี่ยว — ทุก hint วิ่งบน Typhoon OCR
    if (hint === 'typhoon-ocr-preview' || hint === 'preview') {
      const m = explicitModel || TYPHOON_MODEL_FALLBACK;
      text = await callTyphoonOCRWithModelBatch(prompt, data, mime, m);
      finalModel = m;
    } else {
      // auto / typhoon / openrouter (legacy) -> Typhoon OCR
      try {
        const m = explicitModel && explicitModel.includes('typhoon') ? explicitModel : TYPHOON_MODEL;
        text = await callTyphoonOCRWithModelBatch(prompt, data, mime, m);
        finalModel = m;
      } catch (e: any) {
        const msg = String(e);
        if (isRetryableTyphoon(msg) && TYPHOON_MODEL_FALLBACK !== TYPHOON_MODEL) {
          text = await callTyphoonOCRWithModelBatch(prompt, data, mime, TYPHOON_MODEL_FALLBACK);
          finalModel = TYPHOON_MODEL_FALLBACK;
          usedFallback = true;
        } else throw e;
      }
    }
  } catch (e: any) {
    console.error('analyzeOneImage failed:', e, 'hint', hint);
    return { steps: null, dateInImage: null, dateRaw: null, dateMatch: null, confidence: 0, notes: '', alert: true, alertReasons: [String(e?.message || e)], provider: finalProvider, model: finalModel };
  }

  const parsed = parseGeminiJson(text);
  if (usedFallback) {
    if (parsed.notes) parsed.notes = `[fallback:${finalModel}] ` + parsed.notes;
    else parsed.notes = `ประมวลผลด้วย ${finalProvider} (${finalModel}) หลังโมเดลหลักล้มเหลว`;
  }

  const alertReasons: string[] = [];
  const steps = parsed.steps;
  if (steps === null || Number.isNaN(steps)) alertReasons.push('อ่านจำนวนก้าวจากภาพไม่ได้');
  else if (steps <= 0) alertReasons.push('จำนวนก้าวไม่สมเหตุสมผล (0 หรือติดลบ)');
  else if (steps > MAX_REASONABLE_STEPS) alertReasons.push(`จำนวนก้าวสูงผิดปกติ (${steps.toLocaleString()} ก้าว)`);

  if (parsed.dateMatch === false) alertReasons.push('วันที่ในภาพไม่ตรงกับวันที่บันทึก');
  else if (parsed.dateMatch === null) alertReasons.push('ไม่พบวันที่ในภาพ / อ่านวันที่ไม่ชัดเจน');

  if (parsed.confidence < MIN_CONFIDENCE) alertReasons.push(`AI อ่านจำนวนก้าวไม่ชัดเจน (ความมั่นใจ ${Math.round(parsed.confidence * 100)}%)`);

  return {
    steps: steps ?? null,
    dateInImage: parsed.dateInImage,
    dateRaw: parsed.dateRaw,
    dateMatch: parsed.dateMatch,
    confidence: parsed.confidence,
    notes: parsed.notes || '',
    alert: alertReasons.length > 0,
    alertReasons,
    provider: finalProvider,
    model: finalModel,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'images array is required' }, { status: 400 });
    }
    if (images.length > MAX_IMAGES) {
      return NextResponse.json({ error: `สูงสุด ${MAX_IMAGES} ภาพต่อครั้ง` }, { status: 400 });
    }
    if (!TYPHOON_API_KEY) {
      return NextResponse.json({ error: 'TYPHOON_API_KEY not configured' }, { status: 500 });
    }

    const CONCURRENCY = 4;
    const results: any[] = new Array(images.length);
    let idx = 0;
    async function worker() {
      while (idx < images.length) {
        const cur = idx++;
        const img = images[cur];
        if (!img.imageBase64 || !img.expectedDate) {
          results[cur] = { steps: null, dateInImage: null, dateRaw: null, dateMatch: null, confidence: 0, notes: '', alert: true, alertReasons: ['ไม่มีรูปภาพหรือวันที่'] };
          continue;
        }
        const hint = String(img.preferredProvider || img.providerHint || 'auto');
        const m = img.preferredModel ? String(img.preferredModel) : '';
        results[cur] = await analyzeOneImage(img.imageBase64, img.expectedDate, hint, m);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, images.length) }, () => worker()));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('batch-analyze error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
