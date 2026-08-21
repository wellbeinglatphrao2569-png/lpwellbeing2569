/**
 * Gemini AI — อ่านจำนวนก้าวจากภาพ + ตรวจสอบวันที่ในภาพ
 *
 * POST /api/steps/image-analyze
 * Body: { imageBase64: "data:image/jpeg;base64,...", expectedDate: "2026-07-31" }
 * Response: {
 *   steps: number|null, dateInImage: string|null, dateRaw: string|null,
 *   dateMatch: boolean|null, confidence: number, notes: string,
 *   alert: boolean, alertReasons: string[]
 * }
 */
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'stealth/ox-alpha';
const MIN_CONFIDENCE = 0.8;
const MAX_REASONABLE_STEPS = 200000;

async function callOpenRouter(prompt: string, data: string, mime: string): Promise<string> {
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
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('OpenRouter API error:', res.status, errText.slice(0, 500));
    throw new Error(`OpenRouter API error: ${res.status}`);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content || '';
  return text;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBase64(imageBase64: string): { data: string; mime: string } {
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { data: match[2], mime: match[1] };
  return { data: imageBase64, mime: 'image/jpeg' };
}

/** แปลง JSON ที่ Gemini คืนกลับมา (กัน markdown fence / พิมพ์ไม่ตรง schema) */
function parseGeminiJson(text: string): {
  steps: number | null;
  dateInImage: string | null;
  dateRaw: string | null;
  dateMatch: boolean | null;
  confidence: number;
  notes?: string;
} {
  let jsonStr = text.trim();
  // strip ```json ... ```
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();
  // หา {...} chunk สุดท้าย
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, expectedDate } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }
    if (!expectedDate) {
      return NextResponse.json({ error: 'expectedDate is required' }, { status: 400 });
    }
    if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY and OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    const { data, mime } = extractBase64(imageBase64);

    const prompt = `คุณคือผู้ช่วยอ่านภาพสำหรับโครงการส่งเสริมสุขภาพ "นับก้าวเดิน" วิเคราะห์ภาพแคปหน้าจอแอปนับก้าว (step counter) แล้วตอบเป็น JSON เท่านั้น

โจทย์:
1. อ่านจำนวนก้าวทั้งหมด (total steps) ที่แสดงในภาพ โดยดูจากตัวเลขที่ใหญ่และโดดเด่นที่สุดที่ระบุว่าเป็นจำนวนก้าว/เดิน
2. หาวันที่ที่แสดงในภาพ วันที่อาจอยู่ในรูปแบบ เช่น "31 Jul", "07/31/2026", "31/07/2026", "31 ก.ค. 2569" (พ.ศ.ไทย), "Wed, Jul 31" เป็นต้น ถ้าภาพแสดงวันที่ ให้แปลงเป็น ISO yyyy-MM-dd (ปี ค.ศ.) ถ้าไม่มีวันที่ชัดเจนในภาพ ให้ dateInImage เป็น null
3. พิจารณาว่าวันที่ในภาพตรงกับวันที่ที่คาดหวัง "${expectedDate}" (yyyy-MM-dd) หรือไม่
4. ให้คะแนนความมั่นใจ 0.0-1.0 ว่าจำนวนก้าวที่อ่านได้แม่นยำ

ตอบเฉพาะ JSON object (ห้ามมี markdown) ตาม schema นี้:
{
  "steps": <integer หรือ null>,
  "dateInImage": "<yyyy-MM-dd หรือ null>",
  "dateRaw": "<ข้อความวันที่ที่เห็นในภาพ หรือ null>",
  "dateMatch": <true|false|null>,   // null เมื่อไม่พบวันที่ในภาพ
  "confidence": <0.0-1.0>,
  "notes": "<หมายเหตุสั้นๆ ภาษาไทยว่ามองเห็นอะไรในภาพ>"
}`;

    let text = '';
    let usedFallback = false;
    // ถ้าไม่มี Gemini key แต่มี OpenRouter ให้ใช้ OpenRouter เลย
    if (!GEMINI_API_KEY && OPENROUTER_API_KEY) {
      console.warn('No GEMINI_API_KEY — direct OpenRouter fallback', OPENROUTER_MODEL);
      text = await callOpenRouter(prompt, data, mime);
      usedFallback = true;
    } else {
      // ลอง Gemini ก่อน
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mime, data } },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      if (geminiRes.ok) {
        const geminiJson = await geminiRes.json();
        text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else if (geminiRes.status === 429 && OPENROUTER_API_KEY) {
        console.warn('Gemini 429 — fallback to OpenRouter', OPENROUTER_MODEL);
        try {
          text = await callOpenRouter(prompt, data, mime);
          usedFallback = true;
        } catch (e) {
          const errText = await geminiRes.text().catch(() => '');
          console.error('Gemini 429 + OpenRouter failed:', e);
          return NextResponse.json(
            { error: `Gemini 429 and OpenRouter failed: ${geminiRes.status}` },
            { status: 502 }
          );
        }
      } else {
        const errText = await geminiRes.text().catch(() => '');
        console.error('Gemini API error:', geminiRes.status, errText.slice(0, 500));
        if (geminiRes.status === 429) {
          return NextResponse.json(
            { error: `Gemini API error: 429 (OPENROUTER_API_KEY not configured for fallback)` },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: `Gemini API error: ${geminiRes.status}` },
          { status: 502 }
        );
      }
    }

    const parsed = parseGeminiJson(text);
    // ถ้าใช้ fallback ให้เติมโน้ตว่าใช้ OpenRouter
    if (usedFallback && parsed.notes) {
      parsed.notes = `[fallback:${OPENROUTER_MODEL}] ` + parsed.notes;
    } else if (usedFallback) {
      parsed.notes = `ประมวลผลด้วย OpenRouter (${OPENROUTER_MODEL}) หลัง Gemini 429`;
    }

    // คำนวณ flag ความผิดปกติ
    const alertReasons: string[] = [];
    const steps = parsed.steps;

    if (steps === null || Number.isNaN(steps)) {
      alertReasons.push('อ่านจำนวนก้าวจากภาพไม่ได้');
    } else if (steps <= 0) {
      alertReasons.push('จำนวนก้าวไม่สมเหตุสมผล (0 หรือติดลบ)');
    } else if (steps > MAX_REASONABLE_STEPS) {
      alertReasons.push(`จำนวนก้าวสูงผิดปกติ (${steps.toLocaleString()} ก้าว)`);
    }

    if (parsed.dateMatch === false) {
      alertReasons.push('วันที่ในภาพไม่ตรงกับวันที่บันทึก');
    } else if (parsed.dateMatch === null) {
      alertReasons.push('ไม่พบวันที่ในภาพ / อ่านวันที่ไม่ชัดเจน');
    }

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    if (confidence < MIN_CONFIDENCE) {
      alertReasons.push(`AI อ่านจำนวนก้าวไม่ชัดเจน (ความมั่นใจ ${Math.round(confidence * 100)}%)`);
    }

    return NextResponse.json({
      steps: steps ?? null,
      dateInImage: parsed.dateInImage,
      dateRaw: parsed.dateRaw,
      dateMatch: parsed.dateMatch,
      confidence,
      notes: parsed.notes || '',
      alert: alertReasons.length > 0,
      alertReasons,
    });
  } catch (error) {
    console.error('image-analyze error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
