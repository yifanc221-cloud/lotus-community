// ============================================================
// 首页「活动报名」逻辑
// 依赖：index.html 内联脚本里的 $ / esc，以及 common.js 的
//       validPin / ensureResident / toast，supabase.js 的 getSupabase
// ============================================================
(function () {
  var btn = document.getElementById('pRegBtn');
  var mask = document.getElementById('regMask');
  if (!btn || !mask) return;

  var closeBtn = document.getElementById('regClose');
  var sub = document.getElementById('regSub');
  var pinEl = document.getElementById('regPin');
  var nameEl = document.getElementById('regName');
  var submit = document.getElementById('regSubmit');
  var errEl = document.getElementById('regErr');
  var voiceBtn = document.getElementById('regVoice');

  var act = null;       // 本场活动（由 buildPortal 设置 window.__currentActivity）
  var busy = false;
  var done = false;

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = msg ? 'block' : 'none';
  }

  // 语音播报：读本场活动信息 + 报名操作说明（适老化）
  function speakRegGuide() {
    var lines = ['本场活动是' + (act ? act.title || '本场活动' : '本场活动') + '。'];
    if (act && act.date) lines.push('日期' + fmtDate(act.date) + '。');
    if (act && act.time) lines.push('时间' + act.time + '。');
    if (act && act.location) lines.push('地点' + act.location + '。');
    lines.push('请在方框里输入手机号后四位和姓名，然后点确认报名。');
    speak(lines);
  }

  async function fetchCurrent() {
    var sb = getSupabase();
    if (!sb) return null;
    var { data, error } = await sb.from('activities')
      .select('id,title,date,time,location,registration_enabled,registration_deadline,capacity')
      .eq('is_current', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) { console.error(error); return null; }
    return data || null;
  }

  async function open() {
    act = window.__currentActivity || null;
    pinEl.value = '';
    nameEl.value = '';
    done = false;
    submit.textContent = '确认报名';
    showErr('');

    // 若首页数据尚未加载完成（窗口刚打开、buildPortal 还没返回），自行拉取本场活动
    if (!act) {
      sub.textContent = '正在加载本场活动…';
      submit.style.display = 'none';
      pinEl.style.display = 'none';
      nameEl.style.display = 'none';
      mask.classList.add('on');
      var fetched = await fetchCurrent();
      act = fetched;
      if (fetched) window.__currentActivity = fetched;
    }

    if (!act) {
      sub.textContent = '今天还没有设置「本场活动」，暂时无法报名。请先联系工作人员。';
      submit.style.display = 'none';
      pinEl.style.display = 'none';
      nameEl.style.display = 'none';
    } else {
      submit.style.display = '';
      pinEl.style.display = '';
      nameEl.style.display = '';

      var lines = [];
      lines.push('本场活动：' + (act.title || '长者活动'));
      if (act.date) lines.push('日期：' + fmtDate(act.date));
      if (act.time) lines.push('时间：' + (act.time || ''));
      if (act.location) lines.push('地点：' + (act.location || ''));
      sub.textContent = lines.join('　');

      if (!act.registration_enabled) {
        sub.textContent += '\n（本场活动暂未开放报名）';
        submit.disabled = true;
        submit.style.opacity = '.55';
      } else {
        submit.disabled = false;
        submit.style.opacity = '1';
        // 补充名额显示
        var sb = getSupabase();
        if (sb) {
          sb.from('registrations').select('id', { count: 'exact', head: true }).eq('activity_id', act.id).then(function (r) {
            var used = r.count || 0;
            var cap = act.capacity;
            if (cap) {
              sub.textContent = sub.textContent + '\n报名情况：' + used + ' / ' + cap + ' 人' + (used >= cap ? '（已满）' : '');
            } else {
              sub.textContent = sub.textContent + '\n已报名：' + used + ' 人';
            }
          });
        }
      }
    }
    mask.classList.add('on');
    if (pinEl.style.display !== 'none') { setTimeout(function () { pinEl.focus(); }, 60); }
  }

  function close() { mask.classList.remove('on'); }

  async function doSubmit() {
    if (busy) return;
    if (done) { close(); return; }
    showErr('');
    var sb = getSupabase();
    if (!sb) { showErr('未连接云端，请检查配置'); return; }
    if (!act) { showErr('今天还没有设置本场活动'); return; }
    if (!act.registration_enabled) { showErr('本场活动暂未开放报名'); return; }
    if (act.registration_deadline && new Date(act.registration_deadline).getTime() < Date.now()) {
      showErr('报名已截止'); return;
    }

    var pin = pinEl.value.trim();
    var name = nameEl.value.trim();
    if (!validPin(pin)) { showErr('请输入手机号后四位'); pinEl.focus(); return; }
    if (!name) { showErr('请输入姓名'); nameEl.focus(); return; }

    busy = true;
    submit.disabled = true;
    submit.textContent = '报名中…';

    // 1) 识别 / 建档
    var resident = await ensureResident(pin, name);
    if (!resident) { showErr('报名失败，请重试'); busy = false; submit.disabled = false; submit.textContent = '确认报名'; return; }

    // 2) 是否已报名
    var { data: dup } = await sb.from('registrations').select('id').eq('activity_id', act.id).eq('resident_id', resident.id).maybeSingle();
    if (dup) { showErr('您已报名本场活动，无需重复报名'); busy = false; submit.disabled = false; submit.textContent = '确认报名'; return; }

    // 3) 名额检查
    if (act.capacity) {
      var { count } = await sb.from('registrations').select('id', { count: 'exact', head: true }).eq('activity_id', act.id);
      if ((count || 0) >= act.capacity) { showErr('本场活动名额已满'); busy = false; submit.disabled = false; submit.textContent = '确认报名'; return; }
    }

    // 4) 写入报名
    var { error } = await sb.from('registrations').insert({ activity_id: act.id, resident_id: resident.id });
    if (error) {
      if (error.code === '23505') { showErr('您已报名本场活动，无需重复报名'); }
      else { console.error(error); showErr('报名失败，请重试'); }
      busy = false; submit.disabled = false; submit.textContent = '确认报名'; return;
    }

    showErr('');
    sub.textContent = '报名成功！' + (name || '') + '，欢迎参加「' + (act.title || '本场活动') + '」。';
    pinEl.style.display = 'none';
    nameEl.style.display = 'none';
    submit.textContent = '完成';
    done = true;
    toast('报名成功');
    busy = false;
  }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  if (voiceBtn) voiceBtn.addEventListener('click', speakRegGuide);
  mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
  submit.addEventListener('click', doSubmit);
  pinEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') nameEl.focus(); });
  nameEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSubmit(); });
})();
