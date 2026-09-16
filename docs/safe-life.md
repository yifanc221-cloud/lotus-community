# 「安心生活」专区说明

面向社区长者的三段式专区：**防诈骗 / 脑力训练 / 健康运动**，配套工作人员查看页。基础版手动录入、零外部依赖，不做医疗诊断、不宣传「自动判断诈骗」。

## 页面结构

| 页面 | 作用 | 入口 |
| --- | --- | --- |
| `safe-life.html` | 安心生活首页：后四位+姓名识别 → 三大功能卡 | `index.html` 顶部「安心生活」入口 |
| `antifraud.html` | 防诈骗：今日提醒（含语音）、6 类案例、小测试、求助 | 首页「防诈骗」卡 |
| `braintrain.html` | 脑力训练：记忆力 / 注意力 / 生活能力，各 5 题 | 首页「脑力训练」卡 |
| `exercise.html` | 健康运动：4 项数据 + 记录运动 + 最近记录 | 首页「健康运动」卡 |
| `admin.html`（新 Tab「安心生活」） | 工作人员查看：阅读/训练/运动/求助汇总 + 跟进状态 | 后台登录 |

识别结果通过 `sessionStorage`（`js/safe-life.js`）在安心生活各页间共享，长者只需填一次后四位+姓名。

## 数据表（`supabase/migrations/20260917000000_safe_life.sql`）

- `sl_reads` —— 防诈骗阅读记录（section: reminder / cases / quiz）
- `sl_help_requests` —— 求助记录（help_type: family / staff / police；status: 待跟进 / 跟进中 / 已完成）
- `sl_trainings` —— 脑力训练（train_type: memory / attention / life；correct / total / duration_seconds）
- `sl_exercises` —— 运动记录（ex_type / ex_date / duration_minutes / steps / distance / feeling）

RLS 与现有居民端一致：`anon` 可读可写居民侧数据、`authenticated`（工作人员）全权。

## 部署步骤

1. Supabase SQL Editor 执行 `supabase/migrations/20260917000000_safe_life.sql`（建表 + RLS）。
2. （可选）执行 `supabase/seed_safe_life_demo.sql` 生成演示数据（后四位 `8888` / 姓名 `安心示范长者`）。
3. 提交并推送，GitHub Pages 自动上线。

## 后续可扩展方向

- **语音**：今日提醒已接 Web Speech API 本地朗读；后续可换更自然的真人录音或云端 TTS。
- **脑力训练**：开放「日常挑战 / 进阶挑战」难度，扩充题库与题型（如记忆序列、数字广度）。
- **健康运动**：接入智能手环 / 微信运动自动同步步数（当前仅手动录入）。
- **防诈骗**：更多案例库 + 视频/图片；对接社区反诈讲座报名。
- **家属/工作人员协作**：后续可加家属独立账号、求助工单派发与消息提醒。
- **数据看板**：安心生活参与率、训练正确率趋势（当前保持简单，不做复杂大屏）。
