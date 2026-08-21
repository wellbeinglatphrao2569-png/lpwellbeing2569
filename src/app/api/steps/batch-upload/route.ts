/**
 * ส่งข้อมูลก้าวแบบกลุ่มไป GAS backend (action: add-batch-steps)
 *
 * POST /api/steps/batch-upload
 * Body: { Logged_By, Week_Start, Steps: [{ User_ID, Day, Steps_Count, Image_Base64, AI_Steps, AI_Confidence, Date_In_Image, Date_Match, Alert_Flag, Alert_Reason, Notes }] }
 */
import { NextRequest, NextResponse } from 'next/server';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBase64(imageBase64: string): string {
  const match = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : imageBase64;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { Logged_By, Week_Start, Steps, Allow_Overwrite } = body;

    if (!Logged_By) {
      return NextResponse.json({ error: 'Logged_By is required' }, { status: 400 });
    }
    if (!Week_Start) {
      return NextResponse.json({ error: 'Week_Start is required' }, { status: 400 });
    }
    if (!Steps || !Array.isArray(Steps) || Steps.length === 0) {
      return NextResponse.json({ error: 'Steps array is required' }, { status: 400 });
    }
    if (!GAS_API_URL) {
      return NextResponse.json({ error: 'GAS API not configured' }, { status: 500 });
    }

    // Process images: extract base64 for each step
    const processedSteps = Steps.map((step: Record<string, unknown>) => ({
      ...step,
      Image_Base64: step.Image_Base64 ? extractBase64(String(step.Image_Base64)) : '',
    }));

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
      return NextResponse.json(
        { error: gasJson.error || `GAS error: ${gasRes.status}` },
        { status: gasRes.ok ? 500 : gasRes.status }
      );
    }

    return NextResponse.json(gasJson);
  } catch (error) {
    console.error('batch-upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
