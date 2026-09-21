// ============================================================
// 「安心生活」共享工具：居民识别结果（sessionStorage）+ 阅读记录
// ============================================================
(function () {
  // 站点级居民会话已统一到 common.js（sessionStorage），此处保留原函数名委托之
  window.slResident = function () { return window.residentSession ? window.residentSession() : null; };
  window.slSetResident = function (r) { if (window.residentLogin) window.residentLogin(r); };
  window.slClearResident = function () { if (window.residentLogout) window.residentLogout(); };

  // 记录一次「防诈骗」阅读（供工作人员后台查看阅读情况），失败静默
  window.slRecordRead = async function (section) {
    var r = window.slResident();
    if (!r) return;
    var sb = getSupabase();
    if (!sb) return;
    var { error } = await sb.from('sl_reads').insert({ resident_id: r.id, section: section });
    if (error) console.error(error);
  };

  // 模块页校验：无识别结果则跳回安心生活首页；有则返回居民
  window.slRequire = function () {
    var r = window.slResident();
    if (!r) { location.replace('safe-life.html'); return null; }
    return r;
  };
})();
