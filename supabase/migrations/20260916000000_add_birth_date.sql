-- 居民档案：新增出生年月日字段（用于按年龄段分层服务）
-- 对已存在的库执行；新建库请直接用 20260915000000_init.sql（已含该列）
alter table public.residents add column if not exists birth_date date;
