/**
 * ThaiFoon (ใต้ฝุ่น) — Vision OCR core
 * ใช้ Typhoon API (typhoon-ocr) ด้วย System Prompt ใต้ฝุ่น
 * รองรับ Base64 และ Direct Public Image URL (ผ่าน Vercel proxy)
 */

import { buildThaiFoonPrompt } from '@/lib/thaifoonPrompt';
import { normalizeOcrDate } from '@/lib/stepsDateParser';

const THAIFOON_API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const THAIFOON_MODEL = process.env.TYPHOON_OCR_MODEL || 'typhoon-ocr';

function getApiKey(): string {
  return String(process.env.TYPHOON_API_KEY || '').trim();
}

export interface ThaiFoonContext {
  systemDate: string;
  targetDate: string;
  currentYear: string;
  currentThaiYear: string;
  inputSteps?: number | null;
}

export interface ThaiFoonResult {
  layout_pattern: string | null;
  extracted_steps: number | null;
  extracted_date: string | null; // DD/MM/YYYY or null
  extracted_date_normalized: string | null; // YYYY-MM-DD
  steps_match: boolean | null;
  date_match: boolean | null;
  status: 'APPROVED' | 'REVIEW';
  reason: string;
  // raw สำหรับ debug / backward compat
  rawText: string;
  confidence: number | null; // 0-1 (ถ้า model ให้มา)
  visual_evidence?: string | null;
}

// ---------- helpers ----------
function toIntOrNull(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'null' || s === '' || s === 'undefined') return null;
  const n = Number(s.replace(/,/g, ''));
  return isNaN(n) || n <= 0 ? null : n;
}

function parseDDMMYYYYToISO(s: string | null, fallbackYear: string): string | null {
  if (!s) return null;
  const t = String(s).trim();
  // 15/09/2026
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  // 2026-09-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // fallback ใช้ normalizeOcrDate (รองรับ พ.ศ., วันไทย)
  try {
    const iso = normalizeOcrDate(t, `${fallbackYear}-01-01`);
    return iso;
  } catch { return null; }
}

function cleanContent(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return s;
}

function parseThaiFoonJson(content: string): Partial<ThaiFoonResult> | null {
  const cleaned = cleanContent(content);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const jsonStr = cleaned.slice(start, end + 1);
  try {
    const obj = JSON.parse(jsonStr);
    return obj as Partial<ThaiFoonResult>;
  } catch { return null; }
}

