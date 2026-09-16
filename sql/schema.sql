-- ============================================================
-- 莲花社区服务点 · 活动系统 数据库初始化脚本
-- 用法：在 Supabase 控制台 → SQL Editor → 粘贴本文件全文 → Run
-- 说明：新建独立 Supabase 项目后，一次性执行即可完成建表 + RLS + Storage
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. 居民档案 ----------
create table if not exists public.residents (
  id uuid primary key default gen_random_uuid(),
  pin text not null check (pin ~ '^[0-9]{4}$'),   -- 手机号后四位
  name text not null,
  birth_date date,                -- 出生年月日（用于按年龄段分层服务）
  created_at timestamptz not null default now(),
  unique (pin, name)
);

-- ---------- 2. 活动 ----------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date,
  time text,                 -- 时段，如「上午 9:30 - 11:00」
  location text,
  description text,
  registration_enabled boolean not null default false,
  registration_deadline timestamptz,
  capacity int,              -- 名额上限，可空表示不限
  is_current boolean not null default false,   -- 是否为「本场活动」
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 3. 活动报名 ----------
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  registered_at timestamptz not null default now(),
  unique (activity_id, resident_id)
);

-- ---------- 4. 签到记录 ----------
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  checked_in_by text not null default 'self',  -- 'self'=本人 / 工作人员 uid=帮签
  checked_in_at timestamptz not null default now(),
  unique (activity_id, resident_id)
);

-- ---------- 5. 活动照片 ----------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  resident_id uuid references public.residents(id) on delete cascade,  -- 大合照为 NULL
  type text not null check (type in ('personal','group')),
  storage_path text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 索引 ----------
create index if not exists idx_residents_pin on public.residents(pin);
create index if not exists idx_registrations_activity on public.registrations(activity_id);
create index if not exists idx_registrations_resident on public.registrations(resident_id);
create index if not exists idx_checkins_activity on public.checkins(activity_id);
create index if not exists idx_checkins_resident on public.checkins(resident_id);
create index if not exists idx_photos_activity on public.photos(activity_id);
create index if not exists idx_photos_resident on public.photos(resident_id);

-- ============================================================
-- RLS（Row Level Security）
-- 角色约定：
--   anon          = 居民端（无账号，靠「后四位+姓名」识别）
--   authenticated = 工作人员（Supabase 邮箱+密码登录）
-- ============================================================
alter table public.residents enable row level security;
alter table public.activities enable row level security;
alter table public.registrations enable row level security;
alter table public.checkins enable row level security;
alter table public.photos enable row level security;

-- residents：anon 读（识别身份）+ 插（首次建档）；工作人员全权
create policy "residents_anon_select" on public.residents for select to anon using (true);
create policy "residents_anon_insert" on public.residents for insert to anon with check (true);
create policy "residents_auth_all"   on public.residents for all to authenticated using (true) with check (true);

-- activities：anon 读；工作人员全权
create policy "activities_anon_select" on public.activities for select to anon using (true);
create policy "activities_auth_all"    on public.activities for all to authenticated using (true) with check (true);

-- registrations：anon 读 + 插（报名）；工作人员全权
create policy "registrations_anon_select" on public.registrations for select to anon using (true);
create policy "registrations_anon_insert" on public.registrations for insert to anon with check (true);
create policy "registrations_auth_all"    on public.registrations for all to authenticated using (true) with check (true);

-- checkins：anon 读 + 仅可本人签到（checked_in_by 必须为 'self'）；工作人员全权（帮签）
create policy "checkins_anon_select"     on public.checkins for select to anon using (true);
create policy "checkins_anon_insert_self" on public.checkins for insert to anon with check (checked_in_by = 'self');
create policy "checkins_auth_all"        on public.checkins for all to authenticated using (true) with check (true);

-- photos：anon 只能读大合照；个人照通过 security definer 函数按「后四位+姓名」精确获取；工作人员全权
drop policy if exists "photos_anon_select" on public.photos;
drop policy if exists "photos_anon_select_group" on public.photos;
create policy "photos_anon_select_group" on public.photos for select to anon using (type = 'group');
create policy "photos_auth_all"    on public.photos for all to authenticated using (true) with check (true);

