# 莲花社区服务点 · 活动系统（正式版）

给「澳门街坊总会广东办事处 · 莲花社区服务点」做的长者活动系统，把原静态演示版升级为**云端正式应用**。

## 页面结构

| 路径 | 用途 | 使用角色 |
| --- | --- | --- |
| `index.html` | 首页：本场活动门户 + 活动报名 + 服务简报 | 居民（长者） |
| `checkin.html` | 长者活动签到（本人签到，无「帮别人签」） | 居民 |
| `mine.html` | 我的：看个人照片 / 大合照 / 报名 / 签到 | 居民 |
| `admin.html` | 工作人员后台：活动、报名、签到（帮签）、照片、看板 | 工作人员 |

## 上线三步走

### 第 1 步：新建 Supabase 项目并初始化数据库

1. 登录 [supabase.com](https://supabase.com)，**Create a new project**（建议 Region 选 Tokyo，与现有 BuddyUp 项目分开）。
2. 打开项目 → 左侧 **SQL Editor** → 把 `sql/schema.sql` 全文粘贴 → **Run**。
   - 这一步会自动建 5 张表、开启 RLS、建照片存储桶，并预置一个示例活动。
3. 打开 **Settings → API**，复制两样东西：
   - `Project URL`（形如 `https://xxxx.supabase.co`）
   - `anon public` key（形如 `sb_publishable_...`）

### 第 2 步：填入前端配置

编辑 `js/config.js`，把占位符替换为第 1 步复制的两个值：

```js
window.SUPABASE_URL = 'https://xxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_...';
```

### 第 3 步：创建工作人员账号

工作人员后台用 **Supabase Auth 邮箱+密码**登录：

- 打开项目 → **Authentication → Users → Add user → Create new user**
- 填邮箱 + 密码，勾选 **Auto Confirm User**
- 之后用这个邮箱+密码登录 `admin.html`

> 建议每个工作人员一个独立账号，这样才能区分「谁帮签、谁传的照片」。

### 第 4 步：部署到 Netlify

- 方式 A（拖拽）：把整个 `lotus-community/` 目录拖到 [app.netlify.com/drop](https://app.netlify.com/drop)
- 方式 B（CLI）：
  ```bash
  npm i -g netlify-cli
  netlify deploy --dir . --prod
  ```
- 在 Netlify 后台绑定原域名 `lotus-brief.app.workbuddy.host`（或你指定的子域名）。

## 数据与权限说明

- **居民端**：匿名访问，用「手机号后四位 + 姓名」识别身份（首次签到自动建档）。
- **签到**：居民端只能给自己签；帮签在 `admin.html` 后台进行（记录代签人）。
- **照片**：工作人员在后台按「个人照 / 大合照」上传；居民在「我的」页**只能看到自己的个人照 + 所有大合照**。

## 已知安全权衡

居民端无密码账号（靠后四位+姓名识别），数据库层面无法用 `auth.uid()` 强制「只能看自己」；照片读取靠前端按识别出的居民 ID 过滤。场景为长者活动照（非身份证等敏感信息），风险可接受。若日后需要更强隔离，可升级为「个人码 / 会员码」或把照片查询放到 Edge Function。
