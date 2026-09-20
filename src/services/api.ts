// GAS removed — Supabase only (ข้อมูล GAS เก็บเป็น backup ใน Sheet)

// ---------- Supabase helpers ----------
function isSupabaseAvailable(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  return !!url && !!key;
}

// แปลง snake_case (Supabase) -> PascalCase (GAS) ให้ frontend ไม่ต้องแก้
function mapUserRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    User_ID: r.user_id, Prefix: r.prefix, Full_Name: r.full_name, Nickname: r.nickname,
    Position: r.position, Department: r.department, Birth_Date: r.birth_date, Gender: r.gender,
    Weight_kg: r.weight_kg, Height_cm: r.height_cm, BMI_Value: r.bmi_value, Waist_Inch: r.waist_inch,
    Role: r.role, Password: r.password, Total_Points: r.total_points, Level: r.level,
    Personnel_ID: r.personnel_id, Registration_Status: r.registration_status,
    Created_By: r.created_by, Created_Date: r.created_date,
    First_Name: r.first_name, Last_Name: r.last_name, Profile_Image: r.profile_image,
    Activities: r.activities, Step_Record_Mode: r.step_record_mode,
    Device_Token: r.device_token, Device_Updated_At: r.device_updated_at,
    LGBTQ_Identity: r.lgbtq_identity,
  };
}
function mapStepRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    Record_ID: r.record_id, User_ID: r.user_id, Date_Thai: r.date_thai, Steps_Count: r.steps_count,
    Submitted_Steps: r.submitted_steps, Record_Method: r.record_method, Image_Drive_ID: r.image_drive_id,
    Status: r.status, Week_Number: r.week_number, Auditor_ID: r.auditor_id, Reviewed_At: r.reviewed_at,
    Recorded_At: r.recorded_at, Reject_Reason: r.reject_reason, AI_Steps: r.ai_steps,
    AI_Confidence: r.ai_confidence, Date_Match: r.date_match, Alert_Flag: r.alert_flag,
    Alert_Reason: r.alert_reason, Notes: r.notes,
  };
}
function mapSweetRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    Entry_ID: r.entry_id, User_ID: r.user_id, Wednesday_Date: r.wednesday_date,
    Status: r.status, Logged_By: r.logged_by, Reason: r.reason, Recorded_At: r.recorded_at,
  };
}

async function fetchFromSupabase<T>(path: string, params?: Record<string,string>): Promise<T | null> {
  if (!isSupabaseAvailable()) return null;
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    if (!sb) return null;

    if (path === 'users') {
      let all: Record<string, unknown>[] = [];
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await sb.from('users').select('*').order('created_at', { ascending: false }).range(from, from + size - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Record<string, unknown>[]));
        if (data.length < size) break;
        from += size;
      }
      return all.map(mapUserRow) as unknown as T;
    }
    if (path === 'steps') {
      let all: Record<string, unknown>[] = [];
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await sb.from('steps_log').select('*').order('date_thai', { ascending: false }).range(from, from + size - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Record<string, unknown>[]));
        if (data.length < size) break;
        from += size;
      }
      return all.map(mapStepRow) as unknown as T;
    }
    if (path === 'sweet-free') {
      let all: Record<string, unknown>[] = [];
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await sb.from('sweet_free').select('*').order('wednesday_date', { ascending: false }).range(from, from + size - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Record<string, unknown>[]));
        if (data.length < size) break;
        from += size;
      }
      return all.map(mapSweetRow) as unknown as T;
    }
    if (path === 'project-window') {
      const { data, error } = await sb.from('project_settings').select('start_date,end_date').eq('id', 1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { start: (data as {start_date:string}).start_date, end: (data as {end_date:string}).end_date } as unknown as T;
    }
    if (path === 'steps-pending-count') {
      const viewerId = params?.viewerId;
      const { count, error } = await sb.from('steps_log').select('record_id,user_id', { count: 'exact' }).eq('status', 'Pending');
      if (error) throw error;
      if (viewerId) {
        try {
          const { data: viewer } = await sb.from('users').select('department').eq('user_id', viewerId).maybeSingle();
          const viewerDept = (viewer as {department:string}|null)?.department || '';
          if (viewerDept) {
            const { data: pend } = await sb.from('steps_log').select('user_id').eq('status', 'Pending').limit(5000);
            const { data: allUsers } = await sb.from('users').select('user_id,department').in('user_id', (pend||[]).map((p: {user_id:string})=>p.user_id));
            const deptByUser = new Map((allUsers||[]).map((u: {user_id:string,department:string})=>[u.user_id, u.department]));
            const cross = (pend||[]).filter((p: {user_id:string}) => deptByUser.get(p.user_id) !== viewerDept);
            return { count: cross.length } as unknown as T;
          }
        } catch {}
      }
      return { count: count ?? 0 } as unknown as T;
    }
    if (path === 'dashboard' || path === 'weight-comparison' || path === 'baseline') {
      return null;
    }
    return null;
  } catch (e) {
    console.warn(`[supabase fetchData ${path}]`, e);
    return null;
  }
}

