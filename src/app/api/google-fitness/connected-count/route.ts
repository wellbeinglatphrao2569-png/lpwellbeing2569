/**
 * API Route: ดึงจำนวน User ที่เชื่อมต่อ Google Fit แล้ว
 * ใช้สำหรับตัดสินใจเลือก Client ID (Client 1: 1-100, Client 2: 101+)
 */
import { NextResponse } from 'next/server';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

export async function GET() {
  try {
    if (!GAS_API_URL) {
      return NextResponse.json({ count: 0 });
    }

    const res = await fetch(
      `${GAS_API_URL}?path=google-fit-links`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      return NextResponse.json({ count: 0 });
    }

    const data = await res.json();
    const count = Array.isArray(data) ? data.length : 0;

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}