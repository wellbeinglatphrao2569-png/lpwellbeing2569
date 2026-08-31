import type { StepsLog, User } from '@/types';
import { toDateKey, thaiMonths, thaiShortMonths } from './thaiDate';

// ช่วงโครงการลาดพร้าวสร้างสุข — ห้วงเวลาบันทึกข้อมูล (ปรับได้โดย นสส. ที่หน้า Admin)
export const PROJECT_START_DATE = '2026-08-24';
export const PROJECT_END_DATE = '2026-11-13';

export type RankTab = 'weekly' | 'monthly' | 'project';
export type DeptRow = { name: string; total: number; participants: number; avg: number; isMine: boolean };
export type IndRow = { user: User; steps: number; isCurrent: boolean };
export type DateRange = { startKey: string; endKey: string };
export type RankBadgeStyle = { emoji: string | null; badge: string };

/** แปลง Date → 'YYYY-MM-DD' ตามวันปฏิทินท้องถิ่น (กันเพี้ยนจาก timezone ของ toISOString) */
export function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** คืนวันจันทร์ของสัปดาห์ที่ d เป็นสมาชิก (วันแรกของสัปดาห์ = จันทร์) */
export function mondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** 'YYYY-MM-DD' ของวันที่หลังจาก date ไป n วัน */
export function shiftDays(date: Date, n: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return toIsoLocal(d);
}

/** จำนวนวันในเดือนของ 'YYYY-MM' */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return 30;
  return new Date(y, m, 0).getDate();
}

/**
 * เปรียบเทียบ 2 รายการก้าว เพื่อหาว่ารายการใด "บันทึกทีหลัง" (ล่าสุด)
 * เกณฑ์: Recorded_At (เวลาบันทึก) มาก่อน รองลงมาคือ Record_ID ที่มากกว่า
 */
function compareLog(a: StepsLog, b: StepsLog): number {
  const atA = String(a.Recorded_At ?? '');
  const atB = String(b.Recorded_At ?? '');
  if (atA !== atB) return atA < atB ? -1 : 1;
  const idA = String(a.Record_ID ?? '');
  const idB = String(b.Record_ID ?? '');
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

/**
 * คำนวณจำนวนก้าวรวม (เฉพาะที่อนุมัติแล้ว) ของแต่ละคน ภายในช่วงวันที่ [startKey, endKey]
 * ใช้ "ข้อมูลล่าสุดของวัน" (1 วันต่อ 1 รายการ) กันการนับซ้ำ
 */
export function totalsInRange(stepsData: StepsLog[], startKey: string, endKey: string): Map<string, number> {
  const byUser = new Map<string, Map<string, StepsLog>>();
  for (const s of stepsData) {
    if (s.Status !== 'Approved') continue;
    const day = toDateKey(s.Date_Thai);
    if (!day || day < startKey || day > endKey) continue;
    const uid = String(s.User_ID ?? '').trim();
    if (!uid) continue;
    let byDay = byUser.get(uid);
    if (!byDay) { byDay = new Map(); byUser.set(uid, byDay); }
    const cur = byDay.get(day);
    if (!cur || compareLog(s, cur) > 0) byDay.set(day, s);
  }
  const totals = new Map<string, number>();
  for (const [uid, byDay] of byUser) {
    let sum = 0;
    for (const log of byDay.values()) sum += Number(log.Steps_Count) || 0;
    totals.set(uid, sum);
  }
  return totals;
}

/**
 * คำนวณจำนวนก้าวรวม (ทุกสถานะ — รวม Pending ที่รอตรวจสอบด้วย) ของแต่ละคน
 * ใช้ "ข้อมูลล่าสุดของวัน" กันการนับซ้ำ — เพื่อให้การจัดอันดับแสดงผลทันทีหลังบันทึก
 */
export function totalsInRangeAll(stepsData: StepsLog[], startKey: string, endKey: string): Map<string, number> {
  const byUser = new Map<string, Map<string, StepsLog>>();
  for (const s of stepsData) {
    const day = toDateKey(s.Date_Thai);
    if (!day || day < startKey || day > endKey) continue;
    // ใช้ User_ID แบบ trim เทียบเคส number/string
    const uid = String(s.User_ID ?? '').trim();
    if (!uid) continue;
    let byDay = byUser.get(uid);
    if (!byDay) { byDay = new Map(); byUser.set(uid, byDay); }
    const cur = byDay.get(day);
    if (!cur || compareLog(s, cur) > 0) byDay.set(day, s);
  }
  const totals = new Map<string, number>();
  for (const [uid, byDay] of byUser) {
    let sum = 0;
    for (const log of byDay.values()) sum += Number(log.Steps_Count) || 0;
    totals.set(uid, sum);
  }
  return totals;
}

/** ค่า boolean ยืดหยุ่น (ทำงานกับ true/false หรือ 'TRUE'/'FALSE'/'1') */
export function isTrue(val: unknown): boolean {
  if (val === true) return true;
  const s = String(val ?? '').trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'T';
}

/** แสดงวันที่สั้นแบบไทยจาก 'YYYY-MM-DD' เช่น 22 ก.ค. 2569 */
export function formatThaiShort(key: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(key);
  if (!m) return key;
  const yearBE = Number(m[1]) + 543;
  return `${Number(m[3])} ${thaiShortMonths[Number(m[2]) - 1]} ${yearBE}`;
}

/** จัดรูปแบบเวลาบันทึก 'YYYY-MM-DD HH:mm:ss' (เวลาไทย) → '22 ก.ค. 2569 · 14:32 น.' */
export function formatRecordedAt(recordedAt?: string): string {
  const s = String(recordedAt ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})/);
  if (m) {
    const day = Number(m[3]);
    const month = Number(m[2]) - 1;
    const yearBE = Number(m[1]) + 543;
    const time = `${m[4].padStart(2, '0')}:${m[5].padStart(2, '0')}`;
    return `${day} ${thaiShortMonths[month]} ${yearBE} · ${time} น.`;
  }
  const d = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (d) return `${Number(d[3])} ${thaiShortMonths[Number(d[2]) - 1]} ${Number(d[1]) + 543}`;
  return s;
}

/** คำนวณช่วง [จาก, ถึง] ของเดือนตามเดือนที่เลือกจาก URL/state */
export function monthRangeOf(monthFrom: string, monthTo: string): DateRange {
  const a = monthFrom <= monthTo ? monthFrom : monthTo;
  const b = monthFrom <= monthTo ? monthTo : monthFrom;
  const y1 = Number(a.split('-')[0]);
  const m1 = Number(a.split('-')[1]);
  const y2 = Number(b.split('-')[0]);
  const m2 = Number(b.split('-')[1]);
  const startKey = `${y1}-${String(m1).padStart(2, '0')}-01`;
  const endKey = `${y2}-${String(m2).padStart(2, '0')}-${String(daysInMonth(b)).padStart(2, '0')}`;
  return { startKey, endKey };
}

/** รายการสัปดาห์ทั้งหมดในโครงการ (จันทร์–อาทิตย์) สำหรับ dropdown เลือกสัปดาห์ */
export function projectWeeks(): { startKey: string; endKey: string; label: string; weekLabel: string }[] {
  const weeks: { startKey: string; endKey: string; label: string; weekLabel: string }[] = [];
  // เริ่มจากจันทร์ของสัปดาห์แรกที่มี PROJECT_START_DATE
  const cur = mondayOf(new Date(PROJECT_START_DATE + 'T12:00:00'));
  let idx = 1;
  while (true) {
    const startKey = toIsoLocal(cur);
    if (startKey > PROJECT_END_DATE) break;
    let endKey = shiftDays(cur, 6);
    if (endKey > PROJECT_END_DATE) endKey = PROJECT_END_DATE;
    const label = `สัปดาห์ที่ ${idx} · ${formatThaiShort(startKey)} – ${formatThaiShort(endKey)}`;
    const weekLabel = `สัปดาห์ ${formatThaiShort(startKey)} – ${formatThaiShort(endKey)}`;
    weeks.push({ startKey, endKey, label, weekLabel });
    idx++;
    cur.setDate(cur.getDate() + 7);
    // กันลูปไม่สิ้นสุด
    if (idx > 20) break;
  }
  return weeks;
}

/**
 * คำนวณช่วงวันที่ + ป้ายกำกับช่วงเวลาของการ์ดจัดอันดับ
 * (สัปดาห์อ้างอิงจากวันนี้ + weekOffset หรือเลือกสัปดาห์ตรงๆ ผ่าน selectedWeekStart · รายเดือนจาก [monthFrom, monthTo] · ตลอดโครงการจากค่าคงที่)
 * แต่ละ tab ใช้ช่วงแยกกันชัด ไม่ทับซ้อน: weekly=7วัน จ-อา, monthly=ตามเดือนที่เลือก, project=24สค63-13พย69
 */
