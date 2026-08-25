/**
 * ส่งข้อมูลก้าวแบบกลุ่มไป GAS backend (action: add-batch-steps)
 * Server-only AI: หลังรับข้อมูล จะเรียก AI ตรวจภาพทุกใบก่อนส่ง GAS — ถ้าผ่านจะ Approved ทันที ไม่ผ่านจะ Pending ให้ต่างฝ่ายตรวจ
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImage } from '@/lib/serverAi';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function extractBase64(imageBase64: string): string {
  const m = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : imageBase64;
}
function hasAiKeys(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { Logged_By, Week_Start, Steps, Allow_Overwrite } = body;
    if (!Logged_By) return NextResponse.json({ error: 'Logged_By is required' }, { status: 400 });
    if (!Week_Start) return NextResponse.json({ error: 'Week_Start is required' }, { status: 400 });
    if (!Steps || !Array.isArray(Steps) || Steps.length === 0) return NextResponse.json({ error: 'Steps array is required' }, { status: 400 });
    if (!GAS_API_URL) return NextResponse.json({ error: 'GAS API not configured' }, { status: 500 });

    // Server-only AI: ตรวจภาพทุกใบก่อนส่ง GAS (ถ้ามีคีย์)
    const useAi = hasAiKeys();
    const processedSteps: any[] = [];
    for (const step of Steps as Record<string, unknown>[]) {
      const base64Raw = String(step.Image_Base64 || '');
      const day = String(step.Day || '');
      const userSteps = Number(step.Steps_Count) || 0;
      let aiSteps: any = step.AI_Steps ?? '';
      let aiConf: any = step.AI_Confidence ?? '';
      let dateInImage: any = step.Date_In_Image ?? '';
      let dateMatch: any = step.Date_Match ?? '';
      let alertFlag: any = step.Alert_Flag ?? 'FALSE';
      let alertReason: any = step.Alert_Reason ?? '';
      let notes: any = step.Notes ?? '';
      let status = 'Approved';
      // ถ้ามีภาพและมีคีย์ — ให้ AI ตรวจจริง
      if (base64Raw && useAi) {
        try {
          const dataUrl = base64Raw.startsWith('data:') ? base64Raw : `data:image/jpeg;base64,${base64Raw}`;
          const ai = await analyzeStepsImage(dataUrl, day, 'auto');
          aiSteps = ai.steps ?? '';
          aiConf = ai.confidence ?? '';
          dateInImage = ai.dateInImage ?? '';
          dateMatch = ai.dateMatch === true ? 'TRUE' : ai.dateMatch === false ? 'FALSE' : '';
          alertFlag = ai.alert ? 'TRUE' : 'FALSE';
          alertReason = ai.alertReasons.join('; ');
          if (ai.alert) status = 'Pending';
          else status = 'Approved';
          // ถ้า AI อ่านก้าวต่างจากที่กรอกมาก ให้ flag
          if (ai.steps != null && Math.abs(ai.steps - userSteps) > Math.max(500, userSteps * 0.2)) {
            alertFlag = 'TRUE';
            alertReason = (alertReason ? alertReason + '; ' : '') + `จำนวนก้าวที่กรอก (${userSteps}) ต่างจากที่ AI อ่าน (${ai.steps})`;
            status = 'Pending';
          }
          notes = (notes ? notes + ' | ' : '') + ai.notes;
        } catch (e) {
          console.warn('batch AI analyze failed for', day, e);
          alertFlag = 'TRUE';
          alertReason = (alertReason ? alertReason + '; ' : '') + 'AI ตรวจไม่สำเร็จ — รอตรวจสอบ manual';
          status = 'Pending';
        }
      } else if (base64Raw && !useAi) {
        // ไม่มีคีย์ AI — ให้ Pending เพื่อรอ manual
        status = 'Pending';
        alertFlag = 'TRUE';
        alertReason = 'ไม่มีการตรวจ AI (ไม่มีคีย์) — รอเจ้าหน้าที่ต่างฝ่ายตรวจ';
      } else if (!base64Raw) {
        status = 'Pending';
        alertFlag = 'TRUE';
        alertReason = 'ไม่มีภาพหลักฐาน';
      }
      processedSteps.push({
        ...step,
        Image_Base64: base64Raw ? extractBase64(String(step.Image_Base64)) : '',
        AI_Steps: aiSteps,
        AI_Confidence: aiConf,
        Date_In_Image: dateInImage,
        Date_Match: dateMatch,
        Alert_Flag: alertFlag,
        Alert_Reason: alertReason,
        Notes: notes,
        Status: status,
      });
    }

    const gasRes = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'add-batch-steps',
        Logged_By: String(Logged_By),
        Week_Start: String(Week_Start),
        Allow_Overwrite: Allow_Overwrite ? '1' : '0',
        Steps: processedSteps,
      }),
    });
    const gasJson = await gasRes.json().catch(() => ({}));
    if (!gasRes.ok || gasJson.error) {
      console.error('GAS add-batch-steps failed:', gasRes.status, gasJson);
      return NextResponse.json({ error: gasJson.error || `GAS error: ${gasRes.status}` }, { status: gasRes.ok ? 500 : gasRes.status });
    }
    // เพิ่มสรุป AI ให้ client
    const aiApproved = processedSteps.filter(s => s.Status === 'Approved').length;
    const aiPending = processedSteps.filter(s => s.Status === 'Pending').length;
    return NextResponse.json({ ...gasJson, aiApproved, aiPending });
  } catch (error) {
    console.error('batch-upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
