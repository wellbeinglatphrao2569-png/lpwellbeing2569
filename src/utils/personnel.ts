import type { User } from '@/types';

/** รายชื่อส่วนราชการ (10 ฝ่าย) ของสำนักงานเขตลาดพร้าว */
export const DEPARTMENTS = [
  'ฝ่ายทะเบียน',
  'ฝ่ายปกครอง',
  'ฝ่ายรายได้',
  'ฝ่ายเทศกิจ',
  'ฝ่ายสิ่งแวดล้อมและสุขาภิบาล',
  'ฝ่ายการศึกษา',
  'ฝ่ายพัฒนาชุมชนและสวัสดิการสังคม',
  'ฝ่ายการคลัง',
  'ฝ่ายรักษาความสะอาดและสวนสาธารณะ',
  'ฝ่ายโยธา',
];

export const GENDERS = ['ชาย','หญิง','LGBTQ+','ไม่ระบุ'];

export const PREFIXES = ['นาย','นาง','นางสาว','อื่น ๆ (ระบุ)'];
export const CUSTOM_PREFIX = 'อื่น ๆ (ระบุ)';

/** กิจกรรมที่บุคลากรเข้าร่วม — sweet_free เป็นกิจกรรมบังคับ (ทุกคนเข้าร่วมเสมอ) */
export const ACTIVITIES: { code: 'sweet_free' | 'steps' | 'training'; label: string; mandatory?: boolean }[] = [
  { code: 'sweet_free', label: 'พุธนี้ไม่มีเชื่อม (งดน้ำหวานวันพุธ)', mandatory: true },
  { code: 'steps', label: 'นับก้าวสร้างสุข' },
  { code: 'training', label: 'กิจกรรมส่งเสริมความรู้เกี่ยวกับการป้องกันโรคออฟฟิศซินโดรม' },
];

/** แยกคอลัมน์ Activities (เก็บเป็น CSV) → array ของ code กิจกรรม */
export function parseActivities(activities?: string): string[] {
  if (!activities) return ['sweet_free'];
  return String(activities).split(',').filter(Boolean);
}

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
  'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11,
  'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3, 'พฤษภาคม': 4, 'มิถุนายน': 5,
  'กรกฎาคม': 6, 'สิงหาคม': 7, 'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11,
};

const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

/** ชื่อเดือนไทยเต็ม (ใช้ใน dropdown วันเกิด) */
export const THAI_MONTH_NAMES = THAI_MONTHS_FULL;

/** ช่วงปี พ.ศ. สำหรับเลือกวันเกิด (พ.ศ. เริ่มต้นในเร็วที่สุดที่ยอมรับ) */
export const BIRTH_YEAR_BE_MIN = 2470;
export const BIRTH_YEAR_BE_MAX = 2569;

/**
 * แปลง วันที่/เดือน/ปี พ.ศ. → ISO YYYY-MM-DD (สำหรับส่งฝั่ง server)
 * คืน '' ถ้ายังไม่ครบ หรือวันที่ไม่ถูกต้อง (เช่น 30 ก.พ.)
 */
