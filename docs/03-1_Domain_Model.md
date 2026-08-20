### 03-1_Domain_Model.md
**Project:** ลาดพร้าวสร้างสุข (Ladprao Happy)
**Version:** 1.1.0 (Updated)
**Status:** Draft
**Last Updated:** กรกฎาคม พ.ศ. 2569
**Owner:** สำนักงานเขตลาดพร้าว กรุงเทพมหานคร

--------------------------------------------------------------------------------

### 1. วัตถุประสงค์
เอกสารฉบับนี้กำหนดโครงสร้างข้อมูลและความสัมพันธ์ (Domain Model) เพื่อให้ระบบทำงานสอดคล้องกันทุกส่วน ตั้งแต่ฐานข้อมูล Google Sheets ไปจนถึงการแสดงผลบน Dashboard และการออกรายงาน PDF A4

--------------------------------------------------------------------------------

### 2. ขอบเขตของ Domain
ระบบนี้เป็นแบบ **Single Organization** สำหรับสำนักงานเขตลาดพร้าวเท่านั้น ข้อมูลต้องถูกจัดการภายใต้ความปลอดภัยระดับองค์กรและสอดคล้องกับหลัก **PDPA** [4, 12, 18 (History)]

--------------------------------------------------------------------------------

### 3. Domain Overview (ภาพรวมหน่วยข้อมูล)
1. **User Management:** User, Department, User Role, PDPA Consent [30, 31, 18 (History)]
2. **Health Activities:** Step Record, Sweet-Free Wednesday
3. **Training & Learning:** Training Course, Training Round, Attendance [32, 14-1 (History)]
4. **Engagement & Relationship:** Happy Connect (Buddy Match), Mission, Voice to Executive
5. **Gamification:** Points, Badge, Level, Leaderboard
6. **System Admin:** News, Report, Project Settings, Audit Log [34, 17 (History)]

--------------------------------------------------------------------------------

### 4. Domain Definitions (นิยามหน่วยข้อมูล)

#### 4.1 User & Identity
*   **User:** บุคลากรประกอบด้วย ชื่อ-สกุล, ชื่อเล่น, เลขบัตรประชาชน (Login), รหัสผ่าน (Hashed), สังกัดฝ่าย, ตำแหน่ง, ข้อมูลสุขภาพ (BMI, รอบเอว)
*   **User Role:** แบ่งเป็น Admin (นสส.), Executive, Department Head และ Employee เพื่อกำหนดสิทธิ์เข้าถึง (RBAC) [30, 18 (History)]

#### 4.2 Health & Activities
*   **Step Record:** ข้อมูลจำนวนก้าว รายวัน/รายสัปดาห์/รายเดือน มาจาก Google Fit (Locked) หรือ AI OCR (Pending Approval)
*   **Sweet-Free Wednesday:** บันทึกสถานะ 🟢/🔴 โดยเจ้าหน้าที่ นสส. เพื่อสรุปผลรายฝ่ายและเขต

#### 4.3 Office Syndrome Training (โมดูลอบรม)
*   **Course & Round:** หลักสูตรที่มีความยืดหยุ่น กำหนดวัน เวลา สถานที่ และจำนวนที่นั่ง (Capacity) [8, 15 (History)]
*   **Attendance:** บัญชีรายชื่อผู้เข้าร่วม โดยเจ้าหน้าที่ นสส. เท่านั้นที่เป็นคนเช็กชื่อ (Check-in) และสร้างใบลงชื่อ PDF A4 [14-1 (History), 15 (History)]

#### 4.4 Happy Connect (Buddy Matching)
*   **Buddy Match:** การจับคู่บุคลากร **"ต่างฝ่าย"** อัตโนมัติทุกสัปดาห์
*   **Mission:** ภารกิจรายสัปดาห์ (เช่น Coffee Talk, Step Buddy) ที่ต้องยืนยันร่วมกันเพื่อรับคะแนน

#### 4.5 Gamification & Ranking (หัวใจของ Dashboard)
*   **Points:** คะแนนสะสมจากการเดิน, การงดหวาน, การเข้าอบรม (เฉพาะผู้มาจริง), และการทำภารกิจ Buddy [24, 14-1 (History)]
*   **Level & Ranking:** การจัดลำดับชั้น (Level) ของสมาชิกตามคะแนนสะสม เพื่อแสดงผล **Top 3 Individual** และ **Top 3 Department Leaderboard** บนแดชบอร์ด [24, 02 (History), 03 (History)]
*   **Badge:** เข็มเชิดชูเกียรติสำหรับผู้ทำกิจกรรมสม่ำเสมอ

#### 4.6 Governance & Administration
*   **Audit Log:** บันทึกประวัติการแก้ไขข้อมูลสำคัญและการอนุมัติของ Admin [12, 17 (History)]
*   **Project Settings:** ค่าตัวแปรระบบ เช่น เป้าหมายก้าวเดิน (8,000 ก้าว), วันเริ่ม-จบโครงการ [64, 17 (History)]

--------------------------------------------------------------------------------

### 5. Domain Relationship (ความสัมพันธ์)
**Department** 1 --- N **User**
**User** 1 --- N **Step Record**
**User** 1 --- N **Attendance** --- 1 **Training Round**
**User (A)** 1 --- 1 **Buddy Match** --- 1 **User (B)** (ต้องต่างฝ่าย)
**User** 1 --- 1 **Gamification (Points/Level)** --- 1 **Leaderboard**

--------------------------------------------------------------------------------

### 6. Business Constraints (ข้อจำกัดทางธุรกิจ)
*   **PDPA:** ข้อมูลสุขภาพ (น้ำหนัก/ส่วนสูง) เป็นความลับ ดูได้เฉพาะเจ้าตัวและเจ้าหน้าที่ที่ได้รับสิทธิ์ [12, 18 (History)]
*   **Attendance Points:** คะแนนการอบรมจะมอบให้เฉพาะผู้ที่ Admin เช็กชื่อว่า "เข้าอบรมแล้ว" (Attended) เท่านั้น [14-1 (History)]
*   **Step Verification:** ก้าวเดินจากรูปภาพจะไม่ถูกคำนวณจนกว่า Admin จะกด Approve

--------------------------------------------------------------------------------

### 7. เอกสารที่เกี่ยวข้อง
*  02_Business_Requirements.md
*  03_Functional_Requirements.md
*  14_Step_Tracking.md
*  14-1_Office_Syndrome_Training.md
*  17_Project_Settings.md

--------------------------------------------------------------------------------
**End of Document**