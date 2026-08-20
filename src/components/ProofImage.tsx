'use client';
import { useState } from 'react';

/**
 * โหลดรูปจาก Drive ผ่าน proxy ของเซิร์ฟเวอร์ (หลีกเลี่ยง rate-limit ของ Google เมื่อฝังภาพโดยตรง)
 */
export default function ProofImage({ fileId, alt, onClick }: { fileId: string; alt: string; onClick: (src: string) => void }) {
  const sources = [
    `/api/steps/image?fileId=${fileId}`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
  ];
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = sources[idx];

  if (failed) {
    return (
      <div className="p-4 text-center text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
        ไม่สามารถโหลดรูปภาพจาก Google Drive ได้ โปรดกด &quot;เปิดภาพเต็ม&quot; เพื่อดูในแท็บใหม่
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={src} src={src} alt={alt}
      onClick={() => onClick(src)}
      onError={() => {
        if (idx < sources.length - 1) setIdx(idx + 1);
        else setFailed(true);
      }}
      className="w-full max-h-[480px] object-contain bg-gray-100 dark:bg-gray-900 cursor-zoom-in transition-opacity" />
  );
}
