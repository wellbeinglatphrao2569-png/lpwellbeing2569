'use client';
import { useEffect, useState } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import { useAuth } from '@/hooks/useAuth';
import { fetchData, postData, postDataJson } from '@/services/api';
import type { WeightComparisonItem } from '@/types';

interface OwnBaseline {
  Record_ID?: string; Weight_kg: number | string; Height_cm: number | string;
  BMI_Value: number | string; Recorded_At?: string;
}
interface OwnRecord {
  Record_ID: string; User_ID: string; Weight_kg: number | string; Height_cm: number | string;
  BMI_Value: number | string; Recorded_At?: string;
}
interface OwnWeightPayload {
  records: OwnRecord[];
  baseline: OwnBaseline | null;
  height?: number | string;
  currentWeight?: number | string;
  currentBmi?: number | string;
  open: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const fmt = (v: unknown, d = 1): string =>
  Number.isFinite(num(v)) ? num(v).toFixed(d) : '-';

const fmtDate = (iso?: string): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`;
};

function bmiCategory(b: number) {
  if (b < 18.5) return { label: 'ผอม', color: 'bg-sky-500' };
  if (b < 23) return { label: 'ปกติ', color: 'bg-emerald-500' };
  if (b < 25) return { label: 'ท้วม', color: 'bg-yellow-500' };
  if (b < 30) return { label: 'อ้วนระดับ 1', color: 'bg-orange-500' };
  return { label: 'อ้วนระดับ 2', color: 'bg-red-600' };
}

function DeltaBadge({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="text-gray-400">-</span>;
  const cls = value < 0
    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
    : value > 0
      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-500';
  const icon = value < 0 ? 'trending_down' : value > 0 ? 'trending_up' : 'trending_flat';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {value > 0 ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  );
}

function ValueCat({ bmi, weight }: { bmi: number | null; weight: number }) {
  if (bmi === null) return <span className="text-gray-400">-</span>;
  const cat = bmiCategory(bmi);
  return (
    <div className="flex items-center gap-2">
      <span className="font-bold text-gray-900 dark:text-white">{fmt(bmi)}</span>
      <span className={`text-[10px] font-semibold text-white px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
      {Number.isFinite(weight) && <span className="text-xs text-gray-400">({fmt(weight)} กก.)</span>}
    </div>
  );
}

