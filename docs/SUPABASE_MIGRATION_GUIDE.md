# Supabase Migration Guide — Google Sheet -> Supabase

## ภาพรวม
- เดิม: Google Sheet + GAS (`NEXT_PUBLIC_GAS_API_URL`)
- ใหม่: Supabase Postgres (`NEXT_PUBLIC_SUPABASE_URL`)
- ไฟล์สคีมา: `docs/supabase_full_migration.sql` (รันครั้งเดียว)
- สคริปต์ย้ายข้อมูล: `scripts/migrate-sheets-to-supabase.mjs` (ดึงจาก GAS แล้ว upsert)

---

## ขั้นตอนทีละขั้น (ทำตามลำดับ)

### ขั้น 1-3: เชื่อม Supabase (ทำแล้วข้ามได้)
1. สร้าง Project ที่ supabase.com (Singapore)
2. เติม ENV 3 ตัวใน `.env.local` + Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
3. รัน `docs/supabase_system_settings.sql` ใน SQL Editor -> `select * from system_settings;` ต้องได้ 1 แถว

### ขั้น 4: สร้างตารางทั้งหมด (ครั้งเดียว)
1. Supabase > SQL Editor > New query
2. เปิด `docs/supabase_full_migration.sql` > Ctrl+A > Copy > วาง > Run
3. ตรวจ: `select table_name from information_schema.tables where table_schema='public' order by table_name;`
   ต้องเห็น `users`, `steps_log`, `sweet_free`, `baseline_records`, `weight_after_records`, `project_settings`, `google_fit_links`, `system_settings`

### ขั้น 5: ย้ายข้อมูล (เลือกวิธีใดวิธีหนึ่ง)

#### วิธี A: อัตโนมัติผ่าน GAS (แนะนำ — ไม่ต้อง Export มือ)
```bash
# ในเครื่อง dev (ต้องมี ENV ครบ)
npm install  # มี @supabase/supabase-js แล้ว
node scripts/migrate-sheets-to-supabase.mjs
# สคริปต์จะ GET /?path=users, /?path=steps, /?path=sweet-free จาก GAS แล้ว upsert ทีละ 500 แถว
# แปลง พ.ศ. -> ค.ศ. อัตโนมัติ
```
- ถ้า GAS มี path อื่น (เช่น `baseline`) เติมในสคริปต์ได้
- รันซ้ำได้ (upsert บน PK)

#### วิธี B: CSV มือ (ถ้า GAS ช้า/อยากตรวจก่อน)
1. Google Sheet > File > Download > CSV ทีละชีท
2. แปลง พ.ศ. -> ค.ศ.: ใน Sheet เพิ่มคอลัมน์ `=DATE(YEAR(A2)-543,MONTH(A2),DAY(A2))` แล้ว copy เป็น value
3. Supabase > Table Editor > เลือกตาราง > Insert > Import CSV > Map column > Import

### ขั้น 6: Verify
```sql
select count(*) from users;          -- ควรตรงกับจำนวนแถวใน Sheet Users
select count(*) from steps_log;
select count(*) from sweet_free;
select * from users limit 3;
select department, count(*) from users group by department; -- 11 ฝ่าย
```

### ขั้น 7: สลับ App มาใช้ Supabase (ทำหลัง Verify)
- ตอนนี้ `src/services/api.ts` ยังเรียก GAS — ถ้าพอใจข้อมูลแล้ว ค่อยเปลี่ยน `fetchData('users')` ให้เรียก Supabase ผ่าน `src/lib/supabase.ts`
- แนะนำทำแบบค่อยเป็นค่อยไป: ให้ระบบอ่านจาก Supabase ก่อน, เขียนพร้อมกัน GAS+Supabase 1 สัปดาห์, แล้วค่อยปิด GAS

---

## FAQ
- **NEXT_PUBLIC_ ปลอดภัยไหม?** `URL` + `anon` ตั้งใจ public (RLS ป้องกัน) ส่วน `service_role` ห้ามมี `NEXT_PUBLIC_` (ดู `src/lib/supabase.ts:7`)
- **รูป Drive ทำไง?** `image_drive_id` เก็บต่อได้ — ถ้าจะย้ายถาวรให้สร้าง Storage bucket `steps-images` แล้วอัปโหลด
- **รันสคริปต์ error?** เช็คว่า `NEXT_PUBLIC_GAS_API_URL` เปิดได้ใน browser (`?path=users` ต้องได้ JSON)
