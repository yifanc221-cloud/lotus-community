-- ============================================================
-- 「安心生活」专区：防诈骗 / 脑力训练 / 健康运动
-- 用法：在 Supabase 控制台 → SQL Editor 粘贴全文 → Run
-- 说明：基础版手动录入，不做诊断、不宣传「自动判断诈骗」。
-- ============================================================

-- ---------- 1. 防诈骗阅读记录 ----------
create table if not exists public.sl_reads (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  section text not null,                 -- 'reminder' 今日提醒 | 'cases' 案例 | 'quiz' 小测试
  created_at timestamptz not null default now()
);
alter table public.sl_reads enable row level security;
drop policy if exists "sl_reads_anon_select" on public.sl_reads;
drop policy if exists "sl_reads_anon_insert" on public.sl_reads;
drop policy if exists "sl_reads_auth_all" on public.sl_reads;
create policy "sl_reads_anon_select" on public.sl_reads for select to anon using (true);
create policy "sl_reads_anon_insert" on public.sl_reads for insert to anon with check (true);
create policy "sl_reads_auth_all"   on public.sl_reads for all to authenticated using (true) with check (true);

-- ---------- 2. 求助记录 ----------
create table if not exists public.sl_help_requests (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  help_type text not null,               -- 'family' 联系家属 | 'staff' 联系工作人员 | 'police' 报警
  note text,
  status text not null default '待跟进',  -- 待跟进 / 跟进中 / 已完成
  created_at timestamptz not null default now()
);
alter table public.sl_help_requests enable row level security;
drop policy if exists "sl_help_requests_anon_select" on public.sl_help_requests;
drop policy if exists "sl_help_requests_anon_insert" on public.sl_help_requests;
drop policy if exists "sl_help_requests_auth_all" on public.sl_help_requests;
create policy "sl_help_requests_anon_select" on public.sl_help_requests for select to anon using (true);
create policy "sl_help_requests_anon_insert" on public.sl_help_requests for insert to anon with check (true);
create policy "sl_help_requests_auth_all"   on public.sl_help_requests for all to authenticated using (true) with check (true);

-- ---------- 3. 脑力训练记录 ----------
create table if not exists public.sl_trainings (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  train_type text not null,               -- 'memory' 记忆力 | 'attention' 注意力 | 'life' 生活能力
  difficulty text not null default '轻松练习',
  correct int not null default 0,
  total int not null default 5,
  duration_seconds int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.sl_trainings enable row level security;
drop policy if exists "sl_trainings_anon_select" on public.sl_trainings;
drop policy if exists "sl_trainings_anon_insert" on public.sl_trainings;
drop policy if exists "sl_trainings_auth_all" on public.sl_trainings;
create policy "sl_trainings_anon_select" on public.sl_trainings for select to anon using (true);
create policy "sl_trainings_anon_insert" on public.sl_trainings for insert to anon with check (true);
create policy "sl_trainings_auth_all"   on public.sl_trainings for all to authenticated using (true) with check (true);

-- ---------- 4. 健康运动记录 ----------
create table if not exists public.sl_exercises (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  ex_type text not null,                  -- 散步 / 八段锦 / 太极 / 广场舞 / 拉伸运动 / 健身操 / 游泳 / 其他
  ex_date date not null default current_date,
  duration_minutes int not null default 0,
  steps int,
  distance numeric,
  feeling text not null,                  -- 很舒服 / 还不错 / 有点累 / 不舒服
  created_at timestamptz not null default now()
);
alter table public.sl_exercises enable row level security;
drop policy if exists "sl_exercises_anon_select" on public.sl_exercises;
drop policy if exists "sl_exercises_anon_insert" on public.sl_exercises;
drop policy if exists "sl_exercises_auth_all" on public.sl_exercises;
create policy "sl_exercises_anon_select" on public.sl_exercises for select to anon using (true);
create policy "sl_exercises_anon_insert" on public.sl_exercises for insert to anon with check (true);
create policy "sl_exercises_auth_all"   on public.sl_exercises for all to authenticated using (true) with check (true);
