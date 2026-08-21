'use client';
import { useState, useEffect, useRef } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import ConfirmPopup from '@/components/ui/ConfirmPopup';
import ResultPopup from '@/components/ui/ResultPopup';
import { useAuth } from '@/hooks/useAuth';
import { fetchData, postData, postDataJson } from '@/services/api';
import type { User } from '@/types';

interface GoogleFitLink {
  User_ID: string;
  Gmail: string;
  Connected_At: string;
  Full_Name?: string;
}
import { DEPARTMENTS, GENDERS, PREFIXES, CUSTOM_PREFIX, ACTIVITIES, parseActivities, calcAge, calcBmi, bmiCategory, displayName, profileImageUrl, birthDateToInputValue, birthDateThaiText, THAI_MONTH_NAMES, BIRTH_YEAR_BE_MIN, BIRTH_YEAR_BE_MAX, thaiPartsToIso, isValidThaiDate, fileToBase64 } from '@/utils/personnel';

interface AddRow { prefix: string; customPrefix: string; firstName: string; lastName: string; nickname: string; position: string; department: string; role: string; activities: string[]; }

interface PersonnelPayload { Prefix: string; First_Name: string; Last_Name: string; Nickname: string; Position: string; Department: string; Role: string; Activities: string; }

type StatusKey = 'all' | 'pending' | 'registered' | 'inactive';

function statusOf(u: User): 'pending' | 'registered' | 'inactive' {
  if (u.Registration_Status === 'Pending') return 'pending';
  if (u.Registration_Status === 'Registered') return 'registered';
  if (u.Registration_Status === 'Inactive') return 'inactive';
  return u.Password ? 'registered' : 'pending';
}

const badge = {
  pending: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  registered: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
  inactive: 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400',
};
const badgeLabel = { pending: 'รอลงทะเบียน', registered: 'ลงทะเบียนแล้ว', inactive: 'ระงับ' };

const roleLabel: Record<string, string> = { Admin: 'เจ้าหน้าที่ นสส.', Committee: 'กรรมการ', Employee: 'บุคคลทั่วไป' };

const emptyRow = (): AddRow => ({ prefix: 'นาย', customPrefix: '', firstName: '', lastName: '', nickname: '', position: '', department: DEPARTMENTS[0], role: 'Employee', activities: ['sweet_free'] });

/** แยกค่าวันเกิด (ISO หรือรูปแบบไทย) → วัน */
function isoBirthDay(bd?: string): string {
  const iso = birthDateToInputValue(bd);
  if (!iso) return '';
  return String(Number(iso.slice(8, 10)));
}
/** แยกค่าวันเกิด → เดือน (1-12) */
function isoBirthMonth(bd?: string): string {
  const iso = birthDateToInputValue(bd);
  if (!iso) return '';
  return String(Number(iso.slice(5, 7)));
}
/** แยกค่าวันเกิด → ปี พ.ศ. */
function isoBirthYearBE(bd?: string): string {
  const iso = birthDateToInputValue(bd);
  if (!iso) return '';
  return String(Number(iso.slice(0, 4)) + 543);
}

