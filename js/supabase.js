// ============================================================
// Supabase 客户端单例
// 依赖：先加载 @supabase/supabase-js（CDN）、config.js
// ============================================================
let _sb = null;

function getSupabase() {
  if (_sb) return _sb;
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error('Supabase 未配置。请检查 js/config.js 是否填入 URL 与 anon key。');
    return null;
  }
  if (window.SUPABASE_URL.indexOf('YOUR-PROJECT-REF') !== -1) {
    console.warn('⚠️ 检测到占位配置，请先在 js/config.js 填入真实 Supabase URL 与 anon key。');
    return null;
  }
  _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  return _sb;
}
