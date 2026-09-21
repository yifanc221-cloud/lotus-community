-- ============================================================
-- 活动报名抽签 + 押金管理
-- 用法：在 Supabase 控制台 → SQL Editor 粘贴全文 → Run
-- 说明：押金线下收取，系统仅记录「已缴 / 已退」，不接支付网关。
-- ============================================================

-- ---------- 1. activities 加列 ----------
alter table public.activities
  add column if not exists reg_mode text not null default 'first_come',   -- first_come 先到先得 | lottery 抽签
  add column if not exists deposit numeric,                               -- 押金金额（元）
  add column if not exists deposit_deadline timestamptz,                  -- 押金缴纳截止（提示用）
  add column if not exists lottery_done boolean not null default false,
  add column if not exists lottery_at timestamptz;

-- ---------- 2. registrations 加列 ----------
alter table public.registrations
  add column if not exists status text not null default 'registered',      -- registered | drawn | waitlist | cancelled
  add column if not exists deposit_status text not null default 'pending', -- pending | paid | refunded
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists deposit_refunded_at timestamptz,
  add column if not exists draw_order int;

-- ---------- 3. 抽签函数（security definer，随机 + 原子） ----------
create or replace function public.draw_lottery(p_activity_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_cap int; v_mode text; v_drawn int; v_wait int;
begin
  select capacity, reg_mode into v_cap, v_mode
    from public.activities where id = p_activity_id;

  if v_mode is distinct from 'lottery' then
    raise exception '本活动不是抽签模式';
  end if;
  if v_cap is null or v_cap <= 0 then
    raise exception '请先设置活动名额';
  end if;
  if exists (select 1 from public.activities where id = p_activity_id and lottery_done) then
    raise exception '本活动已抽过签';
  end if;

  -- 重置报名状态（保险）
  update public.registrations
    set status = 'registered', draw_order = null, deposit_status = 'pending'
    where activity_id = p_activity_id;

  -- 随机打乱，前 capacity 名中签，其余候补
  with ranked as (
    select id, row_number() over (order by random()) as rn
    from public.registrations
    where activity_id = p_activity_id
  )
  update public.registrations r
    set status = case when k.rn <= v_cap then 'drawn' else 'waitlist' end,
        draw_order = k.rn
    from ranked k
    where k.id = r.id;

  update public.activities
    set lottery_done = true, lottery_at = now()
    where id = p_activity_id;

  select
    count(*) filter (where status = 'drawn'),
    count(*) filter (where status = 'waitlist')
    into v_drawn, v_wait
  from public.registrations where activity_id = p_activity_id;

  return jsonb_build_object('drawn', v_drawn, 'waitlist', v_wait);
end $$;

-- ---------- 4. 候补递补函数 ----------
create or replace function public.promote_waitlist(p_registration_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_act uuid; v_next uuid;
begin
  select activity_id into v_act from public.registrations where id = p_registration_id;
  if v_act is null then raise exception '报名记录不存在'; end if;

  -- 取消该中签者
  update public.registrations
    set status = 'cancelled', deposit_status = 'pending'
    where id = p_registration_id and status = 'drawn';

  -- 候补第一名递补为中签
  select id into v_next
    from public.registrations
    where activity_id = v_act and status = 'waitlist'
    order by draw_order asc nulls last
    limit 1;

  if v_next is not null then
    update public.registrations
      set status = 'drawn', deposit_status = 'pending'
      where id = v_next;
  end if;

  return v_next;
end $$;

-- ---------- 5. 权限：仅工作人员可抽签 / 递补 ----------
revoke execute on function public.draw_lottery(uuid) from public;
revoke execute on function public.draw_lottery(uuid) from anon;
revoke execute on function public.promote_waitlist(uuid) from public;
revoke execute on function public.promote_waitlist(uuid) from anon;
grant execute on function public.draw_lottery(uuid) to authenticated;
grant execute on function public.promote_waitlist(uuid) to authenticated;
