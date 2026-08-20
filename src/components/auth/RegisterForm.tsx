'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { postData } from '@/services/api';
import Link from 'next/link';
import ConfirmPopup from '@/components/ui/ConfirmPopup';
import ResultPopup from '@/components/ui/ResultPopup';
import {
  DEPARTMENTS, GENDERS, PREFIXES, CUSTOM_PREFIX, ACTIVITIES,
  calcBmi, bmiCategory, birthDateThaiText, calcAge,
  THAI_MONTH_NAMES, BIRTH_YEAR_BE_MIN, BIRTH_YEAR_BE_MAX,
  thaiPartsToIso, isValidThaiDate, fileToBase64,
} from '@/utils/personnel';

/** ตรวจเลขบัตรประชาชนไทย 13 หลัก + check digit */
function isValidThaiCitizenId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(id[12]);
}

interface PersonnelRecord {
  Personnel_ID?: string;
  Full_Name?: string;
  First_Name?: string;
  Last_Name?: string;
  Prefix?: string;
  Nickname?: string;
  Position?: string;
  Department?: string;
  Gender?: string;
  Activities?: string;
  Registration_Status?: string;
}

/** ชื่อหน้าตามขั้นตอน */
const STEP_LABELS = [
  'ค้นหาชื่อบุคลากร',
  'ส่วนที่ 1 ข้อมูลส่วนบุคคล',
  'ส่วนที่ 2 น้ำหนัก / ส่วนสูง',
  'ส่วนที่ 3 การเข้าร่วมกิจกรรม',
  'ส่วนที่ 4 รหัสผ่าน',
  'ส่วนที่ 5 ตรวจสอบข้อมูล',
];

const emptyForm = () => ({
  prefix: 'นาย', customPrefix: '', firstName: '', lastName: '', nickname: '', position: '', department: '',
  gender: 'ชาย', birthDay: '', birthMonth: '', birthYearBE: '',
  weight: '', height: '', citizenId: '', password: '', confirmPassword: '',
  activities: ['sweet_free'] as string[],
});

