/*
 * dsh-touch 诊断脚本
 *
 * 用法:桌面窗口按 F12 打开 DevTools → Console → 粘贴本文件全部内容 → 回车。
 *
 * 它会做两件事,都是只读的(除了最后主动模拟一次长按):
 *   1. 报告插件是否加载、行锚点是否匹配、当前生效的触屏媒体查询。
 *   2. 直接派发一次 pointerdown 并等待,验证"手势 → 面板"整条链路。
 *      如果第 2 段成功,你会看到底部弹出面板后自动关闭。
 */
(async () => {
  const out = {};
  const st = window.__dshTouch && window.__dshTouch.status;
  out.plugin_loaded = !!st;
  out.status = st || null;
  if (!st) {
    out.hint = '插件没有激活。看 Console 里有没有 [dsh-touch] 开头的错误行。';
    console.log('dsh-touch 诊断', out);
    return out;
  }

  const rows = [...document.querySelectorAll('[data-row-key]')];
  out.row_count = rows.length;
  out.row_keys = rows.slice(0, 5).map((r) => r.getAttribute('data-row-key'));
  out.session_rows = rows.filter((r) => (r.getAttribute('data-row-key') || '').startsWith('session:')).length;
  out.workspace_rows = rows.filter((r) => (r.getAttribute('data-row-key') || '').startsWith('workspace:')).length;

  /* What each gesture target reads as — this is the workspace/session split. */
  const described = [];
  try {
    const rawRows = window.__dshTouch.rows ? window.__dshTouch.rows() : [];
    rawRows.slice(0, 6).forEach((_, i) => {
      described.push(window.__dshTouch.describe(i));
    });
    out.described = described;
  } catch (error) {
    out.described_error = String((error && error.message) || error);
  }

  out.media_coarse = matchMedia('(pointer:coarse)').matches;
  out.media_hover_none = matchMedia('(hover:none)').matches;
  out.max_touch_points = navigator.maxTouchPoints;
  out.user_agent = navigator.userAgent;

  const layer = document.querySelector('[class^="dsht-layer"], [class*=" dsht-layer"]');
  out.style_tag = !!document.querySelector('style[data-dsh-touch]');
  out.sheet_currently_open = !!layer;

  const target = rows.find((r) => {
    const s = getComputedStyle(r);
    return s.display !== 'none' && s.visibility !== 'hidden' && r.getClientRects().length > 0;
  });
  out.first_visible_row = target ? target.getAttribute('data-row-key') : null;
  if (target) {
    out.row_has_rowActions = !!target.querySelector('span[class*="rowActions"]');
    out.row_title_text = (target.querySelector('span[class*="title"]') || {}).textContent || null;
  }

  const before = st.openings;
  if (target) {
    const r = target.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 987654,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    target.dispatchEvent(new PointerEvent('pointerdown', opts));
    st.__synth = true;
    await new Promise((done) => setTimeout(done, 900));
    out.synth_pointerdown_worked = st.openings > before;
    out.openings_after = st.openings;
    if (window.__dshTouch) window.__dshTouch.close();
  }

  out.settings = window.__dshTouch.settings();
  out.manual_open = window.__dshTouch.open();
  if (window.__dshTouch) window.__dshTouch.close();

  console.log('dsh-touch 诊断结果', out);
  return out;
})();
