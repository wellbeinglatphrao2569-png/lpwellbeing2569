'use client';
import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';

interface Props {
  open: boolean;
  imageSrc: string; // data URL
  onCancel: () => void;
  onSave: (base64WithoutPrefix: string) => void;
  title?: string;
}

async function getCroppedBase64(imageSrc: string, pixelCrop: { x: number; y: number; width: number; height: number }): Promise<string> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((res, rej) => {
    image.onload = () => res();
    image.onerror = () => rej(new Error('โหลดรูปไม่สำเร็จ'));
  });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas error');
  // output 600x600 square
  const size = 600;
  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size
  );
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

export default function ImageCropModal({ open, imageSrc, onCancel, onSave, title = 'ครอบตัดรูปโปรไฟล์ 1:1' }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area: any, pixels: any) => {
    setCroppedPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedPixels) return;
    setSaving(true);
    try {
      const b64 = await getCroppedBase64(imageSrc, croppedPixels);
      onSave(b64);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600">crop</span>
            {title}
          </h3>
          <button onClick={onCancel} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-gray-500">close</span>
          </button>
        </div>
        <div className="relative w-full h-[380px] bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            showGrid={false}
            cropShape="rect"
            objectFit="contain"
          />
        </div>
        <div className="px-5 py-3 flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50">
          <span className="material-symbols-outlined text-gray-400 text-lg">zoom_in</span>
          <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1 accent-emerald-600" />
          <span className="text-xs text-gray-500 w-8 text-right">{zoom.toFixed(1)}x</span>
        </div>
        <p className="px-5 pb-2 text-xs text-gray-500 dark:text-gray-400 text-center">ลากเพื่อเลื่อนตำแหน่ง • เลื่อนแถบเพื่อซูม • ครอบเป็นสี่เหลี่ยมจัตุรัส 1:1</p>
        <div className="px-5 py-4 flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving || !croppedPixels} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><span className="loading loading-spinner loading-xs"></span> กำลังบันทึก...</> : <><span className="material-symbols-outlined text-base">check</span> ใช้รูปนี้</>}
          </button>
        </div>
      </div>
    </div>
  );
}