export function thaiPartsToIso(day: string | number, month: string | number, yearBE: string | number): string {
  const d = Number(day);
  const m = Number(month);
  const y = Number(yearBE);
  if (!d || !m || !y) return '';
  const yearCE = y - 543;
  const date = new Date(Date.UTC(yearCE, m - 1, d));
  if (
    date.getUTCFullYear() !== yearCE ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) return '';
  return `${yearCE}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ตรวจว่าวันที่ ครบ/ถูกต้อง หรือไม่ (ใช้ enable ปุ่มถัดไป) */
export function isValidThaiDate(day: string | number, month: string | number, yearBE: string | number): boolean {
  return thaiPartsToIso(day, month, yearBE) !== '';
}

/** แปลงวันเกิดเป็น Date ป้องกันทั้งรูปแบบ ISO (YYYY-MM-DD) และภาษาไทย (1 ม.ค. 2528) */
export function parseBirthDate(birthDate?: string): Date | null {
  if (!birthDate) return null;
  const s = String(birthDate).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = parseInt(iso[1], 10);
    return new Date(year, parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  }
  const thai = s.match(/^(\d{1,2})[ .]?\s*([^\s\d]+?)\s*(\d{4})$/);
  if (thai) {
    const day = parseInt(thai[1], 10);
    const monthBuddhist = THAI_MONTHS[thai[2]];
    const yearCE = parseInt(thai[3], 10) - 543;
    if (monthBuddhist === undefined) return null;
    return new Date(yearCE, monthBuddhist, day);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** แสดงวันเป็นภาษาไทยแบบเต็มเดือน: เช่น 19 กรกฎาคม 2569 (พ.ศ.) */
export function formatThaiBirthDate(date: Date): string {
  return `${date.getDate()} ${THAI_MONTHS_FULL[date.getMonth()]} ${date.getFullYear() + 543}`;
}

/** แปลงค่าวันเกิด (ISO หรือรูปแบบไทย) → YYYY-MM-DD สำหรับ <input type="date"> */
export function birthDateToInputValue(birthDate?: string): string {
  const d = parseBirthDate(birthDate);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** แสดงวันเกิดแบบไทย เช่น 19 กรกฎาคม 2569 — รองรับทั้ง ISO และรูปแบบไทยที่เก็บไว้ */
export function birthDateThaiText(birthDate?: string): string {
  const d = parseBirthDate(birthDate);
  if (!d) return '';
  return formatThaiBirthDate(d);
}

/** คำนวณอายุเป็น "X ปี Y เดือน" จากวันเกิดถึงวันนี้ */
export function calcAge(birthDate?: string): { years: number; months: number; text: string } | null {
  const birth = parseBirthDate(birthDate);
  if (!birth) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) { years = 0; months = 0; }
  return { years, months, text: `${years} ปี ${months} เดือน` };
}

/** คำนวณค่า BMI (ส่วนสูงเป็นซม., น้ำหนักเป็นกก.) — คืนทศนิยม 1 ตำแหน่ง */
export function calcBmi(weight?: string | number | null, height?: string | number | null): number | null {
  const w = Number(weight);
  const h = Number(height);
  if (!w || !h || w <= 0 || h <= 0) return null;
  return Math.round(w / ((h / 100) * (h / 100)) * 10) / 10;
}

export interface BmiCategory { label: string; color: string; textClass: string; bgClass: string; }

/** เกณฑ์ BMI ตามมาตรฐานคนไทย (WHO Asia-Pacific / กรมอนามัย) */
export function bmiCategory(bmi: number | null): BmiCategory {
  if (bmi === null) return { label: '—', color: 'gray', textClass: 'text-gray-500 dark:text-gray-400', bgClass: 'bg-gray-100 dark:bg-gray-700/50' };
  if (bmi < 18.5) return { label: 'น้ำหนักต่ำกว่าเกณฑ์', color: 'blue', textClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-50 dark:bg-blue-900/20' };
  if (bmi < 23) return { label: 'สมส่วน (ปกติ)', color: 'emerald', textClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-50 dark:bg-emerald-900/20' };
  if (bmi < 25) return { label: 'น้ำหนักเกินเกณฑ์', color: 'amber', textClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-50 dark:bg-amber-900/20' };
  if (bmi < 30) return { label: 'โรคอ้วนระดับ 1', color: 'orange', textClass: 'text-orange-600 dark:text-orange-400', bgClass: 'bg-orange-50 dark:bg-orange-900/20' };
  return { label: 'โรคอ้วนระดับ 2', color: 'red', textClass: 'text-red-600 dark:text-red-400', bgClass: 'bg-red-50 dark:bg-red-900/20' };
}

/** สร้าง URL รูปโปรไฟล์จาก Drive File ID ที่เก็บในคอลัมน์ Profile_Image */
export function profileImageUrl(profileImage?: string): string | null {
  if (!profileImage) return null;
  const id = String(profileImage).trim();
  if (/^https?:\/\//.test(id)) return id;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=s300`;
}

/** อ่านไฟล์ภาพ → ย่อให้พอดี (max 600px) → base64 (ไม่มี data: prefix) */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 600;
        let w = img.width; let h = img.height;
        if (w > max || h > max) {
          const scale = Math.min(max / w, max / h);
          w = Math.round(w * scale); h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(String(reader.result).split(',')[1]); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = () => {
        const dataUrl = String(reader.result);
        const idx = dataUrl.indexOf(',');
        resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('read error'));
    reader.readAsDataURL(file);
  });
}

/** ชื่อเต็มสำหรับแสดง: คำนำหน้า + ชื่อ + นามสกุล (+ ชื่อเล่น) */
export function displayName(user: Pick<User, 'Prefix' | 'Full_Name' | 'First_Name' | 'Last_Name'> | null): string {
  if (!user) return '—';
  const first = user.First_Name || user.Full_Name?.split(' ')[0] || '';
  const last = user.Last_Name || user.Full_Name?.split(' ').slice(1).join(' ') || '';
  const core = (first && last) ? `${first} ${last}` : (user.Full_Name || '');
  return `${user.Prefix || ''} ${core}`.trim();
}