/**
 * API Route: ตรวจสอบว่า Gmail นี้ถูกผูกกับ user ใดหรือยัง
 *
 * POST /api/google-fitness/check-email
 * Body: { email: "user@gmail.com" }
 * Response: { duplicate: boolean, linkedUser?: string }
 */
import { NextRequest, NextResponse } from 'next/server';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

export async function POST(request: NextRequest) {
  try {
    const { email, action } = await request.json();
    if (!email) {
      return NextResponse.json({ duplicate: false }, { status: 200 });
    }

    // Save action: store link in GAS
    if (action === 'save') {
      const { userId } = await request.json();
      await fetch(`${GAS_API_URL}?path=action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-google-fit-link',
          email,
          User_ID: userId,
          connected_at: new Date().toISOString(),
        }),
      });
      return NextResponse.json({ duplicate: false });
    }

    // Check action: verify if email is already linked
    const res = await fetch(
      `${GAS_API_URL}?path=action&action=check-google-fit-email&email=${encodeURIComponent(email)}`
    );

    if (!res.ok) {
      return NextResponse.json({ duplicate: false }); // silent fail
    }

    const data = await res.json();
    return NextResponse.json({
      duplicate: data.duplicate || false,
      linkedUser: data.linkedUser || '',
    });
  } catch {
    return NextResponse.json({ duplicate: false });
  }
}