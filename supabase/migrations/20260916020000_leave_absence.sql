-- ============================================================
-- 请假 / 缺勤限制：请假记录表 + 居民考勤字段 + 缺勤重算函数
-- 用法：在 Supabase 控制台 → SQL Editor 粘贴全文 → Run
-- ============================================================

-- ---------- 1. 请假记录（报名后无法出席的文字说明理由） ----------
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

-- ---------- 2. 居民考勤字段 ----------
alter table public.residents add column if not exists absence_count int not null default 0;  -- 当前累计缺勤（展示用）
alter table public.residents add column if not exists absence_since timestamptz;             -- 缺勤计数起算点（暂停后清零的截止线）
alter table public.residents add column if not exists banned_until timestamptz;              -- 报名暂停截止时间

-- ---------- 3. 缺勤重算 + 自动暂停（security definer，anon 可调） ----------
create or replace function public.recompute_resident_absence(p_resident_id uuid)
returns table (absence_count int, banned_until timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_cutoff date; v_until timestamptz; v_count int;
begin
  select coalesce(r.absence_since::date, '1970-01-01'::date), r.banned_until
    into v_cutoff, v_until from public.residents r where r.id = p_resident_id;

  -- 已在暂停期内：不重复计算、不重复叠加
  if v_until is not null and v_until > now() then
    return query select r.absence_count, r.banned_until from public.residents r where r.id = p_resident_id;
    return;
  end if;

  -- 缺勤 = 报名了、活动已结束(date<今天)、在截止线之后、未签到、未请假
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

  return query select r.absence_count, r.banned_until from public.residents r where r.id = p_resident_id;
end $$;

grant execute on function public.recompute_resident_absence(uuid) to anon;
grant execute on function public.recompute_resident_absence(uuid) to authenticated;
