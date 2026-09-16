// ============================================================
// 「安心生活」共享工具：居民识别结果（sessionStorage）+ 阅读记录
// ============================================================
(function () {
  var KEY = 'sl_resident_v1';

  // 读取当前识别到的居民 { id, name, pin }，无则 null
  window.slResident = function () {
    try {
      var raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  // 保存识别结果
  window.slSetResident = function (r) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ id: r.id, name: r.name, pin: r.pin }));
    } catch (e) {}
  };

  // 清除识别结果（切换账号）
  window.slClearResident = function () {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  };

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
