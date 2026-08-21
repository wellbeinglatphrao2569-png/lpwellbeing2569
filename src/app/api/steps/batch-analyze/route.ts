/**
 * Gemini AI — อ่านจำนวนก้าวจากภาพแบบกลุ่ม (Batch)
 *
 * POST /api/steps/batch-analyze
 * Body: { images: [{ imageBase64, expectedDate }] }
 * Response: { results: [{ steps, dateInImage, dateRaw, dateMatch, confidence, notes, alert, alertReasons }] }
 */
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'stealth/ox-alpha';
const OPENROUTER_MODEL_2 = process.env.OPENROUTER_MODEL_2 || 'google/gemma-4-26b-a4b-it:free';
const MIN_CONFIDENCE = 0.8;
const MAX_REASONABLE_STEPS = 200000;
const MAX_IMAGES = 49; // 7 people * 7 days

async function callOpenRouterWithModelBatch(prompt: string, data: string, mime: string, model: string): Promise<string> {
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
    console.error(`OpenRouter API error (batch ${model}):`, res.status, errText.slice(0, 500));
    throw new Error(`OpenRouter API error (${model}): ${res.status}`);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content || '';
  return text;
}
async function callOpenRouterForBatch(prompt: string, data: string, mime: string): Promise<string> {
  try {
    return await callOpenRouterWithModelBatch(prompt, data, mime, OPENROUTER_MODEL);
  } catch (e) {
    const msg = String(e);
    if ((msg.includes('429') || msg.includes('500') || msg.includes('502') || msg.includes('503')) && OPENROUTER_MODEL_2 && OPENROUTER_MODEL_2 !== OPENROUTER_MODEL) {
      console.warn(`OpenRouter ${OPENROUTER_MODEL} failed in batch (${msg}) — fallback to ${OPENROUTER_MODEL_2}`);
      return await callOpenRouterWithModelBatch(prompt, data, mime, OPENROUTER_MODEL_2);
    }
    throw e;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

async function analyzeOneImage(imageBase64: string, expectedDate: string) {
  const { data, mime } = extractBase64(imageBase64);
  const prompt = `คุณคือผู้ช่วยอ่านภาพสำหรับโครงการส่งเสริมสุขภาพ "นับก้าวเดิน" วิเคราะห์ภาพแคปหน้าจอแอปนับก้าว (step counter) แล้วตอบเป็น JSON เท่านั้น

โจทย์:
1. อ่านจำนวนก้าวทั้งหมด (total steps) ที่แสดงในภาพ โดยดูจากตัวเลขที่ใหญ่และโดดเด่นที่สุดที่ระบุว่าเป็นจำนวนก้าว/เดิน
2. หาวันที่ที่แสดงในภาพ วันที่อาจอยู่ในรูปแบบ เช่น "31 Jul", "07/31/2026", "31/07/2026", "31 ก.ค. 2569" (พ.ศ.ไทย), "Wed, Jul 31" เป็นต้น ถ้าภาพแสดงวันที่ ให้แปลงเป็น ISO yyyy-MM-dd (ปี ค.ศ.) ถ้าไม่มีวันที่ชัดเจนในภาพ ให้ dateInImage เป็น null
3. พิจารณาว่าวันที่ในภาพตรงกับวันที่ที่คาดหวัง "${expectedDate}" (yyyy-MM-dd) หรือไม่
4. ให้คะแนนความมั่นใจ 0.0-1.0 ว่าจำนวนก้าวที่อ่านได้แม่นยำ
5. หากไม่พบวันที่ชัดเจน ให้เดาว่าวันที่น่าจะเป็นไปได้ที่สุดจากภาพ และหมายเหตุว่า "จำนวนก้าวอาจไม่ตรงตามวันที่กำหนด แต่จำนวนภาพรวมทั้งสัปดาห์ถือว่าถูกต้อง"

ตอบเฉพาะ JSON object (ห้ามมี markdown) ตาม schema นี้:
{
  "steps": <integer หรือ null>,
  "dateInImage": "<yyyy-MM-dd หรือ null>",
  "dateRaw": "<ข้อความวันที่ที่เห็นในภาพ หรือ null>",
  "dateMatch": <true|false|null>,
  "confidence": <0.0-1.0>,
  "notes": "<หมายเหตุสั้นๆ ภาษาไทยว่ามองเห็นอะไรในภาพ>"
}`;

  let text = '';
  let usedFallback = false;
  if (!GEMINI_API_KEY && OPENROUTER_API_KEY) {
    console.warn('No GEMINI_API_KEY in batch — direct OpenRouter fallback', OPENROUTER_MODEL, 'for', expectedDate);
    try {
      text = await callOpenRouterForBatch(prompt, data, mime);
      usedFallback = true;
    } catch (e) {
      console.error('Direct OpenRouter failed:', e);
      return { steps: null, dateInImage: null, dateRaw: null, dateMatch: null, confidence: 0, notes: '', alert: true, alertReasons: [`OpenRouter failed: ${String(e)}`] };
    }
  } else {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data } }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    if (geminiRes.ok) {
      const geminiJson = await geminiRes.json();
      text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (geminiRes.status === 429 && OPENROUTER_API_KEY) {
      console.warn('Gemini 429 in batch — fallback to OpenRouter', OPENROUTER_MODEL, 'for', expectedDate);
      try {
        text = await callOpenRouterForBatch(prompt, data, mime);
        usedFallback = true;
      } catch (e) {
        const errText = await geminiRes.text().catch(() => '');
        console.error('Gemini 429 + OpenRouter fallback failed:', e, 'gemini status', geminiRes.status, errText.slice(0,200));
        return { steps: null, dateInImage: null, dateRaw: null, dateMatch: null, confidence: 0, notes: '', alert: true, alertReasons: [`Gemini 429 and OpenRouter failed: ${geminiRes.status}`] };
      }
    } else {
      const errText = await geminiRes.text().catch(() => '');
      console.error('Gemini API error:', geminiRes.status, errText.slice(0, 300));
      if (geminiRes.status === 429) {
        return { steps: null, dateInImage: null, dateRaw: null, dateMatch: null, confidence: 0, notes: '', alert: true, alertReasons: [`Gemini API error: 429 (OPENROUTER_API_KEY not configured)`] };
      }
      return { steps: null, dateInImage: null, dateRaw: null, dateMatch: null, confidence: 0, notes: '', alert: true, alertReasons: [`Gemini API error: ${geminiRes.status}`] };
    }
  }

  const parsed = parseGeminiJson(text);
  if (usedFallback) {
    if (parsed.notes) parsed.notes = `[fallback:${OPENROUTER_MODEL}] ` + parsed.notes;
    else parsed.notes = `ประมวลผลด้วย OpenRouter (${OPENROUTER_MODEL}) หลัง Gemini 429`;
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
    provider: usedFallback ? 'openrouter' : 'gemini',
    model: usedFallback ? OPENROUTER_MODEL : GEMINI_MODEL,
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
    if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY and OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    const results = [];
    for (const img of images) {
      if (!img.imageBase64 || !img.expectedDate) {
        results.push({ steps: null, dateInImage: null, dateRaw: null, dateMatch: null, confidence: 0, notes: '', alert: true, alertReasons: ['ไม่มีรูปภาพหรือวันที่'] });
        continue;
      }
      const result = await analyzeOneImage(img.imageBase64, img.expectedDate);
      results.push(result);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('batch-analyze error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
