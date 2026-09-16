-- ============================================================
-- 「安心生活」演示数据（可选执行）
-- 用法：先执行 migration 建表，再在 SQL Editor 粘贴本文件 Run。
-- 效果：生成 1 位演示长者（后四位 8888 / 姓名 安心示范长者），
--       并补齐防诈骗阅读 / 求助 / 脑力训练 / 运动记录，
--       让「工作人员后台 → 安心生活」页一打开就有数据可看。
-- 演示时：在安心生活首页输入 后四位 8888 + 姓名 安心示范长者 即可识别。
-- ============================================================

insert into public.residents (pin, name, birth_date)
values ('8888', '安心示范长者', '1952-08-15')
on conflict (pin, name) do nothing;

do $$
declare v_id uuid;
begin
  select id into v_id from public.residents where pin = '8888' and name = '安心示范长者';
  if v_id is null then return; end if;

  -- 防诈骗阅读记录
  insert into public.sl_reads (resident_id, section, created_at) values
    (v_id, 'reminder', now() - interval '2 days'),
    (v_id, 'cases',    now() - interval '2 days'),
    (v_id, 'quiz',     now() - interval '1 day');

  -- 求助记录（待跟进）
  insert into public.sl_help_requests (resident_id, help_type, note, status, created_at) values
    (v_id, 'family', '想了解如何为手机设置来电拦截', '跟进中', now() - interval '3 days'),
    (v_id, 'staff',  '收到一条可疑短信，请工作人员帮忙看看', '待跟进', now() - interval '1 day');

  -- 脑力训练记录
  insert into public.sl_trainings (resident_id, train_type, difficulty, correct, total, duration_seconds, created_at) values
    (v_id, 'memory',    '轻松练习', 4, 5, 120, now() - interval '2 days'),
    (v_id, 'attention', '轻松练习', 5, 5,  95, now() - interval '1 day'),
    (v_id, 'life',      '轻松练习', 3, 5, 150, now() - interval '6 hours');

  -- 运动记录
  insert into public.sl_exercises (resident_id, ex_type, ex_date, duration_minutes, steps, feeling, created_at) values
    (v_id, '散步',   current_date - 2, 30, 2600, '很舒服', now() - interval '2 days'),
    (v_id, '八段锦', current_date - 1, 20, null, '还不错', now() - interval '1 day'),
    (v_id, '太极',   current_date,     35, null, '很舒服', now() - interval '3 hours');
end $$;
