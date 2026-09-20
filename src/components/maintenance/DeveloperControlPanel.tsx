'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, DEV_SECRET } from '@/lib/maintenance';
import type { SystemSettings } from '@/lib/maintenance';
import { setDevBypass } from '@/hooks/useMaintenance';
import MaintenancePreviewModal from './MaintenancePreviewModal';

export default function DeveloperControlPanel({
  settings,
  onSettingsChange,
  onSaved,
}: {
  settings: SystemSettings;
  onSettingsChange: (s: SystemSettings) => void;
  onSaved: (s: SystemSettings) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState<SystemSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 640px)');
    const on = () => setIsMobile(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  // auto collapse บนมือถือครั้งแรก
  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/system-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-secret': DEV_SECRET },
        body: JSON.stringify({
          is_maintenance_active: draft.is_maintenance_active,
          maintenance_title: draft.maintenance_title,
          maintenance_message: draft.maintenance_message,
          _dev_secret: DEV_SECRET,
        }),
      });
      const j = await res.json();
      if (!res.ok || j.success === false) throw new Error(j.message || `HTTP ${res.status}`);
      const next: SystemSettings = j.settings || draft;
      onSettingsChange(next);
      onSaved(next);
      setMsg({ type: 'ok', text: 'บันทึกสำเร็จ' });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  function handleExit() {
    setDevBypass(false);
  }

  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-[9998] flex items-center gap-2">
        <button
          onClick={() => setCollapsed(false)}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gray-900 text-white shadow-xl border border-white/10 font-bold text-sm hover:bg-black"
        >
          <span className="material-symbols-outlined text-emerald-400">engineering</span> Dev Panel
          <span className={`w-2 h-2 rounded-full ${draft.is_maintenance_active ? 'bg-amber-400' : 'bg-emerald-400'}`} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[9998] w-[min(380px,calc(100vw-16px))] max-h-[min(84vh,760px)] flex flex-col rounded-[20px] bg-white dark:bg-gray-900 shadow-[0_16px_48px_rgba(0,0,0,0.28)] border border-gray-200 dark:border-gray-800 overflow-hidden animate-scale-in">
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
            <span className="material-symbols-outlined">engineering</span>
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-black leading-none text-sm">Developer Control Panel</p>
            <p className="text-xs opacity-80">Maintenance Mode — เห็นเฉพาะผู้พัฒนา</p>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center border border-white/20"
            aria-label="ย่อแผง"
          >
            <span className="material-symbols-outlined text-lg">expand_more</span>
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* toggle */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full ${draft.is_maintenance_active ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">
                  {draft.is_maintenance_active ? 'เปิดโหมดปิดปรับปรุง' : 'ปิดโหมดปิดปรับปรุง (เปิดเว็บปกติ)'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ผู้ใช้ทั่วไปจะเห็นหน้า Maintenance เมื่อเปิด</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={draft.is_maintenance_active}
                onChange={(e) => setDraft((d) => ({ ...d, is_maintenance_active: e.target.checked }))}
              />
              <span className="w-[52px] h-[30px] bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:bg-amber-500 transition relative after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[24px] after:w-[24px] after:transition-all peer-checked:after:translate-x-[22px] block" />
            </label>
          </div>

          {/* title */}
          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-emerald-600">title</span> หัวข้อแจ้งเตือน
            </label>
            <input
              value={draft.maintenance_title}
              onChange={(e) => setDraft((d) => ({ ...d, maintenance_title: e.target.value }))}
              maxLength={200}
              placeholder={DEFAULT_SETTINGS.maintenance_title}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
            />
            <p className="text-[11px] text-gray-400 mt-1 text-right">{draft.maintenance_title.length}/200</p>
          </div>

          {/* message */}
          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-emerald-600">chat_bubble</span> เนื้อหาข้อความ
            </label>
            <textarea
              value={draft.maintenance_message}
              onChange={(e) => setDraft((d) => ({ ...d, maintenance_message: e.target.value }))}
              maxLength={1000}
              rows={4}
              placeholder={DEFAULT_SETTINGS.maintenance_message}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1 text-right">{draft.maintenance_message.length}/1000</p>
          </div>

          {msg && (
            <div className={`text-xs px-3 py-2 rounded-xl border ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400'}`}>
              {msg.text}
            </div>
          )}
        </div>

        {/* footer actions */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span className="material-symbols-outlined text-lg">visibility</span> ดูตัวอย่าง
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-black shadow shadow-emerald-600/20"
            >
              {saving ? (
                <>
                  <span className="loading loading-spinner loading-xs" /> กำลังบันทึก
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">save</span> บันทึกการตั้งค่า
                </>
              )}
            </button>
          </div>
          <button
            onClick={handleExit}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-100"
          >
            <span className="material-symbols-outlined text-base">logout</span> ออกจากโหมดผู้พัฒนา (ปิด Bypass)
          </button>
          <p className="text-[11px] text-gray-400 text-center leading-relaxed">
            ออกจาก bypass แล้วจะเห็นหน้า Maintenance เหมือนผู้ใช้ทั่วไป — เข้าใหม่ด้วย <code className="px-1 py-0.5 rounded bg-white dark:bg-gray-900 border text-[11px]">?dev_secret=LPWELL2026</code>
          </p>
        </div>
      </div>

      <MaintenancePreviewModal open={previewOpen} title={draft.maintenance_title} message={draft.maintenance_message} onClose={() => setPreviewOpen(false)} />
    </>
  );
}
