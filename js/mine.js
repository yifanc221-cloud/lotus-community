// ============================================================
// 居民「我的」页：识别身份后查看个人照片 / 大合照 / 报名 / 签到
// ============================================================
(function () {
  var sb = getSupabase();
  var $ = function (id) { return document.getElementById(id); };
  var me = null;
  var pendingBirth = false;   // 已识别但首次登录、待补出生年月日

  // 报名状态徽标（抽签 / 押金）
  function regBadge(r, a) {
    var mode = (a && a.reg_mode) || 'first_come';
    if (mode !== 'lottery') return '<span class="tag tag-teal">报名成功</span>';
    var s = r.status || 'registered';
    var d = r.deposit_status || 'pending';
    var dep = (a && a.deposit > 0) ? ' ¥' + a.deposit : '';
    if (s === 'drawn' && d === 'pending') return '<span class="tag tag-coral">🎉 已中签 · 请缴纳押金' + dep + '</span>';
    if (s === 'drawn' && d === 'paid') return '<span class="tag tag-teal">已中签 · 押金已缴</span>';
    if (s === 'drawn' && d === 'refunded') return '<span class="tag tag-gray">已中签 · 押金已退</span>';
    if (s === 'waitlist') {
      var pos = (r.draw_order != null && a && a.capacity) ? '（第' + (r.draw_order - a.capacity) + '候补）' : '';
      return '<span class="tag tag-amber">候补中' + pos + '</span>';
    }
    if (s === 'cancelled') return '<span class="tag tag-gray">未中签</span>';
    return '<span class="tag tag-gray">已报名 · 待抽签</span>';
  }

  // 识别身份：手机号后四位 + 姓名，精确匹配
  var identifying = false;
  async function identify() {
    if (identifying) return;
    var pin = $('mPin').value.trim();
    var name = $('mName').value.trim();
    if (!validPin(pin)) { toast('请输入手机号后四位', 'error'); $('mPin').focus(); return; }
    if (!name) { toast('请输入姓名', 'error'); $('mName').focus(); return; }
    if (!sb) { toast('未连接云端，请检查配置', 'error'); return; }

    identifying = true;
    try {
      // 已识别、等待补填出生年月日
      if (pendingBirth) {
        var birth = birthRead($('identifyCard'));
        if (!birth) { toast('请选择出生年月日', 'error'); return; }
        var { error: ue } = await sb.from('residents').update({ birth_date: birth }).eq('id', me.id);
        if (ue) { toast('保存失败，请重试', 'error'); return; }
        me.birth_date = birth;
        pendingBirth = false;
        $('mBirthField').style.display = 'none';
        $('identifyBtn').textContent = '登录';
        setMe(me);
        return;
      }

      var { data, error } = await sb.from('residents')
        .select('id,pin,name,birth_date')
        .eq('pin', pin).eq('name', name)
        .maybeSingle();
      if (error) { toast('网络异常，请重试', 'error'); return; }
      if (!data) {
        toast('未找到匹配的档案，请确认手机号后四位和姓名', 'error');
        return;
      }
      me = data;
      residentLogin(data);
      if (data.birth_date) {
        setMe(data);
      } else {
        // 首次登录：补填出生年月日
        pendingBirth = true;
        $('mBirthField').style.display = 'block';
        $('identifyBtn').textContent = '保存并登录';
        toast('首次登录，请补充出生年月日');
      }
    } finally {
      identifying = false;
    }
  }

  function setMe(resident) {
    me = resident;
    $('identifyCard').style.display = 'none';
    $('result').style.display = 'block';
    $('whoami').textContent = resident.name;
    $('whoami').style.display = 'block';
    loadAll();
  }

  function photoCard(p) {
    return '<div class="ph"><img src="' + esc(photoUrl(p.storage_path)) + '" alt="" loading="lazy"><div class="ph-cap">' + esc(p.activity_title || '') + '</div></div>';
  }

  // 积分 = 参加活动次数（每场活动签到记 1 积分），按档位展示进度
  function renderPoints(pts) {
    var TIERS = [5, 10, 15, 20];
    var next = 0;
    for (var i = 0; i < TIERS.length; i++) { if (pts < TIERS[i]) { next = TIERS[i]; break; } }
    $('myPtsTotal').textContent = pts;
    if (next) {
      var prev = next - 5;
      var pct = Math.max(5, Math.round((pts - prev) / 5 * 100));
      $('myPtsFill').style.width = pct + '%';
      $('myPtsCurrent').innerHTML = '当前 <b>' + pts + '</b> 积分';
      $('myPtsNext').textContent = '再得 ' + (next - pts) + ' 积分升级礼品';
    } else {
      $('myPtsFill').style.width = '100%';
      $('myPtsCurrent').innerHTML = '当前 <b>' + pts + '</b> 积分';
      $('myPtsNext').textContent = '已达最高档 🎉';
    }
  }

  async function loadAll() {
    // 我的个人照片（经 RPC 校验后四位+姓名，只返回本人个人照，含活动标题）
    var { data: mine, error: e1 } = await sb.rpc('get_my_personal_photos', { p_pin: me.pin, p_name: me.name });
    if (!e1 && mine && mine.length) {
      $('myPhotos').innerHTML = '<div class="photo-grid">' + mine.map(photoCard).join('') + '</div>';
    } else {
      $('myPhotos').innerHTML = '<div class="empty"><span class="em-ico">🖼️</span>暂无个人照片</div>';
    }

    // 大合照
    var { data: groups, error: e2 } = await sb.from('photos')
      .select('id,storage_path,type,activities(title)')
      .eq('type', 'group')
      .order('created_at', { ascending: false });
    if (!e2 && groups && groups.length) {
      $('groupPhotos').innerHTML = '<div class="photo-grid">' + groups.map(function (p) {
        p.activity_title = p.activities ? p.activities.title : '';
        return photoCard(p);
      }).join('') + '</div>';
    } else {
      $('groupPhotos').innerHTML = '<div class="empty"><span class="em-ico">📸</span>暂无大合照</div>';
    }

    // 我的报名
    var { data: regs, error: e3 } = await sb.from('registrations')
      .select('id,registered_at,status,deposit_status,draw_order,activities(title,date,time,reg_mode,capacity,deposit)')
      .eq('resident_id', me.id)
      .order('registered_at', { ascending: false });
    if (!e3 && regs && regs.length) {
      $('myRegs').innerHTML = regs.map(function (r) {
        var a = r.activities || {};
        return '<div class="act-item"><div class="act-title">' + esc(a.title || '活动') + '</div>' +
          '<div class="act-meta">' + esc(fmtDateFull(a.date) || '') + (a.time ? ' · ' + esc(a.time) : '') + ' · 报名于 ' + esc(fmtTime(r.registered_at)) + '</div>' +
          '<div style="margin-top:6px">' + regBadge(r, a) + '</div></div>';
      }).join('');
    } else {
      $('myRegs').innerHTML = '<div class="empty"><span class="em-ico">📋</span>暂无报名记录</div>';
    }

    // 我的签到
    var { data: chk, error: e4 } = await sb.from('checkins')
      .select('id,checked_in_at,checked_in_by,activities(title,date,time)')
      .eq('resident_id', me.id)
      .order('checked_in_at', { ascending: false });
    if (!e4 && chk && chk.length) {
      $('myCheckins').innerHTML = chk.map(function (c) {
        var a = c.activities || {};
        var by = c.checked_in_by === 'self' ? '本人签到' : '工作人员代签';
        return '<div class="act-item"><div class="act-title">' + esc(a.title || '活动') + '</div>' +
          '<div class="act-meta">' + esc(fmtDateFull(a.date) || '') + (a.time ? ' · ' + esc(a.time) : '') + ' · ' + esc(fmtTime(c.checked_in_at)) + ' · ' + by + '</div></div>';
      }).join('');
    } else {
      $('myCheckins').innerHTML = '<div class="empty"><span class="em-ico">✅</span>暂无签到记录</div>';
    }

    // 积分 = 签到 + 安心生活训练完成
    renderPoints(await getResidentPoints(me.id));

    // 出勤情况：缺勤 / 报名暂停
    var ab = await absenceStatus(me.id);
    if (ab.banned_until && new Date(ab.banned_until).getTime() > Date.now()) {
      $('myAttend').innerHTML = '⛔ 报名暂停至 <b>' + esc(fmtDateFull(ab.banned_until)) + '</b>，届时自动恢复。';
    } else if (ab.absence_count > 0) {
      $('myAttend').innerHTML = '⚠️ 累计缺勤 <b>' + ab.absence_count + '</b> 节（满 5 节将暂停报名一周）。';
    } else {
      $('myAttend').innerHTML = '✅ 出勤正常，未出现缺勤。';
    }
  }

  $('identifyBtn').addEventListener('click', identify);
  $('mPin').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('mName').focus(); });
  $('mName').addEventListener('keydown', function (e) { if (e.key === 'Enter') identify(); });
  $('mName').addEventListener('blur', function () { if ($('mName').value.trim()) identify(); });
  $('switchBtn').addEventListener('click', function () {
    residentLogout();
    me = null;
    pendingBirth = false;
    $('mPin').value = '';
    $('mName').value = '';
    $('result').style.display = 'none';
    $('identifyCard').style.display = 'block';
    $('mBirthField').style.display = 'none';
    $('identifyBtn').textContent = '登录';
    $('whoami').style.display = 'none';
  });

  birthInit();

  // 已登录（sessionStorage）则自动进入，无需重复识别
  var s = residentSession();
  if (s) { me = s; setMe(s); }
})();
