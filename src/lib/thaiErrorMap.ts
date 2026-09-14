export function friendlyThai(err: unknown, status?: number): string {
  const raw = (() => {
    if (!err) return '';
    if (typeof err === 'string') return err;
    const o: any = err;
    return String(o.error || o.message || o.Error || JSON.stringify(o) || '');
  })();
  const lower = raw.toLowerCase();
  const isHtml = lower.includes('<!doctype') || lower.includes('ppconfig') || lower.includes('<html') || lower.includes('heartbeatrate');

  if (isHtml) {
    return 'เซิร์ฟเวอร์ตอบเป็นหน้าเว็บ (ระบบงานหนักชั่วคราว) — กรุณารอ 10-15 วินาทีแล้วลองใหม่ ระบบจะข้ามรายการที่บันทึกไปแล้วให้อัตโนมัติ';
  }
  if (status === 429 || lower.includes('429') || lower.includes('too many') || lower.includes('rate')) {
    return 'ระบบงานหนัก (ถูกจำกัดชั่วคราว) — กรุณารอ 10 วินาทีแล้วลองใหม่ ระบบจะแบ่งส่งเป็นชุดเล็กให้อัตโนมัติ';
  }
  if (status === 413 || lower.includes('413') || lower.includes('payload too large') || lower.includes('entity too large') || lower.includes('request too large')) {
    return 'ไฟล์ภาพรวมใหญ่เกินไป — ระบบจะแบ่งส่งอัตโนมัติ ลองลดจำนวนภาพต่อครั้งเหลือ 5-10 รูป';
  }
  if (status === 504 || status === 499 || lower.includes('timeout') || lower.includes('exceeded maximum execution time') || lower.includes('504')) {
    return 'เซิร์ฟเวอร์ใช้เวลาเกินกำหนด (บางรายการอาจบันทึกสำเร็จแล้ว) — กรุณารีเฟรชตารางแล้วเช็ครายการที่เหลือก่อนกดบันทึกซ้ำ';
  }
  if (lower.includes('drive') || lower.includes('service invoked too many times') || lower.includes('quota') || lower.includes('storage')) {
    return 'พื้นที่ Drive ติดขัดชั่วคราว — กรุณารอ 30 วินาทีแล้วลองใหม่';
  }
  if (lower.includes('need_confirm')) {
    return 'บัญชีนี้กำลังใช้งานบนอุปกรณ์อื่น — กรุณายืนยันเพื่อออกจากเครื่องเดิม';
  }
  if (lower.includes('already_reviewed') || lower.includes('ตรวจสอบไปแล้ว')) {
    return raw.slice(0, 400);
  }
  if (lower.includes('gas error') || lower.includes('network error')) {
    return raw ? raw.slice(0, 400) : 'เชื่อมต่อ Google Sheet ล้มเหลว — กรุณาลองใหม่';
  }
  if (raw && raw.trim() && !isHtml) return raw.slice(0, 600);
  return 'เกิดข้อผิดพลาดชั่วคราว — กรุณาลองใหม่ หากยังไม่ได้ให้แจ้ง นสส.';
}

export function isHtmlError(text: string): boolean {
  const l = text.toLowerCase();
  return l.includes('<!doctype') || l.includes('ppconfig') || l.includes('<html');
}
