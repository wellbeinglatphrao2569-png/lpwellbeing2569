/**
 * POST /api/ai/analyze-steps
 * Body: { imageBase64: string (dataURL or base64), expectedDate: "YYYY-MM-DD", inputSteps?: number }
 * ใช้ Typhoon OCR อ่านภาพ แล้วเทียบกับ expectedDate + inputSteps
 * ตอบ JSON สำหรับ Popup ยืนยัน (สรุปสั้น)
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImageWithTyphoon, isTyphoonConfigured } from '@/lib/typhoon';
import { extractStepsFromText } from '@/lib/stepsExtractor';
import { normalizeOcrDate, isDateMatch } from '@/lib/stepsDateParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;



export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, expectedDate, inputSteps } = body as {
      imageBase64: string;
      expectedDate: string;
      inputSteps?: number | string;
    };

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }
    if (!expectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(expectedDate).trim())) {
      return NextResponse.json({ error: 'expectedDate (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const expected = String(expectedDate).trim();
    const inputNum = inputSteps != null && String(inputSteps).trim() !== '' ? Number(inputSteps) : null;

    // ถ้าไม่มี Typhoon key ให้ fallback เป็น manual pending
    if (!isTyphoonConfigured()) {
      return NextResponse.json({
        success: true,
        fallback: true,
        aiSteps: null,
        aiStepsRaw: null,
        dateRaw: null,
        dateNormalized: null,
        dateMatch: null,
        confidence: null,
        rawText: '',
        stepsExact: null,
        alert: true,
        alertReason: 'Typhoon API ไม่ได้ตั้งค่า — รอตรวจสอบ manual',
        expectedDate: expected,
        inputSteps: inputNum,
      });
    }

    // เรียก Typhoon
    let rawText = '';
    let aiSteps: number | null = null;
    let aiStepsRaw: string | null = null;
    let dateRaw: string | null = null;
    let confidence: number | null = null;

    try {
      const ty = await analyzeStepsImageWithTyphoon(imageBase64, { timeoutMs: 25000 });
      rawText = ty.rawText || '';
      dateRaw = ty.dateRaw ?? null;
      confidence = ty.confidence ?? null;

      // ถ้า Typhoon ส่ง steps มาโดยตรง ให้ใช้เลย
      if (ty.steps != null && !isNaN(Number(ty.steps))) {
        aiSteps = Number(ty.steps);
        aiStepsRaw = ty.stepsRaw ?? String(ty.steps);
      } else {
        // fallback: ดึงจาก rawText เอง
        const ext = extractStepsFromText(rawText);
        aiSteps = ext.steps;
        aiStepsRaw = ext.raw;
      }

      // ถ้า Typhoon ไม่ได้ส่ง dateRaw แต่ rawText มีวันที่ ให้ลองดึงเพิ่ม
      if (!dateRaw && rawText) {
        // ลองหา substring ที่ดูเหมือนวันที่ใน rawText มาเติม dateRaw เพื่อให้ parser ลอง
        // แต่ให้ stepsDateParser จัดการ extract เองด้วย
        dateRaw = rawText.slice(0, 200);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Typhoon analyze failed:', msg);
      return NextResponse.json({
        success: true,
        fallback: true,
        error: msg,
        aiSteps: null,
        aiStepsRaw: null,
        dateRaw: null,
        dateNormalized: null,
        dateMatch: null,
        confidence: null,
        rawText: '',
        stepsExact: null,
        alert: true,
        alertReason: `AI อ่านไม่สำเร็จ: ${msg.slice(0, 200)} — รอตรวจสอบ manual`,
        expectedDate: expected,
        inputSteps: inputNum,
      });
    }

    // ถ้า aiSteps ยัง null ให้ลอง extract จาก rawText อีกรอบ
    if (aiSteps == null && rawText) {
      const ext = extractStepsFromText(rawText);
      aiSteps = ext.steps;
      aiStepsRaw = ext.raw;
    }

    // Normalize วันที่
    const dateNormalized = dateRaw ? normalizeOcrDate(dateRaw, expected) : null;
    const dateMatch = dateRaw ? isDateMatch(dateRaw, expected) : null;

    // ตัดสิน alert — Strict 0% tolerance
    const stepsExact = aiSteps != null && inputNum != null ? aiSteps === inputNum : null;
    // confidence default: ถ้าไม่มีให้ถือว่า 0.5
    const conf = confidence ?? (aiSteps != null && dateNormalized ? 0.7 : 0.3);

    let alert = false;
    let alertReason = '';
    if (aiSteps == null) {
      alert = true;
      alertReason = 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ นสส. ตรวจสอบ';
    } else if (stepsExact === false) {
      alert = true;
      alertReason = `ก้าวไม่ตรงกัน (กรอก ${inputNum?.toLocaleString()} vs อ่าน ${aiSteps.toLocaleString()}) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
    } else if (dateMatch === false) {
      alert = true;
      alertReason = `วันที่ในภาพไม่ตรงกับวันที่เลือกบันทึก (${expected} vs ในภาพ "${dateRaw}" → ${dateNormalized || 'อ่านไม่ได้'})`;
    } else if (dateMatch == null) {
      alert = true;
      alertReason = `อ่านวันที่ในภาพไม่ชัดเจน ("${dateRaw || '—'}") — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
    } else if (conf < 0.85) {
      alert = true;
      alertReason = `ความมั่นใจต่ำ (${Math.round(conf * 100)}%) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
    }

    // ถ้า aiSteps == null หรือ dateMatch == null ให้ confidence ลด
    const finalConfidence = confidence ?? conf;

    return NextResponse.json({
      success: true,
      aiSteps,
      aiStepsRaw,
      dateRaw,
      dateNormalized,
      dateMatch,
      confidence: finalConfidence,
      rawText: rawText.slice(0, 2000),
      stepsExact,
      alert,
      alertReason,
      expectedDate: expected,
      inputSteps: inputNum,
    });
  } catch (error) {
    console.error('analyze-steps error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
