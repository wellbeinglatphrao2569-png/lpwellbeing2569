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
  // fields ใหม่ตามสเปคล่าสุด (extraction-only)
  step_count: number | null;
  detected_date_raw: string | null;
  formatted_date: string | null;
  is_date_matched: boolean | null;
  confidence_score: number | null;
  status: 'passed' | 'flagged_for_review' | null;
  reasoning: string | null;
  // fields สกัดข้อความล้วน (ล่าสุด)
  raw_date_text_from_image: string | null;
  parsed_date_from_image: string | null;
  ocr_confidence: number | null;
  visual_evidence: string | null;
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
    'คุณคือระบบ AI OCR ที่มีหน้าที่สกัดข้อความ (Text Extraction) จากภาพถ่ายหน้าจอนับก้าวเท่านั้น';

  const user =
    `[ข้อมูลอ้างอิงปีสำหรับกรณีภาพไม่ระบุปี]\n` +
    `- ปีปัจจุบัน (Current Year): ${ctx.currentYear} (ค.ศ.) / ${ctx.currentThaiYear} (พ.ศ.)\n` +
    `\n[ภารกิจของคุณ]\n` +
    `1. ค้นหาข้อความวันที่ที่ปรากฏอยู่ในรูปภาพจริงๆ (Visual Text)\n` +
    `   - อ่านข้อความทุกรูปแบบ เช่น "Today", "วันนี้", "เมื่อวาน", "พ. 2 ก.ย.", "2 ก.ย.", "02/09/2026", "2 กุมภาพันธ์"\n` +
    `   - นำข้อความที่เห็นในภาพจริงๆ มาใส่ในช่อง "raw_date_text_from_image" (ห้ามเมคขึ้นมาเองเด็ดขาด ถ้าไม่เห็นให้ใส่ null)\n` +
    `2. แปลงข้อความวันที่ที่อ่านได้จากภาพเป็นฟอร์แมต YYYY-MM-DD:\n` +
    `   - หากเจอ "Today" / "วันนี้" ให้แปลงโดยใช้ปี-เดือน-วัน ของวันที่ ${ctx.systemDate}\n` +
    `   - หากเจอ "Yesterday" / "เมื่อวาน" ให้แปลงเป็นวันก่อนหน้า ${ctx.systemDate} 1 วัน\n` +
    `   - หากเจอวัน/เดือนภาษาไทย เช่น "พ. 2 ก.ย." หรือ "2 ก.ย." ให้ใช้ปี ${ctx.currentYear} รวมเข้าไป แล้วแปลงเป็น YYYY-MM-DD\n` +
    `   - หากเจอปี พ.ศ. (เช่น 2569) ให้แปลงเป็น ค.ศ. (2026)\n` +
    `3. อ่านจำนวนก้าว (Step Count):\n` +
    `   - อ่านเฉพาะตัวเลขก้าวรวมหลัก ดึงเครื่องหมาย Comma ออก\n` +
    `\n[รูปแบบผลลัพธ์ที่ต้องการ (ตอบเฉพาะ JSON เท่านั้น)]\n` +
    `{\n` +
    `  "raw_date_text_from_image": "<ข้อความวันที่ที่ตาเห็นในภาพจริงๆ เช่น 'พ. 2 ก.ย.' หรือ 'Today'>",\n` +
    `  "parsed_date_from_image": "<วันที่ที่แปลงจากภาพได้ในรูปแบบ YYYY-MM-DD หรือ null หากอ่านจากภาพไม่ได้>",\n` +
    `  "step_count": <จำนวนก้าวเป็นตัวเลข integer หรือ null หากอ่านไม่ได้>,\n` +
    `  "ocr_confidence": <ระดับความมั่นใจในการอ่านภาพ 0.0 ถึง 1.0>,\n` +
    `  "visual_evidence": "<อธิบายจุดที่พบวันที่และจำนวนก้าวในภาพ เช่น พบข้อความ 'พ. 2 ก.ย.' อยู่มุมซ้ายบน>"\n` +
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
      // รองรับทั้งสคีมาล่าสุด (raw_date_text_from_image) และเก่า (step_count/detected_date_raw/steps)
      const stepVal = obj.step_count ?? obj.steps ?? null;
      const rawDateNew = obj.raw_date_text_from_image ?? null;
      const rawDateOld = obj.detected_date_raw ?? obj.dateRaw ?? null;
      const finalRawDate = rawDateNew != null ? String(rawDateNew) : rawDateOld != null ? String(rawDateOld) : null;
      const parsedNew = obj.parsed_date_from_image ?? null;
      const formattedOld = obj.formatted_date ?? null;
      const finalParsed = parsedNew != null ? String(parsedNew) : formattedOld ? String(formattedOld) : null;
      const confNew = obj.ocr_confidence ?? null;
      const confOld = obj.confidence_score ?? obj.confidence ?? null;
      const finalConf = confNew != null ? Number(confNew) : confOld != null ? Number(confOld) : null;
      const visual = obj.visual_evidence ?? null;
      const isMatched = obj.is_date_matched ?? null;
      const status = obj.status ?? null;
      const reasoning = obj.reasoning ?? obj.visual_evidence ?? null;

      return {
        rawText: String(obj.rawText ?? obj.reasoning ?? obj.visual_evidence ?? raw),
        steps: stepVal != null ? Number(String(stepVal).replace(/,/g, '')) : null,
        stepsRaw: stepVal != null ? String(stepVal) : null,
        dateRaw: finalRawDate,
        confidence: finalConf,
        step_count: stepVal != null ? Number(String(stepVal).replace(/,/g, '')) : null,
        detected_date_raw: finalRawDate,
        formatted_date: finalParsed,
        is_date_matched: isMatched != null ? Boolean(isMatched) : null,
        confidence_score: finalConf,
        status: status === 'passed' || status === 'flagged_for_review' ? status : null,
        reasoning: reasoning ? String(reasoning) : null,
        raw_date_text_from_image: finalRawDate,
        parsed_date_from_image: finalParsed,
        ocr_confidence: finalConf,
        visual_evidence: visual ? String(visual) : null,
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
    raw_date_text_from_image: null,
    parsed_date_from_image: null,
    ocr_confidence: null,
    visual_evidence: null,
  };
}

/**
 * Fallback: ถ้า Typhoon OCR model ไม่รองรับ vision ให้ลองใช้ typhoon vision ผ่าน chat completions
 * ตอนนี้ใช้ typhoon-ocr เป็นหลัก ถ้า fail จะโยน error ให้ caller จัดการ fallback เป็น Pending manual
 */
export function isTyphoonConfigured(): boolean {
  return !!getApiKey();
}
