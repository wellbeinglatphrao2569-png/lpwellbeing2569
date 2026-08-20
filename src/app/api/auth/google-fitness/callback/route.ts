/**
 * Google Fitness OAuth Exchange API
 *
 * รับ code จาก Google → exchange เป็น access_token → ส่งกลับเป็น JSON
 *
 * POST /api/auth/google-fitness/callback
 * Body: { code: "4/0AX4XfWh..." }
 * Response: { access_token: "...", refresh_token: "...", expires_in: 3600 }
 */
import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    // redirect_uri ต้องตรงกับที่ client ใช้ตอน authorize (window.location.origin)
    // ใช้ request origin แทน NEXTAUTH_URL เพื่อกัน mismatch ตอน deploy/เปลี่ยน port
    const redirectUri = `${request.nextUrl.origin}/auth/google-fitness/callback`;
    console.log('Token exchange redirect_uri:', redirectUri);

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => 'no body');
      console.error('Token exchange failed:', res.status, errBody);
      return NextResponse.json(
        { error: `Failed to exchange code: ${res.status} ${errBody}` },
        { status: res.status }
      );
    }

    const tokens: {
      access_token: string;
      refresh_token: string;
      id_token?: string;
      expires_in: number;
    } = await res.json();

    // Extract email from id_token (JWT payload)
    let email = '';
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(atob(tokens.id_token.split('.')[1]));
        email = payload.email || '';
      } catch {}
    }

    // ส่ง tokens + email กลับไป client
    return NextResponse.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      expires_in: tokens.expires_in,
      email,
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