async function postToSupabase(action: string, data?: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!isSupabaseAvailable()) return null;
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    if (!sb) return null;

    if (action === 'set-project-window') {
      const { error } = await sb.from('project_settings').upsert({
        id: 1, start_date: String(data?.Start_Date||'').slice(0,10), end_date: String(data?.End_Date||'').slice(0,10), updated_by: data?.Logged_By ? String(data.Logged_By) : null,
      }, { onConflict: 'id' });
      if (error) throw error;
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:project-window');
      return { success: true, message: 'บันทึกห้วงเวลาสำเร็จ (Supabase)' };
    }
    if (action === 'cleanup-out-of-window') {
      const { data: win } = await sb.from('project_settings').select('start_date,end_date').eq('id',1).maybeSingle();
      const start = (win as {start_date:string}|null)?.start_date;
      const end = (win as {end_date:string}|null)?.end_date;
      if (!start || !end) return { success:false, message:'ไม่พบห้วงเวลา' };
      const targets = String(data?.targets||'all');
      let stepsDeleted = 0, sweetDeleted = 0;
      if (targets==='steps' || targets==='all') {
        const { error, count } = await sb.from('steps_log').delete({ count:'exact' }).lt('date_thai', start).or(`date_thai.gt.${end}`);
        if (!error) stepsDeleted = count ?? 0;
        else {
          const a = await sb.from('steps_log').delete({ count:'exact' }).lt('date_thai', start);
          const b = await sb.from('steps_log').delete({ count:'exact' }).gt('date_thai', end);
          stepsDeleted = (a.count||0)+(b.count||0);
        }
      }
      if (targets==='sweet' || targets==='all') {
        const { count } = await sb.from('sweet_free').delete({ count:'exact' }).lt('wednesday_date', start);
        const { count: c2 } = await sb.from('sweet_free').delete({ count:'exact' }).gt('wednesday_date', end);
        sweetDeleted = (count||0)+(c2||0);
      }
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:steps'); invalidate('gas:sweet-free');
      return { success:true, message:`ลบ Steps ${stepsDeleted} แถว, Sweet ${sweetDeleted} แถว`, cleaned:{ stepsDeleted, sweetDeleted } };
    }
    if (action === 'update-step-status') {
      const rid = String(data?.Record_ID||'');
      const status = String(data?.Status||'');
      if (!rid || !['Approved','Rejected'].includes(status)) return null;
      const { error } = await sb.from('steps_log').update({
        status, auditor_id: data?.Auditor_ID ? String(data.Auditor_ID) : null, reviewed_at: new Date().toISOString(),
        reject_reason: data?.Reject_Reason ? String(data.Reject_Reason) : null,
      }).eq('record_id', rid);
      if (error) throw error;
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:steps'); invalidate('gas:steps-pending-count');
      return { success:true, message:'อัปเดตสถานะสำเร็จ (Supabase)' };
    }
    if (action === 'delete-step') {
      const rid = String(data?.Record_ID||'');
      const { error } = await sb.from('steps_log').delete().eq('record_id', rid);
      if (error) throw error;
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:steps');
      return { success:true, message:'ลบรายการสำเร็จ (Supabase)' };
    }
    return null;
  } catch (e) {
    console.warn(`[supabase post ${action}]`, e);
    return null;
  }
}

// จำแนก path ที่ควร cache
const READ_CACHE_TTL: Record<string, number> = {
  'users': 120_000,
  'steps': 120_000,
  'project-window': 300_000,
  'google-fit-links': 120_000,
  'sweet-free': 120_000,
  'baseline': 300_000,
  'weight-comparison': 120_000,
  'dashboard': 120_000,
  'steps-pending-count': 30_000,
};

function isReadCacheable(path: string): boolean {
  return path in READ_CACHE_TTL;
}

export async function fetchData<T>(path: string, params?: Record<string,string>, opts?: { signal?: AbortSignal; forceRefresh?: boolean }): Promise<T | null> {
  if (isSupabaseAvailable() && !opts?.forceRefresh) {
    const sbData = await fetchFromSupabase<T>(path, params);
    if (sbData !== null) {
      if (isReadCacheable(path)) {
        try {
          const gasCache = await import('@/lib/gasCache');
          const key = (gasCache.GAS_CACHE_KEYS as Record<string,string>)[path] || `gas:${path}${params ? ':'+new URLSearchParams(params).toString() : ''}`;
          gasCache.setCached(key, sbData, READ_CACHE_TTL[path] ?? 30_000);
        } catch {}
      }
      return sbData;
    }
  }
  console.warn(`[api] no Supabase handler for path: ${path} (GAS removed)`);
  return null;
}

export async function postData(action: string, data?: Record<string,unknown>): Promise<any> {
  const sbRes = await postToSupabase(action, data);
  if (sbRes) return sbRes;
  return { success: false, message: `action "${action}" ยังไม่รองรับบน Supabase (GAS ถูกลบแล้ว)` };
}

export async function postDataJson(action: string, data?: Record<string,unknown>): Promise<any> {
  const sbRes = await postToSupabase(action, data);
  if (sbRes) return sbRes;
  return { success: false, message: `action "${action}" ยังไม่รองรับบน Supabase (GAS ถูกลบแล้ว)` };
}

export function invalidateGasCache(pattern: string | RegExp) {
  import('@/lib/gasCache').then(m => m.invalidate(pattern)).catch(() => {});
}
