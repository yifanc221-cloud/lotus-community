// ============================================================
// 居民首页：本场活动门户 + 活动报名 + 服务简报
// ============================================================
(function () {
  var sb = getSupabase();
  var $ = function (id) { return document.getElementById(id); };
  var currentActivity = null;
  var regActivityId = null;

  // ---------- 本场活动门户 ----------
  async function loadCurrent() {
    if (!sb) { $('currentPortal').innerHTML = '<span class="muted">未连接云端，请检查配置</span>'; return; }
    var { data, error } = await sb.from('activities').select('*').eq('is_current', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) { console.error(error); return; }
    currentActivity = data;
    if (data) {
      $('currentPortal').innerHTML =
        '<div class="pname">' + esc(data.title) + '</div>' +
        '<div class="pmeta">' + esc(fmtDateFull(data.date) || '') + (data.time ? ' · ' + esc(data.time) : '') + (data.location ? ' · ' + esc(data.location) : '') + '</div>';
    } else {
      $('currentPortal').innerHTML = '<div class="pname">暂未设置本场活动</div><div class="pmeta">请联系工作人员设置活动后再签到。</div>';
    }
  }

  // ---------- 活动报名列表 ----------
  async function loadActs() {
    if (!sb) return;
    var { data: acts, error } = await sb.from('activities').select('id,title,date,time,location,registration_enabled,registration_deadline,capacity').eq('registration_enabled', true).order('date', { ascending: true });
    if (error) { console.error(error); return; }
    acts = acts || [];
    if (!acts.length) { $('actList').innerHTML = '<div class="empty"><span class="em-ico">📋</span>暂无可报名的活动</div>'; return; }

    var html = '';
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      var { count: cnt } = await sb.from('registrations').select('*', { count: 'exact', head: true }).eq('activity_id', a.id);
      cnt = cnt || 0;
      var full = a.capacity && cnt >= a.capacity;
      var expired = a.registration_deadline && new Date(a.registration_deadline) < new Date();
      html +=
        '<div class="act-item">' +
          '<div class="act-title">' + esc(a.title) + '</div>' +
          '<div class="act-meta">' + esc(fmtDateFull(a.date) || '') + (a.time ? ' · ' + esc(a.time) : '') + (a.location ? ' · ' + esc(a.location) : '') + '</div>' +
          '<div class="act-foot">' +
            '<span class="act-count">' + (a.capacity ? '已报 ' + cnt + '/' + a.capacity + ' 人' : '已报 ' + cnt + ' 人') + '</span>' +
            (full ? '<span class="tag tag-gray">已满员</span>'
              : expired ? '<span class="tag tag-gray">已截止</span>'
              : '<button class="btn btn-primary btn-sm" data-reg="' + a.id + '">报名</button>') +
          '</div>' +
        '</div>';
    }
    $('actList').innerHTML = html;
  }

  // ---------- 服务简报 ----------
  async function loadBrief() {
    if (!sb) return;
    var { count: total } = await sb.from('checkins').select('*', { count: 'exact', head: true });
    var { count: people } = await sb.from('residents').select('*', { count: 'exact', head: true });
    var { count: acts } = await sb.from('activities').select('*', { count: 'exact', head: true });
    $('briefTotal').textContent = total || 0;
    $('briefPeople').textContent = people || 0;
    $('briefActs').textContent = acts || 0;

    // 各月签到人次（按 checked_in_at 聚合）
    var { data: rows, error } = await sb.from('checkins').select('checked_in_at');
    if (error || !rows) { $('monthChart').innerHTML = '<p class="muted">暂无数据</p>'; return; }
    var byMonth = {};
    rows.forEach(function (r) {
      var d = new Date(r.checked_in_at);
      var k = d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
      byMonth[k] = (byMonth[k] || 0) + 1;
    });
    var keys = Object.keys(byMonth).sort();
    if (!keys.length) { $('monthChart').innerHTML = '<p class="muted">暂无数据</p>'; return; }
    var max = Math.max.apply(null, keys.map(function (k) { return byMonth[k]; }));
    var html = '';
    keys.forEach(function (k) {
      var m = k.split('-')[1];
      var pct = Math.round(byMonth[k] / max * 100);
      html +=
        '<div style="display:flex;align-items:center;gap:10px;margin:7px 0">' +
          '<span style="flex:0 0 40px;font-size:13px;color:var(--ink2)">' + Number(m) + '月</span>' +
          '<div style="flex:1;height:16px;background:#F0EDE5;border-radius:8px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:var(--coral);border-radius:8px"></div>' +
          '</div>' +
          '<span style="flex:0 0 36px;font-size:13px;font-weight:700;color:var(--ink)">' + byMonth[k] + '</span>' +
        '</div>';
    });
    $('monthChart').innerHTML = html;
  }

  // ---------- 报名弹窗 ----------
  async function openReg(activityId) {
    regActivityId = activityId;
    $('regPin').value = '';
    $('regName').value = '';
    $('regMask').style.display = 'flex';
    $('regPin').focus();
    $('regTitle').textContent = '活动报名';
    $('regSub').textContent = '';
    var { data } = await sb.from('activities').select('title,date,time,location').eq('id', activityId).maybeSingle();
    if (data) {
      $('regTitle').textContent = data.title;
      $('regSub').textContent = esc(fmtDateFull(data.date) || '') + (data.time ? ' · ' + esc(data.time) : '') + (data.location ? ' · ' + esc(data.location) : '');
    }
  }
  function closeReg() { $('regMask').style.display = 'none'; }

  async function submitReg() {
    var pin = $('regPin').value.trim();
    var name = $('regName').value.trim();
    if (!validPin(pin)) { toast('请输入手机号后四位', 'error'); return; }
    if (!name) { toast('请输入姓名', 'error'); return; }

    var resident = await ensureResident(pin, name);
    if (!resident) { toast('操作失败，请重试', 'error'); return; }

    // 是否已报名
    var { data: dup } = await sb.from('registrations').select('id').eq('activity_id', regActivityId).eq('resident_id', resident.id).maybeSingle();
    if (dup) { toast('您已报名过本活动', 'error'); closeReg(); return; }

    // 名额检查
    var { data: act } = await sb.from('activities').select('capacity').eq('id', regActivityId).maybeSingle();
    if (act && act.capacity) {
      var { count: cnt } = await sb.from('registrations').select('*', { count: 'exact', head: true }).eq('activity_id', regActivityId);
      if ((cnt || 0) >= act.capacity) { toast('本活动已满员', 'error'); closeReg(); return; }
    }

    var { error } = await sb.from('registrations').insert({ activity_id: regActivityId, resident_id: resident.id });
    if (error) { console.error(error); toast('报名失败，请重试', 'error'); return; }
    toast('报名成功！', 'success');
    closeReg();
    loadActs();
  }

  // ---------- 事件 ----------
  $('portalRegister').addEventListener('click', function () {
    if (currentActivity && currentActivity.registration_enabled) openReg(currentActivity.id);
    else toast('本场活动暂未开放报名', 'error');
  });
  $('regClose').addEventListener('click', closeReg);
  $('regMask').addEventListener('click', function (e) { if (e.target === this) closeReg(); });
  $('regSubmit').addEventListener('click', submitReg);
  $('regPin').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('regName').focus(); });
  $('regName').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitReg(); });
  $('actList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-reg]');
    if (b) openReg(b.getAttribute('data-reg'));
  });

  // ---------- 初始化 ----------
  loadCurrent();
  loadActs();
  loadBrief();
})();
