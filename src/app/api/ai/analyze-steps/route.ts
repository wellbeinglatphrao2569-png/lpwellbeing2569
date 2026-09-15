/**
 * POST /api/ai/analyze-steps
 * Body: { imageBase64: string (dataURL or base64), expectedDate: "YYYY-MM-DD", inputSteps?: number }
 * ใช้ Typhoon OCR อ่านภาพ แล้วเทียบกับ expectedDate + inputSteps
 * ตอบ JSON สำหรับ Popup ยืนยัน (สรุปสั้น)
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeImageWithThaiFoon, isThaiFoonConfigured } from '@/lib/thaifoon';
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

    // ถ้าไม่มี ThaiFoon key ให้ fallback เป็น manual pending (ยังคงข้อความไทยเดิม)
    if (!isThaiFoonConfigured()) {
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
        alertReason: 'ThaiFoon API ไม่ได้ตั้งค่า — รอตรวจสอบ manual',
        // ThaiFoon fields ว่าง
        layout_pattern: null,
        extracted_steps: null,
        extracted_date: null,
        steps_match: null,
        status: 'REVIEW',
        reason: 'API ไม่ได้ตั้งค่า',
        expectedDate: expected,
        inputSteps: inputNum,
      });
    }

    // เรียก ThaiFoon (ใต้ฝุ่น) — Vision OCR ตาม Master Prompt PART 1
    let thaifoon: any = null;
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
    let layoutPattern: string | null = null;
    let extractedDateRaw: string | null = null;

    try {
      const now = new Date();
      const systemDate = now.toISOString().slice(0, 10);
      const currentYear = String(now.getFullYear());
      const currentThaiYear = String(now.getFullYear() + 543);
      thaifoon = await analyzeImageWithThaiFoon(imageBase64, {
        timeoutMs: 25000,
        ctx: { systemDate, targetDate: expected, currentYear, currentThaiYear, inputSteps: inputNum },
      });
      rawText = thaifoon.rawText || '';
      layoutPattern = thaifoon.layout_pattern || null;
      extractedDateRaw = thaifoon.extracted_date || null;
      aiSteps = thaifoon.extracted_steps;
      aiStepsRaw = aiSteps != null ? String(aiSteps) : null;
      dateRaw = extractedDateRaw;
      tyFormattedDate = thaifoon.extracted_date_normalized || null;
      tyIsMatched = thaifoon.date_match;
      tyStatus = thaifoon.status === 'APPROVED' ? 'passed' : 'flagged_for_review';
      tyReasoning = thaifoon.reason || null;
      tyVisualEvidence = (thaifoon as any).visual_evidence || null;
      confidence = thaifoon.confidence;

      // fallback ถ้า ThaiFoon อ่าน step เป็น null หรือเลขเล็ก <100 ให้ลอง fallback แบบเดิม (เช่น จำนวนชั้น 1)
      const fallbackSources = [rawText, dateRaw, tyVisualEvidence].filter(Boolean).join('\n');
      let needSecondTry = false;
      if ((aiSteps == null || aiSteps === 0 || (aiSteps != null && aiSteps < 100)) && fallbackSources) {
        const ext = extractStepsFromText(fallbackSources);
        if (ext.steps != null && (aiSteps == null || ext.steps > aiSteps * 5 || aiSteps < 100)) {
          aiSteps = ext.steps; aiStepsRaw = ext.raw;
        } else {
          needSecondTry = true;
        }
      } else if (aiSteps != null && aiSteps < 100) {
        needSecondTry = true;
      }
      if (needSecondTry && (aiSteps == null || aiSteps < 100)) {
        const ac2 = new AbortController();
        const t2 = setTimeout(() => ac2.abort(), 12000);
        try {
          const retryPrompt = `อ่านเฉพาะตัวเลขที่อยู่ใต้คำว่า "ก้าวเดิน" ตรงกลางจอเท่านั้น (เช่น ก้าวเดิน 5,546) ห้ามอ่าน "จำนวนชั้นที่ขึ้น 1" ตอบเป็น JSON {"step_count": <int>} เท่านั้น`;
          const retryRes = await fetch('https://api.opentyphoon.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TYPHOON_API_KEY}` },
            body: JSON.stringify({
              model: process.env.TYPHOON_OCR_MODEL || 'typhoon-ocr',
              messages: [{ role: 'user', content: [{ type: 'text', text: retryPrompt }, { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }] }],
              temperature: 0.1,
              max_tokens: 256,
            }),
            signal: ac2.signal,
          });
          if (retryRes.ok) {
            const j = await retryRes.json();
            const c: string = j?.choices?.[0]?.message?.content ?? '';
            const m = c.match(/"step_count"\s*:\s*(\d[\d,]*)/) || c.match(/(\d[\d,]{2,10})/);
            if (m) {
              const n = Number(m[1].replace(/,/g, ''));
              if (!isNaN(n) && n >= 100) { aiSteps = n; aiStepsRaw = m[1]; }
            }
          }
        } catch {} finally { clearTimeout(t2); }
      }
      if (!dateRaw && fallbackSources) {
        const dateLike = fallbackSources.match(/\d{1,2}\s*[ก-๙\.]{2,10}\s*\d{2,4}|Today|วันนี้|Yesterday|เมื่อวาน/i);
        if (dateLike) dateRaw = dateLike[0].trim();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('ThaiFoon analyze failed:', msg);
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
        layout_pattern: null,
        extracted_steps: null,
        extracted_date: null,
        steps_match: null,
        date_match: null,
        status: 'REVIEW',
        reason: msg.slice(0, 200),
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

    const stepsExact = aiSteps != null && inputNum != null ? aiSteps === inputNum : null;
    // ถ้า Typhoon ไม่ส่ง confidence มา แต่ก้าวและวันที่ตรงกันพอดี ให้ถือว่ามั่นใจสูง (ไม่ควร 70% แล้ว flag)
    let conf: number;
    if (confidence != null) conf = confidence;
    else if (stepsExact === true && dateMatch === true) conf = 0.96;
    else if (aiSteps != null && dateNormalized) conf = 0.85;
    else conf = 0.3;

    let alert: boolean;
    let alertReason: string;
    // เคสตรงกันพอดี: ไม่ต้องดู confidence ว่า 70% — ให้ผ่านเลย (จะได้ไม่สับสน)
    if (stepsExact === true && dateMatch === true) {
      alert = false;
      alertReason = '';
      if (conf < 0.85) conf = 0.95;
    } else if (tyStatus === 'passed' && stepsExact !== false && dateMatch !== false) {
      alert = false;
      alertReason = tyReasoning || '';
    } else if (tyStatus === 'flagged_for_review') {
      alert = true;
      alertReason = tyReasoning || 'AI ประเมินให้ส่งตรวจสอบ — ภาพเบลอ/ไม่พบวันที่/วันที่ไม่ตรง';
    } else {
      if (aiSteps == null) {
        alert = true;
        alertReason = tyReasoning || 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ นสส. ตรวจสอบ';
      } else if (stepsExact === false) {
        alert = true;
        alertReason = tyReasoning || `ก้าวไม่ตรงกัน (กรอก ${inputNum?.toLocaleString()} AI อ่านได้ ${aiSteps.toLocaleString()}) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else if (dateMatch === false) {
        alert = true;
        alertReason = tyReasoning || `วันที่ในภาพไม่ตรงกับวันที่เลือกบันทึก (${expected} AI อ่านได้ "${dateRaw}" → ${dateNormalized || 'อ่านไม่ได้'})`;
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

    const finalConfidence = conf;

    // ส่งทั้ง schema ใต้ฝุ่นใหม่ + schema เดิม (backward compat)
    const thaifoonStepsMatch = thaifoon ? thaifoon.steps_match : stepsExact === true;
    const thaifoonDateMatch = thaifoon ? thaifoon.date_match : dateMatch;
    const thaifoonStatus = thaifoon ? thaifoon.status : (alert ? 'REVIEW' : 'APPROVED');
    return NextResponse.json({
      success: true,
      // ThaiFoon ใหม่ (PART 1)
      layout_pattern: layoutPattern,
      extracted_steps: aiSteps,
      extracted_date: dateRaw ? (tyFormattedDate ? (() => { try { const p = tyFormattedDate; if (/^\d{4}-\d{2}-\d{2}$/.test(p)) { const [y,m,d] = p.split('-'); return `${d}/${m}/${y}`; } return p; } catch { return dateRaw; } })() : dateRaw) : null,
      steps_match: stepsExact === true ? true : stepsExact === false ? false : thaifoonStepsMatch,
      date_match: dateMatch,
      status: thaifoonStatus,
      reason: tyReasoning || alertReason || (thaifoon ? thaifoon.reason : ''),
      // Backward compat (เดิม)
      aiSteps,
      aiStepsRaw,
      dateRaw,
      dateNormalized,
      dateMatch,
      confidence: finalConfidence,
      step_count: aiSteps,
      detected_date_raw: dateRaw,
      formatted_date: dateNormalized,
      raw_date_text_from_image: dateRaw,
      parsed_date_from_image: dateNormalized,
      ocr_confidence: finalConfidence,
      visual_evidence: tyVisualEvidence || rawText.slice(0, 500),
      is_date_matched: dateMatch,
      confidence_score: finalConfidence,
      // alias เดิม
      status_old: alert ? 'flagged_for_review' : 'passed',
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