// ---------- main ----------
export async function analyzeImageWithThaiFoon(
  imageDataOrUrl: string,
  opts: { timeoutMs?: number; ctx: ThaiFoonContext }
): Promise<ThaiFoonResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TYPHOON_API_KEY not configured');

  let dataUrl = imageDataOrUrl.trim();
  // รองรับ Direct Public Image URL (https://...) → แปลงเป็น base64 ไม่ต้องทำที่ core, ให้ caller แปลงมาก่อน
  // ที่นี่รับแค่ dataURL หรือ base64
  if (!dataUrl.startsWith('data:')) {
    if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
      // fetch remote image → base64 (สำหรับ Google Drive Direct URL)
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`fetch image URL failed ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || 'image/jpeg';
      dataUrl = `data:${ct};base64,${buf.toString('base64')}`;
    } else {
      dataUrl = `data:image/jpeg;base64,${dataUrl}`;
    }
  }

  const prompt = buildThaiFoonPrompt({
    systemDate: opts.ctx.systemDate,
    targetDate: opts.ctx.targetDate,
    currentYear: opts.ctx.currentYear,
    currentThaiYear: opts.ctx.currentThaiYear,
    inputSteps: opts.ctx.inputSteps ?? null,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25000);

  try {
    const res = await fetch(THAIFOON_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: THAIFOON_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
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
      throw new Error(`ThaiFoon OCR failed ${res.status}: ${errText.slice(0, 500)}`);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';

    // parse JSON ตาม schema ใต้ฝุ่น
    const parsed = parseThaiFoonJson(content);
    const rawText = content.slice(0, 2000);

    // ถ้า parse ไม่ได้ → fallback เป็น REVIEW
    if (!parsed || (parsed.extracted_steps == null && parsed.extracted_date == null && !parsed.layout_pattern)) {
      // ลองดึงด้วย regex แบบหยาบก่อนคืน REVIEW
      return {
        layout_pattern: (parsed as any)?.layout_pattern || null,
        extracted_steps: null,
        extracted_date: null,
        extracted_date_normalized: null,
        steps_match: null,
        date_match: null,
        status: 'REVIEW',
        reason: 'อ่านภาพไม่สำเร็จ — ส่งให้ตรวจสอบ manual',
        rawText,
        confidence: null,
      };
    }

    // normalize extracted_steps
    let extractedSteps: number | null = null;
    if ((parsed as any).extracted_steps != null) extractedSteps = toIntOrNull((parsed as any).extracted_steps);
    // บาง model อาจส่งเป็น steps
    if (extractedSteps == null && (parsed as any).steps != null) extractedSteps = toIntOrNull((parsed as any).steps);

    // normalize extracted_date
    let extractedDateRaw: string | null = (parsed as any).extracted_date ?? null;
    if (extractedDateRaw != null) extractedDateRaw = String(extractedDateRaw).trim();
    if (extractedDateRaw && extractedDateRaw.toLowerCase() === 'null') extractedDateRaw = null;

    const normalizedISO = parseDDMMYYYYToISO(extractedDateRaw, opts.ctx.currentYear);

    // steps_match / date_match — ถ้า model ให้มาใช้เลย, ถ้าไม่ให้คำนวณเอง
    let stepsMatch: boolean | null = (parsed as any).steps_match ?? null;
    if (stepsMatch == null && extractedSteps != null && opts.ctx.inputSteps != null) stepsMatch = extractedSteps === opts.ctx.inputSteps;

    let dateMatch: boolean | null = (parsed as any).date_match ?? null;
    if (dateMatch == null && normalizedISO) dateMatch = normalizedISO === opts.ctx.targetDate;

    // status
    let status: 'APPROVED' | 'REVIEW' = 'REVIEW';
    const rawStatus = String((parsed as any).status || '').toUpperCase();
    if (rawStatus === 'APPROVED' || rawStatus === 'APPROVE' || rawStatus === 'PASS' || rawStatus === 'PASSED') status = 'APPROVED';
    else if (rawStatus === 'REVIEW' || rawStatus === 'REJECT' || rawStatus === 'FLAGGED' || rawStatus === 'REJECTED') status = 'REVIEW';
    else {
      // คำนวณเองถ้า model ไม่ให้ status ชัด
      if (stepsMatch === true && dateMatch === true && extractedSteps != null && extractedDateRaw) status = 'APPROVED';
      else status = 'REVIEW';
    }

    let reason: string = String((parsed as any).reason || '').trim();
    if (!reason) reason = status === 'APPROVED' ? 'ข้อมูลถูกต้องตรงกัน' : 'ต้องตรวจสอบเพิ่มเติม';

    // confidence ถ้ามี
    const confidence = (parsed as any).confidence != null ? Number((parsed as any).confidence) : null;

    return {
      layout_pattern: (parsed as any).layout_pattern || null,
      extracted_steps: extractedSteps,
      extracted_date: extractedDateRaw,
      extracted_date_normalized: normalizedISO,
      steps_match: stepsMatch,
      date_match: dateMatch,
      status,
      reason,
      rawText,
      confidence: confidence != null && !isNaN(confidence) ? confidence : null,
      visual_evidence: (parsed as any).visual_evidence || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function isThaiFoonConfigured(): boolean {
  return !!getApiKey();
}

// Backward compat — ใช้ชื่อเดิมให้ route เก่ายังเรียกได้
export const isTyphoonConfigured = isThaiFoonConfigured;
