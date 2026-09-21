/**
 * LP Well-being — Maintenance Mode Config & Types
 *
 * จุดเปลี่ยนรหัสลับ (dev_secret):
 *   1) แก้ไฟล์ .env.local  -> NEXT_PUBLIC_DEV_SECRET=ค่าใหม่ และ DEV_SECRET=ค่าใหม่
 *   2) แก้บน Vercel Dashboard -> Environment Variables ทั้ง 2 ตัว แล้ว Redeploy
 *   3) แจก URL ใหม่ให้ dev: https://your-domain.com/?dev_secret=ค่าใหม่
 *
 * ค่า default: LPWELL2026 (ถ้าไม่มี ENV)
 */

export const DEV_SECRET = process.env.NEXT_PUBLIC_DEV_SECRET || process.env.DEV_SECRET || 'LPWELL2026';
// ฝั่ง server ตรวจอีกตัว (ถ้าไม่ได้ตั้ง NEXT_PUBLIC_ จะใช้ DEV_SECRET)
export const DEV_SECRET_SERVER = process.env.DEV_SECRET || process.env.NEXT_PUBLIC_DEV_SECRET || 'LPWELL2026';

export const BYPASS_STORAGE_KEY = 'isDevBypass';
export const BYPASS_FLAG_VALUE = 'true'; // localStorage เก็บ string

export interface SystemSettings {
  is_maintenance_active: boolean;
  maintenance_title: string;
  maintenance_message: string;
  updated_at?: string;
  updated_by?: string | null;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  is_maintenance_active: true,
  maintenance_title: 'แจ้งปิดปรับปรุงระบบชั่วคราว',
  maintenance_message:
    'ขณะนี้ระบบกำลังย้ายฐานข้อมูลเพื่อเพิ่มความเร็วในการใช้งาน คาดว่าจะเปิดให้บริการวันพรุ่งนี้ เวลา 06:00 น.',
};

// Fallback เมื่อ Supabase ยังไม่ถูกตั้งค่า — ใช้ file/memory store ฝั่ง server (ดู route.ts)
export const SETTINGS_SINGLETON_ID = 1;
