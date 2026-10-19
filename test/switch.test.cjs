const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const launchOptions = { headless: true, ...(process.env.DSH_TEST_BROWSER_CHANNEL ? { channel: process.env.DSH_TEST_BROWSER_CHANNEL } : {}) };

test('mode switching preserves guest and Harness state; disposal releases ownership', async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="root"><textarea id="draft">unfinished work</textarea></main>');
    await page.evaluate(() => {
      window.stats = { acquired: 0, released: [], loaded: [] };
      window.dshDesktop = { browser: {
        async acquire() { window.stats.acquired++; return { lease: 'test-lease', partition: 'test-partition' }; },
        async release(id) { window.stats.released.push(id); },
        onOpenRequested() { return () => {}; },
      }};
      window.__ModuleLoader__ = { load(module) { module.factory().apply({ effect(fn) { window.disposePlugin = fn(); } }); } };
      const create = document.createElement.bind(document);
      document.createElement = name => {
        const node = create(name);
        if (name === 'webview') {
          node.loadURL = async url => { window.stats.loaded.push(url); node.currentURL = url; };
          node.getURL = () => node.currentURL || 'about:blank#test-lease';
          node.reload = () => {};
        }
        return node;
      };
    });
    await page.addScriptTag({ path: path.resolve(__dirname, '../lib/client.js') });
    assert.equal(await page.locator('.dms-panel').isVisible(), false);
    await page.locator('[data-mode=deepseek]').click();
    assert.equal(await page.locator('#root').evaluate(node => node.inert), true);
    await page.locator('#draft').evaluate(node => node.focus());
    assert.equal(await page.locator('#draft').evaluate(node => document.activeElement === node), false);
    await page.locator('webview').waitFor({ state: 'attached' });
    await page.locator('webview').dispatchEvent('dom-ready');
    assert.equal(await page.evaluate(() => window.stats.acquired), 1);
    assert.deepEqual(await page.evaluate(() => window.stats.loaded), ['https://chat.deepseek.com/']);
    await page.locator('[data-mode=harness]').click();
    assert.equal(await page.locator('#root').evaluate(node => node.inert), false);
    assert.equal(await page.locator('.dms-panel').isVisible(), false);
    assert.equal(await page.locator('#draft').inputValue(), 'unfinished work');
    await page.locator('[data-mode=deepseek]').click();
    assert.equal(await page.evaluate(() => window.stats.acquired), 1);
    await page.evaluate(() => { const host = document.querySelector('#root'); const replacement = host.cloneNode(true); replacement.inert = false; host.replaceWith(replacement); });
    await page.waitForFunction(() => document.querySelector('#root').inert);
    assert.equal(await page.locator('webview').count(), 1);
    await page.locator('webview').dispatchEvent('did-fail-load', { errorCode: -105, errorDescription: 'ERR_NAME_NOT_RESOLVED', isMainFrame: true });
    assert.match(await page.locator('.dms-status').textContent(), /加载失败/);
    await page.locator('[data-action=back]').click();
    assert.equal(await page.locator('.dms-panel').isVisible(), false);
    await page.locator('[data-mode=deepseek]').click();
    await page.evaluate(() => window.disposePlugin());
    assert.equal(await page.locator('#root').evaluate(node => node.inert), false);
    assert.equal(await page.locator('#dsh-mode-switch').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.stats.released), ['test-lease']);
  } finally { await browser.close(); }
});

test('late acquire after unload releases its lease and does not mount a guest', async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent('<main>Harness</main>');
    await page.evaluate(() => {
      window.released = [];
      window.dshDesktop = { browser: {
        acquire: () => new Promise(resolve => { window.resolveAcquire = resolve; }),
        release: async id => { window.released.push(id); },
      }};
      window.__ModuleLoader__ = { load(module) { module.factory().apply({ effect(fn) { window.disposePlugin = fn(); } }); } };
    });
    await page.addScriptTag({ path: path.resolve(__dirname, '../lib/client.js') });
    await page.locator('[data-mode=deepseek]').click();
    await page.evaluate(async () => {
      window.disposePlugin();
      window.resolveAcquire({ lease: 'late', partition: 'late-partition' });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.deepEqual(await page.evaluate(() => window.released), ['late']);
    assert.equal(await page.locator('webview').count(), 0);
  } finally { await browser.close(); }
});

