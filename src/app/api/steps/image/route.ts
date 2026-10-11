/**
 * Proxy รูปหลักฐานก้าวเดิน
 *
 * รองรับ 2 รูปแบบค่าที่เก็บใน image_drive_id:
 *   1) Google Drive File ID (ตัวอักษร/ตัวเลข)  → ดึงผ่าน 3 source ของ Drive
 *   2) URL เต็ม (เช่น Supabase Storage)        → ดึงตรง ๆ
 *
 * ปัญหาเดิม: ค่าที่เป็น URL ถูกส่งเข้า Drive proxy → ทั้ง 3 source fail → 502 → <img> หน้าขาว
 * วิธีแก้: ถ้าขึ้นต้นด้วย http ให้ proxy ตรง และบังคับ content-type ขึ้นต้นด้วย image/ ก่อนส่งกลับ
 *          (กัน Google เสิร์ฟ HTML interstitial ด้วย HTTP 200 ทำให้ <img> ค้าง)
 *
 * GET /api/steps/image?fileId=<drive-file-id หรือ https-url>
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DRIVE_SOURCES = (fileId: string) => [
  `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
  `https://drive.google.com/uc?export=view&id=${fileId}`,
  `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x-64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36';

async function fetchAndServe(
  url: string,
  etag: string,
  signal: AbortSignal,
): Promise<NextResponse | null> {
  try {
    const upstream = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      cache: 'no-store',
      signal,
    });
    if (!upstream.ok) return null;
    const contentType = upstream.headers.get('content-type') || '';
    // บังคับต้องเป็นรูปจริง — ถ้า Google เสิร์ฟ HTML (interstitial/sign-in) ให้ข้ามไป source ถัดไป
    if (!contentType.startsWith('image/')) return null;

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400, immutable',
      'Access-Control-Allow-Origin': '*',
      ETag: etag,
    };
    if (upstream.body) return new NextResponse(upstream.body, { status: 200, headers });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    headers['Content-Length'] = String(buffer.length);
    return new NextResponse(buffer, { status: 200, headers });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return null;
    console.error('image proxy fetch failed:', url, e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('fileId');
  if (!raw) return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  const fileId = decodeURIComponent(raw);

  const etag = `"${fileId}"`;
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.includes(etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400' } });
  }

  // ถ้าค่าเป็น URL เต็ม (Supabase Storage ฯลฯ) ให้ดึงตรง ๆ
  if (/^https?:\/\//i.test(fileId)) {
    const res = await fetchAndServe(fileId, etag, request.signal);
    if (res) return res;
    return NextResponse.json({ error: 'direct image load failed' }, { status: 502 });
  }

  // ไม่ใช่ URL → สงสัยเป็น Drive File ID
  let lastFail = false;
  for (const url of DRIVE_SOURCES(fileId)) {
    const res = await fetchAndServe(url, etag, request.signal);
    if (res) return res;
    lastFail = true;
  }

  return NextResponse.json({ error: `image load failed (upstream ${lastFail ? 'non-image/error' : 'error'})` }, { status: 502 });
}
