/**
 * Google Fitness API — utility functions
 *
 * Flow:
 * 1. กดปุ่ม "เชื่อมต่อกูเกิลฟิต" → redirect ไป Google OAuth → authorize
 * 2. Google → redirect กลับมาพร้อม code → /auth/google-fitness/callback
 * 3. /auth/google-fitness/callback → fetch exchange code → เก็บ tokens
 * 4. กดปุ่ม "ดึงข้อมูล" → ใช้ tokens เรียก /api/google-fitness/steps
 */

const CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '516906113045-61vsi0n55sdklb5apvbuu5l9n9kakpdt.apps.googleusercontent.com';

/** สร้าง OAuth URL สำหรับ authorize */
export function buildAuthUrl(userId?: string): string {
  const redirectUri =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/google-fitness/callback`
      : '';

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/fitness.activity.read',
      'openid',
      'email',
      'profile',
    ].join(' '),
    prompt: 'consent select_account',
    access_type: 'offline',
  });

  // ส่ง user_id เป็น state parameter — กลับมาตอน callback
  if (userId) {
    params.set('state', btoa(JSON.stringify({ userId })));
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** เชื่อมต่อกูเกิลฟิต — เปิด OAuth consent */
export function connectGoogleFitness(userId?: string): void {
  window.location.href = buildAuthUrl(userId);
}

/** เชื่อมต่อแล้วหรือยัง */
export function isConnected(): boolean {
  return localStorage.getItem('google_fitness_connected') === 'true';
}

/** ตรวจว่าการเชื่อมต่อนี้ถูกผูกกับบัญชีระบบที่กำหนดหรือไม่ (คุม 1 Gmail = 1 คน ป้องกันใช้การเชื่อมต่อร่วมกัน) */
export function isOwnedBy(userId: string): boolean {
  if (!userId) return false;
  return isConnected() && getOwnerUserId() === userId;
}

/** ดึง User_ID (บัญชีระบบ) ที่เป็นเจ้าของการเชื่อมต่อนี้ */
export function getOwnerUserId(): string | null {
  const owner = localStorage.getItem('google_fitness_owner');
  return owner && owner !== '' ? owner : null;
}

/** ดึง access_token จาก localStorage */
export function getToken(): string | null {
  const raw = localStorage.getItem('google_fitness_token');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.access_token || null;
  } catch {
    return null;
  }
}

/** บันทึก tokens + email + เจ้าของบัญชี (ownerUserId = User_ID ที่เชื่อมต่อ) */
export function saveTokens(
  data: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    email?: string;
  },
  ownerUserId?: string
): void {
  localStorage.setItem('google_fitness_token', JSON.stringify(data));
  localStorage.setItem('google_fitness_connected', 'true');
  if (data.email) {
    localStorage.setItem('google_fitness_email', data.email);
  }
  if (ownerUserId) {
    localStorage.setItem('google_fitness_owner', ownerUserId);
  }
}

/** ดึง email ที่เชื่อมต่อ */
export function getConnectedEmail(): string | null {
  return localStorage.getItem('google_fitness_email');
}

/** ล้าง tokens (disconnect) */
export function disconnect(): void {
  localStorage.removeItem('google_fitness_token');
  localStorage.removeItem('google_fitness_connected');
  localStorage.removeItem('google_fitness_email');
  localStorage.removeItem('google_fitness_owner');
}

/** ลบ URL hash (หลังจาก callback เสร็จ) */
export function cleanUrlHash(): void {
  if (typeof window !== 'undefined' && window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
}

/**
 * ดึงข้อมูลก้าวเดินจาก Google Fit API
 * ใช้ server proxy (/api/google-fitness/steps) เพราะ Google Fit API ไม่มี CORS
 */
export async function fetchSteps(date: string): Promise<number> {
  const accessToken = getToken();
  if (!accessToken) {
    throw new Error('ไม่ได้เชื่อมต่อกูเกิลฟิต — โปรด connect ก่อน');
  }

  const res = await fetch('/api/google-fitness/steps', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date,
      // ส่ง email + เจ้าของบัญชี เพื่อให้ฝั่ง server ตรวจ 1 Gmail = 1 คน (ห้ามใช้การเชื่อมต่อของบัญชีอื่น)
      email: getConnectedEmail(),
      user_id: getOwnerUserId(),
    }),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    throw new Error(error || 'ดึงข้อมูลล้มเหลว');
  }

  const data = await res.json();
  return data.totalSteps;
}

/** ดึงข้อมูลหลายวัน */
export async function fetchStepsRange(
  startDate: string,
  endDate: string
): Promise<{ date: string; steps: number }[]> {
  const stepsList: { date: string; steps: number }[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const steps = await fetchSteps(dateStr);
    stepsList.push({ date: dateStr, steps });

    // delay เล็กน้อย
    await new Promise((r) => setTimeout(r, 100));
  }

  return stepsList;
}
