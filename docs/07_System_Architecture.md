### 07_System_Architecture.md
**Project:**  ลาดพร้าวสร้างสุข (Ladprao Happy)
**Version:**  1.0.0
**Status:**  Draft
**Last Updated:**  กรกฎาคม พ.ศ. 2569
**Owner:**  สำนักงานเขตลาดพร้าว กรุงเทพมหานคร

--------------------------------------------------------------------------------

### 1. วัตถุประสงค์
เอกสารฉบับนี้อธิบายสถาปัตยกรรมระบบ (System Architecture) ของแอปพลิเคชัน "ลาดพร้าวสร้างสุข" โดยครอบคลุมถึงโครงสร้างการจัดวางซอฟต์แวร์ การเลือกใช้เทคโนโลยี และการเชื่อมต่อระหว่างส่วนประกอบต่างๆ เพื่อให้ระบบทำงานได้อย่างมีประสิทธิภาพ มั่นคงปลอดภัย และรองรับการขยายตัวในอนาคต

--------------------------------------------------------------------------------

### 2. ภาพรวมสถาปัตยกรรม (Architecture Overview)
ระบบถูกออกแบบภายใต้สถาปัตยกรรมแบบ **Modern Web Application** ที่แยกส่วนการทำงานระหว่างหน้าบ้าน (Frontend) และหลังบ้าน (Backend) โดยเน้นการใช้บริการ Cloud-based ที่คุ้มค่าและจัดการง่าย

*   **Pattern:** Client-Server Architecture (REST API)
*   **Infrastructure:** Serverless Deployment
*   **Concept:** Single Organization, Single Tenant

--------------------------------------------------------------------------------

### 3. ส่วนประกอบของระบบ (System Components)

#### 3.1 Frontend Layer (Next.js App Router)
ส่วนติดต่อผู้ใช้งานที่เน้นความเร็วและความล้ำสมัย (Futuristic Clean):
*   **Framework:** Next.js (App Router) และ React
*   **Styling:** Tailwind CSS และ DaisyUI
*   **Language:** TypeScript
*   **Hosting:** Vercel (เชื่อมต่อกับ GitHub Repository)

#### 3.2 Backend Layer (Google Apps Script API)
ส่วนประมวลผลกลางที่ทำหน้าที่เป็น REST API Web App:
*   **Technology:** Google Apps Script (GAS)
*   **Functions:** จัดการคำขอผ่าน `doGet` และ `doPost`, ประมวลผลลอจิกทางธุรกิจ และเชื่อมต่อฐานข้อมูล
*   **Security:** ตรวจสอบสิทธิ์ (Authentication) และกำหนดสิทธิ์การเข้าถึงข้อมูลตามบทบาท (RBAC)

#### 3.3 Data & Storage Layer (Google Workspace)
ใช้ทรัพยากรของ Google ในการจัดเก็บข้อมูลทั้งหมด:
*   **Database:** **Google Sheets** ทำหน้าที่เป็นฐานข้อมูลหลัก (Relational-like structure)
*   **File Storage:** **Google Drive** ใช้เก็บรูปภาพแคปหน้าจอนับก้าว, ไฟล์ PDF รายงาน และโลโก้โครงการ

--------------------------------------------------------------------------------

### 4. การเชื่อมต่อระบบภายนอก (Integration Layer)
ระบบมีการเชื่อมต่อกับบริการภายนอกเพื่อเพิ่มขีดความสามารถ:
*   **Google Fit API:** ดึงข้อมูลการนับก้าวโดยตรงจากอุปกรณ์ของผู้ใช้
*   **Gemini OCR (AI Studio):** ใช้โมเดล Gemini 1.5 Pro/Flash ในการสกัดตัวเลขจำนวนก้าวจากภาพถ่ายแคปหน้าจอ
*   **LINE OA Messaging API:** ส่งการแจ้งเตือนข่าวสาร (Notification) และแจ้งเตือนภารกิจ Happy Connect

--------------------------------------------------------------------------------

### 5. ผังการไหลของข้อมูล (Data Flow Summary)
1.  **User Interaction:** ผู้ใช้ใช้งานผ่านหน้าเว็บ Next.js ที่รันอยู่บน Vercel
2.  **API Request:** Frontend ส่งคำขอ (JSON) ไปยัง GAS Web App URL
3.  **Processing & AI:** หากเป็นการอัปโหลดรูปภาพ GAS จะส่งภาพไปให้ Gemini OCR วิเคราะห์ข้อมูล
4.  **Data Persistence:** ข้อมูลจะถูกบันทึกลงใน Google Sheets และรูปภาพจะถูกเก็บใน Google Drive
5.  **External Notification:** เมื่อมีการประกาศข่าวหรือจับคู่สำเร็จ ระบบจะสั่งการผ่าน LINE Messaging API ไปยังมือถือของผู้ใช้

--------------------------------------------------------------------------------

### 6. มาตรฐานความปลอดภัย (Security Architecture)
*   **Environment Variables:** ข้อมูลสำคัญ เช่น API Keys และ Token จะถูกเก็บไว้ใน Vercel Environment Variables ไม่เก็บไว้ในโค้ด
*   **Data Protection:** ปฏิบัติตามหลัก PDPA ในการเข้าถึงและแสดงผลข้อมูลส่วนบุคคล
*   **Audit Logging:** บันทึกประวัติการกระทำที่สำคัญของผู้ดูแลระบบลงใน Google Sheets

--------------------------------------------------------------------------------

### 7. เอกสารอ้างอิง
*  01_Project_Overview.md
*  03_Functional_Requirements.md
*  04_Non_Functional_Requirements.md
*  06_System_Workflow.md
*  09_Database_Design.md

--------------------------------------------------------------------------------

**End of Document**