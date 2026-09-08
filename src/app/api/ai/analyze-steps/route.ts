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

    // เรียก Typhoon ด้วย context ใหม่ (SYSTEM_DATE/TARGET_DATE/CURRENT_YEAR)
    let rawText = '';
    let aiSteps: number | null = null;
    let aiStepsRaw: string | null = null;
    let dateRaw: string | null = null;
    let confidence: number | null = null;
    let tyFormattedDate: string | null = null;
    let tyIsMatched: boolean | null = null;
    let tyStatus: string | null = null;
    let tyReasoning: string | null = null;

    try {
      const now = new Date();
      const systemDate = now.toISOString().slice(0, 10);
      const currentYear = String(now.getFullYear());
      const currentThaiYear = String(now.getFullYear() + 543);
      const ty = await analyzeStepsImageWithTyphoon(imageBase64, {
        timeoutMs: 25000,
        ctx: { systemDate, targetDate: expected, currentYear, currentThaiYear },
      });
      rawText = ty.rawText || ty.reasoning || '';
      // รองรับสคีมาใหม่ก่อน
      aiSteps = ty.step_count ?? ty.steps ?? null;
      if (aiSteps != null) aiSteps = Number(String(aiSteps).replace(/,/g, ''));
      aiStepsRaw = ty.stepsRaw ?? (aiSteps != null ? String(aiSteps) : null);
      dateRaw = ty.detected_date_raw ?? ty.dateRaw ?? null;
      tyFormattedDate = ty.formatted_date ?? null;
      tyIsMatched = ty.is_date_matched ?? null;
      confidence = ty.confidence_score ?? ty.confidence ?? null;
      tyStatus = ty.status ?? null;
      tyReasoning = ty.reasoning ?? null;

      if (aiSteps == null && !isNaN(Number(ty.steps))) {
        aiSteps = Number(ty.steps);
        aiStepsRaw = ty.stepsRaw ?? String(ty.steps);
      }
      if (aiSteps == null && rawText) {
        const ext = extractStepsFromText(rawText);
        if (ext.steps != null) { aiSteps = ext.steps; aiStepsRaw = ext.raw; }
      }
      if (!dateRaw && rawText) {
        dateRaw = rawText.slice(0, 200);
      }
      // ถ้า Typhoon ให้ formatted_date มาแล้ว ให้ใช้เป็นตัวตั้งต้นสำหรับ normalize
      if (tyFormattedDate && /^\d{4}-\d{2}-\d{2}$/.test(tyFormattedDate)) {
        // จะใช้ tyFormattedDate เป็น dateNormalized โดยตรงในขั้นตอนถัดไป
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

    // Normalize วันที่ — ถ้า Typhoon ให้ formatted_date ที่เป็น YYYY-MM-DD มาแล้วให้ใช้เลย (น่าเชื่อถือกว่า parser)
    let dateNormalized: string | null = null;
    let dateMatch: boolean | null = null;
    if (tyFormattedDate && /^\d{4}-\d{2}-\d{2}$/.test(tyFormattedDate)) {
      dateNormalized = tyFormattedDate;
      dateMatch = tyIsMatched != null ? tyIsMatched : tyFormattedDate === expected;
    } else {
      dateNormalized = dateRaw ? normalizeOcrDate(dateRaw, expected) : null;
      dateMatch = dateRaw ? isDateMatch(dateRaw, expected) : null;
      // ถ้า Typhoon บอก is_date_matched มา ให้ยึดตามนั้น
      if (tyIsMatched != null) dateMatch = tyIsMatched;
    }

    // ตัดสิน alert — ยึด status จาก Typhoon เป็นหลัก (passed/flagged_for_review) + Strict 0% tolerance เทียบ inputSteps
    const stepsExact = aiSteps != null && inputNum != null ? aiSteps === inputNum : null;
    const conf = confidence ?? (aiSteps != null && dateNormalized ? 0.7 : 0.3);

    // ถ้า Typhoon บอก status ชัดเจน ให้ใช้เลย
    let alert: boolean;
    let alertReason: string;
    if (tyStatus === 'passed' && stepsExact !== false && dateMatch !== false) {
      alert = false;
      alertReason = tyReasoning || '';
    } else if (tyStatus === 'flagged_for_review') {
      alert = true;
      alertReason = tyReasoning || 'AI ประเมินให้ส่งตรวจสอบ — ภาพเบลอ/ไม่พบวันที่/วันที่ไม่ตรง';
    } else {
      // fallback logic เดิม
      if (aiSteps == null) {
        alert = true;
        alertReason = tyReasoning || 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ นสส. ตรวจสอบ';
      } else if (stepsExact === false) {
        alert = true;
        alertReason = tyReasoning || `ก้าวไม่ตรงกัน (กรอก ${inputNum?.toLocaleString()} vs อ่าน ${aiSteps.toLocaleString()}) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else if (dateMatch === false) {
        alert = true;
        alertReason = tyReasoning || `วันที่ในภาพไม่ตรงกับวันที่เลือกบันทึก (${expected} vs ในภาพ "${dateRaw}" → ${dateNormalized || 'อ่านไม่ได้'})`;
      } else if (dateMatch == null) {
        alert = true;
        alertReason = tyReasoning || `อ่านวันที่ในภาพไม่ชัดเจน ("${dateRaw || '—'}") — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else if (conf < 0.85) {
        alert = true;
        alertReason = tyReasoning || `ความมั่นใจต่ำ (${Math.round(conf * 100)}%) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else {
        alert = false;
        alertReason = tyReasoning || '';
      }
    }

    const finalConfidence = confidence ?? conf;

    return NextResponse.json({
      success: true,
      aiSteps,
      aiStepsRaw,
      dateRaw,
      dateNormalized,
      dateMatch,
      confidence: finalConfidence,
      // fields ใหม่ตามสเปคสำหรับ client ที่ต้องการ
      step_count: aiSteps,
      detected_date_raw: dateRaw,
      formatted_date: dateNormalized,
      is_date_matched: dateMatch,
      confidence_score: finalConfidence,
      status: alert ? 'flagged_for_review' : 'passed',
      reasoning: tyReasoning || alertReason,
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
