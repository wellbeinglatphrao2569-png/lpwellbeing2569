/**
 * Typhoon OCR client — ใช้ typhoon-ocr model ผ่าน OpenAI-compatible API
 * Docs: https://docs.opentyphoon.ai/en/ocr/ + https://docs.opentyphoon.ai/en/api-reference/
 * Base: https://api.opentyphoon.ai/v1
 */

const TYPHOON_API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const TYPHOON_OCR_MODEL = process.env.TYPHOON_OCR_MODEL || 'typhoon-ocr';

// จำนวนก้าว OCR result
export interface TyphoonOcrResult {
  rawText: string;
  steps: number | null;
  stepsRaw: string | null;
  dateRaw: string | null;
  confidence: number | null;
  // fields ใหม่ตามสเปคล่าสุด
  step_count: number | null;
  detected_date_raw: string | null;
  formatted_date: string | null;
  is_date_matched: boolean | null;
  confidence_score: number | null;
  status: 'passed' | 'flagged_for_review' | null;
  reasoning: string | null;
}

function getApiKey(): string {
  return String(process.env.TYPHOON_API_KEY || '').trim();
}

export interface TyphoonPromptContext {
  systemDate: string; // YYYY-MM-DD
  targetDate: string; // YYYY-MM-DD
  currentYear: string; // ค.ศ.
  currentThaiYear: string; // พ.ศ.
}

function buildPrompt(ctx: TyphoonPromptContext): { system: string; user: string } {
  const system =
    'คุณคือระบบ AI OCR พิเศษสำหรับตรวจสอบภาพถ่ายหน้าจอนับก้าว ของแอปพลิเคชัน "ก้าวสร้างสุข" (ใช้สำหรับการบันทึกก้าวรายบุคคล และการบันทึกก้าวแบบกลุ่ม)';

  const user =
    `[ข้อมูลอ้างอิงจากระบบ]\n` +
    `- วันที่ปัจจุบันของระบบ (Today System Date): ${ctx.systemDate} (รูปแบบ YYYY-MM-DD)\n` +
    `- วันที่ผู้ใช้ต้องการบันทึก (Target Record Date): ${ctx.targetDate} (รูปแบบ YYYY-MM-DD)\n` +
    `- ปีปัจจุบันของระบบ (Current Year): ${ctx.currentYear} (ค.ศ.) / ${ctx.currentThaiYear} (พ.ศ.)\n` +
    `\n[เงื่อนไขการตรวจสอบ - Checklist]\n` +
    `1. การอ่านจำนวนก้าว (Steps):\n` +
    `   - อ่านเฉพาะตัวเลขรวมจำนวนก้าวหลักของวันนั้น (ระวังอย่าสับสนกับ kcal, km, นาที)\n` +
    `   - ถอดเครื่องหมาย comma ออก (เช่น 3,115 -> 3115)\n` +
    `2. การอ่านและเทียบเคียงวันที่ (Date Matching):\n` +
    `   - อ่านวันที่ในภาพ (รองรับ "Today", "วันนี้", "Yesterday", "เมื่อวาน", ตัวย่อวัน เช่น "พ. 2 ก.ย.", หรือตัวย่อเดือนภาษาไทย/อังกฤษ)\n` +
    `   - หากภาพระบุเฉพาะ วัน/เดือน ให้ถือว่าเป็นปี ${ctx.currentYear}\n` +
    `   - แปลงวันที่ในภาพให้อยู่ในฟอร์แมต YYYY-MM-DD (ใช้ชื่อตัวแปร formatted_date)\n` +
    `   - ตรวจสอบว่า formatted_date ตรงกับ ${ctx.targetDate} ที่ผู้ใช้ต้องการบันทึกหรือไม่ (is_date_matched)\n` +
    `3. ประเมินความถูกต้อง (Verification Decision):\n` +
    `   - ถ้าอ่านค่าก้าวได้ชัดเจน และ formatted_date ตรงกับ ${ctx.targetDate} ให้สถานะเป็น "passed"\n` +
    `   - ถ้าภาพเบลอ, อ่านตัวเลขไม่ได้, ไม่พบวันที่, หรือวันที่ไม่ตรงกับ ${ctx.targetDate} ให้สถานะเป็น "flagged_for_review" (เพื่อให้ระบบส่งต่อให้เจ้าหน้าที่ นสส. ฝ่ายอื่นตรวจสอบ)\n` +
    `\n[รูปแบบผลลัพธ์ที่ต้องการ (JSON)]\n` +
    `ตอบกลับเฉพาะ JSON Object ตามโครงสร้างนี้เท่านั้น ห้ามใส่ข้อความเกริ่นนำหรือ Markdown อื่น:\n` +
    `{\n` +
    `  "step_count": <จำนวนก้าวเป็น integer หรือ null หากอ่านไม่ได้>,\n` +
    `  "detected_date_raw": "<ข้อความวันที่ที่อ่านได้จริงจากภาพ>",\n` +
    `  "formatted_date": "<วันที่ในรูป YYYY-MM-DD หรือ null>",\n` +
    `  "is_date_matched": <true หากตรงกับ TARGET_DATE / false หากไม่ตรง>,\n` +
    `  "confidence_score": <ระดับความมั่นใจ 0.0 ถึง 1.0>,\n` +
    `  "status": "<'passed' หรือ 'flagged_for_review'>",\n` +
    `  "reasoning": "<เหตุผลประกอบสั้นๆ เช่น: ก้าวตรง 3115 แต่วันที่ในภาพไม่ตรงกับวันที่บันทึก>"\n` +
    `}`;

  return { system, user };
}

