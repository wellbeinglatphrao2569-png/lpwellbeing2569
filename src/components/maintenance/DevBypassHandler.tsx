'use client';
import { useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { BYPASS_STORAGE_KEY, BYPASS_FLAG_VALUE, DEV_SECRET } from '@/lib/maintenance';

export default function DevBypassHandler() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const secret = sp.get('dev_secret');
    if (secret) {
      if (secret === DEV_SECRET) {
        try {
          localStorage.setItem(BYPASS_STORAGE_KEY, BYPASS_FLAG_VALUE);
          window.dispatchEvent(new Event('dev-bypass-change'));
        } catch {}
        // ลบ query ออกให้ URL สะอาด — ไม่รีโหลดหน้า
        const url = new URL(window.location.href);
        url.searchParams.delete('dev_secret');
        const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
        router.replace(next);
      } else {
        // รหัสผิด — ล้าง bypass ถ้ามี และแจ้งเตือนเบา ๆ
        console.warn('[DevBypass] dev_secret ไม่ถูกต้อง');
      }
    }
    // รองรับ ?dev_exit=1 เพื่อออกจากโหมด dev
    if (sp.get('dev_exit') === '1') {
      try {
        localStorage.removeItem(BYPASS_STORAGE_KEY);
        window.dispatchEvent(new Event('dev-bypass-change'));
      } catch {}
      const url = new URL(window.location.href);
      url.searchParams.delete('dev_exit');
      router.replace(url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash);
    }
  }, [sp, router, pathname]);

  return null;
}
