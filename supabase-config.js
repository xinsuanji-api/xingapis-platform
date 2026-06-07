// Supabase 配置 - 星算纪 API 平台
const SUPABASE_URL = 'https://fllwyvcmkpgxzjlffcfe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uUwAZ4UtEYIuipSGsU-kBw_01dUJmBv';

// 初始化 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 导出供其他脚本使用
window.SUPABASE_CLIENT = supabase;
window.SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY
};
