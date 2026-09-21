-- ============================================================
-- 抽签公平：同类型活动历史中签者降权（每中签一次，中签概率约减半）
-- 用法：在 Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 说明：
--   1) 给 activities 增加 category（活动类型）字段；
--   2) 重写 draw_lottery：按「同类型历史中签次数」给每位报名者降权。
--   中签权重 = random() × 2^(同类型历史中签次数)
--     中签 0 次 → 权重落在 [0,1)；
--     中签 1 次 → [0,2)；
--     中签 2 次 → [0,4)……
--   排序取前 capacity 名中签，故历史中签越多，越难再次中签，但永不为零。
--   category 为空的活动不参与「同类型降权」（当作无类型，互不比较）。
-- ============================================================

-- ---------- 1. activities 加「活动类型」 ----------
alter table public.activities
  add column if not exists category text;   -- 认知训练 / 肢体训练 / 讲座 / 手工 / 文娱 / 出游 / 其他（空 = 不参与降权）

-- ---------- 2. 重写抽签函数（security definer，随机 + 降权 + 原子） ----------
create or replace function public.draw_lottery(p_activity_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_cap int; v_mode text; v_cat text; v_drawn int; v_wait int;
begin
  select capacity, reg_mode, category into v_cap, v_mode, v_cat
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

  -- 计算每位报名者「同类型历史中签次数」，按随机值 × 2^次数 排序，前 capacity 名中签
  with w as (
    select r.id,
           coalesce((
             select count(*)::int
               from public.registrations r2
               join public.activities a2 on a2.id = r2.activity_id
              where r2.resident_id = r.resident_id
                and r2.status = 'drawn'
                and r2.activity_id <> p_activity_id
                and v_cat is not null
                and a2.category = v_cat
           ), 0) as past_wins
      from public.registrations r
     where r.activity_id = p_activity_id
  ),
  ranked as (
    select id, row_number() over (order by random() * power(2.0, past_wins)) as rn
      from w
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

-- ---------- 3. 权限保持：仅工作人员可抽签 ----------
revoke execute on function public.draw_lottery(uuid) from public;
revoke execute on function public.draw_lottery(uuid) from anon;
grant execute on function public.draw_lottery(uuid) to authenticated;
