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
}

function getApiKey(): string {
  return String(process.env.TYPHOON_API_KEY || '').trim();
}

/**
 * เรียก Typhoon OCR แบบ vision chat completions
 * ส่งภาพเป็น data URL (image/jpeg base64) พร้อม prompt ให้ดึงก้าวและวันที่
 */
export async function analyzeStepsImageWithTyphoon(
  imageDataUrl: string,
  opts?: { timeoutMs?: number }
): Promise<TyphoonOcrResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TYPHOON_API_KEY not configured');

  // สร้าง data URL ให้ถูกต้อง
  let dataUrl = imageDataUrl.trim();
  if (!dataUrl.startsWith('data:')) {
    dataUrl = `data:image/jpeg;base64,${dataUrl}`;
  }

  const systemPrompt =
    'คุณคือผู้เชี่ยวชาญ OCR ภาษาไทย สำหรับอ่านภาพนับก้าวเดิน (step counter). ' +
    'ให้อ่านข้อความทั้งหมดในภาพอย่างละเอียด แล้วสรุปเป็น JSON เท่านั้น ห้ามอธิบายเพิ่ม.';

  const userPrompt =
    'อ่านภาพนี้แล้วดึงข้อมูล 2 อย่าง:\n' +
    '1) จำนวนก้าว (steps): ตัวเลขที่มีคำว่า ก้าว ต่อท้าย หรือตัวเลขตัวใหญ่กลางจอ ถ้ามีหลายตัวเลขให้เลือกตัวที่น่าจะเป็นจำนวนก้าวมากที่สุด\n' +
    '2) วันที่ในภาพ (dateRaw): ข้อความวันที่ทุกแบบที่เห็น (ไทยย่อ/เต็ม, อังกฤษย่อ/เต็ม, ตัวเลข, มี/ไม่มีปี, มีวันในสัปดาห์ เช่น พ. 2 ก.ย.)\n' +
    'ตอบเป็น JSON เท่านั้น รูปแบบ: {"steps": number|null, "stepsRaw": string|null, "dateRaw": string|null, "rawText": string, "confidence": number|null}\n' +
    'ตัวอย่าง: {"steps": 12345, "stepsRaw": "12,345 ก้าว", "dateRaw": "พ. 2 ก.ย. 2568", "rawText": "12,345 ก้าว\\nพ. 2 ก.ย. 2568", "confidence": 0.92}\n' +
    'ถ้าหาไม่เจอให้ใส่ null และ confidence ต่ำ เช่น 0.3';

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
  // พยายามหา JSON ใน content
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      return {
        rawText: String(obj.rawText ?? raw),
        steps: obj.steps != null ? Number(obj.steps) : null,
        stepsRaw: obj.stepsRaw != null ? String(obj.stepsRaw) : null,
        dateRaw: obj.dateRaw != null ? String(obj.dateRaw) : null,
        confidence: obj.confidence != null ? Number(obj.confidence) : null,
      };
    } catch {}
  }
  // fallback: พยายามดึงตัวเลขจาก raw text
  return {
    rawText: raw,
    steps: null,
    stepsRaw: null,
    dateRaw: null,
    confidence: null,
  };
}

/**
 * Fallback: ถ้า Typhoon OCR model ไม่รองรับ vision ให้ลองใช้ typhoon vision ผ่าน chat completions
 * ตอนนี้ใช้ typhoon-ocr เป็นหลัก ถ้า fail จะโยน error ให้ caller จัดการ fallback เป็น Pending manual
 */
export function isTyphoonConfigured(): boolean {
  return !!getApiKey();
}
