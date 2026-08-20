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

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

function extractBase64(imageBase64: string): string {
  const match = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : imageBase64;
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

    const gasRes = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'add-step',
        User_ID: String(userId),
        Steps_Count: Number(steps),
        Date_Thai: String(dateThai),
        Record_Method: 'ภาพถ่าย',
        Status: 'Pending',
        Image_Base64: extractBase64(imageBase64),
        AI_Steps: aiSteps != null ? Number(aiSteps) : '',
        AI_Confidence: aiConfidence != null ? Number(aiConfidence) : '',
        Date_Match: dateMatch === true ? 'TRUE' : dateMatch === false ? 'FALSE' : '',
        Alert_Flag: alert ? 'TRUE' : 'FALSE',
        Alert_Reason: Array.isArray(alertReasons) ? alertReasons.join('; ') : '',
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

    return NextResponse.json(gasJson);
  } catch (error) {
    console.error('image-upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
