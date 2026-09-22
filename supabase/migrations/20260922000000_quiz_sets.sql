-- ============================================================
-- 「安心生活」题库扩充：多套题 + 每套最多记 2 分
-- 用法：在 Supabase 控制台 → SQL Editor 粘贴全文 → Run
-- 说明：给 sl_reads 加 quiz_set 字段，用于区分「哪一套题」。
--       记录完成时仍写 section='quiz'，同时写 quiz_set=套题 id。
--       积分封顶（每套/每类最多 2 分）在客户端计算，无需改表。
-- ============================================================

alter table public.sl_reads
  add column if not exists quiz_set text;   -- section='quiz' 时记录套题 id，如 'fraud_impersonate'