export default function RegisterForm({ onSuccess }: { onSuccess?: () => void }) {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const [form, setForm] = useState(emptyForm());
  const fileRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [queryName, setQueryName] = useState('');
  const [queryDept, setQueryDept] = useState('');
  const [results, setResults] = useState<PersonnelRecord[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<PersonnelRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [confirming, setConfirming] = useState(false);

  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // ---- derived ----
  const bmi = calcBmi(form.weight, form.height);
  const bmiCat = bmiCategory(bmi);
  const effectivePrefix = form.prefix === CUSTOM_PREFIX ? form.customPrefix.trim() : form.prefix;
  const birthIso = thaiPartsToIso(form.birthDay, form.birthMonth, form.birthYearBE);
  const birthOk = isValidThaiDate(form.birthDay, form.birthMonth, form.birthYearBE);

  /** ชื่อไฟล์รูปโปรไฟล์ตามแบบ: ชื่อ-สกุล_ส่วนราชการ_เลขบัตรประชาชน */
  const profileFileName = [form.firstName, form.lastName].filter(Boolean).join(' ') + '_' + form.department + '_' + form.citizenId;
  const canShowFileName = !!(form.firstName.trim() && form.lastName.trim() && form.department && form.citizenId);

  const passwordOk = form.password.length >= 6;
  const citizenOk = isValidThaiCitizenId(form.citizenId);
  const personalOk = !!(
    form.firstName.trim() && form.lastName.trim() && form.nickname.trim() &&
    form.position.trim() && form.department && effectivePrefix && birthOk && citizenOk
  );
  const healthOk = !!Number(form.weight) && !!Number(form.height);
  const passwordMatchOk = passwordOk && form.password === form.confirmPassword;

  const handleSearch = async () => {
    setSearching(true);
    setSearchError('');
    setSelected(null);
    const res = await postData('search-personnel', { q: queryName, department: queryDept });
    setSearching(false);
    if (res?.success) {
      setResults(res.results || []);
      if (!res.results?.length) setSearchError('ไม่พบรายชื่อที่ตรงกัน กรุณาติดต่อเจ้าหน้าที่ นสส.');
    } else {
      setResults(null);
      setSearchError(res?.message || 'ค้นหาไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const selectPerson = (p: PersonnelRecord) => {
    setSelected(p);
    const isStd = !!(p.Prefix && p.Prefix !== CUSTOM_PREFIX && PREFIXES.includes(p.Prefix));
    const acts = p.Activities ? p.Activities.split(',').filter(Boolean) : ['sweet_free'];
    if (!acts.includes('sweet_free')) acts.unshift('sweet_free');
    setForm(f => ({
      ...f,
      prefix: isStd && p.Prefix ? p.Prefix : CUSTOM_PREFIX,
      customPrefix: isStd ? '' : (p.Prefix || ''),
      firstName: p.First_Name || f.firstName,
      lastName: p.Last_Name || f.lastName,
      nickname: p.Nickname || f.nickname,
      position: p.Position || f.position,
      department: p.Department || f.department,
      gender: (GENDERS.includes(p.Gender || '') ? p.Gender : f.gender) as string,
      activities: acts,
    }));
  };

  const toggleActivity = (code: string) => {
    setForm(f => {
      const has = f.activities.includes(code);
      const acts = has ? f.activities.filter(a => a !== code) : [...f.activities, code];
      if (!acts.includes('sweet_free')) acts.unshift('sweet_free');
      return { ...f, activities: acts };
    });
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      setProfileImage(base64);
    } catch {
      setSubmitError('อ่านไฟล์รูปไม่สำเร็จ');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const requestSubmit = () => {
    if (!selected?.Personnel_ID) return;
    if (form.prefix === CUSTOM_PREFIX && !form.customPrefix.trim()) {
      setSubmitError('กรุณากรอกคำนำหน้าในช่อง "อื่น ๆ (ระบุ)"');
      return;
    }
    if (!citizenOk) {
      setSubmitError('เลขบัตรประชาชนไม่ถูกต้อง (ตรวจสอบครบ 13 หลัก)');
      return;
    }
    if (form.password.length < 6) {
      setSubmitError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    setSubmitError('');
    setConfirming(true);
  };

  const handleSubmit = () => {
    setConfirming(false);
    void doSubmit();
  };

  const doSubmit = async () => {
    if (!selected?.Personnel_ID) return;
    setSubmitting(true);
    const payload: Record<string, unknown> = {
      Personnel_ID: selected.Personnel_ID,
      User_ID: form.citizenId,
      Prefix: effectivePrefix,
      First_Name: form.firstName.trim(),
      Last_Name: form.lastName.trim(),
      Full_Name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
      Nickname: form.nickname.trim(),
      Position: form.position.trim(),
      Department: form.department,
      Birth_Date: birthIso,
      Gender: form.gender,
      Weight_kg: form.weight,
      Height_cm: form.height,
      BMI_Value: bmi === null ? '' : String(bmi),
      Activities: form.activities.join(','),
      Password: form.password,
    };
    if (profileImage) payload.Profile_Image_Base64 = profileImage;
    const res = await postData('register', payload);
    setSubmitting(false);
    if (res?.success) {
      setSubmitSuccess(res?.message || 'ลงทะเบียนยืนยันตัวตนเรียบร้อยแล้ว');
    } else {
      setSubmitError(res?.message || 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const go = (n: number) => { setSubmitError(''); setStep(n); };

  return (
    <div className="text-center mb-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ลงทะเบียนยืนยันตัวตน</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">ขั้นตอนที่ {step} จาก 6 · {STEP_LABELS[step - 1]}</p>
      <progress className="progress progress-primary w-full mt-3" value={step} max={6} />

      <div className="text-left space-y-4 animate-fade-in">
        {/* ════ ขั้นตอนที่ 1: ค้นหาบุคลากร ════ */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-semibold text-lg">ค้นหาชื่อบุคลากร</h2>
            <p className="text-sm text-gray-500">เจ้าหน้าที่ นสส. ได้เพิ่มรายชื่อบุคลากรไว้แล้ว กรุณาค้นหาชื่อของท่าน (บุคลากร 1 คน ยืนยันตัวตนได้ 1 ครั้ง)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">ชื่อ-นามสกุล / คำค้น</label>
                <input value={queryName} onChange={e => setQueryName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" placeholder="เช่น สมชาย รักสุขภาพ" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">ส่วนราชการ</label>
                <select value={queryDept} onChange={e => setQueryDept(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800">
                  <option value="">ทั้งหมด</option>
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleSearch} disabled={searching}
              className="btn-primary w-full justify-center">ค้นหา</button>
            {searchError && <p className="text-red-500 text-sm">{searchError}</p>}
            {results !== null && results.length > 0 && (
              <div className="max-h-72 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-2xl p-3">
                {results.map((p, i) => {
                  const registered = p.Registration_Status === 'Registered';
                  return registered ? (
                    <div key={`${p.Personnel_ID || i}`}
                      className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-gray-900 dark:text-white">{p.Prefix} {p.Full_Name}</p>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          <span className="material-symbols-outlined text-sm">verified_user</span>
                          ลงทะเบียนแล้ว
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{p.Nickname}{p.Position ? ` · ${p.Position}` : ''} — {p.Department}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">ท่านได้ลงทะเบียนแล้ว ไม่ต้องลงทะเบียนซ้ำ</p>
                    </div>
                  ) : (
                    <button key={`${p.Personnel_ID || i}`} onClick={() => selectPerson(p)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selected?.Personnel_ID === p.Personnel_ID
                          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-emerald-300'
                      }`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-gray-900 dark:text-white">{p.Prefix} {p.Full_Name}</p>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 whitespace-nowrap">
                          รอลงทะเบียน
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{p.Nickname}{p.Position ? ` · ${p.Position}` : ''} — {p.Department}</p>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => go(2)} disabled={!selected}
                className="btn-primary flex-[2] justify-center disabled:opacity-40 disabled:cursor-not-allowed">ถัดไป</button>
            </div>
          </div>
        )}

        {/* ════ ขั้นตอนที่ 2: ส่วนที่ 1 ข้อมูลส่วนบุคคล ════ */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-semibold text-lg">ส่วนที่ 1 ข้อมูลส่วนบุคคล</h2>

            {/* รูปโปรไฟล์ */}
            <div className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-2xl font-bold overflow-hidden shrink-0">
                {profileImage
                  ? <img src={`data:image/jpeg;base64,${profileImage}`} alt="โปรไฟล์" className="w-full h-full object-cover" />
                  : (form.firstName ? form.firstName.charAt(0) : 'ส')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">รูปภาพโปรไฟล์</p>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="text-xs mt-1" />
                {uploading && <p className="text-xs text-emerald-600 mt-1">กำลังอ่านรูป...</p>}
                {profileImage && canShowFileName && (
                  <p className="text-[11px] text-gray-400 mt-1 truncate" title={profileFileName}>บันทึก: {profileFileName}</p>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">เลขบัตรประชาชน 13 หลัก</label>
              <input value={form.citizenId} onChange={e => update('citizenId', e.target.value.replace(/\D/g, '').slice(0, 13))}
                inputMode="numeric"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" placeholder="เช่น 1xxxx..." />
              {form.citizenId && !citizenOk && <p className="text-red-500 text-sm mt-1">เลขบัตรประชาชนไม่ถูกต้อง (ตรวจสอบครบ 13 หลัก)</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium block mb-1">คำนำหน้า <span className="text-red-500">*</span></label>
                <select value={form.prefix} onChange={e => update('prefix', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800">
                  {PREFIXES.map(p => <option key={p}>{p}</option>)}</select>
                {form.prefix === CUSTOM_PREFIX && (
                  <input value={form.customPrefix} onChange={e => update('customPrefix', e.target.value)} className="w-full mt-2 px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" placeholder="พิมพ์คำนำหน้า เช่น จ.ส.อ., ดร., คุณ" />
                )}</div>
              <div><label className="text-sm font-medium block mb-1">ชื่อเล่น <span className="text-red-500">*</span></label>
                <input value={form.nickname} onChange={e => update('nickname', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" placeholder="ชื่อเล่น" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium block mb-1">ชื่อ <span className="text-red-500">*</span></label>
                <input value={form.firstName} onChange={e => update('firstName', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" placeholder="ชื่อ" /></div>
              <div><label className="text-sm font-medium block mb-1">นามสกุล <span className="text-red-500">*</span></label>
                <input value={form.lastName} onChange={e => update('lastName', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" placeholder="นามสกุล" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium block mb-1">ตำแหน่ง <span className="text-red-500">*</span></label>
                <input value={form.position} onChange={e => update('position', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" placeholder="ตำแหน่ง" /></div>
              <div><label className="text-sm font-medium block mb-1">ส่วนราชการ <span className="text-red-500">*</span></label>
                <select value={form.department} onChange={e => update('department', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800">
                  <option value="">เลือกส่วนราชการ</option>
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">เพศ</label>
              <div className="flex flex-wrap gap-2">
                {GENDERS.map(g => (
                  <button key={g} type="button" onClick={() => update('gender', g)}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                      form.gender === g ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* วันเดือนปีเกิด (พ.ศ.) */}
            <div>
              <label className="text-sm font-medium block mb-1">วัน เดือน ปี (พ.ศ.) เกิด</label>
              <div className="grid grid-cols-3 gap-3">
                <select value={form.birthDay} onChange={e => update('birthDay', e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800">
                  <option value="">วัน</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={form.birthMonth} onChange={e => update('birthMonth', e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800">
                  <option value="">เดือน</option>
                  {THAI_MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={form.birthYearBE} onChange={e => update('birthYearBE', e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800">
                  <option value="">ปี พ.ศ.</option>
                  {Array.from({ length: BIRTH_YEAR_BE_MAX - BIRTH_YEAR_BE_MIN + 1 }, (_, i) => BIRTH_YEAR_BE_MAX - i)
                    .map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {birthIso && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium">
                    <span className="material-symbols-outlined text-sm">calendar_today</span>
                    {birthDateThaiText(birthIso)}
                  </span>
                  {calcAge(birthIso) && (
                    <span className="text-gray-600 dark:text-gray-300">อายุ: <strong>{calcAge(birthIso)?.text}</strong></span>
                  )}
                </div>
              )}
              {form.birthYearBE && !birthOk && <p className="text-red-500 text-sm mt-1">วันที่ไม่ถูกต้อง เช่น วันที่ไม่มีในเดือนดังกล่าว (เช่น 31 ก.พ.)</p>}
            </div>

            <p className="text-xs text-gray-400">* ข้อมูลที่ดึงมาจากรายชื่อบุคลากร สามารถแก้ไขได้</p>
            <div className="flex gap-3">
              <button onClick={() => go(1)} className="btn-ghost flex-1">กลับ</button>
              <button onClick={() => go(3)} disabled={!personalOk}
                className="btn-primary flex-[2] justify-center disabled:opacity-40 disabled:cursor-not-allowed">ถัดไป</button>
            </div>
          </div>
        )}

        {/* ════ ขั้นตอนที่ 3: ส่วนที่ 2 น้ำหนัก / ส่วนสูง ════ */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-semibold text-lg">ส่วนที่ 2 น้ำหนัก / ส่วนสูง</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium block mb-1">น้ำหนัก (กก.)</label>
                <input type="number" min="0" inputMode="decimal" value={form.weight} onChange={e => update('weight', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" /></div>
              <div><label className="text-sm font-medium block mb-1">ส่วนสูง (ซม.)</label>
                <input type="number" min="0" inputMode="decimal" value={form.height} onChange={e => update('height', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" /></div>
            </div>
            {bmi !== null ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">ค่า BMI ของคุณ</p>
                <p className="text-3xl font-bold text-emerald-600">{bmi}</p>
                <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium ${bmiCat.bgClass} ${bmiCat.textClass}`}>{bmiCat.label}</span>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl text-center text-sm text-gray-400">
                กรอกน้ำหนักและส่วนสูงเพื่อคำนวณค่า BMI
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => go(2)} className="btn-ghost flex-1">กลับ</button>
              <button onClick={() => go(4)} disabled={!healthOk}
                className="btn-primary flex-[2] justify-center disabled:opacity-40 disabled:cursor-not-allowed">ถัดไป</button>
            </div>
          </div>
        )}

        {/* ════ ขั้นตอนที่ 4: ส่วนที่ 3 การเข้าร่วมกิจกรรม ════ */}
        {step === 4 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-semibold text-lg">ส่วนที่ 3 การเข้าร่วมกิจกรรม</h2>
            <p className="text-sm text-gray-500">เลือกกิจกรรมสุขภาวะที่ต้องการเข้าร่วม (กิจกรรม &quot;พุธนี้ไม่มีเชื่อม&quot; จำเป็นต้องเข้าร่วมทุกคน)</p>
            <div className="space-y-3">
              {ACTIVITIES.map(a => {
                const checked = form.activities.includes(a.code);
                const mandatory = a.mandatory;
                return (
                  <button key={a.code} type="button" disabled={mandatory}
                    onClick={() => toggleActivity(a.code)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                      checked
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-emerald-300'
                    } ${mandatory ? 'opacity-90' : ''}`}>
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-white ${checked ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-600'}`}>
                      {checked && <span className="material-symbols-outlined text-sm">check</span>}
                    </span>
                    <span className="flex-1">
                      <span className="font-medium text-gray-900 dark:text-white block">{a.label}</span>
                      {mandatory && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">บังคับเข้าร่วม</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => go(3)} className="btn-ghost flex-1">กลับ</button>
              <button onClick={() => go(5)} className="btn-primary flex-[2] justify-center">ถัดไป</button>
            </div>
          </div>
        )}

        {/* ════ ขั้นตอนที่ 5: ส่วนที่ 4 รหัสผ่าน ════ */}
        {step === 5 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-semibold text-lg">ส่วนที่ 4 รหัสผ่าน</h2>
            <div><label className="text-sm font-medium block mb-1">รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</label>
              <input type="password" value={form.password} onChange={e => update('password', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" /></div>
            <div><label className="text-sm font-medium block mb-1">ยืนยันรหัสผ่าน</label>
              <input type="password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white dark:bg-gray-800" /></div>
            {form.password !== form.confirmPassword && form.confirmPassword && <p className="text-red-500 text-sm">รหัสผ่านไม่ตรงกัน</p>}
            {form.password && form.password.length < 6 && <p className="text-red-500 text-sm">รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร</p>}
            <p className="text-xs text-gray-400">ข้อมูลอ่อนไหว (เลขบัตรประชาชน รหัสผ่าน น้ำหนัก ส่วนสูง) จะถูกบันทึกเมื่อยืนยันการลงทะเบียนครั้งนี้เท่านั้น และรหัสผ่านจะถูกเก็บแบบ Hash เพื่อความปลอดภัย</p>
            <div className="flex gap-3">
              <button onClick={() => go(4)} className="btn-ghost flex-1">กลับ</button>
              <button onClick={() => go(6)} disabled={!passwordMatchOk}
                className="btn-primary flex-[2] justify-center disabled:opacity-40 disabled:cursor-not-allowed">ถัดไป</button>
            </div>
          </div>
        )}

        {/* ════ ขั้นตอนที่ 6: ส่วนที่ 5 ตรวจสอบข้อมูล ════ */}
        {step === 6 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-semibold text-lg">ส่วนที่ 5 ตรวจสอบข้อมูล</h2>
            <p className="text-sm text-gray-500">ตรวจสอบข้อมูลทุกส่วนก่อนยืนยันการลงทะเบียน</p>

            <div className="flex items-center gap-4 mb-2">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-xl font-bold overflow-hidden shrink-0">
                {profileImage
                  ? <img src={`data:image/jpeg;base64,${profileImage}`} alt="โปรไฟล์" className="w-full h-full object-cover" />
                  : (form.firstName ? form.firstName.charAt(0) : 'ส')}
              </div>
              <div className="text-xs text-gray-400">
                {profileImage && canShowFileName
                  ? <>ไฟล์รูป: {profileFileName}</>
                  : 'ยังไม่ได้เลือกรูปโปรไฟล์'}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 text-sm bg-white dark:bg-gray-800">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-200">ส่วนที่ 1 · ข้อมูลส่วนบุคคล</div>
              <div className="px-4 py-3 space-y-2">
                <p><strong>ชื่อ:</strong> {effectivePrefix}{form.firstName} {form.lastName} ({form.nickname})</p>
                <p><strong>ตำแหน่ง:</strong> {form.position}</p>
                <p><strong>ส่วนราชการ:</strong> {form.department}</p>
                <p><strong>เพศ:</strong> {form.gender}</p>
                <p><strong>วันเกิด:</strong> {birthDateThaiText(birthIso) || '-'}{calcAge(birthIso) ? ` (อายุ ${calcAge(birthIso)?.text})` : ''}</p>
                <p><strong>เลขบัตรประชาชน:</strong> {form.citizenId ? '********' + form.citizenId.slice(10) : '-'}</p>
              </div>
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-200">ส่วนที่ 2 · น้ำหนัก / ส่วนสูง</div>
              <div className="px-4 py-3 space-y-2">
                <p><strong>น้ำหนัก / ส่วนสูง:</strong> {form.weight} กก. / {form.height} ซม.</p>
                <p><strong>BMI:</strong> {bmi ?? '-'} {bmi !== null ? `(${bmiCat.label})` : ''}</p>
              </div>
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-200">ส่วนที่ 3 · การเข้าร่วมกิจกรรม</div>
              <div className="px-4 py-3">
                <p>{form.activities.map(a => ACTIVITIES.find(x => x.code === a)?.label || a).join(' , ')}</p>
              </div>
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-200">ส่วนที่ 4 · รหัสผ่าน</div>
              <div className="px-4 py-3">
                <p><strong>รหัสผ่าน:</strong> {'•'.repeat(Math.max(form.password.length, 6))}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => go(5)} className="btn-ghost flex-1">กลับ</button>
              <button onClick={requestSubmit} disabled={submitting || !personalOk || !healthOk || !passwordMatchOk}
                className="btn-primary flex-[2] justify-center disabled:opacity-40">
                {submitting ? 'กำลังบันทึก...' : 'ยืนยันและลงทะเบียน'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          มีบัญชีแล้ว? <Link href="/login" className="text-emerald-600 font-medium hover:underline">เข้าสู่ระบบ</Link>
        </p>
      </div>

      <ConfirmPopup
        open={confirming}
        title="ยืนยันการลงทะเบียน"
        message={`คุณกำลังจะยืนยันการลงทะเบียนของ "${effectivePrefix}${form.firstName} ${form.lastName}" ด้วยเลขบัตรประชาชนที่กรอก (แสดงเฉพาะ 3 หลักท้าย: ${form.citizenId ? '********' + form.citizenId.slice(10) : '-'}) เมื่อยืนยันแล้วไม่สามารถแก้ไขเลขบัตรประชาชนได้ แน่ใจหรือไม่?`}
        variant="primary"
        loading={submitting}
        confirmLabel="ยืนยันและลงทะเบียน"
        onConfirm={handleSubmit}
        onClose={() => { if (!submitting) setConfirming(false); }}
      />

      <ResultPopup
        open={!!submitError}
        type="error"
        title="ไม่สามารถยืนยันการลงทะเบียนได้"
        message={submitError}
        confirmLabel="ตกลง"
        onClose={() => setSubmitError('')}
      />

      <ResultPopup
        open={!!submitSuccess}
        type="success"
        title="ลงทะเบียนสำเร็จ"
        message={submitSuccess}
        confirmLabel="ตกลง"
        onClose={() => {
          setSubmitSuccess('');
          if (onSuccess) onSuccess();
          else router.push('/login');
        }}
      />
    </div>
  );
}