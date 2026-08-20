export const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
export const thaiShortMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thaiDays = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

// แปลง string วันที่/เวลาที่รับจาก Google Sheets เป็น Date ใน local timezone ที่เวลาเที่ยง
// - ISO datetime ที่มี timezone (เช่น "2026-08-18T17:00:00Z") แปลงเป็นวันที่ตามปฏิทินไทย (+7) ก่อน
// - YYYY-MM-DD หรือ YYYY-MM-DD HH:mm:ss แปลงแบบตรงๆ (กันวันเลื่อนจาก timezone)
export function parseThaiDate(dateStr: string): Date {
  const s = String(dateStr).trim();
  const isoReq = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(Z|[+-]\d{1,2}:?\d{2})?$/i;
  if (isoReq.test(s)) {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const thai = new Date(parsed.getTime() + 7 * 60 * 60 * 1000);
      return new Date(thai.getUTCFullYear(), thai.getUTCMonth(), thai.getUTCDate(), 12, 0, 0, 0);
    }
  }
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0);
  return new Date(dateStr);
}

// คีย์วันที่ 'YYYY-MM-DD' ตามปฏิทินไทย (UTC+7) สำหรับเปรียบเทียบ/จัดกลุ่มข้อมูลที่มาจากชีท
// ซึ่งเก็บเป็น Date (ISO โดยปริยายอ้างอิง UTC) หรือ string 'YYYY-MM-DD'
export function toDateKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const thai = new Date(value.getTime() + 7 * 60 * 60 * 1000);
    return `${thai.getUTCFullYear()}-${String(thai.getUTCMonth() + 1).padStart(2, '0')}-${String(thai.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const isoReq = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(Z|[+-]\d{1,2}:?\d{2})?$/i;
  if (isoReq.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const thai = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      return `${thai.getUTCFullYear()}-${String(thai.getUTCMonth() + 1).padStart(2, '0')}-${String(thai.getUTCDate()).padStart(2, '0')}`;
    }
  }
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return s.slice(0, 10);
  return s;
}

export function toThaiDateFull(dateStr: string): string {
  const d = parseThaiDate(dateStr);
  return `วัน${thaiDays[d.getDay()]}ที่ ${d.getDate()} ${thaiMonths[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
}
export function toThaiWednesdayDisplay(dateStr: string): string {
  const d = parseThaiDate(dateStr);
  return `วัน${thaiDays[d.getDay()]}ที่ ${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
}
export function toThaiDateShort(dateStr: string): string {
  const d = parseThaiDate(dateStr);
  return `${d.getDate()} ${thaiShortMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
}
export function getCurrentThaiDate(): string {
  const d = new Date();
  return `วัน${thaiDays[d.getDay()]}ที่ ${d.getDate()} ${thaiMonths[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
}
// เวลาปัจจุบันตามเขตเวลาไทย (UTC+7) — ใช้อ้างอิงวัน/เวลาในการทำงานของระบบ
// เพื่อไม่ให้ค่าขึ้นอยู่กับ timezone หรือนาฬิกาของเครื่องผู้ใช้
export function getThaiNow(): Date {
  const utc = new Date();
  return new Date(utc.getTime() + 7 * 60 * 60 * 1000);
}

export function getCurrentWednesdayDate(): string {
  const thai = getThaiNow();
  const day = thai.getUTCDay(); // 0=อาทิตย์ .. 6=เสาร์ ตามวันจริงที่ประเทศไทย
  const wed = new Date(thai);
  wed.setUTCDate(wed.getUTCDate() + (3 - day));
  return `${wed.getUTCFullYear()}-${String(wed.getUTCMonth() + 1).padStart(2, '0')}-${String(wed.getUTCDate()).padStart(2, '0')}`;
}
