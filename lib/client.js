window.__ModuleLoader__.load({
  id: 'dsh-mode-switch',
  factory() {
    return {
      name: 'mode-switch',
      apply(ctx) { ctx.effect(() => mount(), 'dsh-mode-switch'); },
    };
  },
});

function mount() {
  const browser = window.dshDesktop?.browser;
  if (!browser?.acquire || !browser?.release || document.getElementById('dsh-mode-switch')) return () => {};
  let disposed = false;
  let lease = null;
  let guest = null;
  let opening = null;
  let mode = 'harness';
  let unsubscribe = null;
  let loadTimer = null;
  let navigating = false;
  let loadFailed = false;
  let crashed = false;
  let generation = 0;
  let updateFrame = null;
  let guestControlReady = false;
  const guestListeners = [];
  const root = document.createElement('div');
  root.id = 'dsh-mode-switch';
  root.innerHTML = `<style>
    #dsh-mode-switch {font:13px/1.4 system-ui,sans-serif;color:var(--dsw-alias-label-primary,#202124)}
    .dms-bar[data-dms-controls] {font:12px/1.4 system-ui,sans-serif;color:var(--dsw-alias-label-secondary,#666);display:flex;align-items:center;flex:none;min-height:32px;margin:0 0 8px;padding-left:4px;-webkit-app-region:no-drag}
    .dms-bar[data-dms-controls] button {font:inherit;cursor:pointer;border:0;border-radius:6px;background:transparent;color:inherit;padding:6px 8px;text-align:left;display:flex;gap:8px;align-items:center}
    .dms-bar[data-dms-controls] button:hover {background:var(--dsw-alias-interactive-bg-hover,#8881);color:var(--dsw-alias-label-primary,#202124)}
    .dms-bar[data-dms-controls] button:focus-visible {outline:2px solid #4d6bfe;outline-offset:2px}
    #dsh-mode-switch > .dms-bar {position:fixed;top:calc(var(--dsh-frame-chrome-top,32px) + 44px);left:16px;z-index:40;background:var(--dsw-specific-sidebar-fill,#f7f8fa);border-radius:6px}
    #dsh-mode-switch button {font:inherit;cursor:pointer;border:0;border-radius:6px;background:transparent;color:inherit;padding:6px 10px}
    #dsh-mode-switch button:focus-visible {outline:2px solid #4d6bfe;outline-offset:2px}
    #dsh-mode-switch .dms-panel {position:fixed;inset:var(--dsh-frame-chrome-top,32px) 0 0;z-index:40;background:var(--dsw-alias-bg-base,#fff);display:flex;flex-direction:column}
    #dsh-mode-switch .dms-panel > .dms-bar {position:absolute;right:16px;top:12px;z-index:2;margin:0;padding:2px;background:var(--dsw-specific-sidebar-fill,#f7f8fa);border:1px solid #8882;border-radius:8px}
    #dsh-mode-switch [hidden] {display:none!important}
    #dsh-mode-switch .dms-tools {position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:2;box-sizing:border-box;width:max-content;max-width:calc(100% - 32px);display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--dsw-specific-sidebar-fill,#f7f8fa);border:1px solid #8882;border-radius:10px;box-shadow:0 4px 20px #0001}
    #dsh-mode-switch .dms-status {flex:1;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
    #dsh-mode-switch webview {flex:1;min-height:0;width:100%;background:#fff}
    @media(max-width:700px) {#dsh-mode-switch .dms-tools {flex-wrap:wrap} #dsh-mode-switch .dms-status {flex-basis:100%} }
  </style>
  <div class="dms-bar" data-dms-controls>
    <button type="button" data-mode="deepseek" aria-label="当前模式 Harness，切换到 DeepSeek"><span class="dms-switch-label">切换到 DeepSeek</span><span aria-hidden="true">⇄</span></button>
  </div>
  <section class="dms-panel" aria-label="DeepSeek 聊天" hidden>
    <div class="dms-tools" hidden><span class="dms-status" role="status"></span><button type="button" data-action="reload">重新加载</button><button type="button" data-action="back">返回 Harness</button></div>
  </section>`;
  document.body.appendChild(root);
  const panel = root.querySelector('.dms-panel');
  const status = root.querySelector('.dms-status');
  const controls = root.querySelector('.dms-bar');
  const toggle = controls.querySelector('[data-mode]');
  // Supported DSH builds use CSS modules. Match the semantic suffix, never its
  // generated hash. The separate guest adapter touches only public logo layout.
  const logoSelector = '[class$="_logoRow"]';
  const hostInert = new Map();
  function restoreHost() {
    for (const [node, previous] of hostInert) node.inert = previous;
    hostInert.clear();
  }
  function syncHostFocus() {
    if (mode !== 'deepseek') { restoreHost(); return; }
    const host = document.getElementById('root');
    if (host && !host.contains(root)) {
      if (!hostInert.has(host)) hostInert.set(host, host.inert);
      host.inert = true;
    }
  }
  function refreshAnchor() {
    updateFrame = null;
    if (disposed) return;
    syncHostFocus();
    const row = document.querySelector(logoSelector);
    if (row && row.getBoundingClientRect().height > 0) {
      if (mode === 'harness' && row.nextElementSibling !== controls) row.after(controls);
    } else {
      if (mode === 'harness' && controls.parentNode !== root) root.appendChild(controls);
    }
  }
  const observer = new MutationObserver(() => {
    if (updateFrame === null && !disposed) updateFrame = requestAnimationFrame(refreshAnchor);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-sidebar-collapsed'] });
  refreshAnchor();
  const listeners = [];
  function listen(target, event, handler, bucket = listeners) {
    target.addEventListener(event, handler);
    bucket.push(() => target.removeEventListener(event, handler));
  }
  function message(text, visible = true) {
    if (disposed) return;
    status.textContent = text;
    status.parentElement.hidden = !visible;
  }
  function setGuestControl(ready) {
    guestControlReady = ready;
    controls.hidden = mode === 'deepseek' && ready;
    if (controls.hidden && document.activeElement === toggle) guest?.focus();
  }
  function clearLoadTimer() { clearTimeout(loadTimer); loadTimer = null; }
  function release(reserved) {
    if (typeof reserved?.lease === 'string') void Promise.resolve().then(() => browser.release(reserved.lease)).catch(() => {});
  }
  function cleanupGuest() {
    generation++;
    clearLoadTimer();
    guestListeners.splice(0).forEach(remove => remove());
    try { unsubscribe?.(); } catch { /* A failing host disposer must not leak the lease. */ }
    unsubscribe = null;
    guest?.remove(); guest = null;
    release(lease); lease = null;
    navigating = false; crashed = false; loadFailed = false;
    setGuestControl(false);
  }
  async function createGuest() {
    const attempt = ++generation;
    const reserved = await browser.acquire('dsh-mode-switch:deepseek');
    if (disposed || attempt !== generation) { release(reserved); return; }
    lease = reserved;
    if (typeof lease?.lease !== 'string' || !lease.lease || typeof lease.partition !== 'string' || !lease.partition) {
      throw new Error('桌面浏览器返回了无效的页面凭据');
    }
    const view = document.createElement('webview');
    guest = view;
    const current = () => !disposed && guest === view;
    const on = (event, handler) => listen(view, event, handler, guestListeners);
    // UI-only messages have no payload and cannot access any host capability.
    const signal = `dsh-mode-switch:${[...crypto.getRandomValues(new Uint32Array(4))].map(n => n.toString(16)).join('-')}:`;
    const isChat = () => { try { return new URL(view.getURL()).origin === 'https://chat.deepseek.com'; } catch { return false; } };
    function adaptGuest() {
      if (!current() || !isChat() || !view.executeJavaScript) return;
      void Promise.resolve().then(() => view.executeJavaScript(`(${installGuestControl.toString()})(${JSON.stringify(signal)})`)).catch(() => {
        if (current()) setGuestControl(false);
      });
    }
    on('console-message', event => {
      if (!current() || !isChat()) return;
      if (event.message === `${signal}ready`) setGuestControl(true);
      else if (event.message === `${signal}fallback`) setGuestControl(false);
      else if (event.message === `${signal}back`) select('harness');
    });
    on('did-start-navigation', event => {
      if (event.isMainFrame !== false && !event.isInPlace) setGuestControl(false);
    });
    function navigate(url) {
      void Promise.resolve().then(() => { if (current()) return view.loadURL(url); }).catch(error => {
        if (current() && error?.code !== 'ERR_ABORTED') {
          loadFailed = true; clearLoadTimer();
          message(`加载失败：${error?.message || '未知错误'}。可重新加载或返回 Harness。`);
        }
      });
    }
    guest.setAttribute('partition', lease.partition);
    guest.setAttribute('name', lease.lease);
    guest.setAttribute('data-sidebar-browser-frame', '');
    guest.setAttribute('src', `about:blank#${lease.lease}`);
    // The first blank document registers the guest with DSH's owner checks.
    on('dom-ready', () => {
      if (!navigating) {
        navigating = true;
        navigate('https://chat.deepseek.com/');
      } else adaptGuest();
    });
    on('did-start-loading', () => {
      loadFailed = false;
      message('正在加载 DeepSeek…', false);
      clearLoadTimer();
      loadTimer = setTimeout(() => message('加载时间较长，可重新加载或返回 Harness。'), 30000);
    });
    on('did-stop-loading', () => {
      clearLoadTimer();
      if (loadFailed || crashed) return;
      let url;
      try { url = new URL(view.getURL()); } catch { return; }
      if (url.origin === 'https://chat.deepseek.com') {
        message(lease.partition.startsWith('persist:')
          ? 'DeepSeek · 已启用本地登录状态保存；登录过期时需重新登录'
          : 'DeepSeek · 切换可保留当前页面；退出应用后可能需要重新登录', false);
        adaptGuest();
      } else if (url.protocol === 'https:') message(`当前页面：${url.hostname} · 返回聊天可重新加载`);
    });
    on('did-fail-load', event => {
      if (event.errorCode !== -3 && event.isMainFrame !== false) {
        loadFailed = true;
        setGuestControl(false);
        clearLoadTimer();
        message(`加载失败：${event.errorDescription || event.errorCode}。可重新加载或返回 Harness。`);
      }
    });
    on('render-process-gone', () => {
      crashed = true; loadFailed = true; clearLoadTimer();
      setGuestControl(false);
      message('DeepSeek 页面已停止，可重新加载或返回 Harness。');
    });
    unsubscribe = browser.onOpenRequested?.(lease.lease, url => {
      // Keep new chat/auth links in the owned view, without granting Node access.
      try {
        const destination = new URL(url);
        if (current() && destination.protocol === 'https:' && !destination.username && !destination.password) navigate(destination.href);
      } catch { /* Ignore malformed destinations. */ }
    });
    panel.appendChild(guest);
  }
  async function ensureGuest() {
    if (disposed || guest) return;
    if (!opening) {
      opening = createGuest().catch(error => {
        cleanupGuest();
        message(`无法打开 DeepSeek：${error?.message || '未知错误'}`);
      }).finally(() => { opening = null; });
    }
    await opening;
  }
  function select(next) {
    mode = next;
    panel.hidden = mode !== 'deepseek';
    const nextMode = mode === 'deepseek' ? 'harness' : 'deepseek';
    const label = nextMode === 'harness' ? 'Harness' : 'DeepSeek';
    toggle.dataset.mode = nextMode;
    toggle.setAttribute('aria-label', `当前模式 ${mode === 'harness' ? 'Harness' : 'DeepSeek'}，切换到 ${label}`);
    toggle.querySelector('.dms-switch-label').textContent = `切换到 ${label}`;
    if (mode === 'deepseek') {
      panel.appendChild(controls);
      void ensureGuest();
    } else refreshAnchor();
    setGuestControl(guestControlReady);
    syncHostFocus();
    if (controls.hidden) guest?.focus();
    else toggle.focus({ preventScroll: true });
  }
  listen(toggle, 'click', () => select(toggle.dataset.mode));
  listen(root.querySelector('[data-action=back]'), 'click', () => select('harness'));
  listen(root.querySelector('[data-action=reload]'), 'click', () => {
    // Recreate failed/crashed guests too: reload() cannot revive every renderer,
    // and a rejected first navigation may leave the guest on about:blank.
    if (guest && (crashed || loadFailed)) { cleanupGuest(); void ensureGuest(); }
    else if (guest) {
      const view = guest;
      const failed = error => { if (!disposed && guest === view) { loadFailed = true; message(`重新加载失败：${error?.message || '未知错误'}`); } };
      try {
        void Promise.resolve(view.loadURL('https://chat.deepseek.com/')).catch(failed);
      } catch (error) { failed(error); }
    } else void ensureGuest();
  });
  // The Harness DOM and guest both stay mounted when switching views.
  return () => {
    disposed = true;
    observer.disconnect();
    if (updateFrame !== null) cancelAnimationFrame(updateFrame);
    restoreHost();
    cleanupGuest();
    listeners.forEach(remove => remove());
    controls.remove();
    root.remove();
  };
}

// Serialized into the owned, sandboxed website. It reads logo geometry only:
// never input values, account details, storage, cookies or conversation text.
function installGuestControl(signal) {
  if (location.origin !== 'https://chat.deepseek.com' || window !== window.top) return;
  const key = '__dshModeSwitchLogoControl';
  if (window[key]?.signal === signal) { window[key].refresh(); return; }
  window[key]?.dispose();
  let frame = null, disposed = false, announced = null, observed = null;
  const emit = suffix => console.info(signal + suffix);
  const holder = document.createElement('div');
  holder.setAttribute('data-dsh-mode-switch', '');
  holder.style.cssText = 'display:block;flex:none;align-self:stretch;margin:0 12px 8px;min-height:30px';
  const shadow = holder.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host {color:var(--dsw-alias-label-secondary,#666)}
    button {font:12px/1.5 system-ui,sans-serif;display:flex;align-items:center;gap:8px;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:inherit;cursor:pointer}
    button:hover {background:var(--dsw-alias-interactive-bg-hover,#8881);color:var(--dsw-alias-label-primary,#202124)}
    button:focus-visible {outline:2px solid #4d6bfe;outline-offset:2px}
  </style><button type="button" aria-label="当前模式 DeepSeek，切换到 Harness">切换到 Harness <span aria-hidden="true">⇄</span></button>`;
  shadow.querySelector('button').addEventListener('click', () => emit('back'));
  function findRow() {
    // Public website class hashes change independently of desktop releases.
    // Require a wide wordmark at the top left, never a central greeting icon.
    for (const logo of document.querySelectorAll('svg[viewBox],img[alt="DeepSeek"]')) {
      const r = logo.getBoundingClientRect();
      if (r.left < 0 || r.left > 40 || r.top < 0 || r.top > 85 || r.width < 96 || r.width > 240 || r.height < 12 || r.height > 52 || r.width / r.height < 3) continue;
      let row = null, ancestor = logo.parentElement;
      for (let depth = 0; ancestor && depth < 5; depth++, ancestor = ancestor.parentElement) {
        const bounds = ancestor.getBoundingClientRect();
        if (bounds.height > 88 || bounds.width > 420) break;
        if (bounds.width >= 180 && bounds.height >= r.height) row = ancestor;
      }
      if (row && getComputedStyle(row).visibility !== 'hidden' && getComputedStyle(row).opacity !== '0') return row;
    }
    return null;
  }
  const resize = new ResizeObserver(schedule);
  function refresh() {
    frame = null;
    if (disposed) return;
    const row = findRow();
    if (row !== observed) { resize.disconnect(); if (row) resize.observe(row); observed = row; }
    if (row) {
      if (row.nextElementSibling !== holder) row.after(holder);
    } else if (holder.isConnected) holder.remove();
    const ready = !!row && holder.getBoundingClientRect().height > 0;
    if (ready !== announced) { announced = ready; emit(ready ? 'ready' : 'fallback'); }
  }
  function schedule() { if (!disposed && frame === null) frame = requestAnimationFrame(refresh); }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  window.addEventListener('resize', schedule);
  window[key] = { signal, refresh: schedule, dispose() {
    disposed = true; observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule);
    if (frame !== null) cancelAnimationFrame(frame);
    holder.remove(); delete window[key];
  } };
  refresh();
}
