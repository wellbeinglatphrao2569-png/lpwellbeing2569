'use client';
import { useState, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import ImageCropModal from '@/components/ui/ImageCropModal';
import { useAuth } from '@/hooks/useAuth';
import { postDataJson } from '@/services/api';
import type { User } from '@/types';
import {
  DEPARTMENTS, GENDERS, PREFIXES, CUSTOM_PREFIX,
  calcBmi, bmiCategory, calcAge, profileImageUrl,
  THAI_MONTH_NAMES, BIRTH_YEAR_BE_MIN, BIRTH_YEAR_BE_MAX,
  thaiPartsToIso, isValidThaiDate, birthDateToInputValue, birthDateThaiText, fileToBase64,
} from '@/utils/personnel';

interface ProfileForm {
  prefix: string; customPrefix: string; firstName: string; lastName: string; nickname: string;
  gender: string; position: string; department: string;
  birthDay: string; birthMonth: string; birthYearBE: string;
  weight: string; height: string;
}

const roleLabel: Record<string, string> = { Admin: 'เจ้าหน้าที่ นสส.', Committee: 'กรรมการ', Employee: 'บุคคลทั่วไป' };

function formFromUser(u: User): ProfileForm {
  const iso = birthDateToInputValue(u.Birth_Date);
  const isStandardPrefix = PREFIXES.includes(u.Prefix || '');
  return {
    prefix: isStandardPrefix ? (u.Prefix || 'นาย') : CUSTOM_PREFIX,
    customPrefix: isStandardPrefix ? '' : (u.Prefix || ''),
    firstName: u.First_Name || u.Full_Name?.split(' ')[0] || '',
    lastName: u.Last_Name || u.Full_Name?.split(' ').slice(1).join(' ') || '',
    nickname: u.Nickname || '',
    gender: GENDERS.includes(u.Gender || '') ? (u.Gender || 'ไม่ระบุ') : 'ไม่ระบุ',
    position: u.Position || '',
    department: u.Department || DEPARTMENTS[0],
    birthDay: iso ? String(Number(iso.slice(8, 10))) : '',
    birthMonth: iso ? String(Number(iso.slice(5, 7))) : '',
    birthYearBE: iso ? String(Number(iso.slice(0, 4)) + 543) : '',
    weight: u.Weight_kg || '',
    height: u.Height_cm || '',
  };
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm';
const labelCls = 'text-[11px] font-medium text-gray-500 block mb-1';

export default function ProfilePopup({ onClose }: { onClose: () => void }) {
  const { user, login } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProfileForm | null>(() => (user ? formFromUser(user) : null));
  const [newImage, setNewImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // เปลี่ยนรหัสผ่าน
  const [oldPwd, setOldPwd] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changing, setChanging] = useState(false);

  if (!user || !form) return null;

  const update = (k: keyof ProfileForm, v: string) => {
    const next = { ...form, [k]: v };
    setForm(next);
  };

  const effectivePrefix = form.prefix === CUSTOM_PREFIX ? form.customPrefix.trim() : form.prefix;
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const fullNameText = [firstName, lastName].filter(Boolean).join(' ');
  const bmi = calcBmi(form.weight, form.height);
  const bmiCat = bmiCategory(bmi);
  const birthIso = thaiPartsToIso(form.birthDay, form.birthMonth, form.birthYearBE);
  const age = birthIso ? calcAge(birthIso) : null;
  const birthThai = birthIso ? birthDateThaiText(birthIso) : '';
  const avatarSrc = newImage
    ? `data:image/jpeg;base64,${newImage}`
    : profileImageUrl(user.Profile_Image);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl) {
        setCropSrc(dataUrl);
        setCropOpen(true);
      }
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const requestSave = () => {
    setMessage(null);
    if (form.prefix === CUSTOM_PREFIX && !form.customPrefix.trim()) {
      setMessage({ type: 'error', text: 'กรุณากรอกคำนำหน้าในช่อง "อื่น ๆ (ระบุ)"' }); return;
    }
    if (!firstName || !lastName) {
      setMessage({ type: 'error', text: 'กรุณากรอกชื่อและนามสกุลให้ครบ' }); return;
    }
    if (!form.nickname.trim()) {
      setMessage({ type: 'error', text: 'กรุณากรอกชื่อเล่น (ข้อมูลจำเป็นสำหรับ นสส.)' }); return;
    }
    if (form.birthYearBE && !isValidThaiDate(form.birthDay, form.birthMonth, form.birthYearBE)) {
      setMessage({ type: 'error', text: 'วันที่เกิดไม่ถูกต้อง เช่น วันที่ไม่มีในเดือนดังกล่าว' }); return;
    }
    const w = Number(form.weight); const h = Number(form.height);
    if (form.weight && (w < 20 || w > 300)) {
      setMessage({ type: 'error', text: 'กรุณากรอกน้ำหนักที่ถูกต้อง (20-300 กิโลกรัม)' }); return;
    }
    if (form.height && (h < 50 || h > 250)) {
      setMessage({ type: 'error', text: 'กรุณากรอกส่วนสูงที่ถูกต้อง (50-250 เซนติเมตร)' }); return;
    }
    void saveProfile();
  };

  const saveProfile = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = {
      User_ID: user.User_ID,
      Prefix: effectivePrefix,
      First_Name: firstName,
      Last_Name: lastName,
      Full_Name: fullNameText || user.Full_Name || '',
      Nickname: form.nickname.trim(),
      Position: form.position.trim(),
      Department: form.department,
      Gender: form.gender,
      Birth_Date: birthIso,
      Weight_kg: form.weight,
      Height_cm: form.height,
    };
    if (newImage) payload.Profile_Image_Base64 = newImage;
    const res = await postDataJson('update-my-profile', payload);
    setSaving(false);
    if (res?.success) {
      const updated = res.user
        ? { ...user, ...res.user }
        : { ...user, First_Name: firstName, Last_Name: lastName, Full_Name: fullNameText || user.Full_Name, Nickname: form.nickname.trim(), Prefix: effectivePrefix, Position: form.position.trim(), Department: form.department, Gender: form.gender, Birth_Date: birthIso, Weight_kg: form.weight, Height_cm: form.height };
      login(updated);
      setMessage({ type: 'success', text: res.message || 'บันทึกข้อมูลโปรไฟล์สำเร็จ' });
    } else {
      setMessage({ type: 'error', text: res?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่' });
    }
  };

  const changePassword = async () => {
    setPwdMsg(null);
    if (!oldPwd.trim()) { setPwdMsg({ type: 'error', text: 'กรุณากรอกรหัสผ่านเดิม' }); return; }
    if (pwdNew.length < 6) { setPwdMsg({ type: 'error', text: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' }); return; }
    if (pwdNew !== confirmPwd) { setPwdMsg({ type: 'error', text: 'รหัสผ่านใหม่ไม่ตรงกัน' }); return; }
    setChanging(true);
    const res = await postDataJson('change-password', { User_ID: user.User_ID, Old_Password: oldPwd, New_Password: pwdNew });
    setChanging(false);
    if (res?.success) {
      setPwdMsg({ type: 'success', text: 'เปลี่ยนรหัสผ่านสำเร็จ (ครั้งหน้าเข้าสู่ระบบด้วยรหัสใหม่)' });
      setOldPwd(''); setPwdNew(''); setConfirmPwd('');
    } else {
      setPwdMsg({ type: 'error', text: res?.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ' });
    }
  };

  return (
    <Modal open wide onClose={onClose}>
      <div className="flex flex-col flex-1 min-h-0">
        {/* ════ หัวเรื่อง (ปักหมุดด้านบน) ════ */}
        <div className="pr-10">
          <h3 className="font-bold text-xl text-gray-900 dark:text-white mb-1">โปรไฟล์ของฉัน</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">ดูข้อมูลและแก้ไขตามความต้องการได้เลย</p>
        </div>

        {/* ════ ส่วนที่เลื่อนได้ ════ */}
        <div className="flex-1 min-h-0 overflow-y-auto -mr-3 pr-3 flex flex-col gap-4">

        {message && (
          <div className={`p-3 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* ════ หัวข้อมูล + รูปโปรไฟล์ ════ */}
        <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="relative shrink-0">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="รูปโปรไฟล์" className="w-24 h-24 rounded-full object-cover ring-4 ring-emerald-200 dark:ring-emerald-800 shadow-lg" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-3xl font-bold shadow-lg">
                {(firstName || user.Full_Name || 'ส').charAt(0)}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
          </div>
          <div className="text-center sm:text-left flex-1 min-w-0">
            <h4 className="font-bold text-lg text-gray-900 dark:text-white truncate">
              {effectivePrefix}{fullNameText || user.Full_Name}
              {form.nickname.trim() && <span className="text-gray-400 font-medium"> ({form.nickname.trim()})</span>}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{form.position.trim() || user.Position || '—'} · {form.department || user.Department || '—'}</p>
            <span className="inline-block mt-2 px-3 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-medium">
              {roleLabel[user.Role] || user.Role || 'บุคคลทั่วไป'}
            </span>
          </div>
          <div className="w-full sm:w-auto shrink-0 flex flex-col sm:items-end gap-1.5">
            <span className="text-[11px] text-gray-400 text-center sm:text-right">รูปโปรไฟล์</span>
            {uploading
              ? <span className="text-xs text-emerald-600">กำลังอ่านรูป...</span>
              : <button onClick={() => fileRef.current?.click()} className="btn-outline btn-outline-emerald btn-xs">
                  <span className="material-symbols-outlined text-sm">upload</span> เปลี่ยนรูป
                </button>}
          </div>
        </div>

        {/* ════ ข้อมูลส่วนบุคคล ════ */}
        <div>
          <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-lg">badge</span>
            คำนำหน้า ชื่อ-สกุล ชื่อเล่น
          </h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>คำนำหน้า</label>
              <select value={form.prefix} onChange={e => update('prefix', e.target.value)} className={inputCls}>
                {PREFIXES.map(p => <option key={p}>{p}</option>)}
              </select>
              {form.prefix === CUSTOM_PREFIX && (
                <input value={form.customPrefix} onChange={e => update('customPrefix', e.target.value)} className={`${inputCls} mt-1`} placeholder="พิมพ์คำนำหน้า เช่น จ.ส.อ., ดร." />
              )}
            </div>
            <div>
              <label className={labelCls}>ชื่อเล่น</label>
              <input value={form.nickname} onChange={e => update('nickname', e.target.value)} className={inputCls} placeholder="ชื่อเล่น" />
            </div>
            <div>
              <label className={labelCls}>ชื่อ</label>
              <input value={form.firstName} onChange={e => update('firstName', e.target.value)} className={inputCls} placeholder="ชื่อ" />
            </div>
            <div>
              <label className={labelCls}>นามสกุล</label>
              <input value={form.lastName} onChange={e => update('lastName', e.target.value)} className={inputCls} placeholder="นามสกุล" />
            </div>
          </div>
        </div>

        {/* ════ ตำแหน่ง / ส่วนราชการ ════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>ตำแหน่ง</label>
            <input value={form.position} onChange={e => update('position', e.target.value)} className={inputCls} placeholder="ตำแหน่ง" />
          </div>
          <div>
            <label className={labelCls}>ส่วนราชการ (สังกัด)</label>
            <select value={form.department} onChange={e => update('department', e.target.value)} className={inputCls}>
              {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* ════ วันเกิด + อายุ ════ */}
        <div>
          <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-lg">cake</span>
            วัน เดือน ปี เกิด — อายุ
          </h5>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>วัน</label>
              <select value={form.birthDay} onChange={e => update('birthDay', e.target.value)} className={inputCls}>
                <option value="">วัน</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>เดือน</label>
              <select value={form.birthMonth} onChange={e => update('birthMonth', e.target.value)} className={inputCls}>
                <option value="">เดือน</option>
                {THAI_MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>ปี พ.ศ.</label>
              <select value={form.birthYearBE} onChange={e => update('birthYearBE', e.target.value)} className={inputCls}>
                <option value="">ปี</option>
                {Array.from({ length: BIRTH_YEAR_BE_MAX - BIRTH_YEAR_BE_MIN + 1 }, (_, i) => BIRTH_YEAR_BE_MAX - i)
                  .map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {(birthThai || age) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {birthThai && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium">
                  <span className="material-symbols-outlined text-sm">calendar_today</span>
                  {birthThai}
                </span>
              )}
              {age && <span className="text-gray-600 dark:text-gray-300">อายุ: <strong>{age.text}</strong></span>}
            </div>
          )}
          {form.birthYearBE && !isValidThaiDate(form.birthDay, form.birthMonth, form.birthYearBE) && (
            <p className="text-xs text-red-500 mt-1">วันที่ไม่ถูกต้อง เช่น วันที่ไม่มีในเดือนดังกล่าว (เช่น 31 ก.พ.)</p>
          )}
        </div>

        {/* ════ น้ำหนัก / ส่วนสูง / BMI ════ */}
        <div className="p-4 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-900/10">
          <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-lg">monitor_weight</span>
            น้ำหนัก / ส่วนสูง / BMI <span className="text-xs font-normal text-gray-400">(ค่าที่บันทึกล่าสุด)</span>
          </h5>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>น้ำหนัก (กก.)</label>
              <input type="number" min="0" inputMode="decimal" value={form.weight} onChange={e => update('weight', e.target.value)} className={inputCls} placeholder="เช่น 65.5" />
            </div>
            <div>
              <label className={labelCls}>ส่วนสูง (ซม.)</label>
              <input type="number" min="0" inputMode="decimal" value={form.height} onChange={e => update('height', e.target.value)} className={inputCls} placeholder="เช่น 170" />
            </div>
          </div>
          {bmi !== null ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-emerald-200/60 dark:border-emerald-800/60">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">BMI</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none">{bmi}</p>
              </div>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${bmiCat.bgClass} ${bmiCat.textClass}`}>{bmiCat.label}</span>
            </div>
          ) : (
            <p className="text-xs text-gray-400">กรอกน้ำหนักและส่วนสูงเพื่อคำนวณค่า BMI</p>
          )}
        </div>

        {/* ════ เปลี่ยนรหัสผ่าน ════ */}
        <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-lg">lock_reset</span>
            เปลี่ยนรหัสผ่าน
          </h5>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>รหัสผ่านเดิม</label>
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} className={inputCls} placeholder="รหัสผ่านเดิม" />
            </div>
            <div>
              <label className={labelCls}>รหัสผ่านใหม่ (≥6 ตัว)</label>
              <input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} className={inputCls} placeholder="รหัสผ่านใหม่" />
            </div>
            <div>
              <label className={labelCls}>ยืนยันรหัสผ่านใหม่</label>
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} className={inputCls} placeholder="ยืนยันรหัสผ่านใหม่" />
            </div>
          </div>
          {pwdMsg && (
            <p className={`mt-2 text-sm font-medium ${pwdMsg.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{pwdMsg.text}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button onClick={changePassword} disabled={changing} className="btn-outline btn-outline-emerald btn-xs disabled:opacity-50">
              <span className="material-symbols-outlined text-sm">key</span>
              {changing ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}
            </button>
            <p className="text-[11px] text-gray-400">ลืมรหัสผ่าน? กรุณาติดต่อเจ้าหน้าที่ นสส. เพื่อขอคืนค่ารหัสผ่าน</p>
          </div>
        </div>

        </div>

        {/* ════ ปุ่มด้านล่าง (ปักหมุดติดอยู่ด้านล่าง popup) ════ */}
        <div className="flex gap-2 pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button onClick={onClose} className="btn-ghost flex-1">ปิด</button>
          <button onClick={requestSave} disabled={saving} className="btn-primary flex-[2] justify-center disabled:opacity-50">
            <span className="material-symbols-outlined text-base">save</span>
            {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
          </button>
        </div>
      </div>
      <ImageCropModal open={cropOpen && !!cropSrc} imageSrc={cropSrc || ''} onCancel={() => { setCropOpen(false); setCropSrc(null); }} onSave={(b64) => { setNewImage(b64); setCropOpen(false); setCropSrc(null); }} />
    </Modal>
  );
}