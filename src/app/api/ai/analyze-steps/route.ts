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

    // เรียก Typhoon ด้วย context ใหม่ — สกัดข้อความล้วน (Text Extraction Only) แล้ว Backend จะเทียบเอง
    let rawText = '';
    let aiSteps: number | null = null;
    let aiStepsRaw: string | null = null;
    let dateRaw: string | null = null; // raw_date_text_from_image
    let confidence: number | null = null; // ocr_confidence
    let tyParsedDate: string | null = null; // parsed_date_from_image
    let tyVisual: string | null = null;

    try {
      const now = new Date();
      const systemDate = now.toISOString().slice(0, 10);
      const currentYear = String(now.getFullYear());
      const currentThaiYear = String(now.getFullYear() + 543);
      const ty = await analyzeStepsImageWithTyphoon(imageBase64, {
        timeoutMs: 25000,
        ctx: { systemDate, targetDate: expected, currentYear, currentThaiYear },
      });
      // รองรับสคีมาใหม่ Text Extraction เป็นหลัก
      aiSteps = (ty as any).step_count ?? ty.steps ?? null;
      if (aiSteps != null) aiSteps = Number(String(aiSteps).replace(/,/g, ''));
      aiStepsRaw = ty.stepsRaw ?? (aiSteps != null ? String(aiSteps) : null);
      dateRaw = (ty as any).raw_date_text_from_image ?? (ty as any).detected_date_raw ?? ty.dateRaw ?? null;
      tyParsedDate = (ty as any).parsed_date_from_image ?? (ty as any).formatted_date ?? null;
      confidence = (ty as any).ocr_confidence ?? (ty as any).confidence_score ?? ty.confidence ?? null;
      tyVisual = (ty as any).visual_evidence ?? (ty as any).reasoning ?? null;
      rawText = tyVisual || ty.rawText || '';

      if (aiSteps == null && !isNaN(Number(ty.steps))) {
        aiSteps = Number(String(ty.steps).replace(/,/g, ''));
        aiStepsRaw = ty.stepsRaw ?? String(ty.steps);
      }
      if (aiSteps == null && rawText) {
        const ext = extractStepsFromText(rawText);
        if (ext.steps != null) { aiSteps = ext.steps; aiStepsRaw = ext.raw; }
      }
      if (!dateRaw && rawText) {
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

    // === Backend Compare Logic ตามสเปคใหม่ — เทียบ parsed_date_from_image กับ userSelectedDate ===
    // ถ้า Typhoon ให้ parsed_date_from_image มาแล้วใช้เลย, ถ้าไม่ให้ fallback parser เอง
    let dateNormalized: string | null = null;
    if (tyParsedDate && /^\d{4}-\d{2}-\d{2}$/.test(tyParsedDate)) {
      dateNormalized = tyParsedDate;
    } else if (dateRaw) {
      dateNormalized = normalizeOcrDate(dateRaw, expected);
    }

    const imageDate = dateNormalized; // parsed_date_from_image
    const rawTextForLog = dateRaw; // raw_date_text_from_image

    // Comparison Logic ตามโค้ดตัวอย่างที่ให้มา
    let isApprovedByAI = false;
    let reviewReason = '';
    if (!imageDate || !rawTextForLog) {
      isApprovedByAI = false;
      reviewReason = 'ไม่พบข้อความวันที่ในรูปภาพ';
    } else if (imageDate === expected) {
      isApprovedByAI = true;
      reviewReason = `วันที่ในภาพ (${rawTextForLog} -> ${imageDate}) ตรงกับวันที่บันทึก`;
    } else {
      isApprovedByAI = false;
      reviewReason = `วันที่ในภาพ (${rawTextForLog} -> ${imageDate}) ไม่ตรงกับวันที่ผู้ใช้เลือก (${expected})`;
    }

    const stepsExact = aiSteps != null && inputNum != null ? aiSteps === inputNum : null;
    const conf = confidence ?? (aiSteps != null && dateNormalized ? 0.7 : 0.3);

    // สกัดข้อความล้วน: ก้าวต้องอ่านได้ + วันที่ตรง + conf>=0.8 ถึง passed
    let alert: boolean;
    let alertReason: string;
    let finalStatus: 'passed' | 'flagged_for_review';
    if (aiSteps == null) {
      alert = true;
      alertReason = 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ตรวจสอบ';
      finalStatus = 'flagged_for_review';
    } else if (!isApprovedByAI) {
      alert = true;
      alertReason = reviewReason;
      finalStatus = 'flagged_for_review';
    } else if ((confidence ?? conf) < 0.8) {
      alert = true;
      alertReason = `ความมั่นใจต่ำ (${Math.round((confidence ?? conf) * 100)}%) — ${reviewReason}`;
      finalStatus = 'flagged_for_review';
    } else if (stepsExact === false) {
      // ก้าวไม่ตรงที่กรอก — ยังให้ผ่านวันที่ แต่ต้อง flagged เพื่อให้เจ้าหน้าที่เทียบก้าว
      alert = true;
      alertReason = `ก้าวไม่ตรงกัน (กรอก ${inputNum?.toLocaleString()} vs อ่าน ${aiSteps.toLocaleString()}) — ${reviewReason}`;
      finalStatus = 'flagged_for_review';
    } else {
      alert = false;
      alertReason = reviewReason;
      finalStatus = 'passed';
    }

    // ถ้ามี visual_evidence จาก Typhoon ให้ใช้เป็น reasoning
    const reasoning = tyVisual || reviewReason;

    const finalConfidence = confidence ?? conf;

    return NextResponse.json({
      success: true,
      // legacy fields สำหรับ popup เดิม
      aiSteps,
      aiStepsRaw,
      dateRaw: rawTextForLog,
      dateNormalized,
      dateMatch: isApprovedByAI,
      confidence: finalConfidence,
      // fields ใหม่ตามสเปคสกัดข้อความล้วน
      raw_date_text_from_image: rawTextForLog,
      parsed_date_from_image: dateNormalized,
      step_count: aiSteps,
      ocr_confidence: finalConfidence,
      visual_evidence: tyVisual,
      // fields เทียบเคียงสำหรับ Backend routing
      expectedDate: expected,
      inputSteps: inputNum,
      isApprovedByAI,
      reviewReason,
      formatted_date: dateNormalized,
      is_date_matched: isApprovedByAI,
      confidence_score: finalConfidence,
      status: finalStatus,
      reasoning,
      rawText: (tyVisual || rawText).slice(0, 2000),
      stepsExact,
      alert,
      alertReason,
    } as any);
  } catch (error) {
    console.error('analyze-steps error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
