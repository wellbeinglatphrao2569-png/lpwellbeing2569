### 09_Google_Sheet_Schema
**Project:**  ลาดพร้าวสร้างสุข (Ladprao Happy)
**Version:**  1.0.0
**Status:**  Draft
**Last Updated:**  กรกฎาคม พ.ศ. 2569
**Owner:**  สำนักงานเขตลาดพร้าว กรุงเทพมหานคร

--------------------------------------------------------------------------------

### 1. วัตถุประสงค์
เอกสารฉบับนี้กำหนดรายละเอียดของฟิลด์ข้อมูล (Field Specifications) ประเภทข้อมูล (Data Types) และคำอธิบายในระดับคอลัมน์ สำหรับฐานข้อมูล Google Sheets เพื่อให้ทีมพัฒนาสามารถสร้างระบบ Backend (GAS) และ Frontend ได้อย่างแม่นยำและสอดคล้องกัน

--------------------------------------------------------------------------------

### 2. รายละเอียด Schema รายตาราง

#### 2.1 ตาราง Users (บุคลากรและคะแนนสะสม)
| คอลัมน์ | ชื่อฟิลด์ | ประเภทข้อมูล | คำอธิบาย/เงื่อนไข |
| :--- | :--- | :--- | :--- |
| A | `User_ID` | String | เลขบัตรประชาชน (Primary Key) |
| B | `Prefix` | String | คำนำหน้าชื่อ (นาย, นาง, นางสาว) |
| C | `Full_Name` | String | ชื่อ-นามสกุล |
| D | `Nickname` | String | ชื่อเล่น |
| E | `Position` | String | ตำแหน่งงาน |
| F | `Department` | String | ฝ่ายสังกัด (1 ใน 11 ฝ่าย) |
| G | `Birth_Date` | Date | วันเกิด (รูปแบบ พ.ศ.) |
| H | `Gender` | String | เพศกำเนิด |
| I | `LGBTQ_Identity` | String | เพศสภาพ (เช่น Man, Woman, Non-binary, LGBTQ+) |
| J | `Weight_kg` | Number | น้ำหนักปัจจุบัน (กก.) |
| K | `Height_cm` | Number | ส่วนสูง (ซม.) |
| L | `BMI_Value` | Number | ค่า BMI (คำนวณอัตโนมัติ) |
| M | `Waist_Inch` | Number | รอบเอว (นิ้ว) |
| N | `Role` | String | สิทธิ์ (Admin, Executive, Head, Employee) |
| O | `Password` | String | รหัสผ่านที่เข้ารหัส (Hashed) |
| P | `Total_Points` | Number | คะแนนสะสมรวม (Gamification) |
| Q | `Level` | Number | ระดับปัจจุบันของผู้ใช้ |

#### 2.2 ตาราง Steps_Log (บันทึกการนับก้าว)
| คอลัมน์ | ชื่อฟิลด์ | ประเภทข้อมูล | คำอธิบาย/เงื่อนไข |
| :--- | :--- | :--- | :--- |
| A | `Record_ID` | String | รหัสบันทึก (UUID) |
| B | `User_ID` | String | รหัสผู้ใช้ (FK: Users) |
| C | `Date_Thai` | Date | วันที่นับก้าว (พ.ศ.) |
| D | `Steps_Count` | Number | จำนวนก้าว |
| E | `Record_Method` | String | วิธี (Google Fit / Manual OCR) |
| F | `Image_Drive_ID`| String | ID ไฟล์รูปภาพใน Google Drive (ถ้ามี) |
| G | `Status` | String | สถานะ (Pending, Approved, Rejected) |
| H | `Week_Number` | Number | ลำดับสัปดาห์ในปี (1-52) |
| I | `Auditor_ID` | String | รหัส Admin ที่เป็นผู้อนุมัติ |

