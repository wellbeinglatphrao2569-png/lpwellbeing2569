export default function Footer() {
  return (
    <footer className="px-4 md:px-6 py-2.5">
      <div className="max-w-6xl mx-auto w-full">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-800/40 backdrop-blur-sm px-4 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          {/* เครดิตผู้พัฒนา */}
          <div className="flex items-start gap-2 min-w-0">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-lg mt-px shrink-0">code</span>
            <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed min-w-0">
              <span className="font-bold text-gray-900 dark:text-white">พัฒนาโดย</span>{' '}
              <span className="whitespace-normal">นายรัชชานนท์ ประจงกิจ · เจ้าพนักงานธุรการปฏิบัติงาน ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว</span>
              <br />
              <span className="text-gray-400">ร่วมกับ</span>{' '}
              <span className="inline-flex items-center gap-1 font-bold text-gray-900 dark:text-white">
                <span className="material-symbols-outlined text-sm text-purple-500 dark:text-purple-400">psychology</span>
                Open Code (AI)
              </span>
            </p>
          </div>

          {/* ติดต่อ/แจ้งปัญหา */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-lg">call</span>
            <div>
              <p className="text-[11px] text-gray-600 dark:text-gray-300">ติดต่อ / แจ้งปัญหา</p>
              <p className="text-sm font-black text-gray-900 dark:text-white tabular-nums">082 708 6972</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}