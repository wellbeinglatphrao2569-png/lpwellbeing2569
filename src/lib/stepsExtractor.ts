/**
 * ดึงจำนวนก้าวจาก OCR text
 * กติกา: ก้าวที่ถูกต้องต้องตรงเป๊ะ (0% tolerance) ถ้าอ่านไม่ได้ → null
 */

// แปลงเลขไทย → อารบิก
const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
function thaiToArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (ch) => String(thaiDigits.indexOf(ch)));
}

function cleanNumber(s: string): number | null {
  const t = thaiToArabic(s).replace(/[, ]/g, '').trim();
  const n = parseInt(t, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * หาจำนวนก้าวจากข้อความ OCR
 * priority:
 * 1) ตัวเลขที่มีคำว่า ก้าว ต่อท้าย (เช่น "12,345 ก้าว" / "12345ก้าว")
 * 2) ตัวเลขใหญ่สุดในข้อความ (>100) — กันกรณีไม่มีคำว่า ก้าว แต่เป็นตัวเลขใหญ่กลางจอ
 */
export function extractStepsFromText(text: string): { steps: number | null; raw: string | null } {
  if (!text) return { steps: null, raw: null };
  const src = thaiToArabic(text);

  // 1) หา "ก้าว" pattern — รวมเคสมีจุลภาค/ช่องว่าง
  // รองรับ "12,345 ก้าว", "12345ก้าว", "12 345 ก้าว"
  const gaoRegex = /([\d, ]{2,10})\s*ก้าว/g;
  let best: { n: number; raw: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = gaoRegex.exec(src)) !== null) {
    const raw = m[1].trim() + ' ก้าว';
    const n = cleanNumber(m[1]);
    if (n != null && n > 0 && n < 1000000) {
      if (!best || n > best.n) best = { n, raw };
    }
  }
  if (best) return { steps: best.n, raw: best.raw };

  // 2) หาคำว่า steps / step (อังกฤษ)
  const stepEnRegex = /([\d, ]{2,10})\s*steps?/gi;
  while ((m = stepEnRegex.exec(src)) !== null) {
    const raw = m[1].trim() + ' steps';
    const n = cleanNumber(m[1]);
    if (n != null && n > 0 && n < 1000000) {
      if (!best || n > best.n) best = { n, raw };
    }
  }
  if (best) return { steps: best.n, raw: best.raw };

  // 3) fallback: ตัวเลขใหญ่สุดในข้อความ (4-6 หลัก, >100) — สมมติว่าเป็นก้าว
  const numRegex = /(\d[\d, ]{2,8})/g;
  let fallback: { n: number; raw: string } | null = null;
  while ((m = numRegex.exec(src)) !== null) {
    const n = cleanNumber(m[1]);
    if (n != null && n >= 100 && n < 500000) {
      // กรองเลขวันที่/ปี (เช่น 2569, 2026, 8, 12) — ต้อง >=100 และไม่ใช่ปี พ.ศ./ค.ศ. ที่ขึ้นต้นด้วย 25/20 ถ้า 4 หลักและ 2000-2700 ให้ข้ามถ้าไม่มีบริบทก้าว
      // แต่ถ้ามีหลายตัวเลข ให้เลือกตัวใหญ่สุดที่ไม่อยู่ในช่วงปี
      const isYear = n >= 2400 && n <= 2700;
      if (isYear) continue;
      if (!fallback || n > fallback.n) fallback = { n, raw: m[1].trim() };
    }
  }
  if (fallback) return { steps: fallback.n, raw: fallback.raw };

  return { steps: null, raw: null };
}
