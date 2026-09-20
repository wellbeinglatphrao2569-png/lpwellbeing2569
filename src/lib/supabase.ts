import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ใช้ env 2 แบบ: NEXT_PUBLIC_SUPABASE_URL + (SUPABASE_SERVICE_ROLE_KEY หรือ NEXT_PUBLIC_SUPABASE_ANON_KEY)
// ฝั่ง server แนะนำ SERVICE_ROLE_KEY เพื่อ bypass RLS สำหรับ update
// ฝั่ง client ใช้ ANON_KEY ก็อ่านได้ (policy public read)

function normalizeUrl(u: string){
  if(!u) return u;
  let s = String(u).trim().replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
  return s;
}
const supabaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '');
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  if (cached) return cached;
  cached = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseServiceKey;
}
