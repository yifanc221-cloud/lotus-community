// ============================================================
// 公共工具：居民身份识别、Toast、日期格式化、照片 URL
// ============================================================

// 轻提示
function toast(msg, type) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.className = ''; }, 2600);
}

// 日期格式化：'2026-09-15' → '9月15日'
function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return Number(m[2]) + '月' + Number(m[3]) + '日';
}

// 完整日期：'2026-09-15' → '2026年9月15日'
function fmtDateFull(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
}

// 时间戳 → 短日期时间
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// 转义 HTML，防止注入
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// 校验手机号后四位
function validPin(p) {
  return /^[0-9]{4}$/.test(p);
}

// 查找某后四位对应的所有居民（返回数组）
async function findResidentsByPin(pin) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('residents').select('id,pin,name').eq('pin', pin).order('name');
  if (error) { console.error(error); return null; }
  return data || [];
}

// 确保居民存在：按 (pin,name) 精确查，无则建档；返回 resident 对象或 null
// birthDate 为出生年月日 'YYYY-MM-DD'（首次建档时写入；已存在居民不会覆盖）
async function ensureResident(pin, name, birthDate) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: exist } = await sb.from('residents').select('id,pin,name,birth_date').eq('pin', pin).eq('name', name).maybeSingle();
  if (exist) return exist;
  const row = { pin: pin, name: name };
  if (birthDate) row.birth_date = birthDate;
  const { data, error } = await sb.from('residents').insert(row).select().single();
  if (error) {
    // 并发建档撞唯一约束时，重查一次
    if (error.code === '23505') {
      const { data: again } = await sb.from('residents').select('id,pin,name,birth_date').eq('pin', pin).eq('name', name).maybeSingle();
      return again || null;
    }
    console.error(error);
    return null;
  }
  return data;
}

// 缺勤/暂停状态：调用服务端重算函数，返回 { absence_count, banned_until }
async function absenceStatus(residentId) {
  const sb = getSupabase();
  if (!sb) return { absence_count: 0, banned_until: null };
  const { data, error } = await sb.rpc('recompute_resident_absence', { p_resident_id: residentId });
  if (error) { console.error(error); return { absence_count: 0, banned_until: null }; }
  if (Array.isArray(data) && data.length) return data[0];
  return { absence_count: 0, banned_until: null };
}

// 获取当前登录工作人员（无则 null）
async function currentStaff() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data && data.session ? data.session.user : null;
}

// 活动照片公开 URL
function photoUrl(storagePath) {
  return window.SUPABASE_URL + '/storage/v1/object/public/activity-photos/' + encodeURI(storagePath);
}

// 生成随机文件名（防枚举）
function randomFileName(ext) {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) + (ext || '');
}

// ============================================================
// 出生年月日：三个下拉（年/月/日），适老化、必填采集
// ============================================================

// 填充页面上所有「出生年月日」下拉的选项
function birthInit() {
  var y = new Date().getFullYear();
  var years = '<option value="">年份</option>';
  for (var i = y; i >= y - 110; i--) years += '<option value="' + i + '">' + i + '</option>';
  var months = '<option value="">月</option>';
  for (var m = 1; m <= 12; m++) months += '<option value="' + (m < 10 ? '0' + m : m) + '">' + m + '月</option>';
  var days = '<option value="">日</option>';
  for (var d = 1; d <= 31; d++) days += '<option value="' + (d < 10 ? '0' + d : d) + '">' + d + '日</option>';
  document.querySelectorAll('select[data-birth=year]').forEach(function (el) { el.innerHTML = years; });
  document.querySelectorAll('select[data-birth=month]').forEach(function (el) { el.innerHTML = months; });
  document.querySelectorAll('select[data-birth=day]').forEach(function (el) { el.innerHTML = days; });
}

// 读取一组出生年月日（传入容器元素），返回 'YYYY-MM-DD' 或 null（未选全）
function birthRead(scope) {
  var y = scope.querySelector('select[data-birth=year]');
  var m = scope.querySelector('select[data-birth=month]');
  var d = scope.querySelector('select[data-birth=day]');
  if (!y || !m || !d || !y.value || !m.value || !d.value) return null;
  return y.value + '-' + m.value + '-' + d.value;
}

// 由出生日期算周岁年龄；空则返回 ''
function ageFromBirth(b) {
  if (!b) return '';
  var bd = new Date(b);
  if (isNaN(bd.getTime())) return '';
  var now = new Date();
  var age = now.getFullYear() - bd.getFullYear();
  var m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age >= 0 ? age : '';
}

// ============================================================
// 语音播报（适老化）：Web Speech API，零依赖、离线可用，服务长者
// ============================================================
var TTS = { ok: false, voice: null, rate: 0.85, timer: null };

function ttsInit() {
  TTS.ok = ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window);
  if (!TTS.ok) return;
  TTS.voice = ttsPickVoice();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = function () { TTS.voice = ttsPickVoice(); };
  }
}

// 挑一个中文语音；不同手机可用的名字不一样，按优先级找
function ttsPickVoice() {
  try {
    var vs = window.speechSynthesis.getVoices() || [];
    var pref = ['zh-CN', 'zh_CN', 'zh-HK', 'zh_TW', 'zh'];
    for (var k = 0; k < pref.length; k++) {
      for (var i = 0; i < vs.length; i++) {
        if ((vs[i].lang || '').replace('-', '_').indexOf(pref[k].replace('-', '_')) === 0) return vs[i];
      }
    }
    for (var j = 0; j < vs.length; j++) {
      if (/chinese|中文|普通话|粤语|粤语/i.test(vs[j].name || '')) return vs[j];
    }
  } catch (e) {}
  return null;
}

// 播报一句或多句（句间自然停顿）。首次需由用户点击触发（浏览器限制）。
function speak(text) {
  if (!TTS.ok) return;
  var lines = Array.isArray(text) ? text : [text];
  lines = lines.filter(function (s) { return s && String(s).trim(); });
  if (!lines.length) return;
  try { window.speechSynthesis.cancel(); } catch (e) {}
  if (TTS.timer) { clearTimeout(TTS.timer); TTS.timer = null; }
  var i = 0;
  function next() {
    if (i >= lines.length) return;
    var line = String(lines[i++]);
    var u = new SpeechSynthesisUtterance(line);
    u.lang = (TTS.voice && TTS.voice.lang) || 'zh-CN';
    if (TTS.voice) u.voice = TTS.voice;
    u.rate = TTS.rate;   // 偏慢，长者听得清
    u.pitch = 0.95;
    u.volume = 1;
    try { window.speechSynthesis.speak(u); } catch (e) {}
    // 按字数估时长（中文约每秒 4.2 字，再乘语速系数），用定时器串起下一句
    var ms = Math.max(1500, Math.round(line.length / (4.2 * TTS.rate) * 1000)) + 320;
    TTS.timer = setTimeout(next, ms);
  }
  next();
}

// 初始化语音引擎
ttsInit();
