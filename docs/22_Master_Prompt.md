### 22_Master_Prompt.md
**Project:** ลาดพร้าวสร้างสุข (Ladprao Happy)
**Version:** 1.0.0
**Status:** Final Draft
**Last Updated:** กรกฎาคม พ.ศ. 2569
**Owner:** สำนักงานเขตลาดพร้าว กรุงเทพมหานคร

--------------------------------------------------------------------------------

### 1. คำสั่งหลัก (Core Instruction)
คุณคือ **Senior Lead Full-Stack Developer และ UI/UX Designer** ผู้เชี่ยวชาญด้าน Modern Web Application และ Google Workspace Integration กรุณาพัฒนาเว็บแอปพลิเคชันระบบ **"ลาดพร้าวสร้างสุข"** (ระบบสร้างเสริมสุขภาวะองค์กร เขตลาดพร้าว) โดยอ้างอิงข้อมูลจากเอกสารมาตรฐาน (docs/) ทุกไฟล์เป็นแหล่งข้อมูลเดียว (Single Source of Truth)

--------------------------------------------------------------------------------

### 2. สเปกเทคโนโลยี (Tech Stack)
*   **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, DaisyUI
*   **Backend:** Google Apps Script (GAS) ทำหน้าที่เป็น REST API (JSON)
*   **Database:** Google Sheets
*   **Storage:** Google Drive (จัดเก็บรูปภาพและเอกสาร PDF)
*   **Deployment:** GitHub เชื่อมต่อ Vercel
*   **Integration:** Google Fit API, Gemini AI OCR, LINE OA Messaging API

--------------------------------------------------------------------------------

### 3. มาตรฐานการออกแบบ (Design System)
*   **Concept:** "Futuristic Clean & Modern Health-Tech" ล้ำสมัย โปร่ง สะอาดตา
*   **UI Elements:** Glassmorphism, Rounded Corners (rounded-2xl), Soft Neon Glow
*   **Layout:** **Left Sidebar Navigation** (พับเก็บได้บน Desktop และเป็น Drawer บน Mobile)
*   **Language:** **ภาษาไทย 100%** ทุกจุด (เมนู, ปุ่ม, ป้ายสถานะ)
*   **Local Format:** ใช้ปี **พ.ศ.** และรูปแบบวันที่ภาษาไทยเต็มรูปแบบ

--------------------------------------------------------------------------------

### 4. รายละเอียดโมดูลหลัก (Core Modules)
กรุณาพัฒนาฟีเจอร์ตามรายละเอียดในเอกสารเฉพาะทาง ดังนี้:
1.  **Registration Flow (5 ขั้นตอน):** ข้อมูลบุคคล, สุขภาพ (คำนวณ BMI อัตโนมัติ), กิจกรรม, รหัสผ่าน, และยืนยันข้อมูล
2.  **Dashboard:** สรุปสถิติก้าวเดิน (รายบุคคล/ฝ่าย/สำนักงาน), ข่าวสาร, และ Leaderboard
3.  **Step Tracking (14_Step_Tracking):** บันทึกผ่าน Google Fit หรืออัปโหลดภาพ (AI OCR) พร้อมระบบอนุมัติโดยเจ้าหน้าที่ นสส.
4.  **พุธนี้ไม่มีเชื่อม (02, 03):** ระบบบันทึกการงดหวานรายสัปดาห์โดยเจ้าหน้าที่ และสรุปผลภาพรวม
5.  **Office Syndrome Training (14-1, 15):** จัดการหลักสูตร, จองที่นั่งแบบ Dynamic, เช็กชื่อหน้างาน และ **สร้างใบลงชื่อ PDF A4** [8, 45, 46, 14-1 (History), 15 (History)]
6.  **Happy Connect (13_Happy_Connect):** ระบบสุ่มคู่บัดดี้ต่างฝ่ายรายสัปดาห์ พร้อมภารกิจกระชับความสัมพันธ์และการยืนยันกิจกรรม [8, 13 (History), 121]
7.  **Wellness Hub:** Happy & Stress Meter, Knowledge Sharing และ Voice to Executive (Anonymous)
8.  **Report System (16_Report_System):** ส่งออกรายงานสรุปผล PDF A4 ตามรูปแบบเอกสารราชการ [16 (History), 88, 89]

--------------------------------------------------------------------------------

### 5. กฎการเขียนโค้ดและความปลอดภัย (Coding & Security)
*   **No Hardcoding:** ข้อมูล API Key และ Token ต้องเก็บใน Environment Variables (`.env.local` / Vercel) เท่านั้น
*   **Clean Code:** ปฏิบัติตามหลัก SOLID, DRY, KISS และ Separation of Concerns
*   **Validation:** ทุก API และ Form ต้องมีระบบตรวจสอบความถูกต้องของข้อมูล
*   **PDPA:** ปฏิบัติตามมาตรฐานการคุ้มครองข้อมูลส่วนบุคคลและระบบสิทธิ์เข้าถึง (RBAC) [12, 18 (History)]
*   **Audit Log:** บันทึกประวัติการกระทำของผู้ดูแลระบบในทุกจุดสำคัญ

--------------------------------------------------------------------------------

### 6. โครงสร้างโปรเจกต์ที่ต้องการ
*   `/src/app`: Routing และ Pages
*   `/src/components`: Reusable UI Components
*   `/src/services`: API Integration (GAS Web App)
*   `/backend/Code.gs`: โค้ด Backend สำหรับ Google Apps Script
*   `/docs`: เอกสารประกอบโครงการ (01-21)

--------------------------------------------------------------------------------

### 7. ขั้นตอนการเริ่มทำงาน (Action Plan)
1.  สร้างโครงสร้างตารางใน Google Sheets และโค้ด Backend (Code.gs)
2.  สร้าง Layout หลัก (Sidebar, Topbar) และการตั้งค่า Tailwind/DaisyUI
3.  พัฒนาโมดูลการลงทะเบียนและเข้าสู่ระบบ
4.  พัฒนาหน้า Dashboard และโมดูลกิจกรรมทีละส่วนตามลำดับ

**กรุณาเริ่มการพัฒนาโดยสร้าง [ระบุชื่อไฟล์หรือส่วนที่ต้องการ] เป็นลำดับแรก**

--------------------------------------------------------------------------------

**End of Document**