/**
 * เรียก Typhoon OCR แบบ vision chat completions
 * ส่งภาพเป็น data URL (image/jpeg base64) พร้อม prompt ให้ดึงก้าวและวันที่
 */
export async function analyzeStepsImageWithTyphoon(
  imageDataUrl: string,
  opts?: { timeoutMs?: number; ctx?: TyphoonPromptContext }
): Promise<TyphoonOcrResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TYPHOON_API_KEY not configured');

  // สร้าง data URL ให้ถูกต้อง
  let dataUrl = imageDataUrl.trim();
  if (!dataUrl.startsWith('data:')) {
    dataUrl = `data:image/jpeg;base64,${dataUrl}`;
  }

  const now = new Date();
  const systemDate = now.toISOString().slice(0, 10);
  const ctx: TyphoonPromptContext = opts?.ctx ?? {
    systemDate,
    targetDate: systemDate,
    currentYear: String(now.getFullYear()),
    currentThaiYear: String(now.getFullYear() + 543),
  };
  const { system: systemPrompt, user: userPrompt } = buildPrompt(ctx);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 25000);

  try {
    const res = await fetch(TYPHOON_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TYPHOON_OCR_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Typhoon OCR failed ${res.status}: ${errText.slice(0, 500)}`);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    return parseTyphoonContent(content);
  } finally {
    clearTimeout(timeout);
  }
}

function parseTyphoonContent(content: string): TyphoonOcrResult {
  const raw = content.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      // รองรับทั้งสคีมาใหม่ (step_count/detected_date_raw) และเก่า (steps/dateRaw)
      const stepVal = obj.step_count ?? obj.steps ?? null;
      const dateRawVal = obj.detected_date_raw ?? obj.dateRaw ?? null;
      const formatted = obj.formatted_date ?? null;
      const isMatched = obj.is_date_matched ?? null;
      const confScore = obj.confidence_score ?? obj.confidence ?? null;
      const status = obj.status ?? null;
      const reasoning = obj.reasoning ?? null;

      // ถ้าได้ formatted_date มา ให้ใช้เป็น dateRaw fallback ด้วย ถ้าไม่มี detected_date_raw
      const finalDateRaw = dateRawVal != null ? String(dateRawVal) : formatted ? String(formatted) : null;

      return {
        rawText: String(obj.rawText ?? obj.reasoning ?? raw),
        steps: stepVal != null ? Number(String(stepVal).replace(/,/g, '')) : null,
        stepsRaw: stepVal != null ? String(stepVal) : null,
        dateRaw: finalDateRaw,
        confidence: confScore != null ? Number(confScore) : null,
        step_count: stepVal != null ? Number(String(stepVal).replace(/,/g, '')) : null,
        detected_date_raw: finalDateRaw,
        formatted_date: formatted ? String(formatted) : null,
        is_date_matched: isMatched != null ? Boolean(isMatched) : null,
        confidence_score: confScore != null ? Number(confScore) : null,
        status: status === 'passed' || status === 'flagged_for_review' ? status : null,
        reasoning: reasoning ? String(reasoning) : null,
      };
    } catch {}
  }
  return {
    rawText: raw,
    steps: null,
    stepsRaw: null,
    dateRaw: null,
    confidence: null,
    step_count: null,
    detected_date_raw: null,
    formatted_date: null,
    is_date_matched: null,
    confidence_score: null,
    status: null,
    reasoning: null,
  };
}

/**
 * Fallback: ถ้า Typhoon OCR model ไม่รองรับ vision ให้ลองใช้ typhoon vision ผ่าน chat completions
 * ตอนนี้ใช้ typhoon-ocr เป็นหลัก ถ้า fail จะโยน error ให้ caller จัดการ fallback เป็น Pending manual
 */
export function isTyphoonConfigured(): boolean {
  return !!getApiKey();
}
