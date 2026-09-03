/**
 * อัปโหลดภาพหลักฐานก้าวเดิน → ส่งต่อ GAS backend
 * (GAS เป็นคนอัปโหลดไฟล์ไป Google Drive + บันทึก Steps_Log)
 *
 * POST /api/steps/image-upload
 * Body: {
 *   imageBase64, userId, steps, dateThai,
 *   aiSteps, aiConfidence, dateInImage, dateMatch, alert, alertReasons[]
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImage } from '@/lib/serverAi';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

function extractBase64(imageBase64: string): string {
  const match = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : imageBase64;
}
function hasAiKeys(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, userId, steps, dateThai, aiSteps, aiConfidence, dateMatch, alert, alertReasons } = body;

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

    // ห้วงเวลาบันทึก + Data Freeze: ตรวจว่าอยู่ในห้วงและยังไม่เกินวันสิ้นสุด (กันยิง API ตรง)
    try {
      const winRes = await fetch(`${GAS_API_URL}?path=project-window`, { cache: 'no-store' });
      if (winRes.ok) {
        const win = await winRes.json();
        if (win && win.start && win.end) {
          const today = new Date().toISOString().slice(0,10);
          // Data Freeze: ถ้าวันนี้เกิน end ให้ล็อคทันที
          if (today > String(win.end).slice(0,10)) {
            return NextResponse.json({ error: `โครงการสิ้นสุดแล้ว (${win.start} ถึง ${win.end}) — ระบบล็อคการรับข้อมูล (Data Freeze) — ยึดอันดับสุดท้ายเป็นผลถาวร` }, { status: 403 });
          }
          const d = String(dateThai).trim().slice(0,10);
          if (d < String(win.start).slice(0,10) || d > String(win.end).slice(0,10)) {
            return NextResponse.json({ error: `นอกห้วงเวลาบันทึก (${win.start} ถึง ${win.end}) — ไม่สามารถบันทึกวันที่ ${d} ได้` }, { status: 400 });
          }
        }
      }
    } catch (e) { console.warn('image-upload window check failed', e); }

    // กัน Mode 2 บันทึกเอง — ต้องให้ จนท. บันทึกให้เท่านั้น (Mode 1 จึงบันทึกได้)
    try {
      const uRes = await fetch(`${GAS_API_URL}?path=users`, { cache: 'no-store' });
      if (uRes.ok) {
        const users = await uRes.json();
        if (Array.isArray(users)) {
          const target = users.find((u: any) => String(u.User_ID).trim() === String(userId).trim());
          if (target && String((target as any).Step_Record_Mode || '1').trim() === '2') {
            return NextResponse.json({ error: 'คุณอยู่ใน Mode 2 (เจ้าหน้าที่ นสส. บันทึกให้) — ไม่สามารถบันทึกเองได้ กรุณาติดต่อเจ้าหน้าที่ประจำฝ่าย' }, { status: 403 });
          }
        }
      }
    } catch (e) {
      console.warn('image-upload mode check failed', e);
    }

    // ── Server-only AI ตรวจสอบ: ถ้ามั่นใจสูง (ตัวเลข+วันที่ชัดเจนตรงกัน) → Approved ทันที + นับคะแนน; ถ้าสงสัยเล็กน้อย/ผิดปกติ/ตัดต่อ → Pending ให้ต่างฝ่ายตรวจ ──
    let finalAiSteps: any = aiSteps;
    let finalAiConf: any = aiConfidence;
    let finalDateInImage: any = '';
    let finalDateMatch: any = dateMatch;
    let finalAlert: boolean = !!alert;
    let finalAlertReasons: string[] = Array.isArray(alertReasons) ? [...alertReasons] : [];
    let finalNotes = '';
    let aiProvider: string = 'gemini';
    let aiModel: string = GEMINI_MODEL;
    let serverStatus: 'Approved' | 'Pending' = 'Pending';

    if (imageBase64 && hasAiKeys()) {
      try {
        const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        const ai = await analyzeStepsImage(dataUrl, String(dateThai), 'auto');
        finalAiSteps = ai.steps;
        finalAiConf = ai.confidence;
        finalDateInImage = ai.dateInImage || '';
        finalDateMatch = ai.dateMatch;
        finalAlert = ai.alert;
        finalAlertReasons = ai.alertReasons;
        finalNotes = ai.notes;
        aiProvider = ai.provider;
        aiModel = ai.model;
        // เทียบจำนวนก้าวที่กรอกกับที่ AI อ่าน — ต่างกันเกิน 20% หรือ 500 ก้าว ถือว่าสงสัย
        if (ai.steps != null && Math.abs(ai.steps - Number(steps)) > Math.max(500, Number(steps) * 0.2)) {
          finalAlert = true;
          finalAlertReasons = [...finalAlertReasons, `จำนวนก้าวที่กรอก (${Number(steps).toLocaleString()}) ต่างจากที่ AI อ่าน (${ai.steps.toLocaleString()})`];
        }
        serverStatus = finalAlert ? 'Pending' : 'Approved';
      } catch (e) {
        console.warn('image-upload server AI failed, fallback to Pending:', e);
        finalAlert = true;
        finalAlertReasons = [...finalAlertReasons, 'AI ตรวจไม่สำเร็จ — รอตรวจสอบ manual (ต่างฝ่าย)'];
        serverStatus = 'Pending';
      }
    } else if (!hasAiKeys()) {
      // ไม่มีคีย์ AI — ต้องให้มนุษย์ต่างฝ่ายตรวจ
      finalAlert = true;
      finalAlertReasons = ['ไม่มีการตรวจ AI (ไม่มีคีย์) — รอเจ้าหน้าที่ต่างฝ่ายตรวจ'];
      serverStatus = 'Pending';
    } else if (alert === false && finalAlertReasons.length === 0) {
      // client บอกว่าไม่ alert และไม่มี server AI — ถือว่า manual pending ไว้ก่อน แต่ถ้าไม่มี alert จริงก็อนุมัติ
      serverStatus = 'Pending';
    }

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
        AI_Steps: finalAiSteps != null ? Number(finalAiSteps) : '',
        AI_Confidence: finalAiConf != null ? Number(finalAiConf) : '',
        Date_In_Image: finalDateInImage,
        Date_Match: finalDateMatch === true ? 'TRUE' : finalDateMatch === false ? 'FALSE' : '',
        Alert_Flag: finalAlert ? 'TRUE' : 'FALSE',
        Alert_Reason: finalAlertReasons.join('; '),
        Notes: finalNotes,
      }),
    });

    const gasJson = await gasRes.json().catch(() => ({}));
    if (!gasRes.ok || gasJson.error) {
      console.error('GAS add-step failed:', gasRes.status, gasJson);
      return NextResponse.json(
        { error: gasJson.error || `GAS error: ${gasRes.status}` },
        { status: gasRes.ok ? 500 : gasRes.status }
      );
    }

    return NextResponse.json({ ...gasJson, aiStatus: serverStatus, aiAlert: finalAlert, aiModel, aiProvider, aiConfidence: finalAiConf });
  } catch (error) {
    console.error('image-upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