export default function AdminPersonnelPage() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addRows, setAddRows] = useState<AddRow[]>([emptyRow()]);
  const [confirm, setConfirm] = useState<{ title: string; message: string; variant?: 'primary' | 'danger' | 'warning'; onConfirm: () => void } | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // Google Fit Links management
  const [gfLinks, setGfLinks] = useState<GoogleFitLink[]>([]);
  const [showGfLinks, setShowGfLinks] = useState(false);
  const [loadingGfLinks, setLoadingGfLinks] = useState(false);

  // edit modal state
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState({
    prefix: 'นาย', customPrefix: '', firstName: '', lastName: '', nickname: '', position: '',
    department: DEPARTMENTS[0], gender: 'ไม่ระบุ', birthDay: '', birthMonth: '', birthYearBE: '',
    weight: '', height: '',
    activities: ['sweet_free'] as string[], role: 'Employee', citizenId: '',
  });

  // filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  async function load() {
    const data = await fetchData<User[]>('users');
    if (data) setUsers(data);
  }

  async function loadGfLinks() {
    setLoadingGfLinks(true);
    try {
      const data = await fetchData<GoogleFitLink[]>('google-fit-links');
      if (data) {
        // enrich with user names
        const enriched = data.map(link => {
          const u = users.find(user => String(user.User_ID) === String(link.User_ID));
          return { ...link, Full_Name: u?.Full_Name || u?.First_Name + ' ' + u?.Last_Name || '—' };
        });
        setGfLinks(enriched);
      }
    } catch (e) {
      console.error('Load Google Fit links failed:', e);
    } finally {
      setLoadingGfLinks(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  const updateRow = (i: number, k: keyof AddRow, v: string | string[]) => {
    setAddRows(rows => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  };

  const toggleActivity = (i: number, code: string) => {
    if (code === 'sweet_free') return; // บังคับเข้าร่วมเสมอ
    setAddRows(rows => rows.map((r, idx) => {
      if (idx !== i) return r;
      const has = r.activities.includes(code);
      return { ...r, activities: has ? r.activities.filter(a => a !== code) : [...r.activities, code] };
    }));
  };

  const addRow = () => setAddRows(rows => [...rows, emptyRow()]);
  const requestRemoveRow = (i: number) => {
    const r = addRows[i];
    if (!r?.firstName.trim() && !r?.lastName.trim()) { removeRow(i); return; }
    setConfirm({
      title: 'ยืนยันการลบรายการ',
      message: `คุณกำลังจะลบรายการ "${r.firstName} ${r.lastName}" ออกจากฟอร์มการเพิ่ม (ยังไม่ได้บันทึก) แน่ใจหรือไม่?`,
      variant: 'danger',
      onConfirm: () => removeRow(i),
    });
  };
  const removeRow = (i: number) => setAddRows(rows => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));

  const handleAddRequest = () => {
    const bad = addRows.find(r => r.prefix === CUSTOM_PREFIX && r.firstName.trim() && !r.customPrefix.trim());
    if (bad) { setNotice({ type: 'error', text: 'กรุณากรอกคำนำหน้าในช่อง "อื่น ๆ (ระบุ)"' }); return; }
    const personnel = addRows
      .map(r => ({
        Prefix: r.prefix === CUSTOM_PREFIX ? r.customPrefix.trim() : r.prefix,
        First_Name: r.firstName,
        Last_Name: r.lastName,
        Nickname: r.nickname,
        Position: r.position,
        Department: r.department,
        Role: r.role || 'Employee',
        Activities: r.activities.length ? r.activities.join(',') : 'sweet_free',
      }))
      .filter(r => r.First_Name.trim() && r.Last_Name.trim());
    if (!personnel.length) { setNotice({ type: 'error', text: 'กรุณากรอกชื่อและนามสกุลอย่างน้อย 1 คน' }); return; }
    const count = personnel.length;
    setConfirm({
      title: 'ยืนยันการเพิ่มบุคลากร',
      message: `คุณกำลังจะเพิ่มบุคลากร ${count} คนลงในระบบ (สถานะ "รอลงทะเบียน") แน่ใจหรือไม่ที่จะดำเนินการ?`,
      variant: 'primary',
      onConfirm: async () => { await executeAddAll(personnel); },
    });
  };

  const executeAddAll = async (personnel: PersonnelPayload[]) => {
    setSaving(true);
    const res = await postDataJson('add-personnel', { Created_By: user?.User_ID, Personnel: personnel });
    setSaving(false);
    if (res?.success) {
      setSavedMessage(res?.message || 'บันทึกข้อมูลเรียบร้อยแล้ว');
      setAddRows([emptyRow()]);
      setShowForm(false);
      setShowSaved(true);
      load();
    } else {
      setNotice({ type: 'error', text: res?.message || 'เพิ่มบุคลากรไม่สำเร็จ' });
    }
  };

  const requestDeletePersonnel = (u: User) => {
    if (String(u.User_ID) === String(user?.User_ID)) {
      setNotice({ type: 'error', text: 'ไม่สามารถลบบัญชีของตนเองได้' });
      return;
    }
    setConfirm({
      title: 'ลบผู้ใช้งาน',
      message: `คุณกำลังจะลบ "${displayName(u)}" (${u.Department}) ออกจากระบบถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้ แน่ใจหรือไม่?`,
      variant: 'danger',
      onConfirm: () => deletePersonnel(u),
    });
  };

  const deletePersonnel = async (u: User) => {
    const res = await postData('delete-personnel', { Personnel_ID: u.Personnel_ID, Logged_By: user?.User_ID });
    if (res?.success) {
      setNotice({ type: 'success', text: `ลบ "${displayName(u)}" ออกจากระบบแล้ว` });
      load();
    } else {
      setNotice({ type: 'error', text: res?.message || 'ลบผู้ใช้งานไม่สำเร็จ' });
    }
  };

  const requestResetPassword = (u: User) => {
    setConfirm({
      title: 'ยืนยันการคืนค่ารหัสผ่าน',
      message: `คุณกำลังจะคืนค่ารหัสผ่านของ "${displayName(u)}" เป็น pass1234 แน่ใจหรือไม่?`,
      variant: 'warning',
      onConfirm: () => resetPassword(u),
    });
  };

  const resetPassword = async (u: User) => {
    const res = await postDataJson('reset-password', { Personnel_ID: u.Personnel_ID, Logged_By: user?.User_ID });
    if (res?.success) {
      setNotice({ type: 'success', text: `คืนค่ารหัสผ่าน ${displayName(u)} เป็น pass1234 แล้ว` });
      load();
    } else {
      setNotice({ type: 'error', text: res?.message || 'คืนค่ารหัสผ่านไม่สำเร็จ' });
    }
  };

  // Google Fit Links reset
  const requestResetAllGfLinks = () => {
    setConfirm({
      title: '⚠️ ยืนยันการรีเซ็ต Google Fit ทั้งหมด',
      message: 'จะล้างข้อมูลการเชื่อมต่อ Google Fit ของทุกคน ผู้ใช้ทุกคนต้องเชื่อมต่อใหม่ แน่ใจหรือไม่?',
      variant: 'danger',
      onConfirm: resetAllGfLinks,
    });
  };

  const resetAllGfLinks = async () => {
    const res = await postDataJson('reset-google-fit-links', { Logged_By: user?.User_ID });
    if (res?.success) {
      setNotice({ type: 'success', text: 'ล้างข้อมูล Google Fit ทั้งหมดแล้ว' });
      loadGfLinks();
    } else {
      setNotice({ type: 'error', text: res?.message || 'รีเซ็ตไม่สำเร็จ' });
    }
  };

  const requestResetUserGfLink = (link: GoogleFitLink) => {
    setConfirm({
      title: 'ยืนยันการรีเซ็ต Google Fit',
      message: `จะลบการเชื่อมต่อ Google Fit ของ "${link.Full_Name}" (${link.Gmail}) ผู้ใช้ต้องเชื่อมต่อใหม่ แน่ใจหรือไม่?`,
      variant: 'warning',
      onConfirm: () => resetUserGfLink(link),
    });
  };

  const resetUserGfLink = async (link: GoogleFitLink) => {
    const res = await postDataJson('reset-user-google-fit-link', { Logged_By: user?.User_ID, User_ID: link.User_ID });
    if (res?.success) {
      setNotice({ type: 'success', text: `ลบการเชื่อมต่อ Google Fit ของ ${link.Full_Name} แล้ว` });
      loadGfLinks();
    } else {
      setNotice({ type: 'error', text: res?.message || 'รีเซ็ตไม่สำเร็จ' });
    }
  };

  // Step record mode toggle
  const requestChangeMode = (u: User) => {
    const cur = String(u.Step_Record_Mode || '1') === '2' ? '2' : '1';
    const next = cur === '1' ? '2' : '1';
    const nextLabel = next === '2' ? 'เจ้าหน้าที่ นสส. บันทึกให้ (Mode 2)' : 'บันทึกด้วยตนเอง (Mode 1)';
    const warn = next === '2' ? ' — เมื่อเปลี่ยนเป็น Mode 2 บุคลากรจะไม่สามารถบันทึกเองได้จนกว่าจะเปลี่ยนกลับ' : '';
    setConfirm({
      title: 'ยืนยันการเปลี่ยนโหมดบันทึก',
      message: `เปลี่ยนโหมดบันทึกของ "${displayName(u)}" (${u.Department}) จาก Mode ${cur} → Mode ${next} (${nextLabel})${warn} แน่ใจหรือไม่?`,
      variant: next === '2' ? 'warning' : 'primary',
      onConfirm: () => changeMode(u, next),
    });
  };
  const changeMode = async (u: User, mode: string) => {
    const res = await postDataJson('set-step-record-mode', { Logged_By: user?.User_ID, Personnel_ID: u.Personnel_ID, User_ID: (u as any).User_ID || u.User_ID, Step_Record_Mode: mode });
    if (res?.success) {
      setNotice({ type: 'success', text: res.message || 'เปลี่ยนโหมดสำเร็จ' });
      load();
    } else {
      setNotice({ type: 'error', text: (res?.message || 'เปลี่ยนโหมดไม่สำเร็จ') + (res?.error ? ' ('+res.error+')':'' ) });
      console.error('set-step-record-mode failed', res);
    }
  };

  // ---- edit modal ----
  const openEdit = (u: User) => {
    setEditTarget(u);
    const acts = parseActivities(u.Activities);
    if (!acts.includes('sweet_free')) acts.unshift('sweet_free');
    const isCustom = !PREFIXES.includes(u.Prefix || '');
    setEditForm({
      prefix: isCustom ? CUSTOM_PREFIX : (u.Prefix || 'นาย'),
      customPrefix: isCustom ? (u.Prefix || '') : '',
      firstName: u.First_Name || u.Full_Name?.split(' ')[0] || '',
      lastName: u.Last_Name || u.Full_Name?.split(' ').slice(1).join(' ') || '',
      nickname: u.Nickname || '',
      position: u.Position || '',
      department: u.Department || DEPARTMENTS[0],
      gender: u.Gender || 'ไม่ระบุ',
      birthDay: isoBirthDay(u.Birth_Date),
      birthMonth: isoBirthMonth(u.Birth_Date),
      birthYearBE: isoBirthYearBE(u.Birth_Date),
      weight: u.Weight_kg || '',
      height: u.Height_cm || '',
      activities: acts,
      role: u.Role || 'Employee',
      citizenId: String(u.User_ID ?? ''),
    });
    setEditing(true);
  };

  const toggleEditActivity = (code: string) => {
    if (code === 'sweet_free') return;
    setEditForm(f => {
      const has = f.activities.includes(code);
      return { ...f, activities: has ? f.activities.filter(a => a !== code) : [...f.activities, code] };
    });
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editTarget) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      setUploading(false);
      setConfirm({
        title: 'ยืนยันการอัปโหลดรูปโปรไฟล์',
        message: `คุณกำลังจะอัปโหลดรูปโปรไฟล์ของ "${displayName(editTarget)}" แทนรูปเดิม แน่ใจหรือไม่?`,
        variant: 'primary',
        onConfirm: () => { if (editTarget.Personnel_ID) uploadImage(editTarget.Personnel_ID, base64); },
      });
    } catch {
      setUploading(false);
      setNotice({ type: 'error', text: 'อ่านไฟล์รูปไม่สำเร็จ' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const uploadImage = async (personnelId: string, base64: string) => {
    setUploading(true);
    const res = await postDataJson('upload-profile-image', { Personnel_ID: personnelId, Image_Base64: base64 });
    setUploading(false);
    if (res?.success) {
      setEditTarget(t => t ? { ...t, Profile_Image: res.Profile_Image || t.Profile_Image } : t);
      setNotice({ type: 'success', text: 'อัปโหลดรูปโปรไฟล์สำเร็จ' });
      load();
    } else {
      setNotice({ type: 'error', text: res?.message || 'อัปโหลดรูปไม่สำเร็จ' });
    }
  };

  const requestSaveEdit = () => {
    if (!editTarget) return;
    if (editForm.prefix === CUSTOM_PREFIX && !editForm.customPrefix.trim()) {
      setNotice({ type: 'error', text: 'กรุณากรอกคำนำหน้าในช่อง "อื่น ๆ (ระบุ)"' }); return;
    }
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setNotice({ type: 'error', text: 'กรุณากรอกชื่อและนามสกุลให้ครบ' }); return;
    }
    if (!editForm.nickname.trim()) {
      setNotice({ type: 'error', text: 'กรุณากรอกชื่อเล่น (ข้อมูลจำเป็น)' }); return;
    }
    if (editForm.citizenId.trim() && !/^\d{13}$/.test(editForm.citizenId.trim())) {
      setNotice({ type: 'error', text: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' }); return;
    }
    if (editForm.citizenId.trim()) {
      const dup = users.find(u => u.Personnel_ID !== editTarget.Personnel_ID && String(u.User_ID ?? '') === editForm.citizenId.trim());
      if (dup) {
        setNotice({ type: 'error', text: `เลขบัตรประชาชนนี้ถูกใช้โดย ${displayName(dup)} แล้ว ไม่สามารถใช้ซ้ำได้` });
        return;
      }
    }
    if (editForm.birthYearBE && !isValidThaiDate(editForm.birthDay, editForm.birthMonth, editForm.birthYearBE)) {
      setNotice({ type: 'error', text: 'วันที่เกิดไม่ถูกต้อง เช่น วันที่ไม่มีในเดือนดังกล่าว' }); return;
    }
    setConfirm({
      title: 'ยืนยันการแก้ไขข้อมูล',
      message: `คุณกำลังจะบันทึกการแก้ไขข้อมูลของ "${displayName(editTarget)}" แน่ใจหรือไม่?`,
      variant: 'primary',
      onConfirm: () => saveEdit(),
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const res = await postDataJson('update-personnel', {
      Personnel_ID: editTarget.Personnel_ID,
      Logged_By: user?.User_ID,
      User_ID: editForm.citizenId.trim(),
      Prefix: editForm.prefix === CUSTOM_PREFIX ? editForm.customPrefix.trim() : editForm.prefix,
      First_Name: editForm.firstName.trim(),
      Last_Name: editForm.lastName.trim(),
      Nickname: editForm.nickname.trim(),
      Position: editForm.position.trim(),
      Department: editForm.department,
      Gender: editForm.gender,
      Birth_Date: editBirthIso,
      Weight_kg: editForm.weight,
      Height_cm: editForm.height,
      Activities: editForm.activities.length ? editForm.activities.join(',') : 'sweet_free',
      Role: editForm.role,
    });
    if (res?.success) {
      setNotice({ type: 'success', text: `อัปเดตข้อมูล ${res.Full_Name || displayName(editTarget)} สำเร็จ` });
      setEditing(false);
      setEditTarget(null);
      load();
    } else {
      setNotice({ type: 'error', text: res?.message || 'อัปเดตข้อมูลไม่สำเร็จ' });
    }
  };

  const editBmi = calcBmi(editForm.weight, editForm.height);
  const editBmiCat = bmiCategory(editBmi);
  const editBirthIso = thaiPartsToIso(editForm.birthDay, editForm.birthMonth, editForm.birthYearBE);

  const filtered = users.filter(u => {
    const st = statusOf(u);
    const okStatus = statusFilter === 'all' || st === statusFilter;
    const okDept = !deptFilter || u.Department === deptFilter;
    const okSearch = !search || `${u.Full_Name} ${u.Nickname} ${u.First_Name} ${u.Last_Name}`.toLowerCase().includes(search.toLowerCase());
    return okStatus && okDept && okSearch;
  });

  const countBy = (s: StatusKey) => (s === 'all' ? users.length : users.filter(u => statusOf(u) === s).length);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">จัดการบุคลากร</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">เพิ่มบุคลากร (เจ้าหน้าที่ นสส.) แก้ไขข้อมูลทุกอย่าง คืนค่ารหัสผ่าน และตรวจสอบสถานะ</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => { setShowForm(true); setNotice(null); setAddRows([emptyRow()]); }}
              className="btn-primary justify-center">
              <span className="material-symbols-outlined">group_add</span>
              เพิ่มบุคลากร
            </button>
          )}
        </div>
      </div>

      {/* Add personnel modal */}
      <Modal open={showForm} wide onClose={() => setShowForm(false)}>
        <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="font-bold text-gray-900 dark:text-white">เพิ่มบุคลากร (หลายคนพร้อมกันได้)</h3>
            <span className="text-xs px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-medium">
              เลขบัตร / รหัสผ่าน / น้ำหนัก / ส่วนสูง บุคลากรกรอกตอนลงทะเบียนเอง
            </span>
          </div>
          <div className="space-y-3">
            {addRows.map((r, i) => (
              <div key={i} className="p-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                {/* บรรทัดที่ 1: ชื่อ-นามสกุล */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end mb-2">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-0.5">คำนำหน้า <span className="text-red-500">*</span></label>
                    <select value={r.prefix} onChange={e => updateRow(i, 'prefix', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                      {PREFIXES.map(p => <option key={p}>{p}</option>)}
                    </select>
                    {r.prefix === CUSTOM_PREFIX && (
                      <input value={r.customPrefix} onChange={e => updateRow(i, 'customPrefix', e.target.value)} className="w-full mt-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" placeholder="เช่น จ.ส.อ., ดร." />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-0.5">ชื่อ <span className="text-red-500">*</span></label>
                    <input value={r.firstName} onChange={e => updateRow(i, 'firstName', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" placeholder="ชื่อ" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-0.5">นามสกุล <span className="text-red-500">*</span></label>
                    <input value={r.lastName} onChange={e => updateRow(i, 'lastName', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" placeholder="นามสกุล" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-0.5">ชื่อเล่น <span className="text-red-500">*</span></label>
                    <input value={r.nickname} onChange={e => updateRow(i, 'nickname', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" placeholder="ชื่อเล่น" />
                  </div>
                </div>
                {/* บรรทัดที่ 2: ตำแหน่ง/ส่วนราชการ/บทบาท */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-0.5">ตำแหน่ง <span className="text-red-500">*</span></label>
                    <input value={r.position} onChange={e => updateRow(i, 'position', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" placeholder="ตำแหน่ง" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-0.5">ส่วนราชการ <span className="text-red-500">*</span></label>
                    <select value={r.department} onChange={e => updateRow(i, 'department', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                      {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-0.5">บทบาท <span className="text-red-500">*</span></label>
                    <select value={r.role} onChange={e => updateRow(i, 'role', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                      <option value="Admin">เจ้าหน้าที่ นสส. (แก้ไขได้ทุกอย่าง)</option>
                      <option value="Committee">กรรมการ (บันทึกงดหวาน + สิทธิทั่วไป)</option>
                      <option value="Employee">บุคคลทั่วไป (แดชบอร์ด + บันทึกก้าว)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">กิจกรรมที่เข้าร่วม</label>
                  <div className="flex flex-wrap gap-2">
                    {ACTIVITIES.map(a => (
                      <button key={a.code} type="button"
                        onClick={() => toggleActivity(i, a.code)}
                        disabled={a.mandatory}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          r.activities.includes(a.code)
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                        } ${a.mandatory ? 'opacity-90 cursor-default' : 'hover:border-emerald-300'}`}>
                        {a.mandatory && <span className="material-symbols-outlined text-[14px] align-middle mr-1">lock</span>}
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                {addRows.length > 1 && (
                  <div className="text-right mt-2">
                    <button onClick={() => requestRemoveRow(i)} className="text-xs text-red-400 hover:text-red-600 font-medium">ลบรายการนี้</button>
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button onClick={addRow} className="btn-ghost text-sm justify-center">+ เพิ่มคนถัดไป</button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddRequest} disabled={saving}
                className="btn-primary flex-1 justify-center disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : `บันทึกบุคลากร ${addRows.filter(r => r.firstName.trim() && r.lastName.trim()).length} คน`}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* บันทึกสำเร็จ popup */}
      <ResultPopup
        open={showSaved}
        type="success"
        title="บันทึกข้อมูลเรียบร้อยแล้ว"
        message={savedMessage || ''}
        confirmLabel="ตกลง"
        onClose={() => setShowSaved(false)}
      />

      {user?.Department && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <span className="material-symbols-outlined">info</span>
          คุณ (เจ้าหน้าที่ นสส.) สังกัด <strong>{user.Department}</strong> — คุณสามารถจัดการโหมดบันทึกของบุคลากรฝ่ายคุณได้ (Mode 1 = บันทึกเอง, Mode 2 = จนท.บันทึกให้ เมื่อเป็น Mode 2 จะบล็อกการบันทึกเอง)
        </div>
      )}
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white">รายชื่อบุคลากรทั้งหมด ({users.length} คน)</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-medium">รอลงทะเบียน {countBy('pending')}</span>
            <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium">ลงทะเบียนแล้ว {countBy('registered')}</span>
            <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 font-medium">ระงับ {countBy('inactive')}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="ค้นหาชื่อ..." className="md:col-span-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
          <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
            <option value="">ทุกส่วนราชการ</option>
            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as StatusKey); setPage(1); }} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
            <option value="all">ทุกสถานะ</option>
            <option value="pending">รอลงทะเบียน</option>
            <option value="registered">ลงทะเบียนแล้ว</option>
            <option value="inactive">ระงับ</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">ชื่อ-สกุล</th>
              <th className="px-4 py-3 font-medium">ตำแหน่ง</th>
              <th className="px-4 py-3 font-medium">ส่วนราชการ</th>
              <th className="px-4 py-3 font-medium">บทบาท</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
              <th className="px-4 py-3 font-medium">โหมดบันทึก</th>
              <th className="px-4 py-3 font-medium">จัดการ</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {pageItems.map((u, i) => {
                const st = statusOf(u);
                return (
                  <tr key={i} className="hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.Profile_Image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={profileImageUrl(u.Profile_Image) || ''} alt="รูปโปรไฟล์" className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-200 dark:ring-emerald-800 shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                            {(u.Full_Name || u.First_Name || 'ส').charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{displayName(u)}</div>
                          {u.Nickname && <div className="text-xs text-gray-400">ชื่อเล่น: {u.Nickname}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{u.Position || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{u.Department}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-medium ${u.Role === 'Admin' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' : u.Role === 'Committee' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300'}`}>
                        {roleLabel[u.Role] || u.Role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge[st]}`}>
                        {st === 'registered' && <span className="material-symbols-outlined text-sm">verified_user</span>}
                        {badgeLabel[st]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const mode = String(u.Step_Record_Mode || '1') === '2' ? '2' : '1';
                        const isMode2 = mode === '2';
                        return (
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${isMode2 ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'}`}>
                              <span className="material-symbols-outlined text-sm">{isMode2 ? 'support_agent' : 'edit_note'}</span>
                              {isMode2 ? 'Mode 2: จนท.บันทึกให้' : 'Mode 1: บันทึกเอง'}
                            </span>
                            {isAdmin && u.Personnel_ID && (
                              <button onClick={() => requestChangeMode(u)} className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                                สลับเป็น Mode {isMode2 ? '1' : '2'}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5 min-w-[150px]">
                        {u.Personnel_ID && isAdmin ? (
                          <>
                            <button onClick={() => openEdit(u)} className="btn-outline btn-outline-emerald btn-xs">
                              <span className="material-symbols-outlined text-sm">edit</span> แก้ไขข้อมูล
                            </button>
                            <button onClick={() => requestResetPassword(u)} className="btn-outline btn-outline-amber btn-xs">
                              <span className="material-symbols-outlined text-sm">key</span> คืนค่ารหัสผ่าน
                            </button>
                            <button onClick={() => requestDeletePersonnel(u)} className="btn-outline btn-outline-red btn-xs">
                              <span className="material-symbols-outlined text-sm">person_remove</span> ลบผู้ใช้งาน
                            </button>
                          </>
                        ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">ไม่พบข้อมูลบุคลากร</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              แสดง {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} จาก {filtered.length} รายการ
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">
                <span className="material-symbols-outlined text-sm align-middle">chevron_left</span> ก่อนหน้า
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === currentPage ? 'bg-emerald-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">
                ถัดไป <span className="material-symbols-outlined text-sm align-middle">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Google Fit Links Management */}
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white">จัดการการเชื่อมต่อ Google Fit</h3>
          <div className="flex gap-2">
            <button onClick={() => { setShowGfLinks(!showGfLinks); if (showGfLinks) loadGfLinks(); }}
              className="btn-outline btn-outline-emerald justify-center">
              <span className="material-symbols-outlined">link</span>
              {showGfLinks ? 'ซ่อน' : 'แสดง'} รายการเชื่อมต่อ
            </button>
            {showGfLinks && gfLinks.length > 0 && (
              <button onClick={requestResetAllGfLinks} className="btn-outline btn-outline-red justify-center">
                <span className="material-symbols-outlined">delete_forever</span>
                รีเซ็ตทั้งหมด
              </button>
            )}
          </div>
        </div>

        {showGfLinks && (
          <div className="space-y-3">
            {loadingGfLinks ? (
              <div className="flex items-center justify-center py-8">
                <span className="loading loading-spinner loading-lg text-emerald-600"></span>
                <span className="ml-3 text-gray-500">กำลังโหลด...</span>
              </div>
            ) : gfLinks.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <span className="material-symbols-outlined text-4xl mb-2 block">link_off</span>
                <p>ไม่มีข้อมูลการเชื่อมต่อ Google Fit</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 font-medium">ชื่อ-สกุล</th>
                      <th className="px-4 py-3 font-medium">User ID</th>
                      <th className="px-4 py-3 font-medium">Gmail</th>
                      <th className="px-4 py-3 font-medium">เชื่อมต่อเมื่อ</th>
                      <th className="px-4 py-3 font-medium">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {gfLinks.map((link, i) => (
                      <tr key={i} className="hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{link.Full_Name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 font-mono">{link.User_ID || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{link.Gmail || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{link.Connected_At || '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => requestResetUserGfLink(link)}
                            className="btn-outline btn-outline-red btn-xs">
                            <span className="material-symbols-outlined text-sm">unlink</span> ยกเลิกเชื่อมต่อ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Edit modal */}
      <Modal open={editing} onClose={() => { setEditing(false); setEditTarget(null); }}>
        {editTarget && (
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">แก้ไขข้อมูลบุคลากร</h3>

            <div className="flex items-center gap-4">
              {editTarget.Profile_Image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileImageUrl(editTarget.Profile_Image) || ''} alt="รูปโปรไฟล์" className="w-20 h-20 rounded-full object-cover ring-2 ring-emerald-200 dark:ring-emerald-800" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-2xl font-bold">
                  {(editForm.firstName || editTarget.Full_Name || 'ส').charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">รูปโปรไฟล์</p>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="text-xs" />
                {uploading && <p className="text-xs text-emerald-600 mt-1">กำลังอัปโหลด...</p>}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">เลขบัตรประชาชน 13 หลัก</label>
              <input value={editForm.citizenId}
                onChange={e => setEditForm(f => ({ ...f, citizenId: e.target.value.replace(/\D/g, '').slice(0, 13) }))}
                inputMode="numeric"
                placeholder="เช่น 1099900000011"
                className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              {editForm.citizenId && !/^\d{13}$/.test(editForm.citizenId) && (
                <p className="text-xs text-red-500 mt-1">เลขบัตรประชาชนต้องครบ 13 หลัก</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">คำนำหน้า <span className="text-red-500">*</span></label>
                <select value={editForm.prefix} onChange={e => setEditForm(f => ({ ...f, prefix: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  {PREFIXES.map(p => <option key={p}>{p}</option>)}
                </select>
                {editForm.prefix === CUSTOM_PREFIX && (
                  <input value={editForm.customPrefix} onChange={e => setEditForm(f => ({ ...f, customPrefix: e.target.value }))} className="w-full mt-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" placeholder="เช่น จ.ส.อ., ดร." />
                )}
              </div>
              <div />
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">ชื่อ <span className="text-red-500">*</span></label>
                <input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">นามสกุล <span className="text-red-500">*</span></label>
                <input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">ชื่อเล่น <span className="text-red-500">*</span></label>
                <input value={editForm.nickname} onChange={e => setEditForm(f => ({ ...f, nickname: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">เพศ</label>
                <select value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  {GENDERS.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">ตำแหน่ง <span className="text-red-500">*</span></label>
              <input value={editForm.position} onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">ส่วนราชการ <span className="text-red-500">*</span></label>
              <select value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">น้ำหนัก (กก.)</label>
                <input type="number" min="0" value={editForm.weight} onChange={e => setEditForm(f => ({ ...f, weight: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">ส่วนสูง (ซม.)</label>
                <input type="number" min="0" value={editForm.height} onChange={e => setEditForm(f => ({ ...f, height: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              </div>
            </div>
            {editBmi !== null && (
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-center">
                <span className="text-xs text-gray-500">BMI: </span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{editBmi}</span>
                <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${editBmiCat.bgClass} ${editBmiCat.textClass}`}>{editBmiCat.label}</span>
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">วัน เดือน ปี (พ.ศ.) เกิด</label>
              <div className="grid grid-cols-3 gap-2">
                <select value={editForm.birthDay} onChange={e => setEditForm(f => ({ ...f, birthDay: e.target.value }))}
                  className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="">วัน</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={editForm.birthMonth} onChange={e => setEditForm(f => ({ ...f, birthMonth: e.target.value }))}
                  className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="">เดือน</option>
                  {THAI_MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={editForm.birthYearBE} onChange={e => setEditForm(f => ({ ...f, birthYearBE: e.target.value }))}
                  className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="">ปี พ.ศ.</option>
                  {Array.from({ length: BIRTH_YEAR_BE_MAX - BIRTH_YEAR_BE_MIN + 1 }, (_, i) => BIRTH_YEAR_BE_MAX - i)
                    .map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {birthDateThaiText(editBirthIso) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium">
                    <span className="material-symbols-outlined text-sm">calendar_today</span>
                    {birthDateThaiText(editBirthIso)}
                  </span>
                  {calcAge(editBirthIso) && (
                    <span className="text-gray-600 dark:text-gray-300">อายุ: <strong>{calcAge(editBirthIso)?.text}</strong></span>
                  )}
                </div>
              )}
              {editForm.birthYearBE && !isValidThaiDate(editForm.birthDay, editForm.birthMonth, editForm.birthYearBE) && (
                <p className="text-red-500 text-xs mt-1">วันที่ไม่ถูกต้อง เช่น วันที่ไม่มีในเดือนดังกล่าว (เช่น 31 ก.พ.)</p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">กิจกรรมที่เข้าร่วม</label>
              <div className="flex flex-wrap gap-2">
                {ACTIVITIES.map(a => (
                  <button key={a.code} type="button"
                    onClick={() => toggleEditActivity(a.code)}
                    disabled={a.mandatory}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      editForm.activities.includes(a.code)
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                    } ${a.mandatory ? 'opacity-90 cursor-default' : 'hover:border-emerald-300'}`}>
                    {a.mandatory && <span className="material-symbols-outlined text-[14px] align-middle mr-1">lock</span>}
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">บทบาท</label>
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                <option value="Admin">เจ้าหน้าที่ นสส. (แก้ไขได้ทุกอย่าง)</option>
                <option value="Committee">กรรมการ (บันทึกงดหวาน + สิทธิทั่วไป)</option>
                <option value="Employee">บุคคลทั่วไป (แดชบอร์ด + บันทึกก้าว)</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => { setEditing(false); setEditTarget(null); }} className="btn-ghost flex-1">ยกเลิก</button>
              <button onClick={requestSaveEdit} className="btn-primary flex-[2] justify-center">บันทึกการแก้ไข</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmPopup
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message || ''}
        variant={confirm?.variant}
        onConfirm={() => { const fn = confirm?.onConfirm; setConfirm(null); fn?.(); }}
        onClose={() => setConfirm(null)}
      />

      <ResultPopup
        open={!!notice}
        type={notice?.type === 'success' ? 'success' : 'error'}
        title={notice?.type === 'success' ? 'ดำเนินการสำเร็จ' : 'ไม่สำเร็จ'}
        message={notice?.text || ''}
        confirmLabel="ตกลง"
        onClose={() => setNotice(null)}
      />
    </div>
  );
}