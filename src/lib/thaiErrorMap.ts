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
    return 'กำลังอัปโหลดข้อมูลเข้าสู่ฐานข้อมูล — ระบบกำลังบันทึก กรุณารอสักครู่ อย่าปิดหน้าต่าง (ระบบจะข้ามรายการที่บันทึกไปแล้วให้อัตโนมัติ)';
  }
  if (status === 429 || lower.includes('429') || lower.includes('too many') || lower.includes('rate')) {
    return 'กำลังอัปโหลดข้อมูลเข้าสู่ฐานข้อมูล — อยู่ในคิว กรุณารอสักครู่ ระบบจะแบ่งส่งเป็นชุดเล็กให้อัตโนมัติ';
  }
  if (status === 413 || lower.includes('413') || lower.includes('payload too large') || lower.includes('entity too large') || lower.includes('request too large')) {
    return 'กำลังอัปโหลดข้อมูลเข้าสู่ฐานข้อมูล — ไฟล์ภาพรวมใหญ่เกินไป ระบบจะแบ่งส่งเป็นชุดเล็กให้อัตโนมัติ';
  }
  if (status === 504 || status === 499 || lower.includes('timeout') || lower.includes('exceeded maximum execution time') || lower.includes('504')) {
    return 'กำลังอัปโหลดข้อมูลเข้าสู่ฐานข้อมูล — ใช้เวลาเกินกำหนด (บางรายการอาจบันทึกสำเร็จแล้ว) กรุณารีเฟรชตารางแล้วเช็ครายการที่เหลือก่อนกดบันทึกซ้ำ';
  }
  if (lower.includes('drive') || lower.includes('service invoked too many times') || lower.includes('quota') || lower.includes('storage')) {
    return 'กำลังอัปโหลดข้อมูลเข้าสู่ฐานข้อมูล — พื้นที่ Drive กำลังบันทึก กรุณารอสักครู่';
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
