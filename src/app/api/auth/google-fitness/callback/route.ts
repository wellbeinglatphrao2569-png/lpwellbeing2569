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

const CLIENTS = [
  {
    id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_1 || '',
    secret: process.env.GOOGLE_CLIENT_SECRET_1 || '',
  },
  {
    id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_2 || '',
    secret: process.env.GOOGLE_CLIENT_SECRET_2 || '',
  },
];

async function exchangeCodeWithClient(code: string, redirectUri: string, client: { id: string; secret: string }) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  return res;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const redirectUri = `${request.nextUrl.origin}/auth/google-fitness/callback`;
    console.log('Token exchange redirect_uri:', redirectUri);

    // ลองแลกเปลี่ยน code กับ Client 1 ก่อน ถ้าไม่ได้ลอง Client 2
    let tokens: {
      access_token: string;
      refresh_token: string;
      id_token?: string;
      expires_in: number;
    } | null = null;
    let usedClient = '';

    for (const client of CLIENTS) {
      const res = await exchangeCodeWithClient(code, redirectUri, client);
      if (res.ok) {
        tokens = await res.json();
        usedClient = client.id;
        console.log('Token exchange succeeded with:', client.id);
        break;
      } else {
        const errBody = await res.text().catch(() => 'no body');
        console.warn('Token exchange failed with', client.id, ':', res.status, errBody);
      }
    }

    if (!tokens) {
      return NextResponse.json(
        { error: 'Failed to exchange code with both clients' },
        { status: 400 }
      );
    }

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
