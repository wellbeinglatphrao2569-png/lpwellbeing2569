'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchData } from '@/services/api';
import type { User, StepsLog, SweetFree } from '@/types';
import { toDateKey } from '@/utils/thaiDate';
import { totalsInRange, totalsInRangeCapped, PROJECT_START_DATE, PROJECT_END_DATE, DAILY_CAP, RANKING_CRITERIA_TEXT } from '@/utils/stepsRanking';
import { DEPARTMENTS } from '@/utils/personnel';
import WeeklyReportDocument, { WeeklyComputed } from '@/components/report/WeeklyReportDocument';

// Monday of week containing date
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(12, 0, 0, 0);
  return x;
}
function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shift(d: Date, n: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return toIsoLocal(x);
}
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function isOtherSweet(s: SweetFree) {
  const st = String((s as any).Status || '').trim().toUpperCase();
  const r = String((s as any).Reason || '').trim();
  return st === 'OTHER' || st === 'อื่นๆ' || st.startsWith('OTHER') || r !== '';
}
function isTrue(val: unknown) {
  if (val === true) return true;
  const s = String(val ?? '').trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES';
}

export default function AdminReportPage() {
  const { isAdmin, isLoggedIn } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [steps, setSteps] = useState<StepsLog[]>([]);
  const [sweet, setSweet] = useState<SweetFree[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = สัปดาห์ปัจจุบัน
  const [programStart] = useState(PROJECT_START_DATE);
  const [programEnd] = useState(PROJECT_END_DATE);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [u, s, sw] = await Promise.all([
        fetchData<User[]>('users'),
        fetchData<StepsLog[]>('steps'),
        fetchData<SweetFree[]>('sweet-free'),
      ]);
      if (!cancelled) {
        if (u) setUsers(u);
        if (s) setSteps(s);
        if (sw) setSweet(sw);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const nowMonday = useMemo(() => mondayOf(new Date()), []);
  const targetMonday = useMemo(() => {
    const d = new Date(nowMonday);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [nowMonday, weekOffset]);
  const weekStartKey = useMemo(() => toIsoLocal(targetMonday), [targetMonday]);
  const weekEndKey = useMemo(() => shift(targetMonday, 6), [targetMonday]);
  const wedKey = useMemo(() => shift(targetMonday, 2), [targetMonday]);
  const weekNumber = useMemo(() => getWeekNumber(targetMonday), [targetMonday]);

  const computed: WeeklyComputed | null = useMemo(() => {
    if (!users.length) return null;
    // participant totals = จำนวน Users ที่ไม่ Inactive
    const participantsTotal = users.filter(u => String((u as any).Registration_Status) !== 'Inactive' && String(u.Full_Name || '').trim()).length || users.length;

    // weekly totals: uncapped for totals & individual, capped for dept ranking (6000/วัน)
    const weekMap = totalsInRange(steps, weekStartKey, weekEndKey);
    const weekMapCapped = totalsInRangeCapped(steps, weekStartKey, weekEndKey, DAILY_CAP);
    const cumMap = totalsInRange(steps, programStart, weekEndKey);
    const cumMapCapped = totalsInRangeCapped(steps, programStart, weekEndKey, DAILY_CAP);

    let totalWeek = 0;
    for (const v of weekMap.values()) totalWeek += v;
    let totalWeekCapped = 0;
    for (const v of weekMapCapped.values()) totalWeekCapped += v;

    // helpers to get steps for user (support Personnel_ID fallback)
    function stepsFor(u: User, map: Map<string, number>): number {
      const uid = String((u as any).User_ID || '').trim();
      if (uid && map.has(uid)) return map.get(uid)!;
      const pid = String((u as any).Personnel_ID || '').trim();
      if (pid && map.has(pid)) return map.get(pid)!;
      return 0;
    }

    // dept week — capped avg หารด้วยคนทั้งหมดในฝ่าย (รวม Pending, ไม่นับ Inactive) + เก็บ actual วงเล็บ
    function buildDeptCapped(cappedMap: Map<string, number>, actualMap: Map<string, number>) {
      // นับคนทั้งหมดต่อฝ่าย
      const allCounts = new Map<string, number>();
      for (const u of users) {
        const dept = String(u.Department || '').trim();
        if (!dept) continue;
        const st = String((u as any).Registration_Status || '').trim();
        if (st === 'Inactive') continue;
        const hasName = String((u as any).Full_Name || '').trim() !== '' || String((u as any).User_ID || '').trim() !== '' || String((u as any).Personnel_ID || '').trim() !== '';
        if (!hasName) continue;
        allCounts.set(dept, (allCounts.get(dept) || 0) + 1);
      }
      const sumCapped = new Map<string, number>();
      const sumActual = new Map<string, number>();
      const active = new Map<string, number>();
      for (const u of users) {
        const dept = String(u.Department || '').trim();
        if (!dept) continue;
        const c = stepsFor(u, cappedMap);
        const a = stepsFor(u, actualMap);
        if (c > 0 || a > 0) active.set(dept, (active.get(dept) || 0) + 1);
        if (c > 0) sumCapped.set(dept, (sumCapped.get(dept) || 0) + c);
        if (a > 0) sumActual.set(dept, (sumActual.get(dept) || 0) + a);
      }
      const rows: { name: string; steps: number; stepsActual: number; participants: number; active: number; avg: number; avgActual: number }[] = [];
      for (const [name, totalMembers] of allCounts) {
        const tc = sumCapped.get(name) || 0;
        const ta = sumActual.get(name) || 0;
        const act = active.get(name) || 0;
        rows.push({
          name,
          steps: tc,
          stepsActual: ta,
          participants: totalMembers,
          active: act,
          avg: totalMembers ? Math.round(tc / totalMembers) : 0,
          avgActual: totalMembers ? Math.round(ta / totalMembers) : 0,
        });
      }
      for (const [name, tc] of sumCapped) {
        if (!allCounts.has(name)) {
          const ta = sumActual.get(name) || 0;
          rows.push({ name, steps: tc, stepsActual: ta, participants: active.get(name) || 0, active: active.get(name) || 0, avg: tc, avgActual: ta });
        }
      }
      return rows.sort((a, b) => b.avg - a.avg || b.steps - a.steps);
    }

    const deptWeek = buildDeptCapped(weekMapCapped, weekMap);
    const deptCumulative = buildDeptCapped(cumMapCapped, cumMap);

    // top 5 week
    const allWeekRows = users.map(u => ({ user: u, steps: stepsFor(u, weekMap) })).filter(r => r.steps > 0).sort((a, b) => b.steps - a.steps);
    const top5Week = allWeekRows.slice(0, 5);

    // top3 by dept week (dept order = deptWeek order, else DEPARTMENTS)
    const deptOrder = deptWeek.length ? deptWeek.map(d => d.name) : DEPARTMENTS;
    const top3ByDeptWeek = deptOrder.map(dept => {
      const rows = users.filter(u => u.Department === dept).map(u => ({ user: u, steps: stepsFor(u, weekMap) })).filter(r => r.steps > 0).sort((a, b) => b.steps - a.steps).slice(0, 3);
      return { dept, rows };
    });

    // top10 cumulative
    const allCumRows = users.map(u => ({ user: u, steps: stepsFor(u, cumMap), weekSteps: stepsFor(u, weekMap) })).filter(r => r.steps > 0).sort((a, b) => b.steps - a.steps);
    const top10Cumulative = allCumRows.slice(0, 10);

    // sweet week
    const wedSweet = sweet.filter(s => toDateKey(s.Wednesday_Date) === wedKey);
    let kept = 0, failed = 0, other = 0;
    for (const s of wedSweet) {
      if (isOtherSweet(s)) other++;
      else if (isTrue(s.Status)) kept++;
      else failed++;
    }
    const sweetWeekOverall = { kept, failed, other, total: kept + failed + other };

    // sweet by dept week
    const deptIds = new Map<string, Set<string>>();
    for (const u of users) {
      if (!u.Department) continue;
      if (!deptIds.has(u.Department)) deptIds.set(u.Department, new Set());
      const sid = deptIds.get(u.Department)!;
      if (String((u as any).User_ID || '').trim()) sid.add(String((u as any).User_ID).trim());
      if (String((u as any).Personnel_ID || '').trim()) sid.add(String((u as any).Personnel_ID).trim());
      // also map Full_Name fallback not needed for sweet (User_ID linked)
    }
    const sweetWeekByDept = [...deptIds.entries()].map(([dept, ids]) => {
      const rows = wedSweet.filter(s => ids.has(String(s.User_ID).trim()));
      let k = 0, f = 0, o = 0;
      for (const r of rows) {
        if (isOtherSweet(r)) o++;
        else if (isTrue(r.Status)) k++;
        else f++;
      }
      return { dept, kept: k, failed: f, other: o, total: k + f + o, rate: (k + f + o) ? (k / (k + f + o)) * 100 : 0 };
    }).filter(d => d.total > 0).sort((a, b) => b.kept - a.kept);
    // include depts with 0? keep only >0 to reduce noise

    // sweet cumulative overall (from first Wednesday after programStart to wedKey)
    // find all sweet with date in [programStart, wedKey] and is Wednesday
    const cumSweet = sweet.filter(s => {
      const k = toDateKey(s.Wednesday_Date);
      return k && k >= programStart && k <= wedKey;
    });
    let ck = 0, cf = 0, co = 0;
    for (const s of cumSweet) {
      if (isOtherSweet(s)) co++;
      else if (isTrue(s.Status)) ck++;
      else cf++;
    }
    const sweetCumulativeOverall = { kept: ck, failed: cf, other: co, total: ck + cf + co };
    // by week timeline
    const byWed = new Map<string, { kept: number; failed: number; other: number }>();
    for (const s of cumSweet) {
      const k = toDateKey(s.Wednesday_Date);
      if (!byWed.has(k)) byWed.set(k, { kept: 0, failed: 0, other: 0 });
      const cur = byWed.get(k)!;
      if (isOtherSweet(s)) cur.other++;
      else if (isTrue(s.Status)) cur.kept++;
      else cur.failed++;
    }
    const sweetCumulativeByWeek = [...byWed.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([wedKey2, v]) => ({ wedKey: wedKey2, ...v }));

    return {
      weekLabel: `${weekStartKey} - ${weekEndKey}`,
      weekStartKey,
      weekEndKey,
      wednesdayKey: wedKey,
      weekNumber,
      totalStepsWeek: totalWeek,
      totalStepsWeekCapped: totalWeekCapped,
      participantsWeek: weekMap.size,
      participantsTotal,
      deptWeek,
      deptCumulative,
      top5Week,
      top3ByDeptWeek,
      top10Cumulative,
      sweetWeekOverall,
      sweetWeekByDept,
      sweetCumulativeOverall,
      sweetCumulativeByWeek,
      rankingCriteria: RANKING_CRITERIA_TEXT,
    };
  }, [users, steps, sweet, weekStartKey, weekEndKey, wedKey, weekNumber, programStart]);

  const handlePrint = () => window.print();

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-gray-500">เฉพาะเจ้าหน้าที่ นสส. (Admin) เท่านั้นที่เข้าถึงรายงานนี้ได้</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* controls - no-print */}
      <div className="no-print bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 md:p-5 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">description</span>
              รายงานผลรายสัปดาห์ (A4)
            </h1>
            <p className="text-xs text-gray-500 mt-1">สัปดาห์ จันทร์-อาทิตย์ · เฉพาะ นสส. ดาวน์โหลด/พิมพ์ได้ · โลโก้ลาดพร้าวสร้างสุขฝังในเอกสาร</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow">
              <span className="material-symbols-outlined text-lg">print</span> พิมพ์ / บันทึก PDF
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setWeekOffset(v => v + 1)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm flex items-center gap-1">
            <span className="material-symbols-outlined text-base">chevron_left</span> สัปดาห์ก่อน
          </button>
          <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            สัปดาห์ที่ {weekNumber} &nbsp;|&nbsp; {weekStartKey} - {weekEndKey} &nbsp;(พุธ {wedKey})
          </div>
          <button onClick={() => setWeekOffset(v => Math.min(0, v - 1))} disabled={weekOffset >= 0} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
            สัปดาห์ถัดไป <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
          <button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 disabled:opacity-40">กลับสัปดาห์นี้</button>
          <span className="text-xs text-gray-400 ml-2">{loading ? 'กำลังโหลด...' : computed ? `ก้าวรวม ${computed.totalStepsWeek.toLocaleString()} | ผู้ส่ง ${computed.participantsWeek} คน` : ''}</span>
        </div>
      </div>

      {/* report preview */}
      <div className="overflow-auto">
        <WeeklyReportDocument computed={computed} weekNumber={weekNumber} programStart={programStart} programEnd={programEnd} />
      </div>
    </div>
  );
}
