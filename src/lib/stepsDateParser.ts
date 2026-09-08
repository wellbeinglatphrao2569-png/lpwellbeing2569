/**
 * Date parser สำหรับ OCR วันที่นับก้าว — รองรับทุกรูปแบบที่ระบุ:
 * ไทยย่อ (1 ม.ค. 69 / 1 ม.ค. 2569), ไทยเต็ม (1 มกราคม 2569),
 * สากลตัวเลข (01/01/2026, 2026-01-01), อังกฤษย่อ/เต็ม (1 Jan 26, January 1 2026),
 * พ. 2 ก.ย. / 2 ก.ย. (=2 ก.ย. 2569 ปีปัจจุบัน), เลขไทย ๐-๙, พ.ศ./ค.ศ.
 */

const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
function thaiToArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (ch) => String(thaiDigits.indexOf(ch)));
}

const thaiShortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thaiLongMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const thaiShortNoDot = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
const engShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
const engLong = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function monthFromThaiShort(s: string): number | null {
  const t = s.replace(/\./g, '').trim().toLowerCase();
  for (let i = 0; i < thaiShortMonths.length; i++) {
    if (thaiShortMonths[i].replace(/\./g, '').toLowerCase() === t) return i + 1;
    if (thaiShortNoDot[i] === t) return i + 1;
  }
  return null;
}
function monthFromThaiLong(s: string): number | null {
  const t = s.trim().toLowerCase();
  for (let i = 0; i < thaiLongMonths.length; i++) if (thaiLongMonths[i] === t) return i + 1;
  return null;
}
function monthFromEng(s: string): number | null {
  const t = s.replace(/\./g, '').trim().toLowerCase();
  for (let i = 0; i < engLong.length; i++) if (engLong[i] === t) return i + 1;
  for (let i = 0; i < engShort.length; i++) if (engShort[i] === t) return i + 1;
  return null;
}

