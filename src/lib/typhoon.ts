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
    `- วันที่ระบบวันนี้: ${ctx.systemDate} | วันที่ผู้ใช้เลือกบันทึก: ${ctx.targetDate}\n` +
    `\n[ภารกิจ — สกัดเฉพาะที่ตาเห็น ห้ามสรุปทั้งหน้า]\n` +
    `1. raw_date_text_from_image: อ่าน "วันที่" ที่อยู่ในภาพเท่านั้น โฟกัสที่แถบวันที่ตรงกลางบน (pill สีเทา เช่น "พ. 2 ก.ย." / "วันอังคารที่ 18 สิงหาคม" / "26/06/2026")\n` +
    `   ตัวอย่างที่ถูกต้อง: "พ. 2 ก.ย." หรือ "27 ส.ค. 2569" หรือ "18 สิงหาคม" หรือ "26/06/2026" — ห้ามใส่ "วันพฤหัสบดีที่ 27 ส.ค. 2569 เคลื่อนไหว 98/240..."\n` +
    `   ถ้าเห็น "วันพฤหัสบดีที่ 27 ส.ค. 2569" ให้ใส่แค่ "27 ส.ค. 2569"\n` +
    `   ถ้าเห็น "พ. 2 ก.ย." ให้ใส่ "พ. 2 ก.ย." ตรงๆ (อย่าแปลงเป็น 27 ส.ค.)\n` +
    `   รองรับ Today/วันนี้ (→ ${ctx.systemDate}), Yesterday/เมื่อวาน (→ วันก่อนหน้า ${ctx.systemDate} 1 วัน)\n` +
    `   ถ้าไม่เห็นวันที่เลยให้ใส่ null\n` +
    `2. parsed_date_from_image: แปลง raw_date_text_from_image เป็น YYYY-MM-DD (พ.ศ.→ค.ศ. -543, ไม่มีปี → ใช้ปี ${ctx.currentYear}, "พ. 2 ก.ย." → ${ctx.currentYear}-09-02)\n` +
    `3. step_count: อ่านเฉพาะตัวเลขก้าวรวมหลักที่อยู่ใกล้คำว่า "ก้าวเดิน" หรือ "จำนวนก้าว" หรือไอคอนเท้าเท่านั้น (เช่น ก้าวเดิน 3,155 หรือ 8,516 /6,000 → 3155/8516) ถอด comma ออก ถ้าไม่เห็นให้ null\n` +
    `   ห้ามอ่าน "จำนวนชั้นที่ขึ้น 5" หรือ "58/240 กิโลแคล" หรือ "2.19 กม." หรือ "5 นาที" — เลข 5 ตัวเล็กใต้คำว่า "จำนวนชั้นที่ขึ้น" ไม่ใช่ก้าว\n` +
    `   ตัวอย่างผิด: เห็น "จำนวนชั้นที่ขึ้น\\n5" อย่าใส่ 5 ให้หา "ก้าวเดิน\\n3,155" แทน\n` +
    `\n[ตัวอย่างผลลัพธ์ที่ถูกต้อง]\n` +
    `ภาพมี "พ. 2 ก.ย." และ "8,516 /6,000" → {"raw_date_text_from_image":"พ. 2 ก.ย.","parsed_date_from_image":"${ctx.currentYear}-09-02","step_count":8516,"ocr_confidence":0.95,"visual_evidence":"พบ 'พ. 2 ก.ย.' ที่ pill บน, พบ '8,516' ใต้คำว่า จำนวนก้าว"}\n` +
    `\n[รูปแบบผลลัพธ์ (JSON เท่านั้น ห้าม Markdown)]\n` +
    `{"raw_date_text_from_image":"<สั้นๆ หรือ null>","parsed_date_from_image":"<YYYY-MM-DD หรือ null>","step_count":<int หรือ null>,"ocr_confidence":<0.0-1.0>,"visual_evidence":"<สั้นๆ>"}`;

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
    // ใช้ single user message เพื่อให้ typhoon-ocr 2B เข้าใจง่าย (ทดสอบแล้ว single message แม่นกว่า)
    const fullPrompt = systemPrompt + '\n\n' + userPrompt;
    const res = await fetch(TYPHOON_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TYPHOON_OCR_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: fullPrompt },
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

function toIntOrNull(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'null' || s === '' || s === 'undefined') return null;
  const n = Number(s.replace(/,/g, ''));
  return isNaN(n) || n <= 0 ? null : n;
}
function parseTyphoonContent(content: string): TyphoonOcrResult {
  const raw = content.trim();
  let cleaned = raw;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }
  // รองรับทั้ง object {...} และ array [{...}] — ถ้าเป็น array ให้เอาองค์ประกอบแรกที่มี step_count
  const trimmed = cleaned.trim();
  let jsonStr: string | null = null;
  let parsedObj: any = null;
  try {
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.length > 0) {
        // หาตัวแรกที่มี step_count เป็นตัวเลข
        const found = arr.find((x: any) => x && (x.step_count != null || x.steps != null)) || arr[0];
        parsedObj = found;
        jsonStr = JSON.stringify(found);
      }
    } else {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : null;
      if (jsonStr) parsedObj = JSON.parse(jsonStr);
    }
  } catch {}
  if (parsedObj) {
    try {
      const obj = parsedObj;
      const stepVal = obj.step_count ?? obj.steps ?? null;
      const rawDateNew = obj.raw_date_text_from_image ?? null;
      const rawDateOld = obj.detected_date_raw ?? obj.dateRaw ?? null;
      const finalRawDate = rawDateNew != null && String(rawDateNew).toLowerCase() !== 'null' ? String(rawDateNew) : rawDateOld != null && String(rawDateOld).toLowerCase() !== 'null' ? String(rawDateOld) : null;
      const parsedNew = obj.parsed_date_from_image ?? null;
      const formattedOld = obj.formatted_date ?? null;
      const finalParsed = parsedNew != null && String(parsedNew).toLowerCase() !== 'null' ? String(parsedNew) : formattedOld && String(formattedOld).toLowerCase() !== 'null' ? String(formattedOld) : null;
      const confNew = obj.ocr_confidence ?? null;
      const confOld = obj.confidence_score ?? obj.confidence ?? null;
      const rawConf = confNew ?? confOld;
      const finalConf = rawConf != null && String(rawConf).toLowerCase() !== 'null' ? Number(rawConf) : null;
      const visual = obj.visual_evidence ?? null;
      const isMatched = obj.is_date_matched ?? null;
      const status = obj.status ?? null;
      const reasoning = obj.reasoning ?? obj.visual_evidence ?? null;
      const parsedSteps = toIntOrNull(stepVal);

      return {
        rawText: String(obj.rawText ?? obj.reasoning ?? obj.visual_evidence ?? raw),
        steps: parsedSteps,
        stepsRaw: parsedSteps != null ? String(parsedSteps) : null,
        dateRaw: finalRawDate,
        confidence: finalConf != null && !isNaN(finalConf) ? finalConf : null,
        step_count: parsedSteps,
        detected_date_raw: finalRawDate,
        formatted_date: finalParsed,
        is_date_matched: isMatched != null ? Boolean(isMatched) : null,
        confidence_score: finalConf != null && !isNaN(finalConf) ? finalConf : null,
        status: status === 'passed' || status === 'flagged_for_review' ? status : null,
        reasoning: reasoning ? String(reasoning) : null,
        raw_date_text_from_image: finalRawDate,
        parsed_date_from_image: finalParsed,
        ocr_confidence: finalConf != null && !isNaN(finalConf) ? finalConf : null,
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
