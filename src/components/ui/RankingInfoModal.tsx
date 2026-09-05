'use client';
import Modal from './Modal';
import { RANKING_CRITERIA_TEXT, RANKING_FORMULA_DETAIL } from '@/utils/stepsRanking';

export default function RankingInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="pr-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">i</span>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">เกณฑ์การจัดอันดับส่วนราชการ</h3>
        </div>
        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{RANKING_CRITERIA_TEXT.replace('ℹ️ ','')}</p>
        <div className="mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">สูตรคำนวณ</p>
          <pre className="text-xs leading-relaxed text-blue-900 dark:text-blue-200 whitespace-pre-wrap font-mono">{RANKING_FORMULA_DETAIL}</pre>
          <p className="text-[11px] text-blue-700/70 dark:text-blue-300/70 mt-2">Department Score = S_total ÷ N_registered • ไม่ตัดเพดานรายวัน • ผู้ที่ส่ง 0 ก้าวก็นับเป็นตัวหารเพื่อความโปร่งใส</p>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">รายบุคคล/เดอะแบกคิดจากก้าวจริง 100% ไม่ตัดเพดานเช่นกัน</p>
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold">เข้าใจแล้ว</button>
        </div>
      </div>
    </Modal>
  );
}
