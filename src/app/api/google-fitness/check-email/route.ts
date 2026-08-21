/**
 * API Route: ตรวจสอบว่า Gmail นี้ถูกผูกกับ user ใดหรือยัง
 * - ครั้งแรกที่เชื่อมต่อ: ถ้ายังไม่มีในระบบ ให้บันทึกลิงก์ทันที (auto-link)
 * - ครั้งต่อไป: อนุญาตให้เชื่อมต่อต่อได้ปกติถ้าเป็น user เดียวกัน
 *
 * POST /api/google-fitness/check-email
 * Body: { email: "user@gmail.com", userId?: "...", action?: "check"|"save"|"auto-link" }
 * Response: { duplicate: boolean, linkedUser?: string, linkedUserName?: string, autoLink?: boolean, message?: string }
 */
import { NextRequest, NextResponse } from 'next/server';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

export async function POST(request: NextRequest) {
  try {
    const { email, action, userId } = await request.json();
    if (!email) {
      return NextResponse.json({ duplicate: false }, { status: 200 });
    }

    // Save action: store link in GAS
    if (action === 'save') {
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

    // Auto-link action: link email to user if not already linked
    if (action === 'auto-link' && userId) {
      const checkRes = await fetch(
        `${GAS_API_URL}?path=action&action=check-google-fit-email&email=${encodeURIComponent(email)}`
      );
      
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (!checkData.duplicate) {
          // Email not linked to anyone - auto link it
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
          return NextResponse.json({ 
            duplicate: false, 
            autoLink: true,
            linkedUser: userId,
            message: 'เชื่อมต่ออีเมลสำเร็จ (ครั้งแรก)' 
          });
        } else if (String(checkData.linkedUser) === String(userId)) {
          // Already linked to same user
          return NextResponse.json({ 
            duplicate: false, 
            linkedUser: userId,
            linkedUserName: checkData.linkedUserName,
            message: 'เชื่อมต่ออยู่กับบัญชีนี้แล้ว' 
          });
        }
      }
    }

    // Check action: verify if email is already linked
    const res = await fetch(
      `${GAS_API_URL}?path=action&action=check-google-fit-email&email=${encodeURIComponent(email)}`
    );

    if (!res.ok) {
      return NextResponse.json({ duplicate: false }); // silent fail
    }

    const data = await res.json();
    
    // If email is linked to SAME user, it's NOT a duplicate (allow reconnect)
    // Only block if linked to DIFFERENT user
    const isDuplicateDifferentUser = data.duplicate && userId && String(data.linkedUser) !== String(userId);
    
    // Auto-clear signal: if backend says not duplicated but caller provides userId
    const shouldAutoClear = userId && !data.duplicate;
    
    return NextResponse.json({
      duplicate: isDuplicateDifferentUser,
      linkedUser: data.linkedUser || '',
      linkedUserName: data.linkedUserName || '',
      autoClear: shouldAutoClear,
      message: isDuplicateDifferentUser 
        ? `อีเมลนี้เชื่อมต่อกับบัญชีอื่น (${data.linkedUserName || data.linkedUser})`
        : data.duplicate 
          ? 'เชื่อมต่ออยู่กับบัญชีนี้แล้ว'
          : 'ยังไม่มีการเชื่อมต่ออีเมลนี้',
    });
  } catch {
    return NextResponse.json({ duplicate: false });
  }
}