#### 2.3 ตาราง Sweet_Free (พุธนี้ไม่มีเชื่อม)
| คอลัมน์ | ชื่อฟิลด์ | ประเภทข้อมูล | คำอธิบาย/เงื่อนไข |
| :--- | :--- | :--- | :--- |
| A | `Entry_ID` | String | รหัสบันทึก |
| B | `User_ID` | String | รหัสผู้ใช้ (FK: Users) |
| C | `Wednesday_Date`| Date | วันพุธที่บันทึก (พ.ศ.) |
| D | `Status` | Boolean | TRUE (งดได้) / FALSE (งดไม่ได้) |
| E | `Logged_By` | String | รหัสเจ้าหน้าที่ นสส. ผู้บันทึก |

#### 2.4 ตาราง Happy_Connect (การสุ่มคู่บัดดี้)
| คอลัมน์ | ชื่อฟิลด์ | ประเภทข้อมูล | คำอธิบาย/เงื่อนไข |
| :--- | :--- | :--- | :--- |
| A | `Match_ID` | String | รหัสการจับคู่ |
| B | `User_1_ID` | String | รหัสบุคลากรคนที่ 1 (FK: Users) |
| C | `User_2_ID` | String | รหัสบุคลากรคนที่ 2 (ต่างฝ่าย) |
| D | `Match_Date` | Date | วันที่สุ่มจับคู่ |
| E | `Mission_ID` | String | รหัสภารกิจที่สุ่มได้ |
| F | `Confirmation_1`| Boolean | การยืนยันของคนที่ 1 |
| G | `Confirmation_2`| Boolean | การยืนยันของคนที่ 2 |
| H | `Mission_Image` | String | ลิงก์รูปภาพทำกิจกรรมร่วมกัน |
| I | `Feedback_Score`| Number | คะแนนความพึงพอใจ (1-3) |

#### 2.5 ตาราง Voice_Executive (รับฟังเสียงบุคลากร)
| คอลัมน์ | ชื่อฟิลด์ | ประเภทข้อมูล | คำอธิบาย/เงื่อนไข |
| :--- | :--- | :--- | :--- |
| A | `Message_ID` | String | รหัสข้อความ |
| B | `User_ID` | String | รหัสผู้ส่ง (อาจว่างถ้าเป็น Anonymous) |
| C | `Category` | String | ประเภท (ปัญหา, ขอบคุณ, ขออภัย, พัฒนา) |
| D | `Content` | String | รายละเอียดข้อความ |
| E | `Is_Anonymous` | Boolean | TRUE (ไม่ระบุตัวตน) / FALSE (ระบุตัวตน) |
| F | `Timestamp` | DateTime | วันและเวลาที่ส่ง |

#### 2.6 ตาราง Audit_Log (ประวัติการใช้งาน Admin)
| คอลัมน์ | ชื่อฟิลด์ | ประเภทข้อมูล | คำอธิบาย/เงื่อนไข |
| :--- | :--- | :--- | :--- |
| A | `Log_ID` | String | รหัสประวัติ |
| B | `Admin_ID` | String | รหัสผู้กระทำ (FK: Users) |
| C | `Action_Type` | String | ประเภท (Approve Step, Delete News, Export) |
| D | `Target_ID` | String | รหัสอ้างอิงข้อมูลที่ถูกแก้ไข |
| E | `Timestamp` | DateTime | วันและเวลาที่เกิดเหตุการณ์ |

--------------------------------------------------------------------------------

### 3. ข้อกำหนดทางเทคนิค (Data Validation)
*   **DateFormat:** ทุกฟิลด์วันที่ให้เก็บเป็น `YYYY-MM-DD` ในฐานข้อมูล แต่แสดงผลเป็น "วว ดด พ.ศ." ใน UI
*   **Boolean:** ใน Google Sheets ให้ใช้ค่า `TRUE/FALSE` มาตรฐาน
*   **File URL:** ข้อมูลรูปภาพให้เก็บเป็น `Drive File ID` หรือ `Direct Link` เพื่อประหยัดพื้นที่

--------------------------------------------------------------------------------

### 4. เอกสารอ้างอิง
*  01_Project_Overview.md
*  03-1_Domain_Model.md
*  03_Functional_Requirements.md
*  08_Database_Design.md

--------------------------------------------------------------------------------

**End of Document**