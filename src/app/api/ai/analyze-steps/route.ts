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
  let expectedForError = '';
  let inputForError: unknown = null;
  try {
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('analyze-steps json parse failed:', msg);
      return NextResponse.json({ success: true, fallback: true, aiSteps: null, dateRaw: null, dateNormalized: null, dateMatch: null, confidence: null, alert: true, alertReason: `คำขอไม่ถูกต้อง (JSON): ${msg.slice(0,200)} — รอตรวจสอบ manual`, expectedDate: '', inputSteps: null });
    }
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
    expectedForError = expected;
    const inputNum = inputSteps != null && String(inputSteps).trim() !== '' ? Number(inputSteps) : null;
    inputForError = inputNum;

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
    let tyVisualEvidence: string | null = null;

    try {
      const now = new Date();
      const systemDate = now.toISOString().slice(0, 10);
      const currentYear = String(now.getFullYear());
      const currentThaiYear = String(now.getFullYear() + 543);
      const ty = await analyzeStepsImageWithTyphoon(imageBase64, {
        timeoutMs: 25000,
        ctx: { systemDate, targetDate: expected, currentYear, currentThaiYear },
      });
      rawText = ty.rawText || ty.reasoning || ty.visual_evidence || '';
      // รองรับสคีมาล่าสุด (raw_date_text_from_image / parsed_date_from_image) + เก่า
      const rawNew = (ty as any).raw_date_text_from_image ?? null;
      const parsedNew = (ty as any).parsed_date_from_image ?? null;
      const ocrConfNew = (ty as any).ocr_confidence ?? null;
      tyVisualEvidence = (ty as any).visual_evidence ?? null;

      // treat 0 หรือค่าที่ไม่ใช่ตัวเลขบวกให้เป็น null เพื่อให้ fallback หาเลขใกล้คำว่า ก้าว ได้
      let rawStepsVal: unknown = ty.step_count ?? ty.steps ?? null;
      if (rawStepsVal != null && String(rawStepsVal).trim().toLowerCase() === 'null') rawStepsVal = null;
      if (rawStepsVal != null) {
        const n = Number(String(rawStepsVal).replace(/,/g, '').trim());
        aiSteps = !isNaN(n) && n > 0 ? n : null;
      } else aiSteps = null;
      aiStepsRaw = aiSteps != null ? String(aiSteps) : (ty.stepsRaw ?? null);
      // ตัด dateRaw ที่ยาวเกิน (Typhoon บางครั้งส่งทั้งหน้า) ให้เหลือเฉพาะส่วนที่ดูเหมือนวันที่
      let rawDateCandidate: string | null = rawNew != null ? String(rawNew) : (ty.detected_date_raw ?? ty.dateRaw ?? null);
      if (rawDateCandidate && rawDateCandidate.length > 80) {
        // ลองดึง substring ที่ดูเหมือนวันที่ออกมา (เช่น 27 ส.ค. 2569) แทนทั้งหน้า
        const m = rawDateCandidate.match(/\d{1,2}\s*[ก-๙\.]{2,10}\s*\d{2,4}|\d{1,2}\s*(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)|Today|วันนี้|Yesterday|เมื่อวาน/i);
        if (m) rawDateCandidate = m[0].trim();
        else rawDateCandidate = rawDateCandidate.slice(0, 80).trim();
      }
      dateRaw = rawDateCandidate;
      // ถ้า Typhoon ส่ง parsed_date มาแต่เป็นข้อความยาว ให้ตัด
      let parsedCandidate: string | null = parsedNew != null ? String(parsedNew) : (ty.formatted_date ?? null);
      if (parsedCandidate && parsedCandidate.length > 20) parsedCandidate = parsedCandidate.slice(0, 20).trim();
      tyFormattedDate = parsedCandidate && /^\d{4}-\d{2}-\d{2}$/.test(parsedCandidate) ? parsedCandidate : parsedCandidate && /^[^\n]{1,30}$/.test(parsedCandidate) ? parsedCandidate : null;
      // สำหรับสคีมา extraction-only ไม่มี is_date_matched/status ให้คำนวณเอง
      tyIsMatched = ty.is_date_matched ?? null;
      confidence = ocrConfNew != null ? Number(ocrConfNew) : (ty.confidence_score ?? ty.confidence ?? null);
      tyStatus = ty.status ?? null;
      tyReasoning = ty.reasoning ?? tyVisualEvidence ?? null;
      // visual_evidence เก็บไว้สำหรับ response
      if (tyVisualEvidence) rawText = tyVisualEvidence;

      // fallback: ถ้า Typhoon อ่าน step_count ไม่ได้ (null/0) หรืออ่านเป็นเลขชั้นเล็กๆ (5) ให้หาเลขใกล้คำว่า ก้าว ใน rawText + dateRaw
      const fallbackSources = [rawText, dateRaw, (ty as any).visual_evidence].filter(Boolean).join('\n');
      if ((aiSteps == null || aiSteps === 0 || (aiSteps != null && aiSteps < 100)) && fallbackSources) {
        const ext = extractStepsFromText(fallbackSources);
        if (ext.steps != null && (aiSteps == null || ext.steps > aiSteps * 5 || aiSteps < 100)) {
          // ถ้า Typhoon อ่านได้ 5 แต่ fallback เจอ 3155 ที่อยู่ใกล้คำว่า ก้าว ให้ใช้ 3155
          aiSteps = ext.steps; aiStepsRaw = ext.raw;
        }
      }
      // ถ้ายังไม่มี dateRaw ให้ลองหาใน visual_evidence / rawText
      if (!dateRaw && fallbackSources) {
        const dateLike = fallbackSources.match(/\d{1,2}\s*[ก-๙\.]{2,10}\s*\d{2,4}|Today|วันนี้|Yesterday|เมื่อวาน/i);
        if (dateLike) dateRaw = dateLike[0].trim();
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

    if (aiSteps == null || aiSteps === 0 || (aiSteps != null && aiSteps < 100)) {
      const combined = [rawText, dateRaw, tyVisualEvidence].filter(Boolean).join(' ');
      const ext = extractStepsFromText(combined);
      if (ext.steps != null && (aiSteps == null || ext.steps > aiSteps * 5 || aiSteps < 100)) { aiSteps = ext.steps; aiStepsRaw = ext.raw; }
    }
    if (aiSteps === 0 || (aiSteps != null && aiSteps < 100 && inputNum != null && inputNum >= 1000)) {
      // ถ้ายังได้เลขเล็กๆ ทั้งที่ผู้ใช้กรอกเลขใหญ่ ให้ลองหาใหม่แล้วถือว่า null ถ้าหาไม่เจอ
      const combined = [rawText, dateRaw, tyVisualEvidence].filter(Boolean).join(' ');
      const ext2 = extractStepsFromText(combined);
      if (ext2.steps != null && ext2.steps >= 100) { aiSteps = ext2.steps; aiStepsRaw = ext2.raw; }
      else if (aiSteps != null && aiSteps < 100) { aiSteps = null; aiStepsRaw = null; }
    }

    // Normalize วันที่ — ถ้า Typhoon ให้ parsed_date_from_image ที่เป็น YYYY-MM-DD มาแล้วให้ใช้เลย
    let dateNormalized: string | null = null;
    let dateMatch: boolean | null = null;
    if (tyFormattedDate && /^\d{4}-\d{2}-\d{2}$/.test(tyFormattedDate)) {
      dateNormalized = tyFormattedDate;
      dateMatch = tyFormattedDate === expected;
      if (tyIsMatched != null) dateMatch = tyIsMatched;
    } else {
      dateNormalized = dateRaw ? normalizeOcrDate(dateRaw, expected) : null;
      dateMatch = dateRaw ? isDateMatch(dateRaw, expected) : null;
      if (tyIsMatched != null) dateMatch = tyIsMatched;
    }
    if (dateMatch === false || dateNormalized == null) {
      const combinedForDate = [rawText, dateRaw, tyVisualEvidence].filter(Boolean).join(' ');
      const candidates = combinedForDate.match(/\d{1,2}\s*[ก-๙\.]{1,10}\s*(?:\d{2,4})?|Today|วันนี้|Yesterday|เมื่อวาน|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/gi) || [];
      for (const cand of candidates) {
        const norm = normalizeOcrDate(cand.trim(), expected);
        if (norm === expected) {
          dateRaw = cand.trim();
          dateNormalized = norm;
          dateMatch = true;
          if (confidence == null || confidence < 0.85) confidence = 0.85;
          break;
        }
      }
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
      step_count: aiSteps,
      detected_date_raw: dateRaw,
      formatted_date: dateNormalized,
      // fields สคีมาล่าสุด (extraction-only)
      raw_date_text_from_image: dateRaw,
      parsed_date_from_image: dateNormalized,
      ocr_confidence: finalConfidence,
      visual_evidence: tyVisualEvidence || rawText.slice(0, 500),
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
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.slice(0, 1200) : '';
    console.error('analyze-steps outer error:', msg, stack);
    return NextResponse.json({
      success: true,
      fallback: true,
      aiSteps: null,
      dateRaw: null,
      dateNormalized: null,
      dateMatch: null,
      confidence: null,
      alert: true,
      alertReason: `AI ขัดข้อง: ${msg.slice(0,200)} — รอตรวจสอบ manual`,
      expectedDate: expectedForError,
      inputSteps: inputForError,
      error: msg,
      stack,
    });
  }
}