async function mockPage(browser) {
  const page = await browser.newPage();
  await page.setContent('<main><textarea id="draft">keep this draft</textarea></main>');
  await page.evaluate(() => {
    window.stats = { acquired: 0, released: [], loaded: [], unsubscribed: 0 };
    window.dshDesktop = { browser: {
      async acquire() {
        window.stats.acquired++;
        if (window.failAcquire) { window.failAcquire = false; throw new Error('acquire test failure'); }
        return { lease: `lease-${window.stats.acquired}`, partition: 'persist:test-only' };
      },
      async release(id) { window.stats.released.push(id); if (window.failRelease) throw new Error('release test failure'); },
      onOpenRequested(_lease, callback) {
        if (window.failSubscribe) { window.failSubscribe = false; throw new Error('subscribe test failure'); }
        window.openRequested = callback;
        return () => { window.stats.unsubscribed++; if (window.failUnsubscribe) throw new Error('unsubscribe test failure'); };
      },
    }};
    window.__ModuleLoader__ = { load(module) { module.factory().apply({ effect(fn) { window.disposePlugin = fn(); } }); } };
    const create = document.createElement.bind(document);
    document.createElement = name => {
      const node = create(name);
      if (name === 'webview') {
        node.loadURL = url => {
          if (window.failNavigation) { window.failNavigation = false; throw new Error('navigation test failure'); }
          window.stats.loaded.push(url); node.currentURL = url; return Promise.resolve();
        };
        node.getURL = () => node.currentURL || 'about:blank';
        node.executeJavaScript = source => window.executeGuest?.(source);
      }
      return node;
    };
  });
  await page.addScriptTag({ path: path.resolve(__dirname, '../lib/client.js') });
  return page;
}

