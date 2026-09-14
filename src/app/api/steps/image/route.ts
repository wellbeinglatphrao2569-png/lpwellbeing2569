/**
 * Proxy รูปหลักฐานก้าวเดินจาก Google Drive
 *
 * ปัญหา: การฝัง URL ของ Drive โดยตรงใน <img> มักโดน Google rate-limit (HTTP 429)
 * ที่ endpoint lh3.googleusercontent.com เมื่อมี Referer จากเว็บอื่น
 *
 * วิธีแก้: เซิร์ฟเวอร์ดึงภาพมาให้ (ไม่ส่ง Referer → ผ่านเสมอ) แล้วส่งกลับแบบ same-origin
 *
 * GET /api/steps/image?fileId=<drive-file-id>
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCES = (fileId: string) => [
  `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
  `https://drive.google.com/uc?export=view&id=${fileId}`,
  `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
];

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get('fileId');
  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  // ถ้า browser ส่ง If-None-Match ที่ตรงกับ fileId ให้ตอบ 304 ทันที (ประหยัด Drive fetch)
  const ifNoneMatch = request.headers.get('if-none-match');
  const etag = `"${fileId}"`;
  if (ifNoneMatch && ifNoneMatch.includes(etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400' } });
  }

  let lastStatus = 0;
  for (const url of SOURCES(fileId)) {
    try {
      const upstream = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36',
        },
        cache: 'no-store',
        signal: request.signal,
      });
      if (!upstream.ok) {
        lastStatus = upstream.status;
        continue;
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      // streaming: ส่ง body ตรงโดยไม่ buffer ทั้งไฟล์ใน memory
      const body = upstream.body;
      if (body) {
        return new NextResponse(body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400, immutable',
            'Access-Control-Allow-Origin': '*',
            ETag: etag,
          },
        });
      }
      // fallback ถ้าไม่มี body stream
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(buffer.length),
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400, immutable',
          'Access-Control-Allow-Origin': '*',
          ETag: etag,
        },
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return new NextResponse(null, { status: 499 });
      console.error('image proxy source failed:', url, e);
    }
  }

  return NextResponse.json({ error: `image load failed (upstream ${lastStatus || 'error'})` }, { status: 502 });
}
