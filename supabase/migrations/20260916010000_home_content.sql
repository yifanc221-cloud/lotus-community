-- ============================================================
-- 首页门户内容：最新通知 / 服务项目 / 常用办事入口 / 站点设置
-- 用于首页门户展示，工作人员后台可维护
-- ============================================================

-- ---------- 最新通知 ----------
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  is_pinned boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 服务项目 ----------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  icon text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 常用办事入口 ----------
create table if not exists public.quick_links (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  href text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 站点设置（开放状态 / 联系方式，key-value） ----------
create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
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

-- ---------- 预置默认数据 ----------
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
