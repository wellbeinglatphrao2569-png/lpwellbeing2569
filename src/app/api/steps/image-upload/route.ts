/**
 * อัปโหลดภาพหลักฐานก้าวเดิน → ส่งต่อ GAS backend
 * (GAS เป็นคนอัปโหลดไฟล์ไป Google Drive + บันทึก Steps_Log)
 * ระบบบันทึกแบบ Pending รอตรวจสอบ manual ล้วน
 *
 * POST /api/steps/image-upload
 * Body: { imageBase64, userId, steps, dateThai }
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImageWithTyphoon, isTyphoonConfigured } from '@/lib/typhoon';
import { extractStepsFromText } from '@/lib/stepsExtractor';
import { normalizeOcrDate, isDateMatch } from '@/lib/stepsDateParser';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

function extractBase64(imageBase64: string): string {
  const match = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : imageBase64;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, userId, steps, dateThai } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!steps || Number(steps) <= 0) {
      return NextResponse.json({ error: 'steps is required' }, { status: 400 });
    }
    if (!dateThai) {
      return NextResponse.json({ error: 'dateThai is required' }, { status: 400 });
    }
    if (!GAS_API_URL) {
      return NextResponse.json({ error: 'GAS API not configured' }, { status: 500 });
    }

    // ห้วงเวลาบันทึก + Data Freeze
    try {
      const winRes = await fetch(`${GAS_API_URL}?path=project-window`, { cache: 'no-store' });
      if (winRes.ok) {
        const win = await winRes.json();
        if (win && win.start && win.end) {
          const today = new Date().toISOString().slice(0, 10);
          if (today > String(win.end).slice(0, 10)) {
            return NextResponse.json({ error: `โครงการสิ้นสุดแล้ว (${win.start} ถึง ${win.end}) — ระบบล็อคการรับข้อมูล (Data Freeze)` }, { status: 403 });
          }
          const d = String(dateThai).trim().slice(0, 10);
          if (d < String(win.start).slice(0, 10) || d > String(win.end).slice(0, 10)) {
            return NextResponse.json({ error: `นอกห้วงเวลาบันทึก (${win.start} ถึง ${win.end}) — ไม่สามารถบันทึกวันที่ ${d} ได้` }, { status: 400 });
          }
        }
      }
    } catch (e) {
      console.warn('image-upload window check failed', e);
    }

    // กัน Mode 2 บันทึกเอง
    try {
      const uRes = await fetch(`${GAS_API_URL}?path=users`, { cache: 'no-store' });
      if (uRes.ok) {
        const users = await uRes.json();
        if (Array.isArray(users)) {
          const target = users.find((u: any) => String(u.User_ID).trim() === String(userId).trim());
          if (target && String((target as any).Step_Record_Mode || '1').trim() === '2') {
            return NextResponse.json({ error: 'คุณอยู่ใน Mode 2 (เจ้าหน้าที่ นสส. บันทึกให้) — ไม่สามารถบันทึกเองได้' }, { status: 403 });
          }
        }
      }
    } catch (e) {
      console.warn('image-upload mode check failed', e);
    }

    // ตรวจสอบด้วย Typhoon OCR — ถ้ามีข้อมูล AI จาก client ส่งมา (aiSteps/dateMatch) ให้ใช้เลย, ถ้าไม่มีให้ลองอ่านเอง
    let aiSteps: number | null = null;
    let aiConfidence: number | null = null;
    let dateInImageRaw: string | null = null;
    let dateMatch: boolean | null = null;
    let dateNormalized: string | null = null;
    let alertFlag: 'TRUE' | 'FALSE' = 'TRUE';
    let alertReason = 'รอตรวจสอบ manual';
    let aiStepsRaw: string | null = null;

    // รับค่าจาก body ถ้า client ส่งมาจาก /api/ai/analyze-steps แล้ว (flow 2 ชั้นยืนยัน)
    const bodyAi = body as any;
    if (bodyAi.aiSteps != null || bodyAi.dateRaw != null || bodyAi.dateMatch != null) {
      aiSteps = bodyAi.aiSteps != null ? Number(bodyAi.aiSteps) : null;
      aiStepsRaw = bodyAi.aiStepsRaw != null ? String(bodyAi.aiStepsRaw) : null;
      aiConfidence = bodyAi.confidence != null ? Number(bodyAi.confidence) : (bodyAi.aiConfidence != null ? Number(bodyAi.aiConfidence) : null);
      dateInImageRaw = bodyAi.dateRaw != null ? String(bodyAi.dateRaw) : (bodyAi.Date_In_Image != null ? String(bodyAi.Date_In_Image) : null);
      dateNormalized = bodyAi.dateNormalized != null ? String(bodyAi.dateNormalized) : null;
      const dm = bodyAi.dateMatch ?? bodyAi.Date_Match;
      dateMatch = dm === true || dm === 'TRUE' ? true : dm === false || dm === 'FALSE' ? false : null;
      alertFlag = bodyAi.alertFlag === 'FALSE' || bodyAi.Alert_Flag === 'FALSE' ? 'FALSE' : 'TRUE';
      alertReason = bodyAi.alertReason ?? bodyAi.Alert_Reason ?? alertReason;
      // ถ้า client บอกว่า alert=false และ dateMatch true + stepsExact → จะได้ Approved
    } else if (isTyphoonConfigured()) {
      try {
        const now = new Date();
        const systemDate = now.toISOString().slice(0, 10);
        const ty = await analyzeStepsImageWithTyphoon(String(imageBase64), {
          timeoutMs: 20000,
          ctx: { systemDate, targetDate: String(dateThai), currentYear: String(now.getFullYear()), currentThaiYear: String(now.getFullYear() + 543) },
        });
        const tySteps = (ty as any).step_count ?? ty.steps ?? null;
        if (tySteps != null) {
          aiSteps = Number(String(tySteps).replace(/,/g, ''));
          aiStepsRaw = ty.stepsRaw ?? String(tySteps);
        } else if (ty.rawText) {
          const ext = extractStepsFromText(ty.rawText);
          aiSteps = ext.steps;
          aiStepsRaw = ext.raw;
        }
        dateInImageRaw = (ty as any).detected_date_raw ?? ty.dateRaw ?? null;
        const tyFmt = (ty as any).formatted_date ?? null;
        const tyMatched = (ty as any).is_date_matched ?? null;
        aiConfidence = (ty as any).confidence_score ?? ty.confidence ?? null;
        if (tyFmt && /^\d{4}-\d{2}-\d{2}$/.test(tyFmt)) {
          dateNormalized = tyFmt;
          dateMatch = tyMatched != null ? Boolean(tyMatched) : tyFmt === String(dateThai);
        } else {
          dateNormalized = dateInImageRaw ? normalizeOcrDate(dateInImageRaw, String(dateThai)) : null;
          dateMatch = dateInImageRaw ? isDateMatch(dateInImageRaw, String(dateThai)) : null;
          if (tyMatched != null) dateMatch = Boolean(tyMatched);
        }
        const tyReason = (ty as any).reasoning ?? null;
        if (tyReason && !alertReason) alertReason = tyReason;
      } catch (e) {
        console.warn('image-upload Typhoon fallback failed:', e);
      }
    }

    // ตัดสิน Strict 0% tolerance
    const inputStepsNum = Number(steps);
    const stepsExact = aiSteps != null ? aiSteps === inputStepsNum : null;
    const conf = aiConfidence ?? (aiSteps != null && dateNormalized ? 0.7 : 0.3);

    // ถ้าไม่มีข้อมูล AI เลย → Pending
    if (aiSteps == null && dateMatch == null && !bodyAi.aiSteps) {
      alertFlag = 'TRUE';
      alertReason = dateInImageRaw ? 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ตรวจสอบ' : 'AI อ่านไม่สำเร็จ — รอตรวจสอบ manual';
    } else if (bodyAi.alertReason == null && bodyAi.Alert_Reason == null) {
      // คำนวณ alert เองถ้า client ไม่ได้ส่งมา
      if (aiSteps == null) {
        alertFlag = 'TRUE';
        alertReason = 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ตรวจสอบ';
      } else if (stepsExact === false) {
        alertFlag = 'TRUE';
        alertReason = `ก้าวไม่ตรงกัน (กรอก ${inputStepsNum.toLocaleString()} vs อ่าน ${aiSteps.toLocaleString()}) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else if (dateMatch === false) {
        alertFlag = 'TRUE';
        alertReason = `วันที่ในภาพไม่ตรงกับวันที่เลือกบันทึก (${String(dateThai)} vs ในภาพ "${dateInImageRaw}" → ${dateNormalized || 'อ่านไม่ได้'})`;
      } else if (dateMatch == null) {
        alertFlag = 'TRUE';
        alertReason = `อ่านวันที่ในภาพไม่ชัดเจน ("${dateInImageRaw || '—'}") — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else if (conf < 0.85) {
        alertFlag = 'TRUE';
        alertReason = `ความมั่นใจต่ำ (${Math.round(conf * 100)}%) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else {
        alertFlag = 'FALSE';
        alertReason = '';
      }
    }

    const autoApprove = alertFlag === 'FALSE' && stepsExact === true && dateMatch === true && conf >= 0.85;
    const serverStatus: 'Approved' | 'Pending' = autoApprove ? 'Approved' : 'Pending';

    const gasRes = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'add-step',
        User_ID: String(userId),
        Steps_Count: Number(steps),
        Date_Thai: String(dateThai),
        Record_Method: 'ภาพถ่าย',
        Status: serverStatus,
        Image_Base64: extractBase64(imageBase64),
        AI_Steps: aiSteps != null ? String(aiSteps) : (aiStepsRaw || ''),
        AI_Confidence: aiConfidence != null ? String(aiConfidence) : String(conf),
        Date_In_Image: dateInImageRaw || dateNormalized || '',
        Date_Match: dateMatch === true ? 'TRUE' : dateMatch === false ? 'FALSE' : '',
        Alert_Flag: alertFlag,
        Alert_Reason: alertReason,
        Notes: aiStepsRaw ? `AIอ่าน: ${aiStepsRaw} | วันที่ดิบ: ${dateInImageRaw || '—'}` : '',
      }),
    });

    const gasJson = await gasRes.json().catch(() => ({}));
    if (!gasRes.ok || gasJson.error) {
      console.error('GAS add-step failed:', gasRes.status, gasJson);
      return NextResponse.json({ error: gasJson.error || `GAS error: ${gasRes.status}` }, { status: gasRes.ok ? 500 : gasRes.status });
    }

    return NextResponse.json({
      ...gasJson,
      aiStatus: serverStatus,
      aiSteps,
      aiStepsRaw,
      aiConfidence,
      dateInImageRaw,
      dateNormalized,
      dateMatch,
      alertFlag,
      alertReason,
    });
  } catch (error) {
    console.error('image-upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
