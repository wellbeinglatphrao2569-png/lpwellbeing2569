/**
 * AI summary helpers — สรุปผลอ่านค่า AI ให้สั้น กระชับ แบบตาราง/Card
 * ใช้ร่วมกันทั้งรายบุคคล (AiVerificationPopup) รายกลุ่ม (AiBatchSummaryPopup)
 * แอดมิน (verify-steps AiReasonCell) และ API (analyze-steps / image-upload / batch-upload)
 */

export type AiStatus = 'pass' | 'review';

export function aiStatusOf(alert: boolean | null | undefined): AiStatus {
  return alert ? 'review' : 'pass';
}

export function aiStatusLabel(status: AiStatus): string {
  return status === 'pass' ? 'ผ่าน' : 'รอตรวจ';
}

/** ตัดเหตุผลยาวๆ ให้เหลือไม่เกิน max (default 90 ตัวอักษร) แบบไม่ตัดคำกลางคัน */
export function shortenReason(reason: string | null | undefined, max = 90): string {
  const s = String(reason ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** เหตุผลสั้นมาตรฐานจากเงื่อนไข (ใช้ใน API แทนประโยคยาว) */
export function shortAlertReason(kind: 'steps' | 'date' | 'date-missing' | 'lowconf' | 'unreadable' | 'failed', detail?: {
  inputSteps?: number | null;
  aiSteps?: number | null;
  expected?: string | null;
  dateRaw?: string | null;
  dateNormalized?: string | null;
  conf?: number | null;
}): string {
  const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('th-TH'));
  switch (kind) {
    case 'steps':
      return `ก้าวไม่ตรง (กรอก ${fmt(detail?.inputSteps)} / อ่านได้ ${fmt(detail?.aiSteps)})`;
    case 'date':
      return `วันที่ไม่ตรง (${detail?.expected ?? '—'} / อ่านได้ ${detail?.dateRaw ?? detail?.dateNormalized ?? '—'})`;
    case 'date-missing':
      return `อ่านวันที่ไม่ชัด ("${detail?.dateRaw || '—'}")`;
    case 'lowconf':
      return `มั่นใจต่ำ (${Math.round((detail?.conf ?? 0) * 100)}%)`;
    case 'unreadable':
      return 'อ่านก้าวไม่ชัด — ส่งเจ้าหน้าที่ตรวจ';
    case 'failed':
      return 'AI อ่านไม่สำเร็จ — รอตรวจ manual';
  }
}

/** เลือกเหตุผลสั้นที่สุดระหว่าง reason จาก model กับ fallback (กันเรียงความยาวจาก model) */
export function pickShortReason(modelReason: string | null | undefined, fallback: string, max = 90): string {
  const m = shortenReason(modelReason, max);
  if (m) return m;
  return shortenReason(fallback, max);
}