export default function WeightAfterPage() {
  const { user, isAdmin, isCommittee } = useAuth();
  const [own, setOwn] = useState<OwnWeightPayload | null>(null);
  const [rows, setRows] = useState<WeightComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState('');

  const loadOwn = () =>
    postData('get-weight-after', { User_ID: user?.User_ID }).then(r => {
      setOwn(r && typeof r === 'object' ? (r as OwnWeightPayload) : null);
    });

  const loadComparison = () =>
    isAdmin || isCommittee
      ? fetchData<WeightComparisonItem[]>('weight-comparison', { User_ID: user?.User_ID || '' }).then(cmp => setRows(cmp || []))
      : Promise.resolve();

  useEffect(() => {
    let cancelled = false;
    loadOwn().then(() => { if (!cancelled) setLoading(false); });
    void loadComparison();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const w = Number(input);
    if (!input.trim() || Number.isNaN(w) || w < 20 || w > 300) {
      setMsg({ ok: false, text: 'กรุณากรอกน้ำหนักระหว่าง 20–300 กิโลกรัม' });
      return;
    }
    setSaving(true);
    const res = await postDataJson('save-weight-after', { User_ID: user?.User_ID, Weight_kg: w });
    setSaving(false);
    if (res && res.success) {
      setMsg({ ok: true, text: res.message || 'บันทึกสำเร็จ' });
      setInput('');
      await Promise.all([loadOwn(), loadComparison()]);
    } else {
      setMsg({ ok: false, text: (res && res.message) || 'เกิดข้อผิดพลาดในการบันทึก' });
    }
  };

  const base = own?.baseline ?? null;
  const latestRec = own?.records?.[0] ?? null;
  const latestWeight = latestRec ? num(latestRec.Weight_kg) : num(own?.currentWeight);
  const latestBmi = latestRec ? num(latestRec.BMI_Value) : num(own?.currentBmi);
  const latestFromWeightAfter = !!latestRec;
  const latestDate = latestRec?.Recorded_At;
  const baseWeight = base ? num(base.Weight_kg) : NaN;
  const baseBmi = base ? num(base.BMI_Value) : NaN;
  const deltaW = Number.isFinite(baseWeight) && Number.isFinite(latestWeight) ? Math.round((latestWeight - baseWeight) * 10) / 10 : null;
  const deltaB = Number.isFinite(baseBmi) && Number.isFinite(latestBmi) ? Math.round((latestBmi - baseBmi) * 10) / 10 : null;

  const filteredRows = [...rows]
    .filter(r => !filter || r.Full_Name.toLocaleLowerCase('th').includes(filter.toLocaleLowerCase('th')) || String(r.Department || '').toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      const aw = a.deltaWeight === null ? Infinity : a.deltaWeight;
      const bw = b.deltaWeight === null ? Infinity : b.deltaWeight;
      return aw - bw;
    });
  const withDelta = rows.filter(r => r.deltaWeight !== null);
  const avgDelta = withDelta.length
    ? Math.round((withDelta.reduce((s, r) => s + (r.deltaWeight ?? 0), 0) / withDelta.length) * 10) / 10
    : null;

  return (
    <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">monitor_weight</span>
          ชั่งน้ำหนัก / BMI
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          เปรียบเทียบผลการชั่งน้ำหนัก ครั้งแรก (Baseline) กับครั้งล่าสุด หลังสิ้นสุดโครงการ
        </p>
      </header>

      {loading ? (
        <GlassCard className="p-10 text-center text-gray-400">กำลังโหลดข้อมูล...</GlassCard>
      ) : (
        <>
          <section className="grid md:grid-cols-2 gap-6">
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-4">
                <span className="material-symbols-outlined">flag</span>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">ค่าครั้งแรก (Baseline)</h3>
              </div>
              {base ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-400">น้ำหนัก</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(base.Weight_kg)} <span className="text-xs font-normal text-gray-400">กก.</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">ส่วนสูง</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(base.Height_cm, 0)} <span className="text-xs font-normal text-gray-400">ซม.</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">BMI</p>
                    <ValueCat bmi={base ? num(base.BMI_Value) : null} weight={baseWeight} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">
                  ยังไม่มีข้อมูลเริ่มต้น (จะบันทึกอัตโนมัติเมื่อสมัคร/ชั่งครั้งแรก)
                </p>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-4">
                <span className="material-symbols-outlined">schedule</span>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">ค่าครั้งล่าสุด</h3>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-gray-400">น้ำหนัก</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(latestWeight)} <span className="text-xs font-normal text-gray-400">กก.</span></p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">BMI</p>
                  <ValueCat bmi={Number.isFinite(latestBmi) ? latestBmi : null} weight={latestWeight} />
                </div>
                <div>
                  <p className="text-xs text-gray-400">บันทึกเมื่อ</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-2">{fmtDate(latestDate)}</p>
                </div>
              </div>
              <p className="mt-3 text-center text-xs px-3 py-1.5 rounded-lg inline-block w-full bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
                <span className="material-symbols-outlined align-middle text-sm -mt-0.5">info</span>
                &nbsp;ข้อมูลล่าสุดจาก {latestFromWeightAfter ? 'การชั่งหลังโครงการ' : 'โปรไฟล์ของคุณ'}
              </p>
            </GlassCard>
          </section>

          <GlassCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <span className="material-symbols-outlined">swap_vert</span>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">ผลการเปลี่ยนแปลง</h3>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  <span className="material-symbols-outlined text-base">kilogram</span>น้ำหนัก: <DeltaBadge value={deltaW} suffix=" กก." />
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  <span className="material-symbols-outlined text-base">straighten</span>BMI: <DeltaBadge value={deltaB} suffix=" จุด" />
                </span>
              </div>
            </div>
            {Number.isFinite(latestWeight) ? (
              <div className="flex items-center justify-center gap-6 py-4 flex-wrap">
                <div className="text-center">
                  <p className="text-xs text-gray-400">ครั้งแรก</p>
                  <p className="text-2xl font-bold text-gray-400">{Number.isFinite(baseWeight) ? baseWeight.toFixed(1) : '-'}</p>
                </div>
                <div className="text-center relative">
                  <p className="text-xs text-gray-400 mb-1">เปลี่ยนแปลง</p>
                  <DeltaBadge value={deltaW} suffix=" กก." />
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">ครั้งล่าสุด</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{latestWeight.toFixed(1)}</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีข้อมูลการชั่งที่บันทึกไว้</p>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-4">
              <span className="material-symbols-outlined">edit_note</span>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">บันทึกน้ำหนัก</h3>
            </div>
            {own?.open ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="form-control w-48">
                  <span className="label-text text-xs text-gray-400 mb-1">น้ำหนัก (กิโลกรัม)</span>
                  <input
                    type="number"
                    min={20}
                    max={300}
                    step="0.1"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="เช่น 72.5"
                    className="input input-bordered w-full dark:bg-gray-800"
                  />
                </label>
                <button onClick={save} disabled={saving} className="btn btn-primary">
                  {saving ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <span className="material-symbols-outlined text-lg">save</span>
                  )}
                  บันทึก
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 flex items-center gap-2">
                <span className="material-symbols-outlined text-base">lock_clock</span>
                ยังไม่เปิดช่วงเวลาสำหรับการบันทึกน้ำหนักหลังโครงการ โปรดติดต่อเจ้าหน้าที่ นสส.
              </p>
            )}
            {msg && (
              <p className={`mt-3 text-sm font-medium ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {msg.text}
              </p>
            )}
          </GlassCard>

          {(isAdmin || isCommittee) && (
            <GlassCard className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <span className="material-symbols-outlined">people</span>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">สรุปภาพรวม {rows.length} คน</h3>
                </div>
                <label className="input input-sm input-bordered flex items-center gap-2 w-64 dark:bg-gray-800">
                  <span className="material-symbols-outlined text-gray-400 text-lg">search</span>
                  <input
                    type="text"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="ค้นหาชื่อ / ฝ่าย"
                    className="grow"
                  />
                </label>
              </div>

              {avgDelta !== null && (
                <div className="flex flex-wrap gap-3 text-sm mb-4">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                    <span className="material-symbols-outlined text-base">insights</span>
                    น้ำหนักลดลงเฉลี่ย {Math.abs(avgDelta).toFixed(1)} กก.
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    มีข้อมูลเปรียบเทียบ {withDelta.length} คน จาก {rows.length} คน
                  </span>
                </div>
              )}

              {rows.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">ยังไม่มีข้อมูลผู้ใช้ในระบบ</p>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="table table-sm w-full text-sm">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="font-medium">#</th>
                        <th className="font-medium">ชื่อ</th>
                        <th className="font-medium">ฝ่าย</th>
                        <th className="text-center font-medium">สูง (ซม.)</th>
                        <th className="text-center font-medium">น้ำหนักแรก</th>
                        <th className="text-center font-medium">BMI แรก</th>
                        <th className="text-center font-medium">น้ำหนักล่าสุด</th>
                        <th className="text-center font-medium">BMI ล่าสุด</th>
                        <th className="text-center font-medium">Δ น้ำหนัก</th>
                        <th className="text-center font-medium">Δ BMI</th>
                        <th className="font-medium">แหล่งที่มา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r, i) => {
                        const src = r.latest.fromWeightAfter
                          ? `บันทึกหลังโครงการ${r.latest.Recorded_At ? ` (${fmtDate(r.latest.Recorded_At)})` : ''}`
                          : 'จากโปรไฟล์';
                        return (
                          <tr key={r.User_ID} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <td className="text-gray-400">{i + 1}</td>
                            <td className="font-medium text-gray-800 dark:text-gray-200">{r.Full_Name || '-'}</td>
                            <td className="text-gray-500 dark:text-gray-400">{r.Department || '-'}</td>
                            <td className="text-center text-gray-600 dark:text-gray-300">{fmt(r.Height_cm, 0)}</td>
                            <td className="text-center text-gray-600 dark:text-gray-300">{r.baseline ? fmt(r.baseline.Weight_kg) : <span className="text-gray-400">-</span>}</td>
                            <td className="text-center">{r.baseline ? <ValueCat bmi={r.baseline.BMI_Value} weight={0} /> : <span className="text-gray-400">-</span>}</td>
                            <td className="text-center font-semibold text-gray-900 dark:text-white">{fmt(r.latest.Weight_kg)}</td>
                            <td className="text-center">{<ValueCat bmi={r.latest.BMI_Value} weight={0} />}</td>
                            <td className="text-center"><DeltaBadge value={r.deltaWeight} suffix="" /></td>
                            <td className="text-center"><DeltaBadge value={r.deltaBmi} suffix="" /></td>
                            <td className="text-xs text-gray-400">{src}</td>
                          </tr>
                        );
                      })}
                      {filteredRows.length === 0 && (
                        <tr><td colSpan={11} className="text-center text-gray-400 py-6">ไม่พบข้อมูลที่ค้นหา</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
}