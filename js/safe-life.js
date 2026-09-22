// ============================================================
// 「安心生活」共享工具：居民识别结果（sessionStorage）+ 阅读记录
// ============================================================
(function () {
  // 站点级居民会话已统一到 common.js（sessionStorage），此处保留原函数名委托之
  window.slResident = function () { return window.residentSession ? window.residentSession() : null; };
  window.slSetResident = function (r) { if (window.residentLogin) window.residentLogin(r); };
  window.slClearResident = function () { if (window.residentLogout) window.residentLogout(); };

  // 记录一次阅读 / 答题完成（供工作人员后台查看），失败静默
  // section: 'reminder' | 'cases' | 'quiz'；set: 套题 id（section='quiz' 时必填）
  window.slRecordRead = async function (section, set) {
    var r = window.slResident();
    if (!r) return;
    var sb = getSupabase();
    if (!sb) return;
    var row = { resident_id: r.id, section: section };
    if (set) row.quiz_set = set;
    var { error } = await sb.from('sl_reads').insert(row);
    if (error) console.error(error);
  };

  // 某居民某「套/类」的完成次数（用于封顶：每套/每类最多记 2 分）
  // table: 'sl_reads' | 'sl_trainings' | 'sl_exercises'
  // keyCol: 分组字段，如 'quiz_set' / 'train_type' / 'ex_type'；keyVal: 其值
  window.slSetCount = async function (table, keyCol, keyVal) {
    var r = window.slResident();
    if (!r) return 0;
    var sb = getSupabase();
    if (!sb) return 0;
    var q = sb.from(table).select('*', { count: 'exact', head: true }).eq('resident_id', r.id);
    if (keyCol && keyVal != null) q = q.eq(keyCol, keyVal);
    var { count, error } = await q;
    if (error) { console.error(error); return 0; }
    return count || 0;
  };

  // 完成一项训练后提示 +1 积分（完成记录已入库，积分由 common.js getResidentPoints 统一累计）
  window.slAwardPoints = function (label) {
    if (window.toast) toast('🎁 ' + (label || '完成训练') + ' +1 积分');
  };

  // 模块页校验：无识别结果则跳回安心生活首页；有则返回居民
  window.slRequire = function () {
    var r = window.slResident();
    if (!r) { location.replace('safe-life.html'); return null; }
    return r;
  };
})();
