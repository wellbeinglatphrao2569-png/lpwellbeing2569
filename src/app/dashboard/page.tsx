'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import GlassCard from '@/components/ui/GlassCard';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { getCurrentWednesdayDate, getThaiNow, toDateKey, thaiMonths as thaiMonthsLong } from '@/utils/thaiDate';
import { useAuth } from '@/hooks/useAuth';
import { fetchData } from '@/services/api';
import type { StepsLog, User, SweetFree } from '@/types';
import { DEPARTMENTS } from '@/utils/personnel';
import {
  periodRangeFor,
  totalsInRange,
  individualRankingOf,
  deptRankingOf,
  programTotals,
  rankBadge,
  formatThaiShort,
  formatRecordedAt,
  isTrue,
  type RankTab,
  type DeptRow,
  type IndRow,
} from '@/utils/stepsRanking';

export default function DashboardPage() {
  const { user, isLoggedIn } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stepsData, setStepsData] = useState<StepsLog[]>([]);
  const [sweetData, setSweetData] = useState<SweetFree[]>([]);

  const [tab, setTab] = useState<RankTab>('weekly');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthFrom, setMonthFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthTo, setMonthTo] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [bagDept, setBagDept] = useState<string>('');
  const [sweetDeptFilter, setSweetDeptFilter] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    fetchData<User[]>('users').then(us => { if (!cancelled && us) setUsers(us); });
    fetchData<StepsLog[]>('steps').then(steps => { if (!cancelled && steps) setStepsData(steps); });
    fetchData<SweetFree[]>('sweet-free').then(sweet => { if (!cancelled && sweet) setSweetData(sweet); });
    return () => { cancelled = true; };
  }, []);

  const period = periodRangeFor(tab, weekOffset, monthFrom, monthTo);
  const activeRange = { startKey: period.startKey, endKey: period.endKey, periodLabel: period.periodLabel };

  // นับเฉพาะก้าวที่อนุมัติแล้วเท่านั้น — ใช้ข้อมูลล่าสุดของแต่ละวัน (ไม่นับซ้ำ)
  const perUserSteps = useMemo(
    () => totalsInRange(stepsData, activeRange.startKey, activeRange.endKey),
    [stepsData, activeRange.startKey, activeRange.endKey]
  );

  const individualRanking = useMemo<IndRow[]>(
    () => individualRankingOf(users, perUserSteps, user?.User_ID),
    [users, perUserSteps, user]
  );

  const deptRanking = useMemo<DeptRow[]>(
    () => deptRankingOf(users, perUserSteps, user?.Department),
    [users, perUserSteps, user]
  );

  const bagRanking = useMemo<IndRow[]>(() => {
    if (!bagDept) return [];
    const filteredUsers = users.filter(u => u.Department === bagDept);
    return individualRankingOf(filteredUsers, perUserSteps, user?.User_ID);
  }, [users, perUserSteps, bagDept, user]);

  const program = useMemo(() => programTotals(stepsData), [stepsData]);

  const userOf = (uid: string): User | undefined => users.find(x => String(x.User_ID) === String(uid));
  const resolveUser = (ref: string): User | undefined =>
    userOf(ref) ||
    users.find(u => u.Full_Name === String(ref).trim()) ||
    users.find(u => `${u.Prefix} ${u.Full_Name}` === String(ref).trim());

  const currentWedKey = getCurrentWednesdayDate();
  const mySweet = useMemo(
    () => sweetData
      .filter(s => String(s.User_ID) === String(user?.User_ID) && toDateKey(s.Wednesday_Date))
      .sort((a, b) => (String(b.Wednesday_Date) < String(a.Wednesday_Date) ? -1 : 1)),
    [sweetData, user]
  );
  const myCurrentRecord = mySweet.find(s => toDateKey(s.Wednesday_Date) === currentWedKey);
  const myCurrentStatus: boolean | null = myCurrentRecord ? isTrue(myCurrentRecord.Status) : null;

  const isOtherSweet = (s: SweetFree) => {
    const st = String((s as any).Status || '').trim().toUpperCase();
    return st === 'OTHER' || st === 'อื่นๆ' || String((s as any).Reason || '').trim() !== '';
  };
  const sweetThisWeek = useMemo(() => sweetData.filter(s => toDateKey(s.Wednesday_Date) === currentWedKey), [sweetData, currentWedKey]);
  const sweetGlobalKept = sweetThisWeek.filter(s => isTrue(s.Status) && !isOtherSweet(s)).length;
  const sweetGlobalFailed = sweetThisWeek.filter(s => !isTrue(s.Status) && !isOtherSweet(s)).length;
  const sweetGlobalOther = sweetThisWeek.filter(s => isOtherSweet(s)).length;
  const sweetDeptKept = useMemo(() => {
    if (!sweetDeptFilter) return null;
    const deptUserIds = new Set(users.filter(u => u.Department === sweetDeptFilter).map(u => String(u.User_ID)));
    const filtered = sweetThisWeek.filter(s => deptUserIds.has(String(s.User_ID)));
    return { kept: filtered.filter(s => isTrue(s.Status) && !isOtherSweet(s)).length, failed: filtered.filter(s => !isTrue(s.Status) && !isOtherSweet(s)).length, other: filtered.filter(s => isOtherSweet(s)).length, total: filtered.length };
  }, [sweetThisWeek, users, sweetDeptFilter]);

  const todayLabel = (() => {
    const thai = getThaiNow();
    const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    return `วัน${days[thai.getUTCDay()]}ที่ ${thai.getUTCDate()} ${thaiMonthsLong[thai.getUTCMonth()]} ${thai.getUTCFullYear() + 543}`;
  })();

  const INDIVIDUAL_LIMIT = 10;
  const shownIndividual = individualRanking.slice(0, INDIVIDUAL_LIMIT);
  const shownDept = deptRanking.slice(0, INDIVIDUAL_LIMIT);
  const shownBag = bagRanking.slice(0, INDIVIDUAL_LIMIT);
  const viewAllHref = `/dashboard/ranking?tab=${tab}&week=${weekOffset}&from=${monthFrom}&to=${monthTo}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">แดชบอร์ด</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ติดตามความสำเร็จของการเดิน — ทุกคนในสำนักงานเขตลาดพร้าวร่วมสร้างสุข</p>
        </div>
        <span className="text-gray-500 dark:text-gray-400 text-sm">{todayLabel}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-6 md:col-span-2 bg-gradient-to-br from-emerald-600 to-teal-600 border-emerald-500 shadow-xl shadow-emerald-200/40 dark:shadow-emerald-950/40">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-emerald-50">
              <span className="material-symbols-outlined text-2xl">directions_walk</span>
              <h3 className="font-bold text-emerald-50 text-lg">จำนวนก้าวรวมทั้งหมดของบุคลากรสำนักงานเขตลาดพร้าว</h3>
            </div>
            <p className="text-5xl md:text-6xl font-black text-white tracking-tight tabular-nums">
              {program.total.toLocaleString()}
            </p>
            <p className="text-emerald-100/90 text-xs">
              ก้าว — เฉพาะรายการที่ผ่านการอนุมัติแล้ว · นับเฉพาะข้อมูลล่าสุดของแต่ละวัน (ไม่นับซ้ำ) · นับตั้งแต่เริ่มโครงการจนถึงปัจจุบัน
            </p>
          </div>
        </GlassCard>
        <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
          <GlassCard className="p-5 flex flex-col justify-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">บุคลากรที่เข้าร่วมนับก้าว</p>
            <p className="text-3xl font-black text-gray-900 dark:text-white mt-1 tabular-nums">{program.participants.toLocaleString()} <span className="text-sm font-medium text-gray-400">คน</span></p>
          </GlassCard>
          <GlassCard className="p-5 flex flex-col justify-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">ส่วนราชการที่เข้าร่วม</p>
            <p className="text-3xl font-black text-gray-900 dark:text-white mt-1 tabular-nums">{deptRanking.length} <span className="text-sm font-medium text-gray-400">ฝ่าย</span></p>
          </GlassCard>
        </div>
      </div>

      <GlassCard className="p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">leaderboard</span>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">การจัดอันดับ</h3>
          </div>
          <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
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
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5 px-1">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-medium border border-emerald-200 dark:border-emerald-800">
            <span className="material-symbols-outlined text-base">date_range</span>
            {activeRange.periodLabel}
          </span>

          {tab === 'weekly' && (
            <div className="flex gap-1">
              <button onClick={() => setWeekOffset(w => w + 1)}
                className="w-9 h-9 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                title="สัปดาห์ก่อนหน้า">
                <span className="material-symbols-outlined text-lg text-gray-600 dark:text-gray-300">chevron_left</span>
              </button>
              <button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}
                className="px-3 h-9 rounded-lg text-xs font-semibold bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-emerald-700 dark:text-emerald-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white">อันดับรายบุคคล</h4>
                <p className="text-xs text-gray-500 mt-0.5">Top 10 · โปรไฟล์ · ชื่อ-สกุล · ตำแหน่ง · ส่วนราชการ</p>
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                {individualRanking.length} คน
              </span>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {shownIndividual.map((r, idx) => {
                const rank = idx + 1;
                const badge = rankBadge(rank);
                return (
                  <div key={r.user.User_ID}
                    className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800/60 ${
                      r.isCurrent ? 'bg-emerald-50/70 dark:bg-emerald-900/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors'
                    }`}>
                    <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center font-black tabular-nums ${badge.badge}`}>
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
              {shownIndividual.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                  <span className="material-symbols-outlined text-3xl">footprint</span>
                  <p className="text-sm">ยังไม่มีข้อมูลก้าวที่อนุมัติในรอบนี้</p>
                </div>
              )}
            </div>
            {individualRanking.length > INDIVIDUAL_LIMIT && (
              <Link href={viewAllHref}
                className="w-full py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border-t border-gray-100 dark:border-gray-800 text-center inline-flex items-center justify-center gap-1.5">
                ดูทั้งหมด
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white">อันดับภาพรวมรายส่วนราชการ</h4>
                <p className="text-xs text-gray-500 mt-0.5">จัดอันดับจากก้าวรวม ÷ จำนวนคนที่เข้าร่วมในฝ่าย</p>
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-bold">
                {deptRanking.length} ฝ่าย
              </span>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {shownDept.map((d, idx) => {
                const rank = idx + 1;
                const badge = rankBadge(rank);
                return (
                  <div key={d.name}
                    className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800/60 ${
                      d.isMine ? 'bg-blue-50/70 dark:bg-blue-900/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors'
                    }`}>
                    <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center font-black tabular-nums ${badge.badge}`}>
                      {badge.emoji || rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{d.name}</p>
                      <p className="text-xs text-gray-500">ผู้เข้าร่วม {d.participants} คน · ก้าวรวม {d.total.toLocaleString()}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-black text-blue-600 dark:text-blue-400 tabular-nums">{d.avg.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400">ก้าว/คน</p>
                    </div>
                  </div>
                );
              })}
              {shownDept.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                  <span className="material-symbols-outlined text-3xl">groups</span>
                  <p className="text-sm">ยังไม่มีข้อมูลฝ่ายที่เข้าร่วมในรอบนี้</p>
                </div>
              )}
            </div>
            {deptRanking.length > INDIVIDUAL_LIMIT && (
              <Link href={viewAllHref}
                className="w-full py-3 text-sm font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-t border-gray-100 dark:border-gray-800 text-center inline-flex items-center justify-center gap-1.5">
                ดูทั้งหมด
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Link>
            )}
          </div>
        </div>

        {/* เดอะแบกตามฝ่าย */}
        <div className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-800 overflow-hidden">
          <div className="px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600">military_tech</span>
                เดอะแบกประจำฝ่าย
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">เลือกฝ่ายเพื่อดู Top 10 ในฝ่ายนั้นตามช่วงเวลาด้านบน</p>
            </div>
            <select value={bagDept} onChange={e => setBagDept(e.target.value)}
              className="px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white min-w-[220px]">
              <option value="">— เลือกส่วนราชการ —</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {!bagDept ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
              <span className="material-symbols-outlined text-3xl">group</span>
              <p className="text-sm">กรุณาเลือกส่วนราชการเพื่อดูอันดับเดอะแบก</p>
            </div>
          ) : (
            <>
              <div className="max-h-[480px] overflow-y-auto">
                {shownBag.map((r, idx) => {
                  const rank = idx + 1;
                  const badge = rankBadge(rank);
                  return (
                    <div key={r.user.User_ID}
                      className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800/60 ${
                        r.isCurrent ? 'bg-amber-50/70 dark:bg-amber-900/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors'
                      }`}>
                      <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center font-black tabular-nums ${badge.badge}`}>
                        {badge.emoji || rank}
                      </div>
                      <ProfileAvatar user={r.user} size="w-10 h-10" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {r.user.Prefix} {r.user.Full_Name}
                          {r.isCurrent && <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold align-middle">คุณ</span>}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{r.user.Position}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-black text-amber-600 dark:text-amber-400 tabular-nums">{r.steps.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400">ก้าว</p>
                      </div>
                    </div>
                  );
                })}
                  {shownBag.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                      <span className="material-symbols-outlined text-3xl">footprint</span>
                      <p className="text-sm">ฝ่ายนี้ยังไม่มีข้อมูลก้าวที่อนุมัติในรอบนี้</p>
                    </div>
                  )}
              </div>
              {bagRanking.length > INDIVIDUAL_LIMIT && (
                <Link href={`${viewAllHref}&bagDept=${encodeURIComponent(bagDept)}`}
                  className="w-full py-3 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors border-t border-amber-100 dark:border-amber-800 text-center inline-flex items-center justify-center gap-1.5">
                  ดูทั้งหมดของฝ่ายนี้
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </Link>
              )}
            </>
          )}
        </div>
      </GlassCard>

      {/* สรุปพุธนี้ไม่มีเชื่อม (สาธารณะ) */}
      <GlassCard className="p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">event_busy</span>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">พุธนี้ไม่มีเชื่อม — สรุปภาพรวม</h3>
              <p className="text-xs text-gray-500 mt-0.5">นับจาก Sweet_Free วันพุธที่ {formatThaiShort(currentWedKey)} · ทั้งสำนักงาน + แยกตามฝ่าย</p>
            </div>
          </div>
          <select value={sweetDeptFilter} onChange={e => setSweetDeptFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
            <option value="">ทุกฝ่าย (รวมทั้งสำนักงาน)</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl p-5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">😎 ถือศีล (งดน้ำหวาน)</p>
            <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">{(sweetDeptKept ? sweetDeptKept.kept : sweetGlobalKept).toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{sweetDeptFilter ? `ฝ่าย ${sweetDeptFilter}` : 'รวมทั้งสำนักงาน'} · พุธนี้</p>
          </div>
          <div className="rounded-2xl p-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">🫠 หลุดศีล (เติมน้ำหวาน)</p>
            <p className="text-4xl font-black text-red-600 dark:text-red-400 mt-2 tabular-nums">{(sweetDeptKept ? sweetDeptKept.failed : sweetGlobalFailed).toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{sweetDeptFilter ? `ฝ่าย ${sweetDeptFilter}` : 'รวมทั้งสำนักงาน'} · พุธนี้</p>
          </div>
          <div className="rounded-2xl p-5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-center">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">รวมบันทึกแล้ว</p>
            <p className="text-4xl font-black text-gray-900 dark:text-white mt-2 tabular-nums">{(sweetDeptKept ? sweetDeptKept.total : sweetGlobalKept + sweetGlobalFailed + sweetGlobalOther).toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">คน · พุธที่ {formatThaiShort(currentWedKey)} {sweetGlobalOther>0 ? `· อื่นๆ ${sweetGlobalOther} คน (ไม่นับ)` : ''}</p>
          </div>
        </div>
        {sweetDeptFilter && sweetDeptKept && (
          <div className="mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
            กำลังดูเฉพาะฝ่าย <strong>{sweetDeptFilter}</strong> — ถือศีล {sweetDeptKept.kept} คน · หลุดศีล {sweetDeptKept.failed} คน {sweetDeptKept.other ? `· อื่นๆ ${sweetDeptKept.other} คน (ไม่นับ)` : ''} · คละกับภาพรวมทั้งสำนักงานด้านบน (ถือศีล {sweetGlobalKept} · หลุดศีล {sweetGlobalFailed} {sweetGlobalOther ? `· อื่นๆ ${sweetGlobalOther}` : ''})
          </div>
        )}
      </GlassCard>

      {/* พุธนี้ไม่มีเชื่อม: สถานะของตนเอง — ต้อง login */}
      {!isLoggedIn ? (
        <GlassCard className="p-8 text-center border-dashed">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-2xl text-emerald-600">lock</span>
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white">ดูสถานะงดหวานของตนเอง</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ต้องลงทะเบียน / เข้าสู่ระบบก่อนจึงจะดู “ก้าวของฉัน” และ “พุธนี้ของฉัน” ได้</p>
          <div className="mt-4 flex gap-2 justify-center">
            <Link href="/login" className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">เข้าสู่ระบบ / ลงทะเบียน</Link>
            <Link href="/dashboard" className="px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold">อยู่หน้าสาธารณะต่อ</Link>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">event_busy</span>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">พุธนี้ไม่มีเชื่อม — สถานะของฉัน</h3>
                <p className="text-xs text-gray-500 mt-0.5">สถานะการงดน้ำหวานประจำสัปดาห์ ผู้ทำการบันทึก และเวลาที่บันทึก</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`rounded-2xl p-5 border ${
              myCurrentStatus === null
                ? 'border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10'
                : myCurrentStatus
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/10'
                  : 'border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10'
            }`}>
              <div className="text-center mb-4">
                <div className={`inline-flex items-center gap-2.5 px-6 py-2.5 rounded-2xl text-2xl md:text-3xl font-black shadow-sm ${
                  myCurrentStatus === null
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : myCurrentStatus
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  <span className="text-3xl md:text-4xl">{myCurrentStatus === null ? '⏳' : myCurrentStatus ? '😎' : '🫠'}</span>
                  {myCurrentStatus === null ? 'ยังไม่บันทึก' : myCurrentStatus ? 'ถือศีล' : 'หลุดศีล'}
                </div>
                <p className="mt-2.5 text-sm font-bold text-gray-600 dark:text-gray-300">
                  วันพุธ ที่ {formatThaiShort(currentWedKey)}
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/70 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                  <span className="material-symbols-outlined text-blue-500 text-xl">person_pin</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">ผู้บันทึก</p>
                    {myCurrentRecord ? (
                      (() => {
                        const recorder = resolveUser(myCurrentRecord.Logged_By);
                        return (
                          <div className="flex items-center gap-2 mt-0.5">
                            <ProfileAvatar user={recorder} size="w-7 h-7" />
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                              {recorder ? `${recorder.Prefix} ${recorder.Full_Name}` : myCurrentRecord.Logged_By || '—'}
                            </p>
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">—</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/70 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                  <span className="material-symbols-outlined text-purple-500 text-xl">schedule</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">บันทึกเมื่อ</p>
                    {myCurrentRecord && formatRecordedAt(myCurrentRecord.Recorded_At) ? (
                      <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{formatRecordedAt(myCurrentRecord.Recorded_At)}</p>
                    ) : myCurrentRecord ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ข้อมูลเก่า (ก่อนเริ่มบันทึกเวลา)</p>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">—</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <h4 className="font-bold text-gray-900 dark:text-white">ประวัติของฉัน (ย้อนหลัง)</h4>
                <p className="text-xs text-gray-500 mt-0.5">สถานะรายสัปดาห์ที่ผ่านมา</p>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {mySweet.map(s => {
                  const st = isTrue(s.Status);
                  const recorder = resolveUser(s.Logged_By);
                  return (
                    <div key={s.Entry_ID || `${s.User_ID}-${toDateKey(s.Wednesday_Date)}`}
                      className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800/60">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                        st ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {st ? '😎 ถือศีล' : '🫠 หลุดศีล'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{formatThaiShort(toDateKey(s.Wednesday_Date))}</p>
                        <p className="text-xs text-gray-500 truncate">
                          บันทึกโดย {recorder ? `${recorder.Prefix} ${recorder.Full_Name}` : s.Logged_By || '—'}
                          {s.Recorded_At ? ` · ${formatRecordedAt(s.Recorded_At)}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {mySweet.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <span className="material-symbols-outlined text-3xl">history</span>
                    <p className="text-sm">ยังไม่มีประวัติการบันทึกพุธนี้ไม่มีเชื่อม</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