function toBEYear(y: number): number {
  // ถ้า y เป็น 2 หลัก → แปลงตามช่วง: 00-49 → 25xx? 50-99 → 25xx? ใช้เกณฑ์ พ.ศ. ปัจจุบัน
  if (y < 100) {
    // เช่น 68 → 2568, 69 → 2569
    return y + 2500;
  }
  if (y < 2400) {
    // ค.ศ. → พ.ศ.
    return y + 543;
  }
  return y; // พ.ศ. อยู่แล้ว
}
function toADYear(be: number): number {
  return be - 543;
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function stripWeekday(s: string): string {
  let t = s.trim();
  // ตัด "วัน" นำหน้า
  t = t.replace(/^\s*วัน\s*/i, '');
  // ตัดคำวันแบบไทยย่อ/เต็ม + จุด
  // จ., อ., พ., พฤ., ศ., ส., อา. , จันทร์, อังคาร, พุธ, พฤหัสบดี, ศุกร์, เสาร์, อาทิตย์
  t = t.replace(/^\s*(จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์|จ\.|อ\.|พ\.|พฤ\.|ศ\.|ส\.|อา\.)\s*/i, '');
  // เผื่อมีซ้ำสองชั้น เช่น "พ. 2 ก.ย." หลังตัด "พ." แล้วเหลือ "2 ก.ย."
  t = t.trim();
  return t;
}

function currentBEYear(): number {
  return new Date().getFullYear() + 543;
}
function currentADYear(): number {
  return new Date().getFullYear();
}

/**
 * แปลง raw date string จาก OCR ให้เป็น YYYY-MM-DD (ค.ศ.)
 * ถ้าไม่มีปี → ใช้ปีปัจจุบัน (พ.ศ. 2569) หรือปีจาก expectedDate
 * return null ถ้า parse ไม่ได้
 */
export function normalizeOcrDate(raw: string | null | undefined, expectedDate?: string, _depth = 0): string | null {
  if (!raw) return null;
  if (_depth > 2) return null;
  // กัน stack overflow จากข้อความยาวมาก (เช่น JSON array จาก Typhoon)
  let rawStr = String(raw).trim();
  if (rawStr.length > 300) rawStr = rawStr.slice(0, 300);
  let s = thaiToArabic(rawStr);
  if (!s) return null;

  // 1) strip weekday
  s = stripWeekday(s);
  // ล้างช่องว่างซ้ำ
  s = s.replace(/\s+/g, ' ').trim();
  // ลบจุลภาค
  s = s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

  // เตรียมปีอ้างอิง
  const refYearAD = expectedDate && /^\d{4}-\d{2}-\d{2}$/.test(expectedDate)
    ? parseInt(expectedDate.slice(0, 4), 10)
    : currentADYear();
  const refYearBE = refYearAD + 543;

  // Helper สร้าง YYYY-MM-DD
  const makeDate = (d: number, m: number, yBE: number | null): string | null => {
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    const be = yBE ?? refYearBE;
    const ad = toADYear(be);
    // validate date exists
    const dt = new Date(ad, m - 1, d);
    if (dt.getDate() !== d || dt.getMonth() !== m - 1) return null;
    return `${ad}-${pad2(m)}-${pad2(d)}`;
  };

  // 2) ลอง pattern ไทยย่อ: "2 ก.ย. 2569" / "2 ก.ย. 68" / "2 ก.ย." (ไม่มีปี)
  // รวมแบบไม่มีจุด: "2 กย 2569"
  {
    const m = s.match(/^(\d{1,2})\s+([ก-๙]+\.?)\s*(\d{2,4})?$/i) || s.match(/^(\d{1,2})\s+([ก-๙]+\.?)$/i);
    if (m) {
      const d = parseInt(m[1], 10);
      const monStr = m[2];
      const yStr = m[3];
      let mon = monthFromThaiShort(monStr) ?? monthFromThaiLong(monStr);
      if (mon) {
        let yBE: number | null = null;
        if (yStr) {
          const y = parseInt(yStr, 10);
          yBE = toBEYear(y);
        }
        const res = makeDate(d, mon, yBE);
        if (res) return res;
      }
    }
  }

  // 3) ไทยเต็ม: "2 กันยายน 2569" / "2 กันยายน 68" / "2 กันยายน"
  {
    const m = s.match(/^(\d{1,2})\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{2,4})?$/i);
    if (m) {
      const d = parseInt(m[1], 10);
      const mon = monthFromThaiLong(m[2]);
      let yBE: number | null = null;
      if (m[3]) yBE = toBEYear(parseInt(m[3], 10));
      if (mon) {
        const res = makeDate(d, mon, yBE);
        if (res) return res;
      }
    }
  }

  // 4) อังกฤษ: "2 Sep 2026" / "Sep 2 2026" / "September 2 2026" / "2 Sep" (ไม่มีปี)
  {
    // D Mon YYYY
    let m = s.match(/^(\d{1,2})\s+([A-Za-z]+\.?)\s*(\d{2,4})?$/);
    if (m) {
      const d = parseInt(m[1], 10);
      const mon = monthFromEng(m[2]);
      if (mon) {
        let yBE: number | null = null;
        if (m[3]) {
          const y = parseInt(m[3], 10);
          yBE = toBEYear(y);
        }
        const res = makeDate(d, mon, yBE);
        if (res) return res;
      }
    }
    // Mon D YYYY  e.g., "Sep 2 2026" / "September 2, 2026" (comma removed earlier)
    m = s.match(/^([A-Za-z]+\.?)\s+(\d{1,2})\s*(\d{2,4})?$/);
    if (m) {
      const mon = monthFromEng(m[1]);
      const d = parseInt(m[2], 10);
      if (mon) {
        let yBE: number | null = null;
        if (m[3]) yBE = toBEYear(parseInt(m[3], 10));
        const res = makeDate(d, mon, yBE);
        if (res) return res;
      }
    }
  }

  // 5) สากลตัวเลข: "02/09/2026" / "02-09-2569" / "02.09.2026" / "2026-09-02" / "2/9/68" / "2/9" (ไม่มีปี)
  {
    // YYYY-MM-DD
    let m = s.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);
      const yBE = toBEYear(y);
      const res = makeDate(d, mo, yBE);
      if (res) return res;
    }
    // DD/MM/YYYY or DD/MM/YY or DD/MM
    m = s.match(/^(\d{1,2})[-\/\.](\d{1,2})(?:[-\/\.](\d{2,4}))?$/);
    if (m) {
      const d = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      let yBE: number | null = null;
      if (m[3]) yBE = toBEYear(parseInt(m[3], 10));
      // ถ้าไม่มีปี และอยู่ในรูปแบบที่อาจสับสน MM/DD vs DD/MM — เราถือเป็น DD/MM ตามไทย
      const res = makeDate(d, mo, yBE);
      if (res) return res;
      // ลองสลับ MM/DD ถ้าไม่ valid (เผื่อ OCR อังกฤษ)
      const res2 = makeDate(mo, d, yBE);
      if (res2) return res2;
    }
  }

  // 6) กรณีมีข้อความอื่นปะปน — ลอง extract substring ที่ดูเหมือนวันที่
  {
    if (_depth < 2) {
      const sub = s.match(/(\d{1,2})\s*[ก-๙]+\.?\s*\d{2,4}/);
      if (sub && sub[0] !== s) {
        const res = normalizeOcrDate(sub[0], expectedDate, _depth + 1);
        if (res) return res;
      }
      const sub2 = s.match(/(\d{1,2})\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)/);
      if (sub2 && sub2[0] !== s) {
        const res = normalizeOcrDate(sub2[0], expectedDate, _depth + 1);
        if (res) return res;
      }
      const sub3 = s.match(/(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
      if (sub3 && sub3[0] !== s) {
        const res = normalizeOcrDate(sub3[0], expectedDate, _depth + 1);
        if (res) return res;
      }
    }
  }

  return null;
}

/** เทียบวันที่ OCR กับวันที่คาดหวัง (YYYY-MM-DD) */
export function isDateMatch(dateRaw: string | null, expectedDate: string): boolean | null {
  if (!dateRaw) return null;
  const norm = normalizeOcrDate(dateRaw, expectedDate);
  if (!norm) return null;
  return norm === expectedDate;
}

/** แปลงเลขไทย + ทำความสะอาด */
export function cleanOcrText(s: string): string {
  return thaiToArabic(s).trim();
}
