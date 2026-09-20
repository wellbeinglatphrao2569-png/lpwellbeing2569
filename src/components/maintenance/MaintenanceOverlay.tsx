'use client';

export default function MaintenanceOverlay({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-emerald-900 via-teal-800 to-cyan-900 px-4 py-8 overflow-y-auto">
      {/* bg decorations */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-[520px] h-[520px] bg-emerald-400/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] bg-cyan-400/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[420px] bg-white/5 rounded-full blur-2xl" />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* logo + brand */}
        <div className="flex flex-col items-center gap-3 mb-6 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl bg-white shadow-xl shadow-black/20 flex items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo.png" alt="LP Well-being" className="w-full h-full object-contain rounded-xl" />
          </div>
          <div className="text-center">
            <h2 className="text-white font-extrabold tracking-wide text-lg">ลาดพร้าวสร้างสุข</h2>
            <p className="text-emerald-200/70 text-xs tracking-[0.2em]">LADPRAO HAPPY — LP Well-being</p>
          </div>
        </div>

        <div className="bg-white/95 dark:bg-gray-900/90 backdrop-blur-xl rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.35)] border border-white/30 overflow-hidden animate-scale-in">
          {/* top accent */}
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />
          <div className="p-7 md:p-10 text-center">
            <div className="mx-auto w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-5 shadow-inner">
              <span className="material-symbols-outlined text-3xl md:text-4xl text-amber-600 dark:text-amber-400">construction</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white leading-tight">{title}</h1>
            <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
            <p className="mt-4 text-sm md:text-base text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
              {message}
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 rounded-full border border-gray-200 dark:border-gray-700">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                ระบบจะกลับมาให้บริการเร็ว ๆ นี้
              </div>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-600/20 transition"
              >
                <span className="material-symbols-outlined text-lg">refresh</span> รีเฟรช
              </button>
            </div>

            <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
              ขออภัยในความไม่สะดวก — ทีมงานกำลังดูแลระบบให้ดีที่สุด
              <br />
              ติดต่อผู้ดูแล: สำนักงานเขตลาดพร้าว ฝ่ายพัฒนาชุมชนฯ
            </p>
          </div>

          <div className="px-6 md:px-10 pb-6">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-950/30 dark:to-cyan-950/20 border border-emerald-100 dark:border-emerald-900/30 p-4 flex items-start gap-3 text-left">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 mt-0.5">info</span>
              <div className="text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                <p className="font-bold text-gray-900 dark:text-white">สำหรับผู้พัฒนา</p>
                <p className="mt-1 opacity-80">
                  เติม <code className="px-1.5 py-0.5 rounded bg-white dark:bg-gray-800 border text-[11px]">?dev_secret=LPWELL2026</code> ต่อท้าย URL เพื่อเข้าสู่โหมดผู้พัฒนา
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-emerald-200/60 mt-4">© 2569 สำนักงานเขตลาดพร้าว กรุงเทพมหานคร</p>
      </div>
    </div>
  );
}
