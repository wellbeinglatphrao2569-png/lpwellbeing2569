'use client';
import { useEffect } from 'react';
import MaintenanceOverlay from './MaintenanceOverlay';

export default function MaintenancePreviewModal({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex flex-col">
      {/* bar ด้านบนของ modal */}
      <div className="relative z-[10001] flex items-center justify-between px-4 py-3 bg-gray-900 text-white border-b border-white/10">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="material-symbols-outlined text-emerald-400">visibility</span> ตัวอย่างหน้าปิดปรับปรุง (Live Preview)
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold border border-white/20"
        >
          <span className="material-symbols-outlined text-lg">close</span> ปิดตัวอย่าง
        </button>
      </div>
      {/* ใช้ overlay เดียวกันแต่ครอบด้วย container ที่บังคับ full */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {/* เรนเดอร์ overlay แบบ fixed แต่ให้อยู่ใน modal — ใช้ absolute แทน */}
        <div className="absolute inset-0 overflow-y-auto">
          <MaintenanceOverlay title={title} message={message} />
        </div>
      </div>
    </div>
  );
}