-- 居民「我的个人照」查询函数：凭 后四位+姓名 精确匹配，绕过 RLS 只返回本人个人照
create or replace function public.get_my_personal_photos(p_pin text, p_name text)
returns table (id uuid, storage_path text, activity_title text, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select p.id, p.storage_path, a.title, p.created_at
  from public.photos p
  join public.residents r on r.id = p.resident_id
  left join public.activities a on a.id = p.activity_id
  where r.pin = p_pin and r.name = p_name and p.type = 'personal'
  order by p.created_at desc;
$$;
grant execute on function public.get_my_personal_photos(text, text) to anon;

-- ============================================================
-- Storage：活动照片 bucket（public，文件名用随机 uuid 防枚举）
-- ============================================================
insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', true)
on conflict (id) do nothing;

create policy "photos_bucket_public_read" on storage.objects
  for select using (bucket_id = 'activity-photos');

create policy "photos_bucket_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'activity-photos');

create policy "photos_bucket_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'activity-photos');

create policy "photos_bucket_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'activity-photos');

-- ============================================================
-- 可选：预置一个示例活动，便于首次打开页面即可演示
-- ============================================================
insert into public.activities (title, date, time, location, description, registration_enabled, is_current)
values ('长者健康养生讲座', current_date, '上午 9:30 - 11:00', '莲花社区活动中心四楼',
        '欢迎各位街坊参加本场养生讲座，请先在首页报名，当天到场后签到。', true, true)
on conflict do nothing;

-- ============================================================
-- 首页门户内容：最新通知 / 服务项目 / 常用办事入口 / 站点设置
-- ============================================================
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  is_pinned boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  icon text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.quick_links (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  href text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.notices enable row level security;
alter table public.services enable row level security;
alter table public.quick_links enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "notices_anon_select" on public.notices;
drop policy if exists "notices_auth_all" on public.notices;
create policy "notices_anon_select" on public.notices for select to anon using (true);
create policy "notices_auth_all"   on public.notices for all to authenticated using (true) with check (true);

drop policy if exists "services_anon_select" on public.services;
drop policy if exists "services_auth_all" on public.services;
create policy "services_anon_select" on public.services for select to anon using (true);
create policy "services_auth_all"    on public.services for all to authenticated using (true) with check (true);

drop policy if exists "quick_links_anon_select" on public.quick_links;
drop policy if exists "quick_links_auth_all" on public.quick_links;
create policy "quick_links_anon_select" on public.quick_links for select to anon using (true);
create policy "quick_links_auth_all"    on public.quick_links for all to authenticated using (true) with check (true);

drop policy if exists "site_settings_anon_select" on public.site_settings;
drop policy if exists "site_settings_auth_all" on public.site_settings;
create policy "site_settings_anon_select" on public.site_settings for select to anon using (true);
create policy "site_settings_auth_all"    on public.site_settings for all to authenticated using (true) with check (true);

insert into public.site_settings (key, value) values
  ('open_status', 'open'),
  ('open_hours', '周一至周日 9:00—17:30'),
  ('address', '珠海市横琴 · 莲花社区'),
  ('phone', '（待填写）')
on conflict (key) do nothing;

insert into public.services (name, description, icon, sort) values
  ('助餐配餐', '为长者提供营养助餐与健康午餐', '🍚', 1),
  ('恒常场地', '提供休闲活动场地，长者日常可到访', '🏠', 2),
  ('康复理疗', '康复理疗与健康咨询服务', '💆', 3),
  ('文化娱乐', '粤语小剧场、书法角、兴趣班等', '🎨', 4)
on conflict (name) do nothing;

insert into public.quick_links (name, icon, href, sort) values
  ('活动签到', '✅', 'checkin.html', 1),
  ('活动报名', '📝', '#portal', 2),
  ('我的照片', '📷', 'mine.html', 3),
  ('联系我们', '📞', '#contact', 4)
on conflict (name) do nothing;

-- ============================================================
-- 请假 / 缺勤限制：请假记录表 + 居民考勤字段 + 缺勤重算函数
-- ============================================================
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (activity_id, resident_id)
);

alter table public.leave_requests enable row level security;
drop policy if exists "leave_requests_anon_select" on public.leave_requests;
drop policy if exists "leave_requests_anon_insert" on public.leave_requests;
drop policy if exists "leave_requests_auth_all" on public.leave_requests;
create policy "leave_requests_anon_select" on public.leave_requests for select to anon using (true);
create policy "leave_requests_anon_insert" on public.leave_requests for insert to anon with check (true);
create policy "leave_requests_auth_all"   on public.leave_requests for all to authenticated using (true) with check (true);

alter table public.residents add column if not exists absence_count int not null default 0;
alter table public.residents add column if not exists absence_since timestamptz;
alter table public.residents add column if not exists banned_until timestamptz;

create or replace function public.recompute_resident_absence(p_resident_id uuid)
returns table (absence_count int, banned_until timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_cutoff date; v_until timestamptz; v_count int;
begin
  select coalesce(absence_since::date, '1970-01-01'::date), banned_until
    into v_cutoff, v_until from public.residents where id = p_resident_id;

  if v_until is not null and v_until > now() then
    return query select absence_count, banned_until from public.residents where id = p_resident_id;
    return;
  end if;

  select count(*) into v_count
  from public.registrations r join public.activities a on a.id = r.activity_id
  where r.resident_id = p_resident_id and a.date < current_date and a.date > v_cutoff
    and not exists (select 1 from public.checkins c where c.activity_id = r.activity_id and c.resident_id = r.resident_id)
    and not exists (select 1 from public.leave_requests l where l.activity_id = r.activity_id and l.resident_id = r.resident_id);

  if v_count >= 5 then
    update public.residents set banned_until = now() + interval '7 days', absence_since = now(), absence_count = 0 where id = p_resident_id;
  else
    update public.residents set absence_count = v_count where id = p_resident_id;
  end if;

  return query select absence_count, banned_until from public.residents where id = p_resident_id;
end $$;

grant execute on function public.recompute_resident_absence(uuid) to anon;
grant execute on function public.recompute_resident_absence(uuid) to authenticated;
