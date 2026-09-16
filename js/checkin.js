// ============================================================
// 签到页逻辑（云端版，去掉「帮别人签到」）
// ============================================================
(function () {
  var sb = getSupabase();
  var currentActivity = null;
  var pickNames = [];
  var lastResult = null;

  var $ = function (id) { return document.getElementById(id); };
  var steps = ['stepPin', 'stepChoose', 'stepNew', 'stepLeave', 'stepDone'];

  function showStep(name) {
    steps.forEach(function (s) { $(s).style.display = (s === name) ? 'block' : 'none'; });
  }

  // ---- 语音播报（适老化）----
  function speakPinGuide() {
    var t = currentActivity ? currentActivity.title : '今天的活动';
    speak(['您好，欢迎来到莲花社区服务点。',
           '今天的活动是' + t + '。',
           '请在方框里输入您手机号码的最后四位数字，然后点确认签到。']);
  }
  function speakNameGuide() {
    speak(['您是第一次来，需要留下姓名。',
           '请在方框里写下您的名字，然后点确认并签到。',
           '填一次就好，以后再来就不用再填了。']);
  }
  function speakPickGuide() {
    var who = (pickNames && pickNames.length)
      ? '这个号码对应 ' + pickNames.length + ' 位街坊。'
      : '这个号码有好几位街坊都登记过。';
    speak([who, '请在屏幕上找到自己的名字，点一下它，就完成签到了。']);
  }
  function speakDone() {
    var r = lastResult;
    if (!r) return;
    var lines = [r.name + '，签到成功。'];
    if (r.next) {
      lines.push('您目前有 ' + r.pts + ' 积分，再得 ' + (r.next - r.pts) + ' 积分，可以升级礼品。');
    } else {
      lines.push('您目前有 ' + r.pts + ' 积分，已经达到最高档。');
    }
    lines.push('祝您今天活动愉快。');
    speak(lines);
  }

  // 加载当前活动 + 统计
  async function loadActivity() {
    if (!sb) { $('activityInfo').innerHTML = '<span class="muted">未连接云端，请检查配置</span>'; return; }
    var { data, error } = await sb.from('activities').select('*').eq('is_current', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) { console.error(error); return; }
    currentActivity = data;
    if (data) {
      $('activityInfo').innerHTML =
        '<div class="pname">' + esc(data.title) + '</div>' +
        '<div class="pmeta">' + esc(fmtDateFull(data.date) || '') + (data.time ? ' · ' + esc(data.time) : '') + (data.location ? ' · ' + esc(data.location) : '') + '</div>';
    } else {
      $('activityInfo').innerHTML = '<span class="muted">暂未设置本场活动，请联系工作人员。</span>';
    }
    loadStats();
  }

  async function loadStats() {
    if (!sb) return;
    var total = 0;
    var { count: c } = await sb.from('checkins').select('*', { count: 'exact', head: true });
    total = c || 0;
    var today = 0;
    if (currentActivity) {
      var { count: c2 } = await sb.from('checkins').select('*', { count: 'exact', head: true }).eq('activity_id', currentActivity.id);
      today = c2 || 0;
    }
    var { count: c3 } = await sb.from('residents').select('*', { count: 'exact', head: true });
    $('statToday').textContent = today;
    $('statTotal').textContent = total;
    $('statPeople').textContent = c3 || 0;
  }

  // 执行签到
  async function doCheckin(resident) {
    if (!sb || !currentActivity) { toast('当前没有可签到的活动', 'error'); return; }
    var activityId = currentActivity.id;

    // 是否已签到
    var { data: already } = await sb.from('checkins').select('id').eq('activity_id', activityId).eq('resident_id', resident.id).maybeSingle();
    var isNew = !already;

    if (isNew) {
      var { error } = await sb.from('checkins').insert({ activity_id: activityId, resident_id: resident.id, checked_in_by: 'self' });
      if (error) {
        if (error.code === '23505') { isNew = false; }
        else { console.error(error); toast('签到失败，请稍后重试', 'error'); return; }
      }
    }

    // 累计活动积分 = 参加活动次数（每场活动 1 积分）
    var { count: times } = await sb.from('checkins').select('*', { count: 'exact', head: true }).eq('resident_id', resident.id);
    var pts = times || 1;

    // 积分兑换档位（每档 5 积分，可自行调整）：达到对应积分可在年终兑换礼品
    var TIERS = [5, 10, 15, 20];
    var next = 0;
    for (var i = 0; i < TIERS.length; i++) { if (pts < TIERS[i]) { next = TIERS[i]; break; } }

    $('doneName').textContent = resident.name + '，签到成功！';
    $('doneTime').textContent = isNew ? '欢迎参加本场活动' : '您已签到过本场活动，本次不重复计分';
    $('ptsPlus').style.display = isNew ? '' : 'none';
    $('ptsTotal').textContent = pts;

    if (next) {
      var prev = next - 5;                 // 当前档的起点积分
      var pct = Math.max(5, Math.round((pts - prev) / 5 * 100));
      $('ptsFill').style.width = pct + '%';
      $('ptsCurrent').innerHTML = '当前 <b>' + pts + '</b> 积分';
      $('ptsNext').textContent = '再得 ' + (next - pts) + ' 积分升级礼品';
    } else {
      $('ptsFill').style.width = '100%';
      $('ptsCurrent').innerHTML = '当前 <b>' + pts + '</b> 积分';
      $('ptsNext').textContent = '已达最高档 🎉';
    }

    lastResult = { name: resident.name, pts: pts, next: next };
    showStep('stepDone');
    loadStats();
  }

  // 输入后四位 → 查人
  async function onPin() {
    var pin = $('pinInput').value.trim();
    if (!validPin(pin)) { toast('请输入手机号后四位数字', 'error'); $('pinInput').focus(); return; }

    var list = await findResidentsByPin(pin);
    if (list === null) { toast('网络异常，请重试', 'error'); return; }

    if (list.length === 0) {
      // 首次建档
      $('nameInput').value = '';
      showStep('stepNew');
    } else if (list.length === 1) {
      doCheckin(list[0]);
    } else {
      // 多人点选
      pickNames = list.map(function (r) { return r.name; });
      var html = '';
      list.forEach(function (r) {
        html += '<button class="btn btn-line btn-block" style="justify-content:flex-start;margin-bottom:8px" data-id="' + r.id + '">' + esc(r.name) + '</button>';
      });
      $('chooseList').innerHTML = html;
      showStep('stepChoose');
    }
  }

  // 首次建档提交（不再采集出生年月日，由「我的」页首次登录时补填）
  async function onNew() {
    var name = $('nameInput').value.trim();
    if (!name) { toast('请输入姓名', 'error'); return; }
    var pin = $('pinInput').value.trim();
    var resident = await ensureResident(pin, name, null);
    if (!resident) { toast('建档失败，请重试', 'error'); return; }
    doCheckin(resident);
  }

  // 事件绑定
  $('pinNext').addEventListener('click', onPin);
  $('pinInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') onPin(); });
  $('vbtnPin').addEventListener('click', speakPinGuide);
  $('vbtnName').addEventListener('click', speakNameGuide);
  $('vbtnPick').addEventListener('click', speakPickGuide);
  $('vbtnDone').addEventListener('click', speakDone);
  $('newSubmit').addEventListener('click', onNew);
  $('nameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') onNew(); });

  $('chooseBack').addEventListener('click', function () { $('pinInput').value = ''; showStep('stepPin'); });
  $('newBack').addEventListener('click', function () { $('pinInput').value = ''; showStep('stepPin'); });

  $('chooseList').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-id]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    // 从缓存列表里找到对应居民（重新查更稳妥）
    findResidentsByPin($('pinInput').value.trim()).then(function (list) {
      var r = (list || []).filter(function (x) { return x.id === id; })[0];
      if (r) doCheckin(r);
    });
  });

  // ===== 请假说明 =====
  $('leaveBtn').addEventListener('click', function () { $('leaveResult').textContent = ''; showStep('stepLeave'); });
  $('leaveBack').addEventListener('click', function () { showStep('stepPin'); });

  async function onLeave() {
    var pin = $('leavePin').value.trim();
    var name = $('leaveName').value.trim();
    var reason = $('leaveReason').value.trim();
    if (!validPin(pin)) { toast('请输入手机号后四位', 'error'); $('leavePin').focus(); return; }
    if (!name) { toast('请输入姓名', 'error'); $('leaveName').focus(); return; }
    if (!reason) { toast('请说明无法出席的理由', 'error'); $('leaveReason').focus(); return; }
    if (!currentActivity) { toast('暂未设置本场活动', 'error'); return; }

    var list = await findResidentsByPin(pin);
    if (list === null) { toast('网络异常，请重试', 'error'); return; }
    var resident = (list || []).filter(function (r) { return r.name === name; })[0];
    if (!resident) { $('leaveResult').textContent = '未找到您的报名记录，请确认后四位与姓名。'; return; }

    // 是否报名本场活动
    var { data: reg } = await sb.from('registrations').select('id').eq('activity_id', currentActivity.id).eq('resident_id', resident.id).maybeSingle();
    if (!reg) { $('leaveResult').textContent = '您未报名本场活动，无需请假。'; return; }

    // 是否已请假
    var { data: lv } = await sb.from('leave_requests').select('id').eq('activity_id', currentActivity.id).eq('resident_id', resident.id).maybeSingle();
    if (lv) { $('leaveResult').textContent = '您已请过假了，谢谢告知。'; return; }

    var { error } = await sb.from('leave_requests').insert({ activity_id: currentActivity.id, resident_id: resident.id, reason: reason });
    if (error) { console.error(error); toast('提交失败，请重试', 'error'); return; }

    $('leaveResult').textContent = '已登记请假，谢谢告知。';
    toast('请假成功');
    $('leavePin').value = ''; $('leaveName').value = ''; $('leaveReason').value = '';
  }

  $('leaveSubmit').addEventListener('click', onLeave);

  // 初始化
  loadActivity();
})();
