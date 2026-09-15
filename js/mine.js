// ============================================================
// 居民「我的」页：识别身份后查看个人照片 / 大合照 / 报名 / 签到
// ============================================================
(function () {
  var sb = getSupabase();
  var $ = function (id) { return document.getElementById(id); };
  var me = null;

  // 识别身份：后四位 → 若多人则点选（不要求姓名完全一致）
  async function identify() {
    var pin = $('mPin').value.trim();
    if (!validPin(pin)) { toast('请输入手机号后四位', 'error'); return; }
    if (!sb) { toast('未连接云端，请检查配置', 'error'); return; }

    $('mPick').style.display = 'none';
    var list = await findResidentsByPin(pin);
    if (list === null) { toast('网络异常，请重试', 'error'); return; }

    if (list.length === 0) {
      toast('未找到您的档案，请先参加一次活动完成登记', 'error');
    } else if (list.length === 1) {
      setMe(list[0]);
    } else {
      $('mPick').innerHTML = '<p class="hint">该后四位对应多位街坊，请点选您的名字：</p>' +
        list.map(function (r) {
          return '<button class="btn btn-line btn-block" style="margin-bottom:8px" data-id="' + r.id + '" data-name="' + esc(r.name) + '" data-pin="' + r.pin + '">' + esc(r.name) + '</button>';
        }).join('');
      $('mPick').style.display = 'block';
    }
  }

  function setMe(resident) {
    me = resident;
    $('identifyCard').style.display = 'none';
    $('mPick').style.display = 'none';
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
      .select('id,registered_at,activities(title,date,time)')
      .eq('resident_id', me.id)
      .order('registered_at', { ascending: false });
    if (!e3 && regs && regs.length) {
      $('myRegs').innerHTML = regs.map(function (r) {
        var a = r.activities || {};
        return '<div class="act-item"><div class="act-title">' + esc(a.title || '活动') + '</div>' +
          '<div class="act-meta">' + esc(fmtDateFull(a.date) || '') + (a.time ? ' · ' + esc(a.time) : '') + ' · 报名于 ' + esc(fmtTime(r.registered_at)) + '</div></div>';
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

    // 积分 = 签到次数
    renderPoints((chk && chk.length) || 0);
  }

  $('identifyBtn').addEventListener('click', identify);
  $('mPin').addEventListener('keydown', function (e) { if (e.key === 'Enter') identify(); });
  $('mPick').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]');
    if (!b) return;
    setMe({ id: b.getAttribute('data-id'), name: b.getAttribute('data-name'), pin: b.getAttribute('data-pin') });
  });
  $('switchBtn').addEventListener('click', function () {
    me = null;
    $('mPin').value = '';
    $('mPick').innerHTML = ''; $('mPick').style.display = 'none';
    $('result').style.display = 'none';
    $('identifyCard').style.display = 'block';
    $('whoami').style.display = 'none';
  });
})();
