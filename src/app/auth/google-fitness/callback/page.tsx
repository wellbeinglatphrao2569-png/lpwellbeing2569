/**
 * OAuth2 Callback Page
 *
 * Flow:
 * 1. User กด "เชื่อมต่อกูเกิลฟิต" → ไป Google OAuth consent
 * 2. Google authorize → redirect กลับมาพร้อม code
 * 3. page นี้ ดึง code จาก URL → ส่งไป API route ผ่าน fetch
 * 4. API route exchange code → tokens → ส่งกลับมาเป็น JSON
 * 5. page นี้ เก็บ tokens ใน localStorage → redirect ไป /steps
 */
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { saveTokens, cleanUrlHash } from '@/lib/google-fitness';

/**
 * OAuth2 Callback Client Component
 */
function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<string>('กำลังเชื่อมต่อกับ Google...');
  const [error, setError] = useState<string>('');
  const hasProcessed = useRef(false);

  useEffect(() => {
    const processCallback = async () => {
      try {
        // ป้องกัน StrictMode double-invoke — code ใช้ได้ครั้งเดียว
        if (hasProcessed.current) return;
        hasProcessed.current = true;

        const code = searchParams.get('code');

        // Check for error
        if (searchParams.get('error')) {
          setError(searchParams.get('error_description') || 'การ authorize ล้มเหลว');
          setTimeout(() => router.push('/steps'), 3000);
          return;
        }

        // No code → error
        if (!code) {
          setError('ไม่พบ code จาก Google');
          setTimeout(() => router.push('/steps'), 3000);
          return;
        }

        setStatus('กำลังแลกเปลี่ยน code เป็น token...');

        // ส่ง code ไป server เพื่อ exchange เป็น tokens
        const res = await fetch('/api/auth/google-fitness/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Exchange code ล้มเหลว');
        }

        const tokenData: {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          email?: string;
        } = await res.json();

        // ดึง user_id จาก state parameter (ถูกส่งกลับมาจาก Google OAuth)
        const stateRaw = searchParams.get('state') || '';
        let userId = '';
        try {
          const state = JSON.parse(atob(stateRaw));
          userId = state.userId || '';
        } catch {}

// ⚡ ตรวจสอบและ auto-link อีเมล — ครั้งแรกจะบันทึกลิงก์ทันที ถ้าเป็น user เดียวกันให้ผ่าน
         if (tokenData.email) {
           try {
             const checkRes = await fetch('/api/google-fitness/check-email', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ email: tokenData.email, userId, action: 'auto-link' }),
             });
              const checkData = await checkRes.json();
              if (checkData.duplicate && String(checkData.linkedUser) !== String(userId)) {
               throw new Error(`Gmail นี้ (${tokenData.email}) ถูกผูกกับบัญชีอื่นแล้ว (${checkData.linkedUserName || checkData.linkedUser}) — โปรดใช้ Gmail อื่น`);
             }
             // Show message if auto-linked or already linked
             if (checkData.autoLink) {
               setStatus('เชื่อมต่ออีเมลสำเร็จ (ครั้งแรก)...');
             } else if (checkData.message) {
               setStatus(checkData.message);
             }
           } catch (e) {
             if (e instanceof Error && e.message.includes('Gmail นี้')) {
               throw e;
             }
             // API error — ignore
           }
         }

         // เก็บ token + email + เจ้าของบัญชี (User_ID ที่เชื่อมต่อ) ใน localStorage
         saveTokens({
           access_token: tokenData.access_token,
           refresh_token: tokenData.refresh_token || '',
           expires_in: tokenData.expires_in,
           email: tokenData.email,
         }, userId);

        cleanUrlHash(); // ลบ code ออกจาก URL

        setStatus('เชื่อมต่อสำเร็จ! กำลังกลับไปที่หน้าบันทึกก้าวเดิน...');

        setTimeout(() => {
          router.push('/steps?connected=true');
        }, 1000);
      } catch (err) {
        console.error('Callback error:', err);
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
        setTimeout(() => router.push('/steps'), 5000);
      }
    };

    processCallback();
  }, [searchParams, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-gray-900 dark:to-gray-950 p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {error ? (
          <>
            <span className="material-symbols-outlined text-5xl text-red-500 mb-4 block">error_outline</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-red-500 text-sm mb-4">{error}</p>
          </>
        ) : (
          <>
            <span className="loading loading-spinner loading-lg text-emerald-600 mb-4 inline-block"></span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">กำลังเชื่อมต่อกูเกิลฟิต...</h2>
            <p className="text-gray-500 dark:text-gray-400">{status}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function GoogleFitnessCallbackPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><span className="loading loading-spinner loading-lg text-emerald-600"></span></div>}>
      <CallbackContent />
    </Suspense>
  );
}
