# ลาดพร้าวสร้างสุข (Ladprao Happy)

> **ระบบสร้างเสริมสุขภาวะองค์กรของสำนักงานเขตลาดพร้าว กรุงเทพมหานคร**

![Version](https://img.shields.io/badge/version-1.0.0-green)
![Status](https://img.shields.io/badge/status-Planning-blue)
![Platform](https://img.shields.io/badge/platform-Web-success)
![Organization](https://img.shields.io/badge/Organization-สำนักงานเขตลาดพร้าว-0d9488)

---

# ภาพรวมโครงการ

**ลาดพร้าวสร้างสุข (Ladprao Happy)** เป็นเว็บแอปพลิเคชันสำหรับส่งเสริมและบริหารจัดการสุขภาวะของบุคลากรภายในสำนักงานเขตลาดพร้าว กรุงเทพมหานคร โดยรวบรวมกิจกรรมด้านสุขภาพกาย สุขภาพใจ ความสัมพันธ์ในองค์กร การสื่อสารภายใน และข้อมูลเชิงบริหารไว้ในระบบเดียว

ระบบถูกออกแบบให้เป็นศูนย์กลางของโครงการสร้างสุขภาวะองค์กร (Happy Workplace) เพื่อสนับสนุนการพัฒนาองค์กรด้วยข้อมูล (Data-Driven Organization) และสร้างวัฒนธรรมองค์กรแห่งความสุข

---

# วัตถุประสงค์ของโครงการ

- ส่งเสริมสุขภาพของบุคลากร
- สนับสนุนการเดินเฉลี่ยไม่น้อยกว่า **8,000 ก้าวต่อวัน**
- ส่งเสริมกิจกรรม **พุธนี้ไม่มีเชื่อม (งดน้ำหวานวันพุธ)**
- จัดการกิจกรรมอบรม **Office Syndrome**
- ส่งเสริมการสร้างความสัมพันธ์ระหว่างบุคลากรต่างฝ่าย
- เปิดพื้นที่ให้บุคลากรสะท้อนความคิดเห็นต่อผู้บริหาร
- สนับสนุนการตัดสินใจของผู้บริหารด้วย Dashboard
- จัดทำรายงานสรุปผลโครงการในรูปแบบเอกสารราชการ (A4 PDF)

---

# เป้าหมายของระบบ

## Happy Body

- เดินวันละ 8,000 ก้าว
- ส่งเสริมการออกกำลังกาย
- ลดพฤติกรรมเนือยนิ่ง
- ลดความเสี่ยงโรคไม่ติดต่อเรื้อรัง (NCDs)

## Happy Mind

- เพิ่มระดับความสุขในการทำงาน
- ลดความเครียด
- ส่งเสริมสุขภาพจิต

## Happy Relationship

- บุคลากรรู้จักเพื่อนร่วมงานต่างฝ่ายมากขึ้น
- สร้างกิจกรรมพบปะระหว่างฝ่าย
- ส่งเสริมการกล่าวคำขอบคุณและการสื่อสารเชิงบวก

## Happy Organization

- ผู้บริหารเข้าใจบุคลากรมากขึ้น
- ใช้ข้อมูลประกอบการตัดสินใจ
- ติดตามผลโครงการได้แบบ Real-time

---

# ขอบเขตของระบบ

ระบบนี้รองรับ **เฉพาะสำนักงานเขตลาดพร้าว กรุงเทพมหานคร**

> **Single Organization Architecture**

ไม่รองรับ

- Multi Organization
- Multi Tenant
- หลายสำนักงานเขต
- หลายหน่วยงาน

---

# กลุ่มผู้ใช้งาน

## 1. ผู้บริหาร

ประกอบด้วย

- ผู้อำนวยการเขตลาดพร้าว
- ผู้ช่วยผู้อำนวยการเขตลาดพร้าว
- หัวหน้าฝ่ายทุกฝ่าย

สิทธิ์

- ดู Dashboard
- ดูรายงาน
- ดูข้อมูลสถิติภาพรวม
- ดูข้อมูลเชิงวิเคราะห์

---

## 2. บุคลากร

ประกอบด้วย

- ข้าราชการกรุงเทพมหานคร
- ลูกจ้างกรุงเทพมหานคร

สิทธิ์

- ลงทะเบียน
- บันทึกก้าวเดิน
- เข้าร่วมกิจกรรม
- ลงทะเบียนอบรม
- อ่านข่าวสาร
- ตอบแบบประเมิน
- ส่งข้อเสนอแนะ
- ใช้งาน Happy Connect

---

## 3. ผู้ดูแลระบบ

นักจัดการงานสร้างสุขภาวะองค์กร

สิทธิ์

- จัดการข้อมูลบุคลากร
- อนุมัติผลก้าวเดิน
- สร้างข่าวประชาสัมพันธ์
- จัดการกิจกรรม
- จัดการการอบรม
- จัดการ Happy Connect
- ออกรายงาน
- ตั้งค่าระบบทั้งหมด

---

# โมดูลของระบบ

## Authentication

- Login
- Registration
- Forgot Password

---

## Dashboard

- ข่าวประชาสัมพันธ์
- Dashboard ส่วนบุคคล
- Dashboard ผู้บริหาร
- Leaderboard
- สถิติภาพรวม

---

## Step Tracking

- บันทึกก้าวเดิน
- OCR อ่านภาพ
- Google Fit
- ประวัติการเดิน

---

## Happy Body

- นับก้าว
- งดน้ำหวานวันพุธ
- Office Syndrome

---

## Office Syndrome Training

ระบบบริหารจัดการการอบรม

รองรับ

- เปิดหลักสูตร
- กำหนดวันอบรม
- กำหนดเวลา
- กำหนดสถานที่
- กำหนดจำนวนรอบ
- กำหนดจำนวนที่นั่ง
- ลงทะเบียน
- เปลี่ยนรอบ
- เช็กชื่อ
- ออกรายงาน

> หมายเหตุ:
> วัน เวลา สถานที่ จำนวนรอบ และจำนวนที่นั่ง **ไม่กำหนดตายตัวในระบบ** แต่ผู้ดูแลระบบสามารถกำหนดจากหน้า "จัดการการอบรม" ก่อนเปิดรับสมัครแต่ละครั้ง

---

## Happy Connect

ระบบจับคู่บุคลากรต่างฝ่าย

- จับคู่รายสัปดาห์
- ยืนยันการทำกิจกรรม
- ประเมินความสัมพันธ์
- สะสมคะแนน

---

## Wellness Hub

- Happy Meter
- Stress Meter
- Knowledge Sharing
- Voice to Executive

---

## News

- ข่าวประชาสัมพันธ์
- แจ้งเตือนหน้าแรก
- ส่ง LINE OA

---

## Reports

- รายงานก้าวเดิน
- รายงานสุขภาวะ
- รายงานผู้บริหาร
- PDF A4

---

## Admin

- จัดการสมาชิก
- จัดการกิจกรรม
- จัดการข่าว
- ตั้งค่าระบบ
- Audit Log

---

# เทคโนโลยีที่ใช้

## Frontend

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- DaisyUI

## Backend

- Google Apps Script (REST API)

## Database

- Google Sheets

## File Storage

- Google Drive

## Deployment

- GitHub
- Vercel

## Integration

- Google Fit
- Gemini OCR
- LINE OA Messaging API

---

# สถาปัตยกรรมระบบ

```text
Next.js Frontend

        │

 REST API (HTTPS)

        │

Google Apps Script

        │

Google Sheets

        │

Google Drive

        │

LINE OA
```

---

# โครงสร้างโปรเจกต์

```text
ladprao-happy/

├── docs/
├── prompts/
├── frontend/
├── backend-gas/
├── database/
├── public/
├── .github/
├── .env.example
├── README.md
└── LICENSE
```

---

# โครงสร้างเอกสาร

| ลำดับ | เอกสาร |
|--------|---------|
| README | ภาพรวมโครงการ |
| 01 | Project Overview |
| 02 | Business Requirements |
| 03 | Domain Model |
| 04 | Functional Requirements |
| 05 | Non Functional Requirements |
| 06 | User Roles |
| 07 | System Workflow |
| 08 | System Architecture |
| 09 | Database Design |
| 10 | Google Sheet Schema |
| 11 | Google Apps Script API |
| 12 | Frontend Architecture |
| 13 | UI/UX Guideline |
| 14 | Happy Connect |
| 15 | Step Tracking |
| 16 | Office Syndrome Training |
| 17 | LINE OA Integration |
| 18 | Report System |
| 19 | Project Settings |
| 20 | Security & Privacy |
| 21 | Test Plan |
| 22 | Deployment Guide |
| 23 | Coding Standards |
| 24 | Data Dictionary |
| 25 | API Contracts |
| 26 | Component Standards |
| 27 | Master Prompt |
| 28 | Changelog |
| 29 | Release Notes |
| 30 | Future Roadmap |

---

# หลักการออกแบบระบบ

- Responsive Design
- Mobile First
- Clean UI
- Futuristic Health-Tech Design
- Component-Based Architecture
- Reusable Components
- Type Safety
- Accessibility (WCAG)
- Dark Mode / Light Mode
- ภาษาไทย 100%
- รองรับปี พ.ศ.
- รองรับรูปแบบวันที่ภาษาไทย

---

# หลักการพัฒนา

- Clean Architecture
- SOLID Principles
- DRY (Don't Repeat Yourself)
- KISS (Keep It Simple)
- Separation of Concerns
- Secure by Default
- Maintainable Code
- Low Cost Infrastructure
- No Vendor Lock-in

---

# AI Development Rules

AI ทุกตัวที่ใช้พัฒนาโครงการนี้ต้องปฏิบัติตามกฎดังต่อไปนี้

1. อ่านเอกสารทั้งหมดในโฟลเดอร์ `docs/` ก่อนเริ่มเขียนโค้ด
2. ห้ามเปลี่ยน Business Requirement โดยไม่ได้รับอนุมัติ
3. ใช้ TypeScript สำหรับ Frontend
4. ห้าม Hardcode ข้อมูล
5. ใช้ Google Apps Script เป็น Backend
6. ใช้ Google Sheets เป็นฐานข้อมูลหลัก
7. ใช้ Google Drive สำหรับจัดเก็บไฟล์
8. ทุก Component ต้องสามารถนำกลับมาใช้ซ้ำได้
9. ทุก API ต้องมี Validation
10. ทุก Form ต้องตรวจสอบข้อมูลก่อนบันทึก
11. ทุกข้อความใน UI ต้องเป็นภาษาไทย
12. เขียนโค้ดในระดับ Production Ready

---

# Workflow การพัฒนา

```text
Phase 1
Project Documentation

↓

Phase 2
Database Design

↓

Phase 3
Google Apps Script API

↓

Phase 4
Frontend Development

↓

Phase 5
System Integration

↓

Phase 6
Testing & QA

↓

Phase 7
Deployment

↓

Phase 8
Production
```

---

# เป้าหมายด้านประสิทธิภาพ

- โหลดหน้าเว็บไม่เกิน 3 วินาที
- รองรับผู้ใช้งานพร้อมกันอย่างน้อย 500 คน
- Lighthouse Score มากกว่า 90
- รองรับ Desktop, Tablet และ Mobile

---

# Version History

| Version | วันที่ | รายละเอียด |
|---------|---------|------------|
| 1.0.0 | กรกฎาคม 2569 | เริ่มต้นโครงการและจัดทำเอกสารโครงสร้างระบบ |

---

# License

เอกสารและซอร์สโค้ดนี้จัดทำขึ้นเพื่อใช้ภายใน **สำนักงานเขตลาดพร้าว กรุงเทพมหานคร**

ห้ามนำไปใช้งานในองค์กรอื่นโดยไม่ได้รับอนุญาตจากเจ้าของโครงการ

---

# ผู้รับผิดชอบโครงการ

**หน่วยงาน**

สำนักงานเขตลาดพร้าว กรุงเทพมหานคร

**ผู้ดูแลระบบ**

นักจัดการงานสร้างสุขภาวะองค์กร

**โครงการ**

ลาดพร้าวสร้างสุข (Ladprao Happy)

---

> **"สร้างสุขภาวะ สร้างความสัมพันธ์ สร้างองค์กรแห่งความสุข"**