'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import ProgressRing from '@/components/ui/ProgressRing';
import ProofImage from '@/components/ProofImage';
import ConfirmPopup from '@/components/ui/ConfirmPopup';
import { toThaiDateShort } from '@/utils/thaiDate';
import { useAuth } from '@/hooks/useAuth';
import { fetchData, postData } from '@/services/api';
import type { StepsLog, User, AiImageAnalysis } from '@/types';
import * as GF from '@/lib/google-fitness';

type DepartmentMember = {
  name: string;
  steps: number;
  userId: string;
  isCurrentUser: boolean;
};

const DAILY_GOAL = 6000;
const WEEKLY_GOAL = 42000;
const thaiShortMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thaiMonthsLong = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// Thai Buddhist date helpers
function toThaiYear(date: Date): string {
  return String(date.getFullYear() + 543);
}
function formatThaiDateShort(date: Date): string {
  return `${date.getDate()} ${thaiShortMonths[date.getMonth()]} ${toThaiYear(date)}`;
}
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function getSunday(d: Date): Date {
  const sun = new Date(getMonday(d));
  sun.setDate(sun.getDate() + 6);
  return sun;
}
function formatWeekRangeThai(d: Date): string {
  const monday = getMonday(d);
  const sunday = getSunday(d);
  return `${formatThaiDateShort(monday)} - ${formatThaiDateShort(sunday)}`;
}

function getDaysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function formatTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getEncouragement(steps: number, goal: number): { message: string; emoji: string } {
  if (steps >= goal) {
    const over = steps - goal;
    if (over >= 2000) return { message: 'สุดยอดไปเลย!', emoji: '🏆' };
    if (over >= 1000) return { message: 'เก่งมาก!', emoji: '🎉' };
    return { message: 'ถึงเป้าหมายแล้ว!', emoji: '👏' };
  }
  const remaining = goal - steps;
  if (remaining <= 500) return { message: 'ใกล้ถึงแล้ว พยายามอีกนิด!', emoji: '💪' };
  if (remaining <= 2000) return { message: 'อีกไม่ไกล ตั้งใจต่อไป!', emoji: '🔥' };
  return { message: 'สู้ ๆ อีกนิดก็ถึงเป้าหมายแล้ว!', emoji: '💪' };
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
 * เหลือเพียง "ข้อมูลล่าสุดของวัน" (1 วันต่อ 1 รายการ) — ลบข้อมูลเก่าของวันเดียวกัน
 * เพื่อไม่ให้ก้าวของวันนั้นถูกนับซ้ำ ไม่ว่าจะดึงข้อมูลด้วยวิธีใด
 */
function latestStepsByDate(logs: StepsLog[]): Map<string, StepsLog> {
  const map = new Map<string, StepsLog>();
  for (const log of logs) {
    const key = normalizeDateKey(log.Date_Thai);
    if (!key) continue;
    const cur = map.get(key);
    if (!cur || compareLog(log, cur) > 0) map.set(key, log);
  }
  return map;
}

/** หาค่าจำนวนก้าวล่าสุดของวันจาก map (หรือ 0 ถ้ายังไม่มี) */
function stepsOfDay(latest: Map<string, StepsLog>, dateStr: string): number {
  const log = latest.get(dateStr);
  return log ? (Number(log.Steps_Count) || 0) : 0;
}

/** แปลง Date → "YYYY-MM-DD" ตามวันปฏิทินท้องถิ่น (กันเพี้ยนจาก timezone ของ toISOString) */
function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * แปลงค่า Date_Thai จาก backend ให้เป็น key มาตรฐาน "YYYY-MM-DD" (ตามวันท้องถิ่น)
 * เพราะ GAS/Google Sheets อาจคืนค่ามาเป็น Date object (→ ISO string) หรือ "yyyy-MM-dd HH:mm:ss"
 * ทำให้การจับคู่แบบ string เท่ากันพลาด ไม่แสดงจำนวนก้าว
 */
function normalizeDateKey(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return toIsoLocal(value);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return toIsoLocal(d);
  return s;
}

/** ย่อขนาดภาพเป็น JPEG (กัน payload ใหญ่เกินจำกัดของ GAS/Gemini) */
function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('เบราว์เซอร์ไม่รองรับการย่อภาพ'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

export default function StepsPage() {
  const { user, login } = useAuth();
  const [stepsData, setStepsData] = useState<StepsLog[]>([]);
  const [activeResultCard, setActiveResultCard] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [stepInput, setStepInput] = useState('');
  const [logMethod, setLogMethod] = useState<'google-fit' | 'image-upload'>('google-fit');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiExtractedSteps, setAiExtractedSteps] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState<AiImageAnalysis | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [googleFitSteps, setGoogleFitSteps] = useState<number | null>(null);
  const [fetchingGf, setFetchingGf] = useState(false);
  const [gfConnecting, setGfConnecting] = useState(false);
  const [gfErrorMessage, setGfErrorMessage] = useState<string | null>(null);
  const [gfVersion, setGfVersion] = useState(0);
  const [gfLinkedUser, setGfLinkedUser] = useState<{ userId: string; userName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ช่วงเวลาที่ดูย้อนหลังได้ (วัน / สัปดาห์ / เดือน)
  const [dayOffset, setDayOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [zoomImage, setZoomImage] = useState<{ fileId: string; alt: string } | null>(null);
  // วันที่เริ่มต้นของสัปดาห์ (วันจันทร์) ที่เลือกจากปฏิทิน — start = จันทร์ เสมอ (จำสัปดาห์ล่าสุดที่บันทึกไว้)
  const [historyWeekDate, setHistoryWeekDate] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const hw = params.get('historyWeek');
        if (hw && /^\d{4}-\d{2}-\d{2}$/.test(hw)) return hw;
        const saved = localStorage.getItem('steps_historyWeek');
        if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
      }
    } catch {}
    return toIsoLocal(getMonday(new Date()));
  });

  // Department leaderboard state
  const [deptPeriod, setDeptPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [deptUsers, setDeptUsers] = useState<User[]>([]);
  const [showAllRanking, setShowAllRanking] = useState(false);

  // จำสัปดาห์ประวัติที่เลือกไว้ (ให้หลังรีเฟรชยังอยู่สัปดาห์เดิม)
  useEffect(() => {
    try { localStorage.setItem('steps_historyWeek', historyWeekDate); } catch {}
  }, [historyWeekDate]);

  // หลังต่อ Google Fit สำเร็จ → รีเฟรชหน้า /steps อีกครั้งและโหลดข้อมูลใหม่
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected') === 'true') {
        // ล้าง query แล้วรีโหลดข้อมูล + บังคับ re-render ของสถานะเชื่อมต่อ
        window.history.replaceState(null, '', window.location.pathname);
        loadData();
        loadDeptUsers();
        setGfVersion(v => v + 1);
        // รันกลับมาหน้าอีกครั้ง (hard refresh หนึ่งรอบเพื่อให้ hook อ่าน localStorage ใหม่แน่ๆ)
        setTimeout(() => window.location.reload(), 600);
      }
    }
  }, []);

  // Auto-clear Google Fit localStorage if backend has no record
  useEffect(() => {
    if (!user) return;
    const email = GF.getConnectedEmail();
    console.log('[StepsPage] Auto-clear check:', { userId: user.User_ID, email });
    if (email) {
      GF.checkEmail(email, user.User_ID).then((result) => {
        console.log('[StepsPage] checkEmail result:', result);
        if (result.autoClear) {
          console.log('[StepsPage] Auto-clearing localStorage');
          GF.disconnect();
          setGfVersion((v) => v + 1);
        }
      });
    }
  }, [user?.User_ID]);

  useEffect(() => {
    loadData();
    loadDeptUsers();
  }, []);

  // ซิงก์โหมดล่าสุดจาก GAS: เมื่อ Admin เปลี่ยน Mode 1↔2 แล้ว ผู้ใช้ไม่ต้อง logout/login ใหม่ก็เห็นผลทันที
  useEffect(() => {
    if (!user?.User_ID) return;
    let cancelled = false;
    (async () => {
      const usersData = await fetchData<User[]>('users');
      if (cancelled || !usersData) return;
      const fresh = usersData.find(u => String(u.User_ID).trim() === String(user.User_ID).trim());
      if (!fresh) return;
      const oldMode = String((user as any).Step_Record_Mode || '1').trim();
      const newMode = String((fresh as any).Step_Record_Mode || '1').trim();
      const oldDept = String(user.Department || '').trim();
      const newDept = String(fresh.Department || '').trim();
      if (oldMode !== newMode || oldDept !== newDept || String(user.Full_Name||'') !== String(fresh.Full_Name||'')) {
        login(fresh);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.User_ID]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const data = await fetchData<StepsLog[]>('steps');
    if (data) setStepsData(data);
  }

  async function loadDeptUsers() {
    const usersData = await fetchData<User[]>('users');
    if (usersData) setDeptUsers(usersData);
  }

  const todayReal = new Date();
  const todayStr = todayReal.toISOString().split('T')[0];

  // วันที่ / สัปดาห์ / เดือน ที่กำลังดูอยู่ (ย้อนหลังได้)
  const viewDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return d;
  }, [dayOffset]);
  const viewDateStr = viewDate.toISOString().split('T')[0];
  const monday = useMemo(() => {
    const m = getMonday(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);
  const sunday = useMemo(() => getSunday(monday), [monday]);
  const viewMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  }, [monthOffset]);
  const viewMonthFirst = useMemo(() => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1), [viewMonth]);
  const viewMonthLast = useMemo(() => new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0), [viewMonth]);
  const daysInMonth = getDaysInMonth(viewMonth);

  const userSteps = stepsData.filter(s => s.User_ID === user?.User_ID);

  // ใช้เฉพาะรายการที่ผ่านการอนุมัติ (Approved) แล้วเลือกเฉพาะ "ข้อมูลล่าสุดของวัน"
  // เพื่อไม่ให้เกิดการนับซ้ำเมื่อมีการบันทึกหลายครั้งในวันเดียวกัน (ทั้ง Google Fit และอัปโหลดภาพ)
  const latestApproved = useMemo(
    () => latestStepsByDate(userSteps.filter(s => s.Status === 'Approved')),
    [userSteps]
  );

  const todaySteps = stepsOfDay(latestApproved, viewDateStr);

  const weeklySteps = useMemo(() => {
    let total = 0;
    for (const [ds, log] of latestApproved) {
      const d = new Date(ds);
      if (d >= monday && d <= sunday) total += Number(log.Steps_Count) || 0;
    }
    return total;
  }, [latestApproved, monday, sunday]);

  const monthlySteps = useMemo(() => {
    let total = 0;
    for (const [ds, log] of latestApproved) {
      const d = new Date(ds);
      if (d >= viewMonthFirst && d <= viewMonthLast) total += Number(log.Steps_Count) || 0;
    }
    return total;
  }, [latestApproved, viewMonthFirst, viewMonthLast]);

  const monthlyGoal = DAILY_GOAL * daysInMonth;

  // สัปดาห์ที่จะแสดงในตารางประวัติ (จันทร์-อาทิตย์) — กำหนดด้วยวันที่ใดก็ได้ในสัปดาห์นั้น
  const historyMonday = useMemo(() => getMonday(new Date(historyWeekDate)), [historyWeekDate]);
  // เช็คว่าในสัปดาห์ที่เลือกนี้มีข้อมูลก้าวของผู้ใช้หรือไม่ (สำหรับคำแนะนำเมื่อไม่มีข้อมูล)
  const historyWeekHasData = useMemo(() => {
    const days = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(historyMonday);
      d.setDate(d.getDate() + i);
      days.add(toIsoLocal(d));
    }
    return userSteps.some(s => days.has(normalizeDateKey(s.Date_Thai)));
  }, [userSteps, historyMonday]);
  // รวมก้าวสะสมของสัปดาห์ที่กำลังดู (ผลรวมของจำนวนก้าวที่อนุมัติแล้วของแต่ละวัน ไม่นับซ้ำ)
  const historyWeekTotal = useMemo(() => {
    const days = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(historyMonday);
      d.setDate(d.getDate() + i);
      days.add(toIsoLocal(d));
    }
    let total = 0;
    for (const [ds, log] of latestApproved) {
      if (days.has(ds)) total += Number(log.Steps_Count) || 0;
    }
    return total;
  }, [latestApproved, historyMonday]);

  // ข้อมูล "จำนวนก้าวที่อนุมัติแล้ว" ล่าสุดของแต่ละวัน สำหรับแสดงในตารางประวัติรายสัปดาห์
  const latestUserSteps = useMemo(
    () => latestStepsByDate(userSteps.filter(s => s.Status === 'Approved')),
    [userSteps]
  );
  // ข้อมูลล่าสุดของแต่ละวัน (ไม่กรองสถานะ) เพื่อตรวจว่ายังมีรายการรอตรวจสอบที่ใหม่กว่ารายการที่อนุมัติหรือไม่
  const latestAnyUserSteps = useMemo(() => latestStepsByDate(userSteps), [userSteps]);

  const resultCards = useMemo(() => ({
    daily: { label: 'วันนี้', date: formatThaiDateShort(viewDate) },
    weekly: { label: 'สัปดาห์', date: formatWeekRangeThai(monday) },
    monthly: { label: 'เดือน', date: `${thaiMonthsLong[viewMonth.getMonth()]} ${toThaiYear(viewMonth)}` },
  }), [viewDate, monday, viewMonth]);

  const dailyEnc = getEncouragement(todaySteps, DAILY_GOAL);
  const weeklyEnc = getEncouragement(weeklySteps, WEEKLY_GOAL);
  const monthlyEnc = getEncouragement(monthlySteps, monthlyGoal);

  // Department leaderboard
  const userDept = user?.Department ?? '';
  const deptMembers: DepartmentMember[] = useMemo(() => {
    const deptApproved = stepsData.filter(s => s.Status === 'Approved');
    return deptUsers.map((u) => {
      if (u.Department !== userDept) return null;
      let total = 0;
      for (const log of latestStepsByDate(deptApproved.filter(s => s.User_ID === u.User_ID)).values()) {
        const d = new Date(log.Date_Thai);
        const inPeriod = deptPeriod === 'weekly' ? (d >= monday && d <= sunday) : (d >= viewMonthFirst && d <= viewMonthLast);
        if (inPeriod) total += Number(log.Steps_Count) || 0;
      }
      return {
        name: u.Full_Name,
        steps: total,
        userId: u.User_ID,
        isCurrentUser: u.User_ID === user?.User_ID,
      };
    }).filter((m): m is DepartmentMember => m !== null && m.steps > 0)
      .sort((a, b) => b.steps - a.steps);
  }, [stepsData, deptUsers, deptPeriod, user, monday, sunday, viewMonthFirst, viewMonthLast, userDept]);

  const topThreeFromDept = deptMembers.slice(0, 3);

  function getDeptNickname(rank: number): string {
    if (rank === 1) return '🥇 เดอะแบก';
    if (rank === 2) return '🥈 รองเดอะแบก';
    if (rank === 3) return '🥉 ที่สาม';
    return '';
  }

  function getLogDateDisplay(dateIso: string): string {
    if (!dateIso) return formatThaiDateShort(new Date());
    const d = new Date(dateIso);
    return formatThaiDateShort(d);
  }

  // ══ Google Fit Handlers ══

  // สถานะการเชื่อมต่อ Google Fit — คุม 1 Gmail = 1 คน (ห้ามใช้การเชื่อมต่อของบัญชีอื่นบนเครื่องเดียวกัน)
  // gfTick: ค่า tick ใช้บังคับ re-render หลังถอดการเชื่อมต่อ (localStorage ไม่ trigger rendering)
  void gfVersion;
  const gfConnected = GF.isConnected();
  const gfOwned = user ? GF.isOwnedBy(user.User_ID) : false;
  const gfInherited = gfConnected && !gfOwned;

  // ดึงข้อมูลบัญชีที่เชื่อมต่ออีเมลนี้อยู่ (จาก backend)
  useEffect(() => {
    if (!gfConnected || !user) return;
    const email = GF.getConnectedEmail();
    if (!email) return;
    const checkLinkedUser = async () => {
      try {
        const res = await fetch('/api/google-fitness/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, userId: String(user.User_ID || '').trim(), action: 'check' }),
        });
        const data = await res.json();
        if (data.linkedUser) {
          setGfLinkedUser({ userId: String(data.linkedUser), userName: data.linkedUserName || String(data.linkedUser) });
        } else {
          setGfLinkedUser(null);
        }
      } catch {}
    };
    checkLinkedUser();
  }, [gfConnected, gfVersion, user?.User_ID]);

  /** Connect Google Fit → redirect to OAuth → come back with code */
  async function handleGfConnect(): Promise<void> {
    setGfConnecting(true);
    setGfErrorMessage(null);
    await GF.connectGoogleFitness(String(user?.User_ID || '').trim());
  }

  /** ถอดการเชื่อมต่อ Google Fit */
  function handleGfDisconnect(): void {
    GF.disconnect();
    setGoogleFitSteps(null);
    setGfErrorMessage(null);
    setGfLinkedUser(null);
    setGfVersion((v) => v + 1); // trigger re-render
  }

  /** Fetch steps from Google Fit for selected date */
  async function fetchGoogleFitSteps(): Promise<void> {
    if (!logDate) return;
    if (!GF.isConnected()) {
      setGfErrorMessage('ยังไม่ได้เชื่อมต่อกูเกิลฟิต — กด "เชื่อมต่อกูเกิลฟิต" ก่อน');
      return;
    }
    // อนุญาตให้ดึงข้อมูลได้ถ้าเป็นเจ้าของการเชื่อมต่อ (gfOwned) หรือเป็น user เดียวกับที่ลิงก์ใน backend — เทียบแบบข้อความ
    const isSameUser = gfOwned || (gfLinkedUser && String(gfLinkedUser.userId) === String(user?.User_ID || '').trim());
    if (user && !isSameUser) {
      setGfErrorMessage(`การเชื่อมต่อ Google Fit นี้เชื่อมกับบัญชี "${gfLinkedUser?.userName || 'อื่น'}" — ห้ามใช้ร่วมกัน โปรดถอดการเชื่อมต่อแล้วเชื่อมต่อใหม่`);
      return;
    }
    setFetchingGf(true);
    setGoogleFitSteps(null);
    setGfErrorMessage(null);
    try {
      const steps = await GF.fetchSteps(logDate);
      setGoogleFitSteps(steps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ดึงข้อมูลล้มเหลว';
      setGfErrorMessage(msg);
      if (msg.includes('ไม่ได้') || msg.includes('401') || msg.includes('403') || msg.includes('406')) {
        GF.disconnect();
        setGfVersion((v) => v + 1);
      }
    } finally {
      setFetchingGf(false);
    }
  }

  async function handleAiProcess() {
    if (!imageFile || !imagePreview) return;
    setAiProcessing(true);
    setAiExtractedSteps(null);
    setAiResult(null);
    setAiError(null);
    try {
      const res = await fetch('/api/steps/image-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imagePreview, expectedDate: logDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'AI อ่านภาพล้มเหลว');
      setAiResult(data);
      setAiExtractedSteps(data.steps);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI อ่านภาพล้มเหลว');
    } finally {
      setAiProcessing(false);
    }
  }

  function resetSteps() {
    setGoogleFitSteps(null);
    setAiExtractedSteps(null);
    setAiResult(null);
    setAiError(null);
    setStepInput('');
  }

  const requestSave = () => {
    if (!user) return;
    if (isMode2) { setAiError('คุณอยู่ใน Mode 2 — ไม่สามารถบันทึกเองได้'); return; }
    const steps = logMethod === 'google-fit' ? googleFitSteps : (parseInt(stepInput) || aiExtractedSteps);
    if (!steps || steps <= 0) return;
    if (logMethod === 'image-upload' && !imagePreview) {
      setAiError('ไม่พบรูปภาพ — โปรดเลือกไฟล์รูปก่อนบันทึก');
      return;
    }
    setConfirmSave(true);
  };

  async function handleSave() {
    setConfirmSave(false);
    if (!user) return;
    if (isMode2) { setAiError('คุณอยู่ใน Mode 2 — ไม่สามารถบันทึกเองได้'); return; }
    const steps = logMethod === 'google-fit' ? googleFitSteps : (parseInt(stepInput) || aiExtractedSteps);
    if (!steps || steps <= 0) return;
    setSaving(true);
    setAiError(null);

    let res: { success?: boolean; error?: string } | null = null;

    if (logMethod === 'image-upload') {
      if (!imagePreview) {
        setSaving(false);
        setAiError('ไม่พบรูปภาพ — โปรดเลือกไฟล์รูปก่อนบันทึก');
        return;
      }
      try {
        const uploadRes = await fetch('/api/steps/image-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imagePreview,
            userId: user.User_ID,
            steps,
            dateThai: logDate,
            aiSteps: aiResult?.steps ?? null,
            aiConfidence: aiResult?.confidence ?? null,
            dateInImage: aiResult?.dateInImage ?? null,
            dateMatch: aiResult?.dateMatch ?? null,
            alert: aiResult?.alert ?? false,
            alertReasons: aiResult?.alertReasons ?? [],
          }),
        });
        const data = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !data.success) {
          throw new Error(data.error || 'บันทึกไม่สำเร็จ');
        }
        res = data;
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
        setSaving(false);
        return;
      }
    } else {
      res = await postData('add-step', {
        User_ID: user.User_ID,
        Steps_Count: steps,
        Record_Method: 'Google Fit',
        Date_Thai: logDate,
        Recorded_At: `${logDate}T${formatTime()}:00`,
        Status: 'Approved',
      });
      if (!res?.success) {
        setSaving(false);
        return;
      }
    }

    if (res?.success) {
      const savedWeek = toIsoLocal(getMonday(new Date(logDate)));
      resetSteps();
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setLogDate(new Date().toISOString().split('T')[0]);
      // ให้ประวัติกระโดดไปสัปดาห์ของวันที่เพิ่งบันทึก แล้วดึงข้อมูลใหม่+รีเฟรชหนึ่งครั้ง
      setHistoryWeekDate(savedWeek);
      try { localStorage.setItem('steps_historyWeek', savedWeek); } catch {}
      await loadData();
      await loadDeptUsers();
      setSaving(false);
      setTimeout(() => window.location.reload(), 700);
      return;
    }
    setSaving(false);
  }

  const activeSteps = logMethod === 'google-fit' ? googleFitSteps : (stepInput ? parseInt(stepInput) : aiExtractedSteps);
  const isCurrentDate = logDate === todayStr;
  const isMode2 = String(user?.Step_Record_Mode || '1') === '2';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">ก้าวสร้างสุข</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">บันทึกก้าวประจำวัน — เป้าหมาย 6,000 ก้าว/วัน</p>
        </div>
        <span className="text-gray-500 dark:text-gray-400 text-sm hidden sm:block">
          {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* Section 1: Result Cards (Today / Week / Month) */}
      {/* ═══════════════════════════════════════════ */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">directions_walk</span>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">ผลลัพธ์ก้าวเดิน</h3>
          </div>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700 px-2.5 py-1 rounded-full whitespace-nowrap">
            ใช้ข้อมูลล่าสุดของแต่ละวัน ไม่นับซ้ำ
          </span>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              {(['daily', 'weekly', 'monthly'] as const).map(key => (
                <button key={key} onClick={() => setActiveResultCard(key)}
                  className={`px-3 py-2 rounded-md font-semibold text-sm transition-all ${
                    activeResultCard === key
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}>
                  {resultCards[key].label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button disabled={activeResultCard === 'daily' && dayOffset <= 0}
                onClick={() => {
                  if (activeResultCard === 'daily') setDayOffset(d => Math.min(d + 1, 365));
                  if (activeResultCard === 'weekly') setWeekOffset(w => w + 1);
                  if (activeResultCard === 'monthly') setMonthOffset(m => m + 1);
                }}
                className="w-9 h-9 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title={activeResultCard === 'daily' ? 'ย้อนวันก่อนหน้า' : activeResultCard === 'weekly' ? 'ย้อนสัปดาห์ก่อนหน้า' : 'ย้อนเดือนก่อนหน้า'}>
                <span className="material-symbols-outlined text-lg text-gray-600 dark:text-gray-300">chevron_left</span>
              </button>
            </div>
          </div>
        </div>

        {/* Daily Card */}
        {activeResultCard === 'daily' && (() => {
          const pct = Math.min(Math.round((todaySteps / DAILY_GOAL) * 100), 100);
          return (
            <div className="rounded-2xl p-4 bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 border border-emerald-200 dark:border-emerald-700">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <ProgressRing value={todaySteps} max={DAILY_GOAL} size={110} strokeWidth={10} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center -translate-y-0.5">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">{todaySteps.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-lg font-black text-gray-900 dark:text-white">{dayOffset === 0 ? 'วันนี้' : 'ย้อนหลัง'}</h4>
                    <span className="text-xl">{dailyEnc.emoji}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">เป้าหมาย 6,000 ก้าว — {formatThaiDateShort(viewDate)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="bg-white/70 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border text-center">
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{pct}%</p>
                      <p className="text-[10px] text-gray-400">เสร็จ</p>
                    </div>
                    <div className="bg-white/70 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border text-center">
                      <p className="text-sm font-black text-gray-900 dark:text-white">{Math.max(DAILY_GOAL - todaySteps, 0).toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400">เหลือนับ</p>
                    </div>
                  </div>
                  {dayOffset > 0 && (
                    <button onClick={() => setDayOffset(0)} className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                      ← กลับมาวันนี้
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Weekly Card */}
        {activeResultCard === 'weekly' && (() => {
          const pct = Math.min(Math.round((weeklySteps / WEEKLY_GOAL) * 100), 100);
          return (
            <div className="rounded-2xl p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <ProgressRing value={weeklySteps} max={WEEKLY_GOAL} size={110} strokeWidth={10} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center -translate-y-0.5">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">{weeklySteps.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-lg font-black text-gray-900 dark:text-white">{weekOffset === 0 ? 'สัปดาห์นี้' : 'ย้อนหลัง'}</h4>
                    <span className="text-xl">{weeklyEnc.emoji}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">เป้าหมาย 42,000 ก้าว — {resultCards.weekly.date}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="bg-white/70 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border text-center">
                      <p className="text-sm font-black text-blue-600 dark:text-blue-400">{pct}%</p>
                      <p className="text-[10px] text-gray-400">เสร็จ</p>
                    </div>
                    <div className="bg-white/70 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border text-center">
                      <p className="text-sm font-black text-gray-900 dark:text-white">{Math.max(WEEKLY_GOAL - weeklySteps, 0).toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400">เหลือนับ</p>
                    </div>
                  </div>
                  {weekOffset > 0 && (
                    <button onClick={() => setWeekOffset(0)} className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                      ← กลับมาสัปดาห์นี้
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Monthly Card */}
        {activeResultCard === 'monthly' && (() => {
          const pct = Math.min(Math.round((monthlySteps / monthlyGoal) * 100), 100);
          return (
            <div className="rounded-2xl p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <ProgressRing value={monthlySteps} max={monthlyGoal} size={110} strokeWidth={10} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center -translate-y-0.5">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">{monthlySteps.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-lg font-black text-gray-900 dark:text-white">{monthOffset === 0 ? 'เดือนนี้' : 'ย้อนหลัง'}</h4>
                    <span className="text-xl">{monthlyEnc.emoji}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">เป้าหมาย {monthlyGoal.toLocaleString()} ก้าว — {resultCards.monthly.date}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="bg-white/70 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border text-center">
                      <p className="text-sm font-black text-purple-600 dark:text-purple-400">{pct}%</p>
                      <p className="text-[10px] text-gray-400">เสร็จ</p>
                    </div>
                    <div className="bg-white/70 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border text-center">
                      <p className="text-sm font-black text-gray-900 dark:text-white">{Math.max(monthlyGoal - monthlySteps, 0).toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400">เหลือนับ</p>
                    </div>
                  </div>
                  {monthOffset > 0 && (
                    <button onClick={() => setMonthOffset(0)} className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                      ← กลับมาเดือนนี้
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </GlassCard>

      {/* ═══════════════════════════════════════════ */}
      {/* Section 3: Logging Form + Top 3 */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ══ Logging Form ══ */}
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">edit_note</span>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">บันทึกก้าวเดิน</h3>
          </div>

          {isMode2 && (
            <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl">block</span>
                <div>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300">คุณอยู่ในโหมดเจ้าหน้าที่ นสส. บันทึกให้ (Mode 2)</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">ไม่สามารถบันทึกด้วยตนเองได้ — กรุณาติดต่อเจ้าหน้าที่ นสส. ประจำส่วนราชการของคุณเพื่อให้บันทึกจำนวนก้าวให้ จนกว่าจะเปลี่ยนโหมดเป็น &quot;บันทึกด้วยตนเอง&quot; (Mode 1)</p>
                </div>
              </div>
            </div>
          )}
          {/* Method selector */}
          <div className={`flex gap-3 mb-5 ${isMode2 ? 'opacity-40 pointer-events-none' : ''}`}>
            <button onClick={() => { setLogMethod('google-fit'); resetSteps(); setImageFile(null); setImagePreview(null); }}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                logMethod === 'google-fit'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-300'
              }`}>
              <span className="material-symbols-outlined align-middle mr-1.5 text-lg">sync</span>
              Google Fit
            </button>
            <button onClick={() => { setLogMethod('image-upload'); resetSteps(); setGoogleFitSteps(null); }}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                logMethod === 'image-upload'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-300'
              }`}>
              <span className="material-symbols-outlined align-middle mr-1.5 text-lg">image</span>
              อัปโหลดรูปภาพ
            </button>
          </div>

          <div className="space-y-4">
            {/* Date picker */}
            <div>
              <label className="font-medium text-gray-700 dark:text-gray-300 text-sm block mb-1.5">
                เลือกวันที่ — {getLogDateDisplay(logDate)}
              </label>
              <input type="date" value={logDate} onChange={e => {
                setLogDate(e.target.value); resetSteps(); setImageFile(null); setImagePreview(null);
              }}
                className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm [color-scheme:light] dark:[color-scheme:dark]" />
              {isCurrentDate && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">📍 วันนี้</p>}
            </div>

            {/* Google Fit flow */}
            {logMethod === 'google-fit' && (
              <>
                {!gfConnected && (
                  <button onClick={handleGfConnect} disabled={gfConnecting}
                    className="w-full py-2.5 rounded-xl font-bold text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                    {gfConnecting ? (<>
                      <span className="loading loading-spinner loading-xs"></span>
                      กำลังเชื่อมต่อ...
                    </>) : (
                      <><span className="material-symbols-outlined text-lg">sync</span> 👉️ เชื่อมต่อกูเกิลฟิต</>
                    )}
                  </button>
                )}
                {gfConnected && (
                  gfLinkedUser && String(gfLinkedUser.userId) !== String(user?.User_ID || '').trim() ? (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-red-500 text-xl">block</span>
                          <div>
                            <p className="text-sm font-bold text-red-700 dark:text-red-400">Gmail เชื่อมต่อกับผู้ใช้อื่นแล้ว</p>
                            <p className="text-[10px] text-red-600 dark:text-red-500 mt-0.5 leading-relaxed">โปรดติดต่อเจ้าหน้าที่ นสส.</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={handleGfDisconnect}
                            className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium">
                            ถอดการเชื่อมต่อ
                          </button>
                          <button onClick={() => { GF.disconnect(); setGfVersion(v => v + 1); }}
                            className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                            ล้างข้อมูลเก่าบนเครื่อง
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-500 text-xl">check_circle</span>
                          <div>
                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">เชื่อมต่อสำเร็จ</p>
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{GF.getConnectedEmail() || ''}</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button onClick={handleGfDisconnect}
                            className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium">
                            ถอดการเชื่อมต่อ
                          </button>
                          <button onClick={() => { GF.disconnect(); setGfVersion(v => v + 1); }}
                            className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                            ล้างข้อมูลเก่าบนเครื่อง
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
                <button onClick={fetchGoogleFitSteps} disabled={fetchingGf || !logDate || (gfInherited && String(gfLinkedUser?.userId || '') !== String(user?.User_ID || '').trim())}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {fetchingGf ? (<>
                    <span className="loading loading-spinner loading-xs"></span>
                    กำลังดึงข้อมูล...
                  </>) : (
                    <><span className="material-symbols-outlined text-lg">sync</span> ดึงข้อมูลจากกูเกิลฟิต</>
                  )}
                </button>
                {gfErrorMessage && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400">{gfErrorMessage}</p>
                  </div>
                )}
                {googleFitSteps !== null && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">จำนวนก้าวจาก Google Fit</p>
                        <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{googleFitSteps.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400 mt-1">ไม่สามารถแก้ไขได้</p>
                      </div>
                      <span className="material-symbols-outlined text-emerald-500 text-2xl">verified</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Image Upload flow */}
            {logMethod === 'image-upload' && (
              <>
                <div>
                  <label className="font-medium text-gray-700 dark:text-gray-300 text-sm block mb-1.5">อัปโหลดรูปภาพแคปหน้าจอ Step Counter</label>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={async e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImageFile(file); resetSteps();
                      try {
                        const dataUrl = await compressImage(file);
                        setImagePreview(dataUrl);
                      } catch (err) {
                        setAiError(err instanceof Error ? err.message : 'อ่านรูปไม่สำเร็จ');
                      }
                    }
                  }}
                    className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-emerald-50 dark:file:bg-emerald-900/30 file:text-emerald-700 dark:file:text-emerald-400 file:font-bold file:cursor-pointer hover:file:bg-emerald-100 dark:hover:file:bg-emerald-900/50" />
                </div>
                {imagePreview && (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                    <img src={imagePreview} alt="Preview" className="w-full max-h-56 object-contain bg-gray-100 dark:bg-gray-900" />
                  </div>
                )}
                {imageFile && aiExtractedSteps === null && (
                  <button onClick={handleAiProcess} disabled={aiProcessing}
                    className="w-full py-2.5 rounded-xl font-bold text-sm bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                    {aiProcessing ? <>
                      <span className="loading loading-spinner loading-xs text-purple-500"></span>
                      AI กำลังประมวลผล...
                    </> : <><span className="material-symbols-outlined text-lg">auto_awesome</span> AI อ่านค่าจำนวนก้าวจากภาพ</>}
                  </button>
                )}
                {aiProcessing && (
                  <div className="flex items-center justify-center gap-2 py-4 text-purple-500">
                    <span className="loading loading-spinner loading-md"></span>
                    <span className="text-sm font-medium">กำลังวิเคราะห์ภาพ...</span>
                  </div>
                )}
                {aiError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>
                  </div>
                )}
                {aiResult !== null && (
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">จำนวนก้าวที่ AI อ่านได้</p>
                      <button onClick={() => { setAiExtractedSteps(null); setStepInput(''); setAiResult(null); }} className="text-xs text-red-400 hover:text-red-500 font-medium">ล้างค่า</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-black text-purple-600 dark:text-purple-400 flex-1 text-center">{aiExtractedSteps?.toLocaleString() ?? '—'}</span>
                    </div>

                    {aiResult && (
                      <div className="mt-3 space-y-2 text-xs">
                        {/* วันที่ในภาพ */}
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/60 dark:bg-gray-800/50 border">
                          <span className="material-symbols-outlined text-base text-gray-500">calendar_today</span>
                          <span className="text-gray-600 dark:text-gray-400">วันที่ในภาพ:</span>
                          {aiResult.dateMatch === true ? (
                            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold">
                              <span className="material-symbols-outlined text-sm">check_circle</span>
                              {aiResult.dateInImage ? toThaiDateShort(aiResult.dateInImage) : 'ตรงกัน'}
                            </span>
                          ) : aiResult.dateMatch === false ? (
                            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold">
                              <span className="material-symbols-outlined text-sm">cancel</span>
                              ไม่ตรงกับ {toThaiDateShort(logDate)}
                            </span>
                          ) : (
                            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-bold">
                              <span className="material-symbols-outlined text-sm">help</span>
                              ไม่พบวันที่ในภาพ
                            </span>
                          )}
                        </div>
                        {/* ความมั่นใจ */}
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/60 dark:bg-gray-800/50 border">
                          <span className="material-symbols-outlined text-base text-gray-500">auto_awesome</span>
                          <span className="text-gray-600 dark:text-gray-400">ความมั่นใจ AI:</span>
                          <span className="ml-auto font-bold text-gray-900 dark:text-white">{Math.round(aiResult.confidence * 100)}%</span>
                        </div>
                        {aiResult.notes && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/60 dark:bg-gray-800/50 border">
                            <span className="material-symbols-outlined text-base text-gray-500">notes</span>
                            <span className="text-gray-600 dark:text-gray-400">{aiResult.notes}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ⚠️ โน้ตแจ้งเตือนความผิดปกติ */}
                    {aiResult?.alert && (
                      <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-red-700 dark:text-red-400">
                          <span className="material-symbols-outlined text-lg">warning</span>
                          ตรวจพบความผิดปกติ — จนท.นสส. จะตรวจสอบก่อนยืนยัน
                        </p>
                        <ul className="mt-1.5 ml-5 list-disc text-xs text-red-600 dark:text-red-400 space-y-0.5">
                          {aiResult.alertReasons.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}

                    <p className="text-[10px] text-gray-400 mt-1">สามารถแก้ไขจำนวนก้าวได้</p>
                    <input type="number" value={stepInput || aiExtractedSteps?.toString() || ''} onChange={e => setStepInput(e.target.value)}
                      className="w-full mt-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xl font-bold text-gray-900 dark:text-white text-center" min="0" />
                  </div>
                )}
              </>
            )}

            {/* Save */}
            {activeSteps !== null && activeSteps > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl">
                  <span>วันที่: {getLogDateDisplay(logDate)}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{activeSteps.toLocaleString()} ก้าว</span>
                </div>
                {logMethod === 'image-upload' && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">hourglass</span>
                    ข้อมูลรูปภาพจะรอการตรวจสอบโดย จนท.นสส. (บุคคลต่างฝ่าย) ก่อนนับรวมสถิติ
                  </p>
                )}
                <button onClick={requestSave} disabled={saving}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:shadow-emerald-200/30 dark:hover:shadow-emerald-900/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <>
                    <span className="loading loading-spinner loading-sm text-white"></span>
                    กำลังบันทึก...
                  </> : <>
                    <span className="material-symbols-outlined">save</span>
                    บันทึกก้าวเดิน
                  </>}
                </button>
              </div>
            )}
          </div>
        </GlassCard>

        {/* ══ Top 3 Department Leaderboard ══ */}
        <GlassCard className="p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 text-2xl">emoji_events</span>
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">Top 3 บุคลากรในฝ่าย</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {user?.Department ? user.Department : 'กรุณาเข้าสู่ระบบ'}
              </p>
            </div>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-0.5 rounded-lg">
              {([
                { key: 'weekly' as const, label: 'สัปดาห์' },
                { key: 'monthly' as const, label: 'เดือน' },
              ]).map((p) => (
                <button key={p.key} onClick={() => setDeptPeriod(p.key)}
                  className={`px-2 py-0.5 rounded font-semibold text-xs transition-all ${
                    deptPeriod === p.key ? 'bg-amber-500 text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}>{p.label}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {topThreeFromDept.length > 0 && (
              <>
                {/* Rank 1 */}
                {topThreeFromDept[0] && (
                  <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                    topThreeFromDept[0].isCurrentUser ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                      : 'bg-gradient-to-r from-amber-50/50 to-yellow-50/50 dark:from-amber-900/10 dark:to-yellow-900/10 border-amber-200 dark:border-amber-700'
                  }`}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm shrink-0">1</div>
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0">{topThreeFromDept[0].name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{topThreeFromDept[0].name}{topThreeFromDept[0].isCurrentUser && <span className="text-[10px] text-indigo-500 ml-1">ตัวคุณ</span>}</p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">🏆 เดอะแบก</p>
                    </div>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{topThreeFromDept[0].steps.toLocaleString()}</span>
                  </div>
                )}
                {/* Rank 2 */}
                {topThreeFromDept[1] && (
                  <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                    topThreeFromDept[1].isCurrentUser ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                      : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600'
                  }`}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center text-white font-bold text-sm shrink-0">2</div>
                    <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold text-sm shrink-0">{topThreeFromDept[1].name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{topThreeFromDept[1].name}{topThreeFromDept[1].isCurrentUser && <span className="text-[10px] text-indigo-500 ml-1">ตัวคุณ</span>}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">รองเดอะแบก</p>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{topThreeFromDept[1].steps.toLocaleString()}</span>
                  </div>
                )}
                {/* Rank 3 */}
                {topThreeFromDept[2] && (
                  <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                    topThreeFromDept[2].isCurrentUser ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                      : 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-700/50'
                  }`}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm shrink-0">3</div>
                    <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm shrink-0">{topThreeFromDept[2].name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{topThreeFromDept[2].name}{topThreeFromDept[2].isCurrentUser && <span className="text-[10px] text-indigo-500 ml-1">ตัวคุณ</span>}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">ที่สามเดอะแบก</p>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{topThreeFromDept[2].steps.toLocaleString()}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {deptMembers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-gray-400">
              <span className="material-symbols-outlined text-4xl mb-2">emoji_events</span>
              <p className="text-sm font-medium">ยังไม่มีข้อมูลอันดับ</p>
              <p className="text-[10px]">ยังไม่มีการบันทึกก้าวเดิน</p>
            </div>
          )}

          {deptMembers.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/30 rounded-lg py-1.5">
                {deptMembers.some((m) => m.steps >= (deptPeriod === 'weekly' ? WEEKLY_GOAL : DAILY_GOAL * daysInMonth))
                  ? '🎉 มีเดอะแบกที่ถึงเป้าหมายแล้ว! ลองแซงพวกเขาดูสิ!'
                  : deptMembers.length === 1
                    ? `💪 ${deptMembers[0].name} กำลังนำอยู่! อย่าเพิ่งยอมแพ้!`
                    : `🔥 มีการแข่งขันที่เข้มข้น! ${deptMembers[0].name} นำอยู่ด้วยการ ${deptMembers[0].steps.toLocaleString()} ก้าว`}
              </p>
              {deptMembers.length > 3 && (
                <button onClick={() => setShowAllRanking(true)}
                  className="w-full py-2 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold rounded-lg shadow-sm hover:shadow active:scale-[0.98] transition-all text-xs flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">emoji_events</span>
                  ดูอันดับทั้งหมด ({deptMembers.length} คน)
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              )}
            </div>
          )}
        </GlassCard>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* Section 4.5: Weekly History (Mon-Sun) + Approval Status + Proof Image */}
      {/* ═══════════════════════════════════════════ */}
      <GlassCard className="overflow-hidden">
        <div className="p-5 md:p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-2xl">calendar_view_week</span>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">ประวัติก้าวเดินรายสัปดาห์ (จันทร์ - อาทิตย์)</h3>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">เลือกวันจันทร์ (วันที่เริ่มต้นสัปดาห์) จากปฏิทินเพื่อดูช่วงที่ต้องการ — แสดงจำนวนก้าวที่ได้รับการอนุมัติล่าสุดของแต่ละวัน (ไม่นับซ้ำ)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => {
                const prev = new Date(historyWeekDate);
                prev.setDate(prev.getDate() - 7);
                setHistoryWeekDate(toIsoLocal(prev));
              }} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-all" title="สัปดาห์ก่อนหน้า">
                <span className="material-symbols-outlined text-base text-gray-600 dark:text-gray-300">chevron_left</span>
              </button>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-gray-400 dark:text-gray-500">calendar_month</span>
                <input type="date" value={historyWeekDate}
                  onChange={e => { if (e.target.value) {
                    // เลือกวันที่จากปฏิทิน → snap เป็นวันจันทร์ของสัปดาห์นั้น (เริ่มต้นสัปดาห์)
                    const m = getMonday(new Date(e.target.value));
                    setHistoryWeekDate(toIsoLocal(m));
                  } }}
                  title="เลือกวันจันทร์ (วันที่เริ่มต้นของสัปดาห์)"
                  className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full border border-transparent [color-scheme:light] dark:[color-scheme:dark]" />
              </div>
              <button onClick={() => {
                const next = new Date(historyWeekDate);
                next.setDate(next.getDate() + 7);
                setHistoryWeekDate(toIsoLocal(next));
              }} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-all" title="สัปดาห์ถัดไป">
                <span className="material-symbols-outlined text-base text-gray-600 dark:text-gray-300">chevron_right</span>
              </button>
            </div>
          </div>
          <div className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 py-2 px-3 rounded-xl inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">info</span>
            {formatWeekRangeThai(historyMonday)}
          </div>
          {!historyWeekHasData && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 py-2 px-3 rounded-xl flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">help</span>
              สัปดาห์นี้ยังไม่มีข้อมูลก้าว — เลือกวันที่อื่นด้านบนเพื่อดูประวัติที่บันทึกไว้เดิม
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">วัน</th>
                <th className="px-4 py-3 font-medium">จำนวนก้าว (อนุมัติแล้ว)</th>
                <th className="px-4 py-3 font-medium">นำเข้าข้อมูลแบบ</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(() => {
                const todayLocal = toIsoLocal(new Date());
                const dayList: { ds: string; label: string }[] = [];
                for (let i = 0; i < 7; i++) {
                  const d = new Date(historyMonday);
                  d.setDate(d.getDate() + i);
                  const ds = toIsoLocal(d);
                  const todayFlag = ds === todayLocal;
                  dayList.push({ ds, label: `วัน${['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][d.getDay()]} ${formatThaiDateShort(d)}${todayFlag ? ' (วันนี้)' : ''}` });
                }
                return dayList.map((day, idx) => {
                  const dayLogs = userSteps.filter(s => normalizeDateKey(s.Date_Thai) === day.ds);
                  const approved = latestUserSteps.get(day.ds);
                  const latestAny = latestAnyUserSteps.get(day.ds);
                  const total = approved ? (Number(approved.Steps_Count) || 0) : 0;
                  const hasPending = dayLogs.some(s => s.Status !== 'Approved' && s.Status !== 'Rejected');
                  const hasRejected = dayLogs.some(s => s.Status === 'Rejected');
                  const newerUnapproved = latestAny && latestAny.Status !== 'Approved';
                  // หลักฐานภาพหน้าจอที่ใหม่ที่สุดของวัน (ถ้ามี) — แสดงใต้ข้อความวิธีนำเข้าในคอลัมน์ "นำเข้าข้อมูลแบบ"
                  const proofLog = dayLogs
                    .filter(s => s.Image_Drive_ID && String(s.Image_Drive_ID).trim() !== '')
                    .sort(compareLog)
                    .pop();
                  const statusBadge = !dayLogs.length ? (
                    <span className="text-xs text-gray-300 dark:text-gray-600">ไม่มีการบันทึก</span>
                  ) : approved ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      อนุมัติแล้ว
                    </span>
                  ) : hasRejected && !hasPending ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      ไม่อนุมัติ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      กำลังตรวจสอบ
                    </span>
                  );
                  return (
                    <tr key={idx} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium whitespace-nowrap">
                        {day.label}
                        {dayLogs.length > 1 && (
                          <span className="block text-[10px] text-gray-400 dark:text-gray-500 font-normal mt-0.5">
                            บันทึก {dayLogs.length} ครั้ง — ไม่นับซ้ำ
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {approved || latestAny ? (
                          <span className={`text-lg font-bold ${
                            approved ? 'text-emerald-600 dark:text-emerald-400' :
                            latestAny!.Status === 'Rejected' ? 'text-red-500 dark:text-red-400' :
                            'text-amber-600 dark:text-amber-400'
                          }`}>
                            {(approved ? total : (Number(latestAny!.Steps_Count) || 0)).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300 dark:text-gray-600">—</span>
                        )}
                        {approved && newerUnapproved && latestAny && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-normal mt-0.5">
                            มีรายการใหม่ ({Number(latestAny.Steps_Count).toLocaleString()} ก้าว) รอการอนุมัติ — ยังไม่นับรวม
                          </span>
                        )}
                        {!approved && latestAny && (
                          <span className={`block text-[10px] font-normal mt-0.5 ${latestAny.Status === 'Rejected' ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {latestAny.Status === 'Rejected' ? 'ไม่ได้รับการอนุมัติ — ยังไม่นับรวม' : 'รอการอนุมัติ — ยังไม่นับรวม'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                          <span className="material-symbols-outlined text-base">
                            {approved ? (approved.Record_Method === 'Google Fit' ? 'sync' : 'image') : 'edit_note'}
                          </span>
                          {approved ? (approved.Record_Method === 'Google Fit' ? 'Google Fit' : 'อัปโหลดรูปภาพ') : '—'}
                        </span>
                        {proofLog && (
                          <button
                            onClick={() => setZoomImage({ fileId: String(proofLog.Image_Drive_ID), alt: `หลักฐานภาพ ${day.label}` })}
                            className="mt-2 block rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-gray-600 hover:ring-emerald-400 transition-all"
                            title="คลิกเพื่อขยายภาพหลักฐาน">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img key={proofLog.Image_Drive_ID}
                              src={`/api/steps/image?fileId=${proofLog.Image_Drive_ID}`}
                              alt="หลักฐานภาพหน้าจอ"
                              onError={e => { const t = e.currentTarget; t.onerror = null; t.src = `https://drive.google.com/thumbnail?id=${proofLog.Image_Drive_ID}&sz=w400`; }}
                              className="w-20 h-20 object-cover cursor-zoom-in" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">{statusBadge}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50/60 dark:bg-emerald-900/10 border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">รวมก้าวสะสมในสัปดาห์นี้ <span className="font-normal text-gray-400 dark:text-gray-500">(จันทร์ - อาทิตย์)</span></td>
                <td className="px-4 py-3">
                  {historyWeekTotal > 0 ? (
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{historyWeekTotal.toLocaleString()}</span>
                  ) : (
                    <span className="text-sm text-gray-300 dark:text-gray-600">—</span>
                  )}
                  <span className="block text-[10px] text-gray-400 dark:text-gray-500 font-normal mt-0.5">
                    เป้าหมายสัปดาห์ละ {WEEKLY_GOAL.toLocaleString()} ก้าว ({historyWeekTotal > 0 ? Math.round((historyWeekTotal / WEEKLY_GOAL) * 100) : 0}%)
                  </span>
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </GlassCard>

      {/* ═══════════════════════════════════════════ */}
      {/* Zoom Image Modal */}
      {/* ═══════════════════════════════════════════ */}
      {zoomImage && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setZoomImage(null)} />
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-white/30 dark:border-gray-700/30 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl relative z-10 animate-scale-in">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <p className="font-bold text-gray-900 dark:text-white">{zoomImage.alt}</p>
              <button onClick={() => setZoomImage(null)} aria-label="ปิด"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-3">
              <ProofImage fileId={zoomImage.fileId} alt={zoomImage.alt} onClick={src => window.open(src, '_blank')} />
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => window.open(`https://drive.google.com/file/d/${zoomImage.fileId}/view`, '_blank')}
                className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all text-sm">
                เปิดใน Google Drive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* Full Ranking Popup Modal */}
      {/* ═══════════════════════════════════════════ */}
      {showAllRanking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowAllRanking(false)} />
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-white/30 dark:border-gray-700/30 rounded-[2rem] w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl relative z-10 flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500">emoji_events</span>
                  อันดับบุคลากรในฝ่าย
                </h3>
                <button onClick={() => setShowAllRanking(false)}
                  className="material-symbols-outlined text-gray-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">close</button>
              </div>
              <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                {[
                  { key: 'weekly' as const, label: '📅 สัปดาห์นี้' },
                  { key: 'monthly' as const, label: '📆 เดือนนี้' },
                ].map((p) => (
                  <button key={p.key} onClick={() => setDeptPeriod(p.key)}
                    className={`flex-1 px-3 py-1.5 rounded-md font-semibold text-sm transition-all ${
                      deptPeriod === p.key ? 'bg-amber-500 text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {deptMembers.map((member, idx) => {
                const rank = idx + 1;
                return (
                  <div key={member.userId}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                      member.isCurrentUser
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-100 dark:ring-indigo-800/50'
                        : rank <= 3
                          ? 'bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/20 border border-transparent'
                    }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      rank === 1 ? 'bg-amber-400 text-white shadow-md' :
                      rank === 2 ? 'bg-gray-400 text-white shadow-md' :
                      rank === 3 ? 'bg-orange-400 text-white shadow-md' :
                      'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                    }`}>{rank}</div>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                      rank === 1 ? 'bg-amber-500' : rank === 2 ? 'bg-gray-500' : rank === 3 ? 'bg-orange-500' : 'bg-gray-400 dark:bg-gray-500'
                    }`}>{member.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {member.name}{member.isCurrentUser && <span className="text-[10px] text-indigo-500 ml-1">ตัวคุณ</span>}
                      </p>
                      {rank <= 3 && rank > 1 && <p className="text-[10px] text-gray-400 dark:text-gray-500">{getDeptNickname(rank)}</p>}
                    </div>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{member.steps.toLocaleString()} ก้าว</span>
                  </div>
                );
              })}
              {deptMembers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <span className="material-symbols-outlined text-5xl mb-3">emoji_events</span>
                  <p className="text-lg font-medium">ยังไม่มีข้อมูลอันดับ</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
              <button onClick={() => setShowAllRanking(false)}
                className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">ปิด</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmPopup
        open={confirmSave}
        title="ยืนยันการบันทึกก้าวเดิน"
        message={`คุณกำลังจะบันทึก ${(activeSteps || 0).toLocaleString()} ก้าว สำหรับวันที่ ${logDate}${logMethod === 'image-upload' ? ' (จากรูปภาพ จะตรวจสอบโดย จนท.นสส. ก่อนนับรวม)' : ' (จาก Google Fit)'} แน่ใจหรือไม่?`}
        loading={saving}
        onConfirm={handleSave}
        onClose={() => { if (!saving) setConfirmSave(false); }}
      />
    </div>
  );
}
