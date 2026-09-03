'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import GlassCard from '@/components/ui/GlassCard';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { useAuth } from '@/hooks/useAuth';
import { fetchData } from '@/services/api';
import type { StepsLog, User } from '@/types';
import { DEPARTMENTS } from '@/utils/personnel';
import {
  periodRangeFor,
  totalsInRange,
  totalsInRangeCapped,
  individualRankingOf,
  deptRankingCapped,
  rankBadge,
  projectWeeks,
  DAILY_CAP,
  RANKING_CRITERIA_TEXT,
  type RankTab,
  type IndRow,
  type DeptCappedRow,
} from '@/utils/stepsRanking';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function RankingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [stepsData, setStepsData] = useState<StepsLog[]>([]);
  const [tab, setTab] = useState<RankTab>(() => (searchParams.get('tab') as RankTab) || 'weekly');
  const [weekOffset, setWeekOffset] = useState(() => parseInt(searchParams.get('week') || '0', 10) || 0);
  const weeks = useMemo(() => projectWeeks(), []);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => searchParams.get('weekStart') || '');
  const [monthFrom, setMonthFrom] = useState(() => searchParams.get('from') || currentMonth());
  const [monthTo, setMonthTo] = useState(() => searchParams.get('to') || currentMonth());
  const [search, setSearch] = useState('');
  const [wantScrollMe, setWantScrollMe] = useState(0);
  const [bagDept, setBagDept] = useState(() => searchParams.get('bagDept') || '');

  // เก็บค่าช่วงเวลาลง URL เพื่อแชร์/ย้อนกลับได้
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('tab', tab);
    params.set('week', String(weekOffset));
    if (selectedWeekStart) params.set('weekStart', selectedWeekStart);
    params.set('from', monthFrom);
    params.set('to', monthTo);
    if (bagDept) params.set('bagDept', bagDept);
    const qs = params.toString();
    if (String(searchParams) !== qs) router.replace(`/dashboard/ranking?${qs}`, { scroll: false });
  }, [tab, weekOffset, selectedWeekStart, monthFrom, monthTo, bagDept, router, searchParams]);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    fetchData<User[]>('users').then(us => { if (!cancelled && !ac.signal.aborted && us) setUsers(us); });
    fetchData<StepsLog[]>('steps').then(steps => { if (!cancelled && !ac.signal.aborted && steps) setStepsData(steps); });
    return () => { cancelled = true; ac.abort(); };
  }, []);

  // ── ช่วงเวลา ── (weekly ใช้ selectedWeekStart จาก dropdown ไม่ทับ monthly/project)
  const period = periodRangeFor(tab, weekOffset, monthFrom, monthTo, tab === 'weekly' && selectedWeekStart ? selectedWeekStart : undefined);
  const activeRange = { startKey: period.startKey, endKey: period.endKey, periodLabel: period.periodLabel };
  // ถ้ายังไม่ได้เลือกสัปดาห์และอยู่ tab weekly ให้ default เป็นสัปดาห์ปัจจุบันในโครงการ
  useEffect(() => {
    if (tab === 'weekly' && !selectedWeekStart && weeks.length > 0) {
      const wk = period.weekStartKey;
      if (weeks.some(w => w.startKey === wk)) setSelectedWeekStart(wk); // eslint-disable-line react-hooks/set-state-in-effect
      else setSelectedWeekStart(weeks[weeks.length - 1].startKey); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [tab, selectedWeekStart, weeks, period.weekStartKey]);

  // Strict Isolation (Choice A): Tab สลับ → reset loading + tabId
  const [indLoading, setIndLoading] = useState(false);
  const tabSeqRef = useRef(0);
  useEffect(() => {
    tabSeqRef.current += 1;
    const myId = tabSeqRef.current;
    setIndLoading(true);
    const t = setTimeout(() => { if (tabSeqRef.current === myId) setIndLoading(false); }, 60);
    return () => clearTimeout(t);
  }, [tab, activeRange.startKey, activeRange.endKey]);

  // ── อันดับ ── รายบุคคล uncapped / ส่วนราชการ capped 6000/วัน (ตามสเปคใหม่) — clean replace ไม่ concat
  const perUserStepsActual = useMemo(
    () => totalsInRange(stepsData, activeRange.startKey, activeRange.endKey),
    [stepsData, activeRange.startKey, activeRange.endKey]
  );
  const perUserStepsCapped = useMemo(
    () => totalsInRangeCapped(stepsData, activeRange.startKey, activeRange.endKey, DAILY_CAP),
    [stepsData, activeRange.startKey, activeRange.endKey]
  );
  const allRows = useMemo<IndRow[]>(
    () => individualRankingOf(users, perUserStepsActual, user?.User_ID),
    [users, perUserStepsActual, user]
  );
  const deptRows = useMemo<DeptCappedRow[]>(
    () => deptRankingCapped(users, perUserStepsCapped, perUserStepsActual, user?.Department),
    [users, perUserStepsCapped, perUserStepsActual, user]
  );

  const myRow = allRows.find(r => r.isCurrent);
  const myRankNum = myRow ? allRows.indexOf(myRow) + 1 : null;
  const bagRows = useMemo<IndRow[]>(() => {
    if (!bagDept) return [];
    const filteredUsers = users.filter(u => u.Department === bagDept);
    return individualRankingOf(filteredUsers, perUserStepsActual, user?.User_ID);
  }, [users, perUserStepsActual, bagDept, user]);

  // ── ค้นหา ──
  const q = search.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    if (!q) return allRows;
    return allRows.filter(r => {
      const hay = [
        r.user.Prefix || '',
        r.user.Full_Name || '',
        r.user.First_Name || '',
        r.user.Last_Name || '',
        r.user.Position || '',
        r.user.Department || '',
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, q]);

  // เลื่อนไปหาบรรทัดของตนเองเมื่อกด "ค้นหาตำแหน่งของฉัน"
  useEffect(() => {
    if (!wantScrollMe) return;
    const t = setTimeout(() => {
      document.getElementById('my-rank-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => clearTimeout(t);
  }, [wantScrollMe]);

  const findMe = () => {
    if (!user) return;
    const meName = [user.Prefix, user.Full_Name, user.First_Name, user.Last_Name].filter(Boolean).join(' ');
    setSearch(meName);
    setWantScrollMe(n => n + 1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* เกณฑ์ */}
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15 px-4 py-3 flex gap-2.5 items-start">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl shrink-0 mt-0.5">info</span>
        <p className="text-xs md:text-sm leading-relaxed text-amber-900 dark:text-amber-300">{RANKING_CRITERIA_TEXT}</p>
      </div>
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline mb-2">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            กลับไปแดชบอร์ด
          </Link>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">การจัดอันดับทั้งหมด</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ค้นหาตำแหน่งของตนเอง หรือดูอันดับรายบุคคล/รายส่วนราชการฉบับเต็ม · รายบุคคล/เดอะแบก = ก้าวจริง 100% · ส่วนราชการ = capped {DAILY_CAP.toLocaleString()}/วัน</p>
        </div>
      </div>

      {/* สรุปอันดับของฉัน — ซ่อนเมื่อไม่ login */}
      {!isLoggedIn ? (
        <GlassCard className="p-5 border-dashed text-center">
          <p className="font-bold text-gray-900 dark:text-white">เข้าสู่ระบบเพื่อดูอันดับของตนเอง</p>
          <p className="text-sm text-gray-500 mt-1">ส่วนนี้จะแสดงอันดับส่วนตัวของคุณเมื่อลงทะเบียน/เข้าสู่ระบบแล้ว</p>
          <Link href="/login" className="inline-flex mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">เข้าสู่ระบบ / ลงทะเบียน</Link>
        </GlassCard>
      ) : (
        <GlassCard className={`p-5 ${myRow ? 'bg-gradient-to-br from-emerald-600 to-teal-600 border-emerald-500 shadow-xl shadow-emerald-200/40 dark:shadow-emerald-950/40' : 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/10'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={`flex items-start gap-3 min-w-0 ${myRow ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
              <span className={`material-symbols-outlined text-2xl mt-0.5 ${myRow ? 'text-emerald-100' : 'text-amber-500 dark:text-amber-400'}`}>
                {myRow ? 'emoji_events' : 'priority_high'}
              </span>
              <div className="min-w-0">
                {myRow ? (
                  <>
                    <p className="text-xl md:text-2xl font-black tabular-nums">
                      คุณอยู่อันดับที่ {myRankNum} <span className="text-sm md:text-base font-bold opacity-90">จาก {allRows.length} คน</span>
                    </p>
                    <p className={`text-xs mt-1 ${myRow ? 'text-emerald-100/90' : 'text-gray-500 dark:text-gray-400'}`}>
                      ในช่วง {activeRange.periodLabel} · ก้าวรวมของคุณ {myRow.steps.toLocaleString()} ก้าว
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xl md:text-2xl font-black">คุณยังไม่มีก้าวที่อนุมัติในรอบนี้</p>
                    <p className={`text-xs mt-1 ${myRow ? 'text-emerald-100/90' : 'text-gray-500 dark:text-gray-400'}`}>
                      ในช่วง {activeRange.periodLabel} — บันทึกก้าวและรอการอนุมัติเพื่อเข้าสู่อันดับ
                    </p>
                  </>
                )}
              </div>
            </div>
            {user && (
              <button onClick={findMe}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  myRow
                    ? 'bg-white/20 hover:bg-white/30 text-white backdrop-blur'
                    : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-gray-700'
                }`}>
                <span className="material-symbols-outlined text-lg">my_location</span>
                ค้นหาตำแหน่งของฉัน
              </button>
            )}
          </div>
        </GlassCard>
      )}

      {/* ── ตัวกรองช่วง + ค้นหา ── */}
      <GlassCard className="p-5 md:p-6">
        {/* Tabs */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg self-start">
            {([['weekly', 'รายสัปดาห์'], ['monthly', 'รายเดือน'], ['project', 'ตลอดโครงการ']] as [RankTab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-3 py-2 rounded-md font-semibold text-sm transition-all ${
                  tab === key
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-medium border border-emerald-200 dark:border-emerald-800 self-start">
            <span className="material-symbols-outlined text-base">date_range</span>
            {activeRange.periodLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          {tab === 'weekly' && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={selectedWeekStart || period.weekStartKey} onChange={e => { setSelectedWeekStart(e.target.value); setWeekOffset(0); }}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white min-w-[260px]">
                {weeks.map(w => <option key={w.startKey} value={w.startKey}>{w.label} (จ–อา)</option>)}
              </select>
              <button
                onClick={() => {
                  const cur = selectedWeekStart || period.weekStartKey;
                  const idx = weeks.findIndex(w => w.startKey === cur);
                  if (idx > 0) setSelectedWeekStart(weeks[idx - 1].startKey);
                }}
                disabled={(weeks.findIndex(w => w.startKey === (selectedWeekStart || period.weekStartKey)) <= 0)}
                className="w-9 h-9 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="สัปดาห์ก่อนหน้า">
                <span className="material-symbols-outlined text-lg text-gray-600 dark:text-gray-300">chevron_left</span>
              </button>
              <button
                onClick={() => {
                  const cur = selectedWeekStart || period.weekStartKey;
                  const idx = weeks.findIndex(w => w.startKey === cur);
                  if (idx >= 0 && idx < weeks.length - 1) setSelectedWeekStart(weeks[idx + 1].startKey);
                }}
                disabled={(weeks.findIndex(w => w.startKey === (selectedWeekStart || period.weekStartKey)) >= weeks.length - 1)}
                className="w-9 h-9 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="สัปดาห์ถัดไป">
                <span className="material-symbols-outlined text-lg text-gray-600 dark:text-gray-300">chevron_right</span>
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const day = today.getDay();
                  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                  const m = new Date(today);
                  m.setDate(diff);
                  m.setHours(0, 0, 0, 0);
                  const y = m.getFullYear();
                  const mo = String(m.getMonth() + 1).padStart(2, '0');
                  const da = String(m.getDate()).padStart(2, '0');
                  const todayKey = `${y}-${mo}-${da}`;
                  const ws = weeks;
                  const found = ws.find(w => todayKey >= w.startKey && todayKey <= w.endKey);
                  if (found) setSelectedWeekStart(found.startKey);
                  else if (ws.length) setSelectedWeekStart(todayKey < ws[0].startKey ? ws[0].startKey : ws[ws.length - 1].startKey);
                  setWeekOffset(0);
                }}
                className="px-3 h-9 rounded-lg text-xs font-semibold bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-emerald-700 dark:text-emerald-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                สัปดาห์นี้
              </button>
            </div>
          )}

          {tab === 'monthly' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                ตั้งแต่
                <input type="month" value={monthFrom}
                  onChange={e => setMonthFrom(e.target.value)}
                  className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]" />
              </label>
              <label className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                ถึง
                <input type="month" value={monthTo}
                  onChange={e => setMonthTo(e.target.value)}
                  className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]" />
              </label>
            </div>
          )}

          {/* ช่องค้นหา */}
          <div className="relative min-w-[240px] flex-1 md:max-w-md">
            <span className="material-symbols-outlined text-lg text-gray-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
            <input type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / ตำแหน่ง / ส่วนราชการ..."
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            {search && (
              <button onClick={() => { setSearch(''); setWantScrollMe(0); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-xs flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── รายการอันดับรายบุคคล (เต็ม) — Card-Level Isolated (Choice A) */}
        <div key={`individual-full-${tab}-${activeRange.startKey}-${activeRange.endKey}`} className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
          <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white">อันดับรายบุคคล ทุกคน</h4>
              <p className="text-xs text-gray-500 mt-0.5">เรียงลำดับตามก้าวรวมที่อนุมัติ · แถวของคุณไฮไลต์เขียวพร้อมป้าย “คุณ” {indLoading ? '· กำลังรีเฟรช...' : ''}</p>
            </div>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
              {indLoading ? '...' : (q ? `${visibleRows.length} / ${allRows.length} คน` : `${allRows.length} คน`)}
            </span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {indLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3"><span className="loading loading-spinner loading-md text-emerald-600"></span><p className="text-sm">กำลังโหลดอันดับใหม่...</p></div>
            ) : visibleRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <span className="material-symbols-outlined text-4xl">{q ? 'search_off' : 'footprint'}</span>
                <p className="text-sm">{q ? `ไม่พบผู้ที่ตรงกับ “${search.trim()}” ในรอบนี้` : 'ยังไม่มีข้อมูลก้าวที่อนุมัติในรอบนี้'}</p>
                {q && (
                  <button onClick={() => setSearch('')}
                    className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                    ล้างการค้นหา
                  </button>
                )}
              </div>
            ) : visibleRows.map((r, idx) => {
              const rank = idx + 1;
              const badge = rankBadge(rank);
              const inTop3 = rank <= 3;
              return (
                <div key={r.user.User_ID} id={r.isCurrent ? 'my-rank-row' : undefined}
                  className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800/60 ${
                    r.isCurrent
                      ? 'bg-emerald-50/80 dark:bg-emerald-900/25 ring-1 ring-inset ring-emerald-300 dark:ring-emerald-700'
                      : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors'
                  }`}>
                  <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center font-black tabular-nums ${badge.badge} ${inTop3 ? 'text-base' : 'text-sm'}`}>
                    {badge.emoji || rank}
                  </div>
                  <ProfileAvatar user={r.user} size="w-10 h-10" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {r.user.Prefix} {r.user.Full_Name}
                      {r.isCurrent && <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold align-middle">คุณ</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{r.user.Position}{r.user.Department ? ` · ${r.user.Department}` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{r.steps.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">ก้าว</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── อันดับรายส่วนราชการ (เต็ม) — capped */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
          <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
            <h4 className="font-bold text-gray-900 dark:text-white">อันดับภาพรวมรายส่วนราชการ</h4>
            <p className="text-xs text-gray-500 mt-0.5">ค่าเฉลี่ยแบบ capped {DAILY_CAP.toLocaleString()} ก้าว/คน/วัน · หารด้วยจำนวนคนทั้งหมดในฝ่าย (รวม Pending)</p>
          </div>
          <div className="overflow-x-auto">
            {deptRows.map((d, idx) => {
              const rank = idx + 1;
              const badge = rankBadge(rank);
              const safeAvg = Number.isFinite(d.avg) ? d.avg : 0;
              return (
                <div key={d.name}
                  className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800/60 ${
                    d.isMine ? 'bg-blue-50/70 dark:bg-blue-900/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors'
                  }`}>
                  <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center font-black tabular-nums">
                    {badge.emoji ? <span className="text-lg">{badge.emoji}</span> : <span className={badge.badge}>{rank}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{d.name}</p>
                    <p className="text-xs text-gray-500">ทั้งหมด {d.participants} คน · ส่งแล้ว {d.activeParticipants} คน · ก้าวรวม capped {d.totalCapped.toLocaleString()} <span className="text-gray-400">(จริง {d.totalActual.toLocaleString()})</span></p>
                  </div>
                  <div className="shrink-0 text-right" title={`จริงเฉลี่ย ${d.avgActual.toLocaleString()}`}>
                    <p className="font-black text-blue-600 dark:text-blue-400 tabular-nums">{safeAvg.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">ก้าว/คน (capped)</p>
                  </div>
                </div>
              );
            })}
            {deptRows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                <span className="material-symbols-outlined text-3xl">groups</span>
                <p className="text-sm">ยังไม่มีข้อมูลฝ่ายที่เข้าร่วมในรอบนี้</p>
              </div>
            )}
          </div>
        </div>

        {/* เดอะแบกตามฝ่าย */}
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 overflow-hidden">
          <div className="px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><span className="material-symbols-outlined text-amber-600">military_tech</span>เดอะแบกประจำฝ่าย</h4>
              <p className="text-xs text-gray-500 mt-0.5">เลือกฝ่ายเพื่อดูอันดับ Top ในฝ่ายตามช่วงเวลาเดียวกัน</p>
            </div>
            <select value={bagDept} onChange={e => setBagDept(e.target.value)}
              className="px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm min-w-[220px]">
              <option value="">— เลือกส่วนราชการ —</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {!bagDept ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
              <span className="material-symbols-outlined text-3xl">group</span>
              <p className="text-sm">กรุณาเลือกฝ่ายเพื่อดูอันดับเดอะแบก</p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              {bagRows.map((r, idx) => {
                const rank = idx + 1;
                const badge = rankBadge(rank);
                return (
                  <div key={r.user.User_ID}
                    className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800/60 ${r.isCurrent ? 'bg-amber-50/70 dark:bg-amber-900/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors'}`}>
                    <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center font-black tabular-nums ${badge.badge}`}>{badge.emoji || rank}</div>
                    <ProfileAvatar user={r.user} size="w-10 h-10" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{r.user.Prefix} {r.user.Full_Name}{r.isCurrent && <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold align-middle">คุณ</span>}</p>
                      <p className="text-xs text-gray-500 truncate">{r.user.Position}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-black text-amber-600 dark:text-amber-400 tabular-nums">{r.steps.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400">ก้าว</p>
                    </div>
                  </div>
                );
              })}
              {bagRows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                  <span className="material-symbols-outlined text-3xl">footprint</span>
                  <p className="text-sm">ฝ่ายนี้ยังไม่มีข้อมูลก้าวที่อนุมัติในรอบนี้</p>
                </div>
              )}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}