test('acquire/subscription failures retry, and a crashed guest is recreated without leaking ownership', async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await mockPage(browser), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => { window.failAcquire = true; });
    await page.locator('[data-mode=deepseek]').click();
    await page.waitForFunction(() => document.querySelector('.dms-status').textContent.includes('acquire test failure'));
    await page.evaluate(() => { window.failSubscribe = true; });
    await page.locator('[data-action=reload]').click();
    await page.waitForFunction(() => document.querySelector('.dms-status').textContent.includes('subscribe test failure'));
    await page.locator('[data-action=reload]').click();
    await page.locator('webview').waitFor({ state: 'attached' });
    await page.locator('webview').dispatchEvent('dom-ready');
    await page.locator('webview').dispatchEvent('render-process-gone');
    assert.match(await page.locator('.dms-status').textContent(), /页面已停止/);
    await page.evaluate(() => { window.oldGuest = document.querySelector('webview'); });
    await page.locator('[data-action=reload]').click();
    await page.waitForFunction(() => document.querySelector('webview')?.getAttribute('name') === 'lease-4');
    await page.locator('webview').dispatchEvent('dom-ready');
    await page.locator('webview').dispatchEvent('did-stop-loading');
    const recovered = await page.locator('.dms-status').textContent();
    assert.match(recovered, /本地登录状态保存/);
    await page.evaluate(() => window.oldGuest.dispatchEvent(new Event('render-process-gone')));
    assert.equal(await page.locator('.dms-status').textContent(), recovered);
    await page.evaluate(() => { window.failRelease = true; window.failUnsubscribe = true; window.disposePlugin(); });
    await page.waitForFunction(() => window.stats.released.length === 3);
    assert.deepEqual(await page.evaluate(() => window.stats.released), ['lease-2', 'lease-3', 'lease-4']);
    assert.equal(await page.locator('webview').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('website logo control occupies its own row, remounts once, and returns via an origin-scoped UI signal', async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const guest = await browser.newPage();
    await guest.route('https://chat.deepseek.com/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <style>body{margin:0}aside{width:260px;height:100vh;background:#f7f8fa;display:flex;flex-direction:column}
      .logo-row{height:64px;flex:none;display:flex;align-items:center;padding:0 16px;gap:12px}.logo-row svg{width:140px;height:30px}
      #new-chat{height:40px;flex:none;margin:6px 12px}aside.collapsed{display:none}</style>
      <aside><div class="logo-row"><svg viewBox="0 0 140 30"><path d="M0 0h140v30H0z"/></svg><button>Collapse</button></div><button id="new-chat">New chat</button></aside>` }));
    await guest.goto('https://chat.deepseek.com/');
    const before = await guest.locator('#new-chat').boundingBox();
    const page = await mockPage(browser);
    await page.exposeFunction('executeGuest', source => guest.evaluate(source));
    const pending = new Set();
    guest.on('console', event => {
      const message = event.text();
      if (!message.startsWith('dsh-mode-switch:')) return;
      const task = page.evaluate(message => {
        const event = new Event('console-message'); event.message = message;
        document.querySelector('webview')?.dispatchEvent(event);
      }, message).catch(() => {}).finally(() => pending.delete(task));
      pending.add(task);
    });
    await page.locator('[data-mode=deepseek]').click();
    await page.locator('webview').dispatchEvent('dom-ready');
    await page.locator('webview').dispatchEvent('dom-ready');
    await page.waitForFunction(() => document.querySelector('[data-dms-controls]').hidden);
    assert.equal(await page.locator('.dms-tools').isVisible(), false);
    const action = guest.locator('[data-dsh-mode-switch] button');
    assert.equal(await action.textContent(), '切换到 Harness ⇄');
    const buttonBox = await action.boundingBox(), logoBox = await guest.locator('.logo-row').boundingBox();
    const after = await guest.locator('#new-chat').boundingBox();
    assert.ok(buttonBox.y >= logoBox.y + logoBox.height);
    assert.ok(after.y >= buttonBox.y + buttonBox.height && after.y - before.y >= 30);
    await page.locator('webview').dispatchEvent('did-stop-loading');
    await guest.waitForTimeout(50);
    assert.equal(await guest.locator('[data-dsh-mode-switch]').count(), 1);
    await action.click();
    await page.waitForFunction(() => document.querySelector('.dms-panel').hidden);
    await page.locator('[data-mode=deepseek]').click();
    assert.equal(await page.evaluate(() => window.stats.acquired), 1);
    // Fold/unfold and React-style replacement must recover without duplicates.
    await guest.locator('aside').evaluate(node => node.className = 'collapsed');
    await page.waitForFunction(() => !document.querySelector('[data-dms-controls]').hidden);
    await guest.locator('aside').evaluate(node => { node.className = ''; node.innerHTML = node.innerHTML; });
    await page.waitForFunction(() => document.querySelector('[data-dms-controls]').hidden);
    assert.equal(await guest.locator('[data-dsh-mode-switch]').count(), 1);
    // The signal conveys no data and does nothing while an external page is open.
    const signal = await guest.evaluate(() => window.__dshModeSwitchLogoControl.signal);
    await page.evaluate(signal => {
      const view = document.querySelector('webview'); view.currentURL = 'https://example.org/';
      const event = new Event('console-message'); event.message = `${signal}back`; view.dispatchEvent(event);
    }, signal);
    assert.equal(await page.locator('.dms-panel').isVisible(), true);
    await page.locator('webview').dispatchEvent('did-start-navigation', { isMainFrame: true, isInPlace: false });
    assert.equal(await page.locator('[data-mode=harness]').isVisible(), true);
    await page.locator('[data-mode=harness]').click();
    await page.evaluate(() => window.disposePlugin());
    await Promise.all([...pending]);
  } finally { await browser.close(); }
});

test('failed initial navigation recovers, unsafe popup URLs are ignored, and external host is visible', async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await mockPage(browser);
    await page.evaluate(() => { window.failNavigation = true; });
    await page.locator('[data-mode=deepseek]').click();
    await page.locator('webview').dispatchEvent('dom-ready');
    await page.waitForFunction(() => document.querySelector('.dms-status').textContent.includes('navigation test failure'));
    await page.locator('[data-action=reload]').click();
    await page.waitForFunction(() => document.querySelector('webview')?.getAttribute('name') === 'lease-2');
    await page.locator('webview').dispatchEvent('dom-ready');
    await page.evaluate(() => {
      for (const url of ['javascript:alert(1)', 'file:///tmp/test', 'http://example.org/', 'https://user:pass@example.org/', 'invalid']) window.openRequested(url);
    });
    assert.deepEqual(await page.evaluate(() => window.stats.loaded), ['https://chat.deepseek.com/']);
    await page.evaluate(() => window.openRequested('https://example.org/help'));
    await page.locator('webview').dispatchEvent('did-stop-loading');
    assert.match(await page.locator('.dms-status').textContent(), /example\.org/);
    await page.locator('[data-action=reload]').click();
    assert.equal(await page.evaluate(() => window.stats.loaded.at(-1)), 'https://chat.deepseek.com/');
    await page.locator('[data-mode=harness]').click();
    assert.equal(await page.locator('#draft').inputValue(), 'keep this draft');
  } finally { await browser.close(); }
});

test('web-only hosts are a no-op and repeated mounts create only one mode bar', async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent('<main>Web Harness</main>');
    await page.evaluate(() => {
      window.__ModuleLoader__ = { load(module) { module.factory().apply({ effect(fn) { fn(); } }); } };
    });
    const script = path.resolve(__dirname, '../lib/client.js');
    await page.addScriptTag({ path: script });
    assert.equal(await page.locator('#dsh-mode-switch').count(), 0);
    await page.evaluate(() => { window.dshDesktop = { browser: { acquire() {}, release() {} } }; });
    await page.addScriptTag({ path: script });
    await page.addScriptTag({ path: script });
    assert.equal(await page.locator('#dsh-mode-switch').count(), 1);
  } finally { await browser.close(); }
});

test('one action follows the native logo and survives sidebar remount/collapse without a duplicate chat header', async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await mockPage(browser);
    await page.evaluate(() => {
      document.head.insertAdjacentHTML('beforeend', '<style>.fixture_logoRow{height:40px}.fixture_brandMark svg{width:24px;height:24px}[data-collapsed] .fixture_logoRow{height:0}</style>');
      const sidebar = document.createElement('aside');
      sidebar.id = 'sidebar';
      sidebar.innerHTML = '<div class="fixture_logoRow"><span class="fixture_brandMark"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24H0z"/></svg></span><span class="fixture_brandName"><svg viewBox="26 0 156 24"><defs><clipPath id="badge"><rect width="24" height="24"/></clipPath></defs><path clip-path="url(#badge)" fill="currentColor" d="M26 0h102v24H26z"/></svg></span></div><button id="native-new">New session</button>';
      document.body.prepend(sidebar);
      window.originalBrand = sidebar.querySelector('.fixture_logoRow').outerHTML;
    });
    await page.waitForFunction(() => document.querySelector('#sidebar .fixture_logoRow').nextElementSibling?.hasAttribute('data-dms-controls'));
    assert.equal(await page.locator('[data-dms-controls] button').count(), 1);
    const original = await page.evaluate(() => window.originalBrand);
    await page.locator('[data-mode=deepseek]').click();
    assert.equal(await page.locator('.dms-panel > [data-dms-controls]').count(), 1);
    assert.equal(await page.locator('.dms-chat-header,.dms-brand').count(), 0);
    assert.equal(await page.locator('#sidebar .fixture_logoRow').evaluate(node => node.outerHTML), original);
    // Responsive layout and dark host colors must not recreate the guest.
    await page.setViewportSize({ width: 480, height: 640 });
    await page.evaluate(() => document.documentElement.style.setProperty('--dsw-specific-sidebar-fill', '#202124'));
    assert.equal(await page.locator('.dms-panel').evaluate(node => node.getBoundingClientRect().width), 480);
    assert.equal(await page.locator('.dms-panel > .dms-bar').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(32, 33, 36)');
    assert.equal(await page.evaluate(() => window.stats.acquired), 1);
    await page.locator('[data-mode=harness]').click();
    await page.evaluate(() => { document.querySelector('#sidebar').setAttribute('data-collapsed', ''); document.querySelector('#sidebar').className = 'collapsed'; });
    await page.waitForFunction(() => document.querySelector('[data-dms-controls]').parentNode.id === 'dsh-mode-switch');
    await page.evaluate(() => {
      const sidebar = document.querySelector('#sidebar');
      sidebar.removeAttribute('data-collapsed');
      sidebar.innerHTML = sidebar.innerHTML;
    });
    await page.waitForFunction(() => document.querySelector('[data-dms-controls]').parentNode.id === 'sidebar');
    await page.evaluate(() => window.disposePlugin());
    assert.equal(await page.locator('[data-dms-controls]').count(), 0);
    assert.equal(await page.locator('#sidebar .fixture_logoRow').evaluate(node => node.outerHTML), original);
  } finally { await browser.close(); }
});
