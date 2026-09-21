// ============================================================
// 工作人员后台：登录 + 活动/报名/签到/照片/看板
// ============================================================
(function () {
  var sb = getSupabase();
  var $ = function (id) { return document.getElementById(id); }
  var staff = null;
  var editingActId = null;
  var photoType = 'personal';       // 'personal' | 'group'
  var photoResidentId = null;       // 个人照关联居民
  var chkSelected = null;           // 帮签选中的居民
  var actRegMode = 'first_come';    // 活动报名方式：first_come | lottery

  // ================= 认证 =================
  function showLogin() {
    $('loginView').style.display = 'block';
    $('adminView').style.display = 'none';
    $('adminBar').style.display = 'none';
  }
  function showAdmin() {
    $('loginView').style.display = 'none';
    $('adminView').style.display = 'block';
    $('adminBar').style.display = 'flex';
    $('staffMail').textContent = staff.email;
    refreshAll();
  }

  async function initAuth() {
    if (!sb) { toast('未连接云端', 'error'); return; }
    var { data } = await sb.auth.getSession();
    if (data && data.session) { staff = data.session.user; showAdmin(); } else { showLogin(); }
  }

  $('loginBtn').addEventListener('click', async function () {
    var email = $('loginEmail').value.trim();
    var pass = $('loginPass').value;
    if (!email || !pass) { toast('请输入邮箱和密码', 'error'); return; }
    var { data, error } = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (error) { toast('登录失败：' + (error.message || '邮箱或密码错误'), 'error'); return; }
    staff = data.user;
    showAdmin();
  });
  $('loginPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('loginBtn').click(); });

  $('logoutBtn').addEventListener('click', async function () {
    await sb.auth.signOut();
    staff = null;
    showLogin();
    $('loginEmail').value = ''; $('loginPass').value = '';
  });

  // ================= Tab 切换 =================
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-p]');
    if (!b) return;
    var p = b.getAttribute('data-p');
    switchPanel(p);
    if (p === 'pSafeLife') loadSafeLife();
  });

  function switchPanel(p) {
    document.querySelectorAll('#tabs button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-p') === p); });
    document.querySelectorAll('.panel').forEach(function (x) { x.classList.toggle('on', x.id === p); });
  }

  // ================= 活动管理 =================
  async function loadActAdmin() {
    var { data, error } = await sb.from('activities').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    data = data || [];
    if (!data.length) { $('actAdminList').innerHTML = '<div class="empty">暂无活动，点右上「＋新建活动」创建</div>'; return; }
    var html = '';
    data.forEach(function (a) {
      html +=
        '<div class="act-item">' +
          '<div class="act-title">' + esc(a.title) +
            (a.is_current ? ' <span class="tag tag-coral">本场</span>' : '') +
            (a.registration_enabled ? ' <span class="tag tag-teal">报名中</span>' : '') +
            (a.reg_mode === 'lottery' ? ' <span class="tag tag-amber">抽签</span>' : '') +
          '</div>' +
          '<div class="act-meta">' + esc(fmtDateFull(a.date) || '未定日期') + (a.time ? ' · ' + esc(a.time) : '') + (a.location ? ' · ' + esc(a.location) : '') +
            (a.capacity ? ' · 名额 ' + a.capacity : '') + '</div>' +
          '<div class="act-foot" style="flex-wrap:wrap">' +
            '<button class="btn btn-sm btn-line" data-cur="' + a.id + '">' + (a.is_current ? '✓ 本场' : '设为本场') + '</button>' +
            '<button class="btn btn-sm btn-line" data-edit="' + a.id + '">编辑</button>' +
            '<button class="btn btn-sm btn-line" data-del="' + a.id + '" style="color:#C0392B">删除</button>' +
          '</div>' +
        '</div>';
    });
    $('actAdminList').innerHTML = html;
  }

  $('actAdminList').addEventListener('click', async function (e) {
    var id = e.target.getAttribute('data-cur');
    if (id) {
      await sb.from('activities').update({ is_current: false }).neq('id', '00000000-0000-0000-0000-000000000000');
      await sb.from('activities').update({ is_current: true }).eq('id', id);
      toast('已设为本场活动', 'success'); loadActAdmin(); refreshSelects(); return;
    }
    id = e.target.getAttribute('data-edit');
    if (id) { openActEditor(id); return; }
    id = e.target.getAttribute('data-del');
    if (id) {
      if (!confirm('确定删除该活动？相关报名、签到、照片将一并删除。')) return;
      await sb.from('activities').delete().eq('id', id);
      toast('已删除', 'success'); loadActAdmin(); refreshSelects(); return;
    }
  });

  function setMode(mode) {
    actRegMode = mode;
    $('aModeFirst').classList.toggle('on', mode === 'first_come');
    $('aModeLottery').classList.toggle('on', mode === 'lottery');
    $('aLotteryFields').style.display = (mode === 'lottery') ? 'block' : 'none';
  }

  function openActEditor(id) {
    editingActId = id || null;
    $('actModalTitle').textContent = id ? '编辑活动' : '新建活动';
    $('aTitle').value = ''; $('aDate').value = ''; $('aTime').value = '';
    $('aLocation').value = ''; $('aDesc').value = ''; $('aCapacity').value = ''; $('aDeadline').value = '';
    $('aRegOn').checked = false;
    $('aDeposit').value = ''; $('aDepositDeadline').value = '';
    setMode('first_come');
    if (id) {
      sb.from('activities').select('*').eq('id', id).maybeSingle().then(function (r) {
        var a = r.data; if (!a) return;
        $('aTitle').value = a.title || ''; $('aDate').value = a.date || ''; $('aTime').value = a.time || '';
        $('aLocation').value = a.location || ''; $('aDesc').value = a.description || ''; $('aCapacity').value = a.capacity || '';
        $('aDeadline').value = a.registration_deadline ? a.registration_deadline.slice(0, 16) : '';
        $('aRegOn').checked = !!a.registration_enabled;
        setMode(a.reg_mode || 'first_come');
        $('aDeposit').value = a.deposit != null ? a.deposit : '';
        $('aDepositDeadline').value = a.deposit_deadline ? a.deposit_deadline.slice(0, 16) : '';
      });
    }
    $('actMask').style.display = 'flex';
  }

  $('aModeFirst').addEventListener('click', function () { setMode('first_come'); });
  $('aModeLottery').addEventListener('click', function () { setMode('lottery'); });

  $('newActBtn').addEventListener('click', function () { openActEditor(null); });
  $('actClose').addEventListener('click', function () { $('actMask').style.display = 'none'; });
  $('actMask').addEventListener('click', function (e) { if (e.target === this) this.style.display = 'none'; });

  $('actSave').addEventListener('click', async function () {
    var title = $('aTitle').value.trim();
    if (!title) { toast('请填写活动名称', 'error'); return; }
    var payload = {
      title: title,
      date: $('aDate').value || null,
      time: $('aTime').value.trim() || null,
      location: $('aLocation').value.trim() || null,
      description: $('aDesc').value.trim() || null,
      capacity: $('aCapacity').value ? parseInt($('aCapacity').value, 10) : null,
      registration_deadline: $('aDeadline').value ? new Date($('aDeadline').value).toISOString() : null,
      registration_enabled: $('aRegOn').checked,
      reg_mode: actRegMode,
      deposit: $('aDeposit').value ? parseFloat($('aDeposit').value) : null,
      deposit_deadline: $('aDepositDeadline').value ? new Date($('aDepositDeadline').value).toISOString() : null,
      created_by: staff.id
    };
    if (editingActId) {
      var { error } = await sb.from('activities').update(payload).eq('id', editingActId);
      if (error) { toast('保存失败', 'error'); return; }
    } else {
      var { error: e2 } = await sb.from('activities').insert(payload);
      if (e2) { toast('创建失败', 'error'); return; }
    }
    toast('已保存', 'success');
    $('actMask').style.display = 'none';
    loadActAdmin(); refreshSelects();
  });

  // ================= 选择器 =================
  async function refreshSelects() {
    var { data } = await sb.from('activities').select('id,title,is_current').order('created_at', { ascending: false });
    data = data || [];
    var opts = data.map(function (a) { return '<option value="' + a.id + '">' + esc(a.title) + (a.is_current ? '（本场）' : '') + '</option>'; }).join('');
    $('regActSel').innerHTML = opts;
    $('chkActSel').innerHTML = opts;
    $('phoActSel').innerHTML = opts;
    loadRegAdmin(); loadChkAdmin(); loadPhoList();
  }

  // ================= 报名管理 =================
  var LOTTERY_STATUS = { drawn: '🎉 中签', waitlist: '候补', cancelled: '未中签', registered: '已报名' };
  var DEPOSIT_STATUS = { pending: '待缴', paid: '已缴', refunded: '已退' };

  async function loadRegAdmin() {
    var aid = $('regActSel').value;
    if (!aid) { $('regAdminList').innerHTML = '<div class="empty">请先创建活动</div>'; return; }
    var { data: act, error: ae } = await sb.from('activities')
      .select('reg_mode,capacity,deposit,deposit_deadline,lottery_done,lottery_at').eq('id', aid).maybeSingle();
    if (ae || !act) { $('regAdminList').innerHTML = '<div class="empty">活动不存在</div>'; return; }

    var { data, error } = await sb.from('registrations')
      .select('id,registered_at,status,deposit_status,deposit_paid_at,deposit_refunded_at,draw_order,residents(id,name,pin,absence_count,banned_until)')
      .eq('activity_id', aid).order('registered_at', { ascending: true });
    if (error) { console.error(error); return; }
    data = data || [];

    // 顶部：抽签 / 押金控制区
    var top = '';
    if (act.reg_mode === 'lottery') {
      if (!act.lottery_done) {
        top = '<div style="background:#F1FAF5;border:1.5px solid #BFE4D6;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:14px;color:var(--ink2);line-height:1.7">' +
          '🎲 <b>抽签模式</b> · 已报名 <b>' + data.length + '</b> 人，名额 <b>' + (act.capacity || '未设') + '</b> 人　' +
          '<button class="btn btn-sm btn-primary" data-draw="1">开始抽签</button></div>';
      } else {
        var drawn = data.filter(function (r) { return r.status === 'drawn'; }).length;
        var wait = data.filter(function (r) { return r.status === 'waitlist'; }).length;
        top = '<div style="background:#F1FAF5;border:1.5px solid #BFE4D6;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:14px;color:var(--ink2);line-height:1.7">' +
          '✅ <b>已抽签</b>（' + esc(fmtTime(act.lottery_at)) + '）· 中签 <b>' + drawn + '</b> 人 / 候补 <b>' + wait + '</b> 人' +
          (act.deposit != null ? ' · 押金 ¥' + act.deposit : '') + '</div>';
      }
    }

    if (!data.length) { $('regAdminList').innerHTML = top + '<div class="empty">暂无报名</div>'; return; }

    // 逐人重算缺勤/暂停状态（服务端函数，保证最新）
    var rows = await Promise.all(data.map(async function (r) {
      var p = r.residents || {};
      var st = { absence_count: p.absence_count || 0, banned_until: p.banned_until || null };
      if (p.id) {
        var ab = await absenceStatus(p.id);
        if (ab && typeof ab.absence_count === 'number') st = ab;
      }
      return { reg: r, p: p, st: st };
    }));

    var isLottery = act.reg_mode === 'lottery' && act.lottery_done;
    var html = top + '<table class="admin-table"><tr><th>#</th><th>姓名</th><th>后四位</th><th>报名时间</th>';
    if (isLottery) html += '<th>结果</th><th>押金</th>';
    html += '<th>考勤</th><th>操作</th></tr>';
    rows.forEach(function (o, i) {
      var p = o.p, st = o.st, r = o.reg;
      var banned = st.banned_until && new Date(st.banned_until).getTime() > Date.now();
      var attn = banned
        ? '<span style="color:#C0392B;font-weight:700">⛔ 暂停至 ' + esc(fmtDateFull(st.banned_until)) + '</span>'
        : (st.absence_count > 0 ? '缺勤 ' + st.absence_count + ' 节' : '—');
      html += '<tr><td>' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.pin) + '</td><td>' + esc(fmtTime(r.registered_at)) + '</td>';
      if (isLottery) {
        var stxt = LOTTERY_STATUS[r.status] || r.status;
        if (r.status === 'waitlist' && r.draw_order != null && act.capacity) stxt += ' 第 ' + (r.draw_order - act.capacity) + ' 位';
        var dtxt = DEPOSIT_STATUS[r.deposit_status] || r.deposit_status;
        if (r.deposit_status === 'paid' && r.deposit_paid_at) dtxt += ' ' + esc(fmtTime(r.deposit_paid_at));
        if (r.deposit_status === 'refunded' && r.deposit_refunded_at) dtxt += ' ' + esc(fmtTime(r.deposit_refunded_at));
        html += '<td>' + stxt + '</td><td>' + dtxt + '</td>';
      }
      var ops = '<button class="btn btn-sm btn-line" data-leave="' + p.id + '">请假</button>';
      if (banned) ops += ' <button class="btn btn-sm btn-line" data-unban="' + p.id + '" style="color:#C0392B">解除暂停</button>';
      if (isLottery && r.status === 'drawn' && r.deposit_status === 'pending') {
        ops += ' <button class="btn btn-sm btn-primary" data-pay="' + r.id + '">标记已缴</button>';
        ops += ' <button class="btn btn-sm btn-line" data-promote="' + r.id + '">取消并递补</button>';
      }
      if (isLottery && r.status === 'drawn' && r.deposit_status === 'paid') {
        ops += ' <button class="btn btn-sm btn-line" data-refund="' + r.id + '">标记已退</button>';
      }
      html += '<td>' + attn + '</td><td>' + ops + '</td></tr>';
    });
    html += '</table>';
    $('regAdminList').innerHTML = html;
  }

  $('regActSel').addEventListener('change', loadRegAdmin);

  // 报名名单：抽签 / 押金 / 请假 / 解除暂停
  $('regAdminList').addEventListener('click', async function (e) {
    var aid = $('regActSel').value;

    if (e.target.getAttribute('data-draw')) {
      if (!confirm('确定开始抽签？将随机抽取名额内的居民，抽签后不可撤销。')) return;
      var { data: dr, error: de } = await sb.rpc('draw_lottery', { p_activity_id: aid });
      if (de) { toast('抽签失败：' + (de.message || '请检查活动设置'), 'error'); return; }
      toast('抽签完成：中签 ' + dr.drawn + ' 人 / 候补 ' + dr.waitlist + ' 人', 'success');
      loadRegAdmin(); return;
    }
    var payId = e.target.getAttribute('data-pay');
    if (payId) {
      var { error: pe } = await sb.from('registrations').update({ deposit_status: 'paid', deposit_paid_at: new Date().toISOString() }).eq('id', payId);
      if (pe) { toast('操作失败，请重试', 'error'); return; }
      toast('已标记缴纳押金', 'success'); loadRegAdmin(); return;
    }
    var refundId = e.target.getAttribute('data-refund');
    if (refundId) {
      var { error: re } = await sb.from('registrations').update({ deposit_status: 'refunded', deposit_refunded_at: new Date().toISOString() }).eq('id', refundId);
      if (re) { toast('操作失败，请重试', 'error'); return; }
      toast('已标记退还押金', 'success'); loadRegAdmin(); return;
    }
    var promoteId = e.target.getAttribute('data-promote');
    if (promoteId) {
      if (!confirm('确定取消该中签者，并把名额递补给候补第一位？')) return;
      var { data: nextId, error: proe } = await sb.rpc('promote_waitlist', { p_registration_id: promoteId });
      if (proe) { toast('递补失败：' + (proe.message || '请重试'), 'error'); return; }
      toast(nextId ? '已递补候补居民' : '已取消，暂无候补可递补', 'success');
      loadRegAdmin(); return;
    }

    var leaveId = e.target.getAttribute('data-leave');
    if (leaveId) {
      var reason = prompt('请填写该居民的请假理由：');
      if (reason === null) return;
      reason = reason.trim();
      if (!reason) { toast('理由不能为空', 'error'); return; }
      var { data: lv } = await sb.from('leave_requests').select('id').eq('activity_id', aid).eq('resident_id', leaveId).maybeSingle();
      if (lv) { toast('该居民已登记请假', 'error'); return; }
      var { error } = await sb.from('leave_requests').insert({ activity_id: aid, resident_id: leaveId, reason: reason });
      if (error) { console.error(error); toast('登记失败，请重试', 'error'); return; }
      toast('已登记请假', 'success');
      loadRegAdmin();
      return;
    }
    var unbanId = e.target.getAttribute('data-unban');
    if (unbanId) {
      if (!confirm('确定解除该居民的报名暂停？解除后可立即报名。')) return;
      var { error } = await sb.from('residents').update({ banned_until: null }).eq('id', unbanId);
      if (error) { console.error(error); toast('解除失败，请重试', 'error'); return; }
      toast('已解除暂停', 'success');
      loadRegAdmin();
      return;
    }
  });
  $('regExport').addEventListener('click', async function () {
    var aid = $('regActSel').value;
    if (!aid) { toast('请先选择活动', 'error'); return; }
    var { data } = await sb.from('registrations').select('registered_at,residents(name,pin,birth_date)').eq('activity_id', aid).order('registered_at', { ascending: true });
    var { data: act } = await sb.from('activities').select('title').eq('id', aid).maybeSingle();
    var rows = [['姓名', '手机号后四位', '出生年月日', '年龄', '报名时间']];
    (data || []).forEach(function (r) {
      var p = r.residents || {};
      rows.push([p.name, p.pin, p.birth_date || '', ageFromBirth(p.birth_date), fmtTime(r.registered_at)]);
    });
    exportXLSX('报名名单_' + (act ? act.title : '') + '.xlsx', rows, [12, 12, 14, 8, 20]);
  });

  // ================= 签到管理 =================
  async function loadChkAdmin() {
    var aid = $('chkActSel').value;
    if (!aid) { $('chkAdminList').innerHTML = '<div class="empty">请先创建活动</div>'; return; }
    var { data, error } = await sb.from('checkins')
      .select('id,checked_in_at,checked_in_by,residents(name,pin)')
      .eq('activity_id', aid).order('checked_in_at', { ascending: true });
    if (error) { console.error(error); return; }
    data = data || [];
    if (!data.length) { $('chkAdminList').innerHTML = '<div class="empty">暂无签到</div>'; return; }
    var html = '<table class="admin-table"><tr><th>#</th><th>姓名</th><th>后四位</th><th>签到时间</th><th>方式</th></tr>';
    data.forEach(function (r, i) {
      var p = r.residents || {};
      html += '<tr><td>' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.pin) + '</td><td>' + esc(fmtTime(r.checked_in_at)) + '</td><td>' + (r.checked_in_by === 'self' ? '本人' : '代签') + '</td></tr>';
    });
    html += '</table>';
    $('chkAdminList').innerHTML = html;
  }

  $('chkActSel').addEventListener('change', loadChkAdmin);
  $('chkExport').addEventListener('click', async function () {
    var aid = $('chkActSel').value;
    if (!aid) { toast('请先选择活动', 'error'); return; }
    var { data } = await sb.from('checkins').select('checked_in_at,checked_in_by,residents(name,pin,birth_date)').eq('activity_id', aid).order('checked_in_at', { ascending: true });
    var { data: act } = await sb.from('activities').select('title').eq('id', aid).maybeSingle();
    var rows = [['姓名', '手机号后四位', '出生年月日', '年龄', '签到时间', '方式']];
    (data || []).forEach(function (r) {
      var p = r.residents || {};
      rows.push([p.name, p.pin, p.birth_date || '', ageFromBirth(p.birth_date), fmtTime(r.checked_in_at), r.checked_in_by === 'self' ? '本人' : '代签']);
    });
    exportXLSX('签到名单_' + (act ? act.title : '') + '.xlsx', rows, [12, 12, 14, 8, 20, 8]);
  });

  // 帮签：输入后四位查人
  $('chkPin').addEventListener('input', async function () {
    var pin = this.value.trim();
    chkSelected = null;
    $('chkNameField').style.display = 'none';
    $('chkBirthField').style.display = 'none';
    if (!validPin(pin)) { $('chkPeople').innerHTML = ''; return; }
    var list = await findResidentsByPin(pin);
    if (list === null) return;
    if (list.length === 0) {
      $('chkPeople').innerHTML = '<p class="hint">未找到记录，首次登记请填写姓名和出生年月日。</p>';
      $('chkNameField').style.display = 'block';
      $('chkBirthField').style.display = 'block';
    } else if (list.length === 1) {
      chkSelected = list[0];
      $('chkPeople').innerHTML = '<p class="hint" style="color:var(--teal)">将为 <b>' + esc(list[0].name) + '</b> 签到</p>';
    } else {
      $('chkPeople').innerHTML = '<p class="hint">请选择居民：</p>' + list.map(function (r) {
        return '<button class="btn btn-line btn-block chk-person" style="margin-bottom:6px" data-id="' + r.id + '">' + esc(r.name) + '</button>';
      }).join('');
    }
  });
  $('chkPeople').addEventListener('click', function (e) {
    var b = e.target.closest('.chk-person');
    if (!b) return;
    chkSelected = { id: b.getAttribute('data-id'), name: b.textContent };
    $('chkPeople').innerHTML = '<p class="hint" style="color:var(--teal)">将为 <b>' + esc(b.textContent) + '</b> 签到</p>';
  });

  $('chkDoBtn').addEventListener('click', async function () {
    var aid = $('chkActSel').value;
    if (!aid) { toast('请先创建活动', 'error'); return; }
    var pin = $('chkPin').value.trim();
    if (!validPin(pin)) { toast('请输入居民手机号后四位', 'error'); return; }

    var resident = chkSelected;
    if (!resident) {
      var name = $('chkName').value.trim();
      if (!name) { toast('请输入居民姓名', 'error'); return; }
      var birth = birthRead($('chkBirthField'));
      if (!birth) { toast('请选择出生年月日', 'error'); return; }
      resident = await ensureResident(pin, name, birth);
      if (!resident) { toast('建档失败', 'error'); return; }
    }

    var { data: dup } = await sb.from('checkins').select('id').eq('activity_id', aid).eq('resident_id', resident.id).maybeSingle();
    if (dup) { toast('该居民已签到过本场活动', 'error'); return; }

    // 本场活动若开放报名，需先核对是否已报名；未报名则二次确认
    var { data: actInfo } = await sb.from('activities').select('registration_enabled').eq('id', aid).maybeSingle();
    if (actInfo && actInfo.registration_enabled) {
      var { data: reg } = await sb.from('registrations').select('id').eq('activity_id', aid).eq('resident_id', resident.id).maybeSingle();
      if (!reg && !confirm('该居民尚未报名本场活动，仍要为其签到吗？')) { return; }
    }

    var { error } = await sb.from('checkins').insert({ activity_id: aid, resident_id: resident.id, checked_in_by: staff.id });
    if (error) { toast('签到失败', 'error'); return; }
    toast('已为 ' + resident.name + ' 签到', 'success');
    $('chkPin').value = ''; $('chkName').value = ''; $('chkPeople').innerHTML = ''; chkSelected = null; $('chkNameField').style.display = 'none'; $('chkBirthField').style.display = 'none';
    loadChkAdmin();
  });

  // ================= 照片管理 =================
  function setPhotoType(t) {
    photoType = t;
    $('typeGroupBtn').classList.toggle('on', t === 'group');
    $('typePersonalBtn').classList.toggle('on', t === 'personal');
    if (t === 'group') { $('typeGroupBtn').style.background = 'var(--teal-x)'; $('typeGroupBtn').style.color = 'var(--teal)'; $('typeGroupBtn').style.borderColor = '#BFE4D6'; $('typePersonalBtn').style.background = ''; $('typePersonalBtn').style.color = ''; $('typePersonalBtn').style.borderColor = ''; }
    else { $('typePersonalBtn').style.background = 'var(--coral-x)'; $('typePersonalBtn').style.color = 'var(--coral)'; $('typePersonalBtn').style.borderColor = 'var(--coral-l)'; $('typeGroupBtn').style.background = ''; $('typeGroupBtn').style.color = ''; $('typeGroupBtn').style.borderColor = ''; }
    $('phoResidentField').style.display = (t === 'personal') ? 'block' : 'none';
  }
  $('typeGroupBtn').addEventListener('click', function () { setPhotoType('group'); });
  $('typePersonalBtn').addEventListener('click', function () { setPhotoType('personal'); });
  setPhotoType('personal');

  $('phoPin').addEventListener('input', async function () {
    var pin = this.value.trim();
    photoResidentId = null;
    if (!validPin(pin)) { $('phoPeople').innerHTML = ''; return; }
    var list = await findResidentsByPin(pin);
    if (!list || !list.length) { $('phoPeople').innerHTML = '<p class="hint">未找到居民，请确认后四位。</p>'; return; }
    if (list.length === 1) { photoResidentId = list[0].id; }
    $('phoPeople').innerHTML = '<p class="hint">选择居民：</p>' + list.map(function (r) {
      return '<button class="btn btn-line btn-block pho-person" style="margin-bottom:6px" data-id="' + r.id + '">' + esc(r.name) + '</button>';
    }).join('');
  });
  $('phoPeople').addEventListener('click', function (e) {
    var b = e.target.closest('.pho-person');
    if (!b) return;
    photoResidentId = b.getAttribute('data-id');
    Array.prototype.forEach.call($('phoPeople').querySelectorAll('button'), function (x) { x.style.background = ''; });
    b.style.background = 'var(--coral-x)';
  });

  $('phoUploadBtn').addEventListener('click', async function () {
    var aid = $('phoActSel').value;
    if (!aid) { toast('请先创建活动', 'error'); return; }
    if (photoType === 'personal' && !photoResidentId) { toast('个人照请先选择关联居民', 'error'); return; }
    var files = $('phoFiles').files;
    if (!files || !files.length) { toast('请选择要上传的图片', 'error'); return; }

    var ok = 0, fail = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var ext = (f.name.match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0];
      var path = randomFileName(ext);
      var { error: ue } = await sb.storage.from('activity-photos').upload(path, f);
      if (ue) { console.error(ue); fail++; continue; }
      var { error: ie } = await sb.from('photos').insert({
        activity_id: aid,
        resident_id: photoType === 'personal' ? photoResidentId : null,
        type: photoType,
        storage_path: path,
        uploaded_by: staff.id
      });
      if (ie) { console.error(ie); fail++; continue; }
      ok++;
    }
    toast('上传完成：成功 ' + ok + ' 张' + (fail ? '，失败 ' + fail + ' 张' : ''), fail ? 'error' : 'success');
    $('phoFiles').value = '';
    loadPhoList();
  });

  async function loadPhoList() {
    var aid = $('phoActSel').value;
    if (!aid) { $('phoList').innerHTML = '<div class="empty">请先创建活动</div>'; return; }
    var { data, error } = await sb.from('photos')
      .select('id,type,storage_path,residents(name)')
      .eq('activity_id', aid).order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    data = data || [];
    if (!data.length) { $('phoList').innerHTML = '<div class="empty">暂无照片</div>'; return; }
    var html = '<div class="upload-grid">';
    data.forEach(function (p) {
      var cap = (p.type === 'personal' ? '个人·' + ((p.residents || {}).name || '') : '大合照');
      html += '<div class="up-item"><img src="' + esc(photoUrl(p.storage_path)) + '" alt=""><div class="ph-cap" style="position:absolute;left:0;right:0;bottom:0;font-size:11px;color:#fff;padding:10px 6px 4px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.6))">' + esc(cap) + '</div>' +
        '<button class="del" data-ph="' + p.id + '" data-path="' + esc(p.storage_path) + '">✕</button></div>';
    });
    html += '</div>';
    $('phoList').innerHTML = html;
  }
  $('phoActSel').addEventListener('change', function () { photoResidentId = null; $('phoPin').value = ''; $('phoPeople').innerHTML = ''; loadPhoList(); });

  $('phoList').addEventListener('click', async function (e) {
    var b = e.target.closest('.del');
    if (!b) return;
    if (!confirm('确定删除这张照片？')) return;
    var id = b.getAttribute('data-ph');
    var path = b.getAttribute('data-path');
    await sb.from('photos').delete().eq('id', id);
    await sb.storage.from('activity-photos').remove([path]);
    toast('已删除', 'success');
    loadPhoList();
  });

  // ================= 数据看板 =================
  async function loadStat() {
    var { count: total } = await sb.from('checkins').select('*', { count: 'exact', head: true });
    var { count: people } = await sb.from('residents').select('*', { count: 'exact', head: true });
    var { count: acts } = await sb.from('activities').select('*', { count: 'exact', head: true });
    $('sTotal').textContent = total || 0;
    $('sPeople').textContent = people || 0;
    $('sActs').textContent = acts || 0;
    var { data: rows } = await sb.from('checkins').select('checked_in_at');
    var byMonth = {};
    (rows || []).forEach(function (r) {
      var d = new Date(r.checked_in_at);
      var k = d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
      byMonth[k] = (byMonth[k] || 0) + 1;
    });
    var keys = Object.keys(byMonth).sort();
    if (!keys.length) { $('sChart').innerHTML = '<p class="muted">暂无数据</p>'; return; }
    var max = Math.max.apply(null, keys.map(function (k) { return byMonth[k]; }));
    $('sChart').innerHTML = keys.map(function (k) {
      var pct = Math.round(byMonth[k] / max * 100);
      return '<div style="display:flex;align-items:center;gap:10px;margin:7px 0"><span style="flex:0 0 40px;font-size:13px;color:var(--ink2)">' + Number(k.split('-')[1]) + '月</span>' +
        '<div style="flex:1;height:16px;background:#F0EDE5;border-radius:8px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--teal);border-radius:8px"></div></div>' +
        '<span style="flex:0 0 36px;font-size:13px;font-weight:700">' + byMonth[k] + '</span></div>';
    }).join('');
  }

  // ================= 首页内容（通知/服务/入口/设置） =================
  var openNow = true;

  function setOpenNow(v) {
    openNow = v;
    var ob = $('setOpenBtn'), cb = $('setClosedBtn');
    ob.classList.toggle('on', v);
    cb.classList.toggle('on', !v);
    if (v) {
      ob.style.background = 'var(--teal)'; ob.style.color = '#fff'; ob.style.borderColor = 'var(--teal)';
      cb.style.background = ''; cb.style.color = ''; cb.style.borderColor = '';
    } else {
      cb.style.background = '#C0392B'; cb.style.color = '#fff'; cb.style.borderColor = '#C0392B';
      ob.style.background = ''; ob.style.color = ''; ob.style.borderColor = '';
    }
  }

  async function loadHomeAdmin() {
    var { data: settings } = await sb.from('site_settings').select('key,value');
    var s = {};
    (settings || []).forEach(function (x) { s[x.key] = x.value; });
    setOpenNow(s.open_status !== 'closed');
    $('setHours').value = s.open_hours || '';
    $('setAddress').value = s.address || '';
    $('setPhone').value = s.phone || '';

    var { data: notices } = await sb.from('notices').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    notices = notices || [];
    $('noticeAdminList').innerHTML = notices.length ? notices.map(function (n) {
      return '<div class="act-item"><div class="act-title">' + (n.is_pinned ? '<span class="tag tag-coral">置顶</span> ' : '') + esc(n.title) + '</div>'
        + '<div class="act-meta">' + (n.content ? esc(n.content) : '') + '</div>'
        + '<div class="act-foot"><button class="btn btn-sm btn-line" data-npin="' + n.id + '">' + (n.is_pinned ? '取消置顶' : '置顶') + '</button>'
        + '<button class="btn btn-sm btn-line" data-ndel="' + n.id + '" style="color:#C0392B">删除</button></div></div>';
    }).join('') : '<div class="empty">暂无通知</div>';

    var { data: svcs } = await sb.from('services').select('*').order('sort', { ascending: true });
    svcs = svcs || [];
    $('svcAdminList').innerHTML = svcs.length ? svcs.map(function (sv) {
      return '<div class="act-item"><div class="act-title">' + (sv.icon ? esc(sv.icon) + ' ' : '') + esc(sv.name) + '</div>'
        + '<div class="act-meta">' + (sv.description ? esc(sv.description) : '') + '</div>'
        + '<div class="act-foot"><button class="btn btn-sm btn-line" data-sdel="' + sv.id + '" style="color:#C0392B">删除</button></div></div>';
    }).join('') : '<div class="empty">暂无服务项目</div>';

    var { data: links } = await sb.from('quick_links').select('*').order('sort', { ascending: true });
    links = links || [];
    $('linkAdminList').innerHTML = links.length ? links.map(function (l) {
      return '<div class="act-item"><div class="act-title">' + (l.icon ? esc(l.icon) + ' ' : '') + esc(l.name) + '</div>'
        + '<div class="act-meta">' + esc(l.href || '') + '</div>'
        + '<div class="act-foot"><button class="btn btn-sm btn-line" data-ldel="' + l.id + '" style="color:#C0392B">删除</button></div></div>';
    }).join('') : '<div class="empty">暂无办事入口</div>';
  }

  $('setOpenBtn').addEventListener('click', function () { setOpenNow(true); });
  $('setClosedBtn').addEventListener('click', function () { setOpenNow(false); });

  $('settingsSave').addEventListener('click', async function () {
    var kv = [
      ['open_status', openNow ? 'open' : 'closed'],
      ['open_hours', $('setHours').value.trim()],
      ['address', $('setAddress').value.trim()],
      ['phone', $('setPhone').value.trim()]
    ];
    for (var i = 0; i < kv.length; i++) {
      var { error } = await sb.from('site_settings').upsert({ key: kv[i][0], value: kv[i][1], updated_at: new Date().toISOString() });
      if (error) { console.error(error); toast('保存失败', 'error'); return; }
    }
    toast('设置已保存', 'success');
  });

  $('noticeAdd').addEventListener('click', async function () {
    var title = $('nTitle').value.trim();
    if (!title) { toast('请填写通知标题', 'error'); return; }
    var { error } = await sb.from('notices').insert({ title: title, content: $('nContent').value.trim() || null, is_pinned: $('nPin').checked });
    if (error) { toast('发布失败', 'error'); return; }
    toast('已发布', 'success');
    $('nTitle').value = ''; $('nContent').value = ''; $('nPin').checked = false;
    loadHomeAdmin();
  });

  $('svcAdd').addEventListener('click', async function () {
    var name = $('sName').value.trim();
    if (!name) { toast('请填写项目名称', 'error'); return; }
    var { error } = await sb.from('services').insert({ name: name, description: $('sDesc').value.trim() || null, icon: $('sIcon').value.trim() || null });
    if (error) { toast('添加失败', 'error'); return; }
    toast('已添加', 'success');
    $('sName').value = ''; $('sDesc').value = ''; $('sIcon').value = '';
    loadHomeAdmin();
  });

  $('linkAdd').addEventListener('click', async function () {
    var name = $('lName').value.trim();
    if (!name) { toast('请填写入口名称', 'error'); return; }
    var { error } = await sb.from('quick_links').insert({ name: name, icon: $('lIcon').value.trim() || null, href: $('lHref').value.trim() || null });
    if (error) { toast('添加失败', 'error'); return; }
    toast('已添加', 'success');
    $('lName').value = ''; $('lIcon').value = ''; $('lHref').value = '';
    loadHomeAdmin();
  });

  $('noticeAdminList').addEventListener('click', async function (e) {
    var id = e.target.getAttribute('data-ndel');
    if (id) { if (confirm('确定删除这条通知？')) { await sb.from('notices').delete().eq('id', id); loadHomeAdmin(); } return; }
    id = e.target.getAttribute('data-npin');
    if (id) {
      var { data: n } = await sb.from('notices').select('is_pinned').eq('id', id).maybeSingle();
      if (n) { await sb.from('notices').update({ is_pinned: !n.is_pinned }).eq('id', id); loadHomeAdmin(); }
      return;
    }
  });
  $('svcAdminList').addEventListener('click', async function (e) {
    var id = e.target.getAttribute('data-sdel');
    if (id && confirm('确定删除这个服务项目？')) { await sb.from('services').delete().eq('id', id); loadHomeAdmin(); }
  });
  $('linkAdminList').addEventListener('click', async function (e) {
    var id = e.target.getAttribute('data-ldel');
    if (id && confirm('确定删除这个办事入口？')) { await sb.from('quick_links').delete().eq('id', id); loadHomeAdmin(); }
  });

  // ================= 存档导出（全量 CSV） =================
  function todayStr() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  async function archResidents() {
    var { data } = await sb.from('residents').select('id,pin,name,birth_date,created_at').order('created_at', { ascending: true });
    var { data: chk } = await sb.from('checkins').select('resident_id');
    var { data: reg } = await sb.from('registrations').select('resident_id');
    var chkCount = {}, regCount = {};
    (chk || []).forEach(function (c) { chkCount[c.resident_id] = (chkCount[c.resident_id] || 0) + 1; });
    (reg || []).forEach(function (r) { regCount[r.resident_id] = (regCount[r.resident_id] || 0) + 1; });
    var rows = [['姓名', '手机号后四位', '出生年月日', '年龄', '建档时间', '累计签到·积分', '累计报名次数']];
    (data || []).forEach(function (r) {
      var n = chkCount[r.id] || 0;
      rows.push([r.name, r.pin, r.birth_date || '', ageFromBirth(r.birth_date), fmtTime(r.created_at), n, regCount[r.id] || 0]);
    });
    exportXLSX('居民档案总表_' + todayStr() + '.xlsx', rows, [12, 12, 14, 8, 20, 14, 14]);
  }

  async function archCheckins() {
    var { data } = await sb.from('checkins')
      .select('checked_in_at,checked_in_by,residents(name,pin,birth_date),activities(title,date)')
      .order('checked_in_at', { ascending: true });
    var rows = [['活动', '活动日期', '姓名', '后四位', '出生年月日', '年龄', '签到时间', '方式']];
    (data || []).forEach(function (c) {
      var r = c.residents || {}, a = c.activities || {};
      rows.push([a.title || '', a.date || '', r.name || '', r.pin || '', r.birth_date || '', ageFromBirth(r.birth_date), fmtTime(c.checked_in_at), c.checked_in_by === 'self' ? '本人' : '代签']);
    });
    exportXLSX('签到记录总表_' + todayStr() + '.xlsx', rows, [22, 14, 12, 10, 14, 8, 20, 8]);
  }

  async function archRegs() {
    var { data } = await sb.from('registrations')
      .select('registered_at,residents(name,pin,birth_date),activities(title,date)')
      .order('registered_at', { ascending: true });
    var rows = [['活动', '活动日期', '姓名', '后四位', '出生年月日', '年龄', '报名时间']];
    (data || []).forEach(function (r) {
      var rs = r.residents || {}, a = r.activities || {};
      rows.push([a.title || '', a.date || '', rs.name || '', rs.pin || '', rs.birth_date || '', ageFromBirth(rs.birth_date), fmtTime(r.registered_at)]);
    });
    exportXLSX('报名记录总表_' + todayStr() + '.xlsx', rows, [22, 14, 12, 10, 14, 8, 20]);
  }

  async function archActs() {
    var { data } = await sb.from('activities')
      .select('id,title,date,time,location,is_current,registration_enabled,capacity')
      .order('created_at', { ascending: false });
    var { data: chk } = await sb.from('checkins').select('activity_id');
    var { data: reg } = await sb.from('registrations').select('activity_id');
    var chkCount = {}, regCount = {};
    (chk || []).forEach(function (c) { chkCount[c.activity_id] = (chkCount[c.activity_id] || 0) + 1; });
    (reg || []).forEach(function (r) { regCount[r.activity_id] = (regCount[r.activity_id] || 0) + 1; });
    var rows = [['活动名称', '日期', '时段', '地点', '是否本场', '报名人数', '签到人数']];
    (data || []).forEach(function (a) {
      rows.push([a.title, a.date || '', a.time || '', a.location || '', a.is_current ? '本场' : '', regCount[a.id] || 0, chkCount[a.id] || 0]);
    });
    exportXLSX('活动汇总表_' + todayStr() + '.xlsx', rows, [24, 14, 16, 22, 10, 10, 10]);
  }

  async function archPhotos() {
    var { data } = await sb.from('photos')
      .select('type,storage_path,created_at,residents(name,pin,birth_date),activities(title)')
      .order('created_at', { ascending: true });
    data = data || [];
    if (!window.ExcelJS) { toast('Excel 组件未加载，请刷新后重试', 'error'); return; }

    toast('正在生成照片 Excel，请稍候…');
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('照片清单');

    // 表头
    var header = ['照片', '活动', '类型', '关联居民', '后四位', '出生年月日', '上传时间'];
    var hr = ws.addRow(header);
    hr.font = { bold: true };
    hr.height = 24;
    hr.eachCell(function (c) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EDE5' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // 列宽（第 1 列放图片，留足宽度）
    [18, 24, 10, 12, 10, 14, 20].forEach(function (w, idx) { ws.getColumn(idx + 1).width = w; });

    // 逐行写入 + 嵌入缩略图
    for (var i = 0; i < data.length; i++) {
      var p = data[i];
      var r = p.residents || {}, a = p.activities || {};
      var isPersonal = p.type === 'personal';
      var row = ws.addRow(['', a.title || '', isPersonal ? '个人照' : '大合照',
        isPersonal ? (r.name || '') : '—', isPersonal ? (r.pin || '') : '—',
        r.birth_date || '', fmtTime(p.created_at)]);
      row.height = 80;
      row.alignment = { vertical: 'middle' };

      var img = await fetchImageB64(photoUrl(p.storage_path), p.storage_path);
      if (img) {
        var imageId = wb.addImage({ base64: img.base64, extension: img.extension });
        // ExcelJS 锚点坐标为 0 起：表头占第 1 行(row 0)，数据第 i 条在 row i+1
        ws.addImage(imageId, {
          tl: { col: 0.1, row: i + 1.1 },
          ext: { width: 96, height: 72 }
        });
      } else {
        row.getCell(1).value = '（图片加载失败）';
      }
    }

    var buf = await wb.xlsx.writeBuffer();
    downloadBlob(buf, '照片清单_' + todayStr() + '.xlsx');
    toast('照片 Excel 已导出', 'success');
  }

  $('archResidents').addEventListener('click', archResidents);
  $('archCheckins').addEventListener('click', archCheckins);
  $('archRegs').addEventListener('click', archRegs);
  $('archActs').addEventListener('click', archActs);
  $('archPhotos').addEventListener('click', archPhotos);

  // ================= 工具 =================
  function downloadBlob(buf, filename) {
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // 通用：二维数组 → xlsx 下载（表头自动加粗 + 底纹，可选列宽）
  async function exportXLSX(filename, rows, colWidths) {
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('数据');
    ws.addRows(rows);
    var hr = ws.getRow(1);
    hr.font = { bold: true };
    hr.eachCell(function (c) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EDE5' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    if (colWidths && colWidths.length) {
      ws.columns.forEach(function (col, i) { if (colWidths[i]) col.width = colWidths[i]; });
    }
    var buf = await wb.xlsx.writeBuffer();
    downloadBlob(buf, filename);
  }

  // 图片公开 URL → { base64, extension }（用于嵌入 Excel）
  async function fetchImageB64(url, storagePath) {
    try {
      var resp = await fetch(url);
      if (!resp.ok) return null;
      var blob = await resp.blob();
      var buf = await blob.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var binary = '';
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      var ext = 'jpeg';
      var m = (storagePath || '').match(/\.([a-zA-Z0-9]+)$/);
      if (m) {
        var e = m[1].toLowerCase();
        ext = (e === 'jpg') ? 'jpeg' : e;
        if (['jpeg', 'png', 'gif', 'bmp'].indexOf(ext) < 0) ext = 'jpeg';
      }
      return { base64: btoa(binary), extension: ext };
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  // ================= 安心生活（工作人员查看） =================
  var SL_SECTION = { reminder: '今日提醒', cases: '常见案例', quiz: '小测试' };
  var SL_TYPE = { memory: '记忆力', attention: '注意力', life: '生活能力' };
  var SL_HELP = { family: '联系家属', staff: '联系工作人员', police: '拨打96110/110' };
  var SL_STATUS = ['待跟进', '跟进中', '已完成'];

  function slStatusSelect(h) {
    return '<select class="select" data-help="' + h.id + '" style="padding:6px 8px;font-size:13px;width:auto">' +
      SL_STATUS.map(function (s) {
        return '<option value="' + s + '"' + (h.status === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select>';
  }

  async function loadSafeLife() {
    var box = $('slList');
    box.innerHTML = '<div class="empty">加载中…</div>';
    var [reads, trains, exes, helps, residents] = await Promise.all([
      sb.from('sl_reads').select('resident_id,section,created_at').order('created_at', { ascending: false }),
      sb.from('sl_trainings').select('resident_id,train_type,difficulty,correct,total,duration_seconds,created_at').order('created_at', { ascending: false }),
      sb.from('sl_exercises').select('resident_id,ex_type,ex_date,duration_minutes,steps,feeling,created_at').order('ex_date', { ascending: false }),
      sb.from('sl_help_requests').select('resident_id,help_type,note,status,created_at').order('created_at', { ascending: false }),
      sb.from('residents').select('id,name,pin').order('name', { ascending: true })
    ]);
    reads = reads.data || []; trains = trains.data || []; exes = exes.data || [];
    helps = helps.data || []; residents = residents.data || [];

    var withRec = {};
    reads.forEach(function (r) { withRec[r.resident_id] = 1; });
    trains.forEach(function (r) { withRec[r.resident_id] = 1; });
    exes.forEach(function (r) { withRec[r.resident_id] = 1; });
    helps.forEach(function (r) { withRec[r.resident_id] = 1; });

    var list = residents.filter(function (r) { return withRec[r.id]; });
    if (!list.length) { box.innerHTML = '<div class="empty">暂无安心生活记录</div>'; return; }

    var g = {};
    list.forEach(function (r) { g[r.id] = { reads: [], trains: [], exes: [], helps: [] }; });
    reads.forEach(function (x) { if (g[x.resident_id]) g[x.resident_id].reads.push(x); });
    trains.forEach(function (x) { if (g[x.resident_id]) g[x.resident_id].trains.push(x); });
    exes.forEach(function (x) { if (g[x.resident_id]) g[x.resident_id].exes.push(x); });
    helps.forEach(function (x) { if (g[x.resident_id]) g[x.resident_id].helps.push(x); });

    box.innerHTML = list.map(function (res) {
      var d = g[res.id];

      // 防诈骗阅读
      var seen = {};
      var readTxt = d.reads.map(function (r) { return SL_SECTION[r.section]; })
        .filter(function (s) { if (!s || seen[s]) return false; seen[s] = 1; return true; }).join('、') || '—';

      // 脑力训练
      var trainTxt = '—';
      if (d.trains.length) {
        var t0 = d.trains[0];
        trainTxt = d.trains.length + ' 次 · 最近 ' + (SL_TYPE[t0.train_type] || t0.train_type) +
          ' ' + t0.correct + '/' + t0.total + '（' + fmtDate(t0.created_at) + '）';
      }

      // 运动记录
      var exTxt = '—';
      if (d.exes.length) {
        var e0 = d.exes[0];
        exTxt = d.exes.length + ' 次 · 最近 ' + e0.ex_type + ' ' + fmtDate(e0.ex_date) +
          ' ' + e0.duration_minutes + '分钟' + (e0.feeling ? ' · ' + e0.feeling : '');
      }

      // 求助记录
      var helpHtml = d.helps.length
        ? d.helps.map(function (h) {
            return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px dashed var(--line)">' +
              '<span style="font-size:13.5px">' + (SL_HELP[h.help_type] || h.help_type) +
                (h.note ? ' · ' + esc(h.note) : '') + ' · ' + fmtTime(h.created_at) + '</span>' +
              slStatusSelect(h) + '</div>';
          }).join('')
        : '<div style="font-size:13.5px;color:var(--ink3)">—</div>';

      return '<div class="card" style="padding:16px 16px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
          '<b style="font-size:17px">' + esc(res.name) + '</b>' +
          '<span class="tag tag-gray">后四位 ' + esc(res.pin) + '</span>' +
        '</div>' +
        '<div style="font-size:14px;color:var(--ink2);line-height:1.6">' +
          '<div>🛡️ 防诈骗阅读：' + esc(readTxt) + '</div>' +
          '<div>🧠 脑力训练：' + esc(trainTxt) + '</div>' +
          '<div>🏃 运动记录：' + esc(exTxt) + '</div>' +
        '</div>' +
        '<div style="margin-top:4px;font-size:14px;color:var(--ink2)">📣 求助跟进：</div>' + helpHtml +
      '</div>';
    }).join('');
  }

  $('slList').addEventListener('change', async function (e) {
    var sel = e.target.closest('select[data-help]');
    if (!sel) return;
    var id = sel.getAttribute('data-help');
    var status = sel.value;
    var { error } = await sb.from('sl_help_requests').update({ status: status }).eq('id', id);
    if (error) { console.error(error); toast('更新失败，请重试', 'error'); loadSafeLife(); return; }
    toast('已更新为「' + status + '」', 'success');
  });

  function refreshAll() {
    loadActAdmin(); refreshSelects(); loadStat(); loadHomeAdmin(); loadSafeLife();
  }

  birthInit();
  initAuth();
})();