export function periodRangeFor(tab: RankTab, weekOffset: number, monthFrom: string, monthTo: string, selectedWeekStart?: string): {
  startKey: string;
  endKey: string;
  periodLabel: string;
  weekStartKey: string;
  weekEndKey: string;
} {
  // หา weekStart/weekEnd — ถ้ามี selectedWeekStart (จาก dropdown) ให้ใช้ตรงๆ
  let weekStartKey: string;
  let weekEndKey: string;
  if (selectedWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(selectedWeekStart)) {
    weekStartKey = selectedWeekStart;
    weekEndKey = shiftDays(new Date(weekStartKey + 'T12:00:00'), 6);
    if (weekEndKey > PROJECT_END_DATE) weekEndKey = PROJECT_END_DATE;
    if (weekStartKey < PROJECT_START_DATE) weekStartKey = PROJECT_START_DATE;
  } else {
    const wm = mondayOf(new Date());
    wm.setDate(wm.getDate() + weekOffset * 7);
    weekStartKey = toIsoLocal(wm);
    weekEndKey = shiftDays(wm, 6);
    // clamp ให้อยู่ในขอบโครงการเมื่อแสดงผล (กันสัปดาห์ที่เลยโครงการ)
    if (weekEndKey > PROJECT_END_DATE && weekStartKey <= PROJECT_END_DATE) {
      // ถ้าสัปดาห์เลยขอบ ให้ clamp ปลาย
      if (weekEndKey > PROJECT_END_DATE) weekEndKey = PROJECT_END_DATE;
    }
  }

  if (tab === 'weekly') {
    // สัปดาห์แยกชัด 7 วัน จ-อา ไม่รวมเดือน/โครงการ
    return {
      startKey: weekStartKey,
      endKey: weekEndKey,
      periodLabel: `สัปดาห์ ${formatThaiShort(weekStartKey)} – ${formatThaiShort(weekEndKey)}`,
      weekStartKey,
      weekEndKey,
    };
  }
  if (tab === 'monthly') {
    const a = monthFrom <= monthTo ? monthFrom : monthTo;
    const b = monthFrom <= monthTo ? monthTo : monthFrom;
    const range = monthRangeOf(a, b);
    const label = a === b
      ? `${thaiMonths[Number(a.split('-')[1]) - 1]} ${Number(a.split('-')[0]) + 543}`
      : `${thaiMonths[Number(a.split('-')[1]) - 1]} ${Number(a.split('-')[0]) + 543} – ${thaiMonths[Number(b.split('-')[1]) - 1]} ${Number(b.split('-')[0]) + 543}`;
    return { startKey: range.startKey, endKey: range.endKey, periodLabel: label, weekStartKey, weekEndKey };
  }
  return {
    startKey: PROJECT_START_DATE,
    endKey: PROJECT_END_DATE,
    periodLabel: `ตลอดโครงการ (${formatThaiShort(PROJECT_START_DATE)} – ${formatThaiShort(PROJECT_END_DATE)})`,
    weekStartKey,
    weekEndKey,
  };
}

function getUserRankingKey(u: User): string {
  const uid = String((u as any).User_ID ?? '').trim();
  if (uid) return uid;
  return String((u as any).Personnel_ID ?? '').trim();
}
function stepsForUser(u: User, totals: Map<string, number>): number {
  const uid = String((u as any).User_ID ?? '').trim();
  if (uid && totals.has(uid)) return totals.get(uid)!;
  const pid = String((u as any).Personnel_ID ?? '').trim();
  if (pid && totals.has(pid)) return totals.get(pid)!;
  // fallback: ถ้า map มี key เป็น Personnel_ID แต่ user มี User_ID แล้ว totals ยังเป็น PID ก็ยังดักไว้
  if (uid) return totals.get(uid) || 0;
  return totals.get(pid) || 0;
}
/** จัดอันดับรายบุคคล ตามจำนวนก้าวรวม (มาก→น้อย) เฉพาะคนที่บันทึกก้าวจริงในรอบ */
export function individualRankingOf(users: User[], totals: Map<string, number>, currentUserId?: string | number | null): IndRow[] {
  const curKey = String(currentUserId ?? '').trim();
  return users
    .map(u => {
      const steps = stepsForUser(u, totals);
      const myKey = getUserRankingKey(u);
      return { user: u, steps, isCurrent: myKey === curKey || String((u as any).Personnel_ID ?? '').trim() === curKey };
    })
    .filter(r => r.steps > 0)
    .sort((a, b) => b.steps - a.steps);
}

/** จัดอันดับรายส่วนราชการ จาก ก้าวรวม ÷ คนที่บันทึกก้าวจริงในฝ่าย (มาก→น้อย) */
export function deptRankingOf(users: User[], totals: Map<string, number>, currentDept?: string | null): DeptRow[] {
  const byDept = new Map<string, { total: number; participants: number }>();
  for (const u of users) {
    const steps = stepsForUser(u, totals);
    if (steps <= 0 || !u.Department) continue;
    const cur = byDept.get(u.Department) || { total: 0, participants: 0 };
    cur.total += steps;
    cur.participants += 1;
    byDept.set(u.Department, cur);
  }
  return [...byDept.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      participants: v.participants,
      avg: Math.round(v.total / v.participants),
      isMine: name === currentDept,
    }))
    .sort((a, b) => b.avg - a.avg || b.total - a.total);
}

/** ก้าวรวม + จำนวนผู้เข้าร่วม ทั้งโครงการ (ภาพใหญ่) — นับเฉพาะข้อมูลล่าสุดของแต่ละวัน */
export function programTotals(stepsData: StepsLog[]): { total: number; participants: number } {
  const totals = totalsInRange(stepsData, PROJECT_START_DATE, PROJECT_END_DATE);
  let total = 0;
  for (const v of totals.values()) total += v;
  return { total, participants: totals.size };
}

/** สี/เหรียญของอันดับ: อันดับ 1-3 เป็นสีทอง/เงิน/ทองแดง ตามลำดับ ที่เหลือสีกลาง */
export function rankBadge(rank: number): RankBadgeStyle {
  if (rank === 1) return { emoji: '🥇', badge: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' };
  if (rank === 2) return { emoji: '🥈', badge: 'bg-slate-200 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300' };
  if (rank === 3) return { emoji: '🥉', badge: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400' };
  return { emoji: null, badge: 'text-gray-400 dark:text-gray-500' };
}