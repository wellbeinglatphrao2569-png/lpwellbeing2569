### 20_Deployment_Guide.md
**Project:** ลาดพร้าวสร้างสุข (Ladprao Happy)
**Version:** 1.0.0
**Status:** Draft
**Last Updated:** กรกฎาคม พ.ศ. 2569
**Owner:** สำนักงานเขตลาดพร้าว กรุงเทพมหานคร

--------------------------------------------------------------------------------

### 1. วัตถุประสงค์
เอกสารฉบับนี้กำหนดขั้นตอนการติดตั้งและตั้งค่าระบบ (Deployment & Configuration) เพื่อให้เจ้าหน้าที่หรือทีมพัฒนาสามารถนำระบบ "ลาดพร้าวสร้างสุข" ขึ้นใช้งานจริงบนสภาพแวดล้อมที่กำหนดได้อย่างถูกต้องและปลอดภัย

--------------------------------------------------------------------------------

### 2. สิ่งที่ต้องเตรียม (Prerequisites)
ก่อนเริ่มการติดตั้ง ผู้ดูแลระบบต้องมีบัญชีและสิทธิ์การเข้าถึงเครื่องมือดังต่อไปนี้:
*   **Google Account:** สำหรับใช้งาน Google Sheets, Google Drive และ Google Apps Script
*   **GitHub Account:** สำหรับจัดเก็บซอร์สโค้ดโปรเจกต์
*   **Vercel Account:** สำหรับการทำ Hosting และ CI/CD ของ Frontend
*   **LINE Developers Account:** สำหรับจัดการ LINE Messaging API
*   **Google AI Studio API Key:** สำหรับใช้งาน Gemini OCR

--------------------------------------------------------------------------------

### 3. ขั้นตอนการติดตั้งส่วนหลังบ้าน (Backend Deployment)

#### 3.1 การตั้งค่า Google Sheets & Drive
1.  **ฐานข้อมูล:** สร้าง Google Sheets ตามโครงสร้างที่กำหนดใน `09_Google_Sheet_Schema.md`
2.  **พื้นที่เก็บข้อมูล:** สร้างโฟลเดอร์ใน Google Drive และตั้งค่าสิทธิ์ให้เป็น "ทุกคนที่มีลิงก์มีสิทธิ์อ่าน" (สำหรับดึงรูปภาพแสดงผล) หรือจัดการสิทธิ์ผ่าน GAS API

#### 3.2 การติดตั้ง Google Apps Script (GAS)
1.  เปิด Google Sheets ฐานข้อมูล -> ไปที่เมนู "ส่วนขยาย" -> "Apps Script"
2.  คัดลอกโค้ดจากไฟล์ `backend/Code.gs` ลงในโปรเจกต์
3.  กดเมนู **"ทำให้ใช้งานได้" (Deploy)** -> "การทำให้ใช้งานได้ใหม่" (New Deployment)
4.  เลือกประเภทเป็น **"เว็บแอป" (Web App)**
    *   Execute as: Me (เจ้าของชีท)
    *   Who has access: **Anyone** (เพื่อให้ Frontend เชื่อมต่อได้)
5.  คัดลอก **Web App URL** ที่ได้ เพื่อนำไปใช้เป็น API Endpoint ในระบบหน้าบ้าน

--------------------------------------------------------------------------------

### 4. ขั้นตอนการติดตั้งส่วนหน้าบ้าน (Frontend Deployment)

#### 4.1 การตั้งค่า GitHub
1.  สร้าง Repository ใหม่บน GitHub (เช่น `ladprao-happy-app`)
2.  Push ซอร์สโค้ด Next.js จากเครื่องพัฒนาขึ้นไปยัง GitHub

#### 4.2 การ Deployment บน Vercel
1.  ที่หน้า Dashboard ของ Vercel เลือก **"Add New Project"** -> **"Import"** จาก GitHub Repository ที่สร้างไว้
2.  ตั้งค่า **Environment Variables** ในหน้า Settings ของ Vercel ให้ครบถ้วน (ห้ามใส่ในโค้ดโดยตรง):
    *   `NEXT_PUBLIC_GAS_API_URL`: URL ของ GAS Web App ที่ได้จากข้อ 3.2
    *   `GEMINI_API_KEY`: API Key จาก Google AI Studio
    *   `LINE_CHANNEL_SECRET`: จาก LINE Developers
    *   `LINE_CHANNEL_ACCESS_TOKEN`: จาก LINE Developers
3.  กดปุ่ม **"Deploy"** และรอระบบทำการ Build จนเสร็จสิ้น

--------------------------------------------------------------------------------

### 5. การเชื่อมต่อบริการภายนอก (Integration Setup)
*   **LINE OA Webhook:** นำ URL ของ Vercel (หรือ GAS ตามสถาปัตยกรรมที่เลือก) ไปใส่ในช่อง Webhook URL ใน LINE Developers Console เพื่อรับเหตุการณ์จากผู้ใช้ [11, 15 (History)]
*   **Google Fit:** ตั้งค่า OAuth Client ID ใน Google Cloud Console และนำค่าไปใส่ในระบบตั้งค่าเพื่อให้บุคลากรสามารถเชื่อมต่อข้อมูลสุขภาพได้

--------------------------------------------------------------------------------

### 6. การตรวจสอบหลังการติดตั้ง (Post-Deployment Check)
1.  ทดสอบการลงทะเบียน 5 ขั้นตอน และตรวจสอบว่าข้อมูลลงใน Google Sheets ถูกต้องหรือไม่
2.  ทดสอบการอัปโหลดรูปภาพนับก้าว เพื่อดูว่าไฟล์ถูกเก็บใน Google Drive และ AI อ่านค่าได้หรือไม่
3.  ทดสอบการส่งข้อความแจ้งเตือนผ่าน LINE OA
4.  ตรวจสอบหน้า Dashboard ว่าสามารถดึงข้อมูลจากชีทมาแสดงผลได้ภายในเวลาที่กำหนด (ไม่เกิน 3 วินาที)

--------------------------------------------------------------------------------

### 7. เอกสารอ้างอิง
*  07_System_Architecture.md
*  09_Google_Sheet_Schema.md
*  11_Google_Apps_Script_API.md
*  15_Line_OA_Integration.md
*  18_Security_and_Privacy.md

--------------------------------------------------------------------------------

**End of Document**