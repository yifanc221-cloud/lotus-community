-- ============================================================
-- 重新抽签：清空上一次抽签结果与押金状态，重新随机抽取
-- 用法：在 Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 说明：抽签默认是一次性的（防误触）；如需重抽，用本函数。
--       重抽会清空「中签/候补」结果和押金「已缴/已退」状态，
--       请仅在押金尚未收取、或确认可以清空时使用。
-- ============================================================

create or replace function public.redraw_lottery(p_activity_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.activities where id = p_activity_id and lottery_done) then
    raise exception '本活动尚未抽过签';
  end if;

  -- 清空上次抽签结果与押金状态
  update public.activities
     set lottery_done = false, lottery_at = null
   where id = p_activity_id;

  update public.registrations
     set status = 'registered', draw_order = null,
         deposit_status = 'pending', deposit_paid_at = null, deposit_refunded_at = null
   where activity_id = p_activity_id;

  -- 复用抽签逻辑（含同类型历史中签降权）重新抽
  return public.draw_lottery(p_activity_id);
end $$;

-- 权限：仅工作人员可重新抽签
revoke execute on function public.redraw_lottery(uuid) from public;
revoke execute on function public.redraw_lottery(uuid) from anon;
grant execute on function public.redraw_lottery(uuid) to authenticated;
