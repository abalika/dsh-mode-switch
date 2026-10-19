'use strict';
// Promotional illustration, not a recording of the production desktop or a
// signed-in website. The unmodified plugin runs against synthetic test pages.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'release', 'promotion-v0.2.2');
fs.mkdirSync(output, { recursive: true });
const W = 1440, H = 810;
const css = `*{box-sizing:border-box}body{margin:0;color:#20242c;background:#fff;font:15px/1.6 'Microsoft YaHei',system-ui,sans-serif}button,textarea{font:inherit}button{cursor:pointer}.chrome{height:32px;background:#f8f9fb;border-bottom:1px solid #e9ebef;font-size:11px;color:#6d7480;padding:6px 18px}.layout{display:flex;height:778px}aside{width:290px;flex:none;background:#f7f8fa;padding:10px 16px}.demo_logoRow,.logo-row{height:64px;display:flex;align-items:center;gap:8px;white-space:nowrap}.wordmark{font-size:27px;font-weight:700;letter-spacing:-1px}.harness-label{font-size:10px;letter-spacing:1px;background:#20242c;color:white;border-radius:3px;padding:1px 4px}svg{width:208px;height:36px;overflow:visible}.new{border:0;background:#e9edf9;border-radius:10px;padding:10px 16px;width:100%;color:#4058ba;text-align:left;margin:8px 0 26px}.muted{color:#8b929d;font-size:12px}.history{padding:12px 10px;color:#626976;font-size:13px}.main{flex:1;padding:75px 86px}.eyebrow{font-size:12px;letter-spacing:2px;color:#4d6bfe;font-weight:700}h1{font-size:35px;letter-spacing:-1px;margin:10px 0 12px;font-weight:650}.intro{color:#737b88;margin:0 0 30px}.card{border:1px solid #e4e7ee;border-radius:18px;padding:22px;background:#fafbfe;max-width:770px}.card-title{font-weight:600;font-size:15px;margin:0 0 12px}.line{padding:6px 0;color:#555e6c}.composer{margin-top:28px;max-width:770px;border:1px solid #dce1eb;border-radius:17px;background:#fff;padding:14px 18px;box-shadow:0 4px 20px #18203805}.composer textarea{width:100%;height:85px;resize:none;border:0;outline:none;font-size:16px;line-height:1.7;color:#303948;background:transparent}.composer-footer{display:flex;justify-content:space-between;font-size:12px;color:#8d94a0}.pill{background:#f0f3fa;border-radius:5px;padding:2px 8px}.send{width:28px;height:28px;border-radius:50%;background:#4d6bfe;color:white;text-align:center;font-size:18px}.badge{position:fixed;top:9px;right:18px;font-size:10px;color:#646e7c;z-index:1000;letter-spacing:.3px}.caption{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#17213af2;color:white;border-radius:14px;padding:14px 26px;text-align:center;z-index:1000;box-shadow:0 8px 25px #17213a20;min-width:600px}.caption strong{display:block;font-size:23px;line-height:1.4;font-weight:600}.caption small{display:block;font-size:12px;color:#c9d4ed;margin-top:5px}.demo-highlight{outline:3px solid #4d6bfe!important;outline-offset:5px!important;border-radius:8px!important}.step{position:fixed;right:32px;bottom:40px;color:#4d6bfe;font-size:12px;z-index:1001;font-weight:700}`;
const shell = (guest = false) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>DSH Mode Switch — 隔离演示</title><style>${css}</style><div class="chrome">DSH Mode Switch · v0.2.2 · UI 演示</div><div class="badge">隔离演示 · 页面与内容均为合成 · 非线上账号录屏</div><div id="root" class="layout"><aside><div class="${guest ? 'logo-row' : 'demo_logoRow'}">${guest ? '<svg viewBox="0 0 208 36" aria-label="DeepSeek"><text x="0" y="29" fill="#4d6bfe" font-family="Arial,sans-serif" font-size="34" font-weight="700">deepseek</text></svg>' : '<span class="wordmark">deepseek</span><span class="harness-label">HARNESS</span>'}</div><button class="new">＋ ${guest ? '开启新对话' : '新建任务'}</button><div class="muted">演示内容</div><div class="history">${guest ? '整理周末计划' : '制作一个个人主页'}</div><div class="history">${guest ? '练习英语表达' : '优化项目首页布局'}</div><div class="muted" style="margin:32px 10px">未连接任何真实账号</div></aside><main class="main"><div class="eyebrow">${guest ? 'DEEPSEEK · 网页模式示意' : 'HARNESS · 任务模式示意'}</div><h1>${guest ? '换个话题，继续聊' : '正在制作个人主页'}</h1><p class="intro">${guest ? '同一个切换流程，进入独立的 DeepSeek 网页。' : '写到一半的任务和草稿，切换回来继续。'}</p><div class="card"><div class="card-title">${guest ? '演示对话 · 合成内容' : '演示任务 · 合成内容'}</div><div class="line">${guest ? '想把周末分成休息、运动和阅读三个部分。' : '✓ 首页结构已整理'}</div><div class="line">${guest ? '可以先列出三个时间段，再给每段留出弹性。' : '✓ 配色与导航已确认'}</div><div class="line">${guest ? '这段文字预先写入演示页，没有发送给模型。' : '接下来：继续完善首页细节'}</div></div><div class="composer"><textarea id="draft" aria-label="演示草稿" placeholder="写下还没发送的内容…"></textarea><div class="composer-footer"><span class="pill">${guest ? '深度思考' : '任务草稿'}</span><span>演示草稿 · 未发送</span><span class="send">↑</span></div></div></main></div><div class="caption"><strong></strong><small></small></div><div class="step"></div></html>`;
const timeline = [];
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.DSH_TEST_BROWSER_CHANNEL || 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'zh-CN', serviceWorkers: 'block' });
    // No connection to DeepSeek: all HTTP requests are intercepted locally.
    await context.route('**/*', route => route.request().url() === 'https://chat.deepseek.com/'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: shell(true) })
      : route.abort());
    const host = await context.newPage();
    const guest = await context.newPage();
    await host.setContent(shell(false));
    await guest.goto('https://chat.deepseek.com/');
    await host.evaluate(() => {
      window.stats = { acquired: 0, loaded: [] };
      window.dshDesktop = { browser: {
        async acquire() { window.stats.acquired++; return { lease: 'synthetic-demo-lease', partition: 'persist:synthetic-demo-only' }; },
        async release() {}, onOpenRequested() { return () => {}; },
      } };
      window.__ModuleLoader__ = { load(module) { module.factory().apply({ effect(fn) { window.disposeDemo = fn(); } }); } };
      const create = document.createElement.bind(document);
      document.createElement = name => {
        const node = create(name);
        if (name === 'webview') {
          node.loadURL = async url => { window.stats.loaded.push(url); node.currentURL = url; };
          node.getURL = () => node.currentURL || 'about:blank';
          node.executeJavaScript = source => window.executeSyntheticGuest(source);
        }
        return node;
      };
    });
    await host.exposeFunction('executeSyntheticGuest', source => guest.evaluate(source));
    const forwards = [];
    guest.on('console', event => {
      if (event.text().startsWith('dsh-mode-switch:')) forwards.push(host.evaluate(message => {
        const e = new Event('console-message'); e.message = message;
        document.querySelector('webview')?.dispatchEvent(e);
      }, event.text()));
    });
    await host.addScriptTag({ path: path.join(root, 'lib', 'client.js') });
    const caption = async (page, title, sub, step = '') => page.evaluate(({ title, sub, step }) => {
      document.querySelector('.caption strong').textContent = title;
      document.querySelector('.caption small').textContent = sub;
      document.querySelector('.step').textContent = step;
    }, { title, sub, step });
    async function frame(page, seconds) {
      await page.evaluate(() => document.activeElement?.blur());
      await page.evaluate(() => document.fonts.ready);
      const name = `frame-${String(timeline.length).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(output, name) });
      timeline.push({ name, seconds });
    }
    await caption(host, '给 DSH 加一个「切换到 DeepSeek」', 'DSH Mode Switch · 独立社区插件 · MIT 开源', '01 / 04');
    await frame(host, 3);
    const draft = '请把首页主色改成蓝色，并增加一个作品展示区。';
    await host.locator('#draft').fill(draft);
    await caption(host, '任务写到一半，先留着草稿', '下面的按钮由原始插件代码插入；其余页面为演示夹具。', '01 / 04');
    await frame(host, 3);
    await host.locator('[data-mode=deepseek]').evaluate(node => node.classList.add('demo-highlight'));
    await caption(host, '在 LOGO 下方，一键切换', '无需另开一个聊天窗口。', '02 / 04');
    await frame(host, 2);
    await host.locator('[data-mode=deepseek]').evaluate(node => node.classList.remove('demo-highlight'));
    await host.locator('[data-mode=deepseek]').click();
    await host.locator('webview').dispatchEvent('dom-ready');
    await host.waitForFunction(() => window.stats.loaded.length === 1);
    await host.locator('webview').dispatchEvent('dom-ready');
    await guest.locator('[data-dsh-mode-switch] button').waitFor();
    await Promise.all(forwards);
    assert.equal(await host.locator('.dms-panel').isVisible(), true);
    await guest.locator('#draft').fill('顺便帮我安排一个轻松的周末。');
    await caption(guest, '进入 DeepSeek 网页模式', '返回入口同样位于网页 LOGO 下方。', '02 / 04');
    await frame(guest, 4);
    await guest.locator('[data-dsh-mode-switch] button').evaluate(node => { node.style.outline = '3px solid #4d6bfe'; node.style.outlineOffset = '5px'; });
    await caption(guest, '聊完，再切回 Harness', '这段演示没有使用账号，也没有向模型发送消息。', '03 / 04');
    await frame(guest, 2);
    await guest.locator('[data-dsh-mode-switch] button').evaluate(node => { node.style.outline = ''; node.style.outlineOffset = ''; });
    await guest.locator('[data-dsh-mode-switch] button').click();
    await host.waitForFunction(() => document.querySelector('.dms-panel').hidden);
    assert.equal(await host.locator('#draft').inputValue(), draft);
    assert.equal(await host.evaluate(() => window.stats.acquired), 1);
    await caption(host, '回来后，刚才的草稿还在', '实际切换逻辑验证通过：页面未重建，草稿值保持不变。', '03 / 04');
    await host.locator('.composer').evaluate(node => node.classList.add('demo-highlight'));
    await frame(host, 4);
    await host.locator('.composer').evaluate(node => node.classList.remove('demo-highlight'));
    await caption(host, 'v0.2.2 · Windows 默认配置登录保存', '支持的版本：完全退出一次后，下次启动生效；网站过期仍需重登。', '04 / 04');
    await frame(host, 4);
    await caption(host, '开源地址：github.com/abalika/dsh-mode-switch', '独立社区插件 · 兼容 DSH Desktop 0.2.0-rc.2 / 0.2.1-rc.2 · 非官方', '04 / 04');
    await frame(host, 4);
    // A second round verifies both synthetic drafts survive the plugin switch.
    await host.locator('[data-mode=deepseek]').click();
    assert.equal(await guest.locator('#draft').inputValue(), '顺便帮我安排一个轻松的周末。');
    assert.equal(await host.evaluate(() => window.stats.acquired), 1);
    await caption(guest, 'LOGO 下方切回 Harness', '隔离界面示意 · 使用插件原始切换逻辑 · 无真实账号');
    await guest.screenshot({ path: path.join(__dirname, 'demo-deepseek.png') });
    await guest.locator('[data-dsh-mode-switch] button').click();
    await host.waitForFunction(() => document.querySelector('.dms-panel').hidden);
    await caption(host, 'LOGO 下方切换到 DeepSeek', '隔离界面示意 · 返回后保留任务草稿 · 无真实账号');
    await host.screenshot({ path: path.join(__dirname, 'demo-harness.png') });
    // Local cover for the creator to upload with the video.
    await host.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f6f8ff;color:#1d2941;font-family:'Microsoft YaHei',sans-serif}.wrap{padding:85px 100px}.label{color:#4d6bfe;font-size:20px;font-weight:700;letter-spacing:3px}h1{font-size:82px;line-height:1.2;letter-spacing:-3px;margin:30px 0}p{font-size:28px;color:#637087}.modes{display:flex;align-items:center;gap:40px;margin:50px 0;font-size:42px;font-weight:700}.modes span{border-radius:20px;padding:20px 35px;background:white;border:1px solid #e0e6f5}.modes b{color:#4d6bfe}.footer{font-size:20px;color:#788496}.badge{position:absolute;right:45px;bottom:38px;color:#788496;font-size:16px}</style><div class="wrap"><div class="label">DSH MODE SWITCH · MIT 开源</div><h1>在 DSH 里<br>一键切到 DeepSeek</h1><p>LOGO 下方切换 · 返回保留草稿</p><div class="modes"><span>Harness</span><b>⇄</b><span style="color:#4d6bfe">DeepSeek</span></div><div class="footer">github.com/abalika/dsh-mode-switch</div></div><div class="badge">独立社区插件 · 非官方</div>`);
    await host.screenshot({ path: path.join(output, 'cover.png') });
    fs.writeFileSync(path.join(output, 'timeline.json'), JSON.stringify(timeline, null, 2));
    const concat = timeline.map(f => `file '${f.name}'\nduration ${f.seconds}`).join('\n') + `\nfile '${timeline.at(-1).name}'\n`;
    fs.writeFileSync(path.join(output, 'frames.txt'), concat);
    const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-movflags', '+faststart', '-t', '26', '-map_metadata', '-1', 'dsh-mode-switch-demo-26s.mp4'], { cwd: output, stdio: 'inherit' });
    // A compact animation suitable for a GitHub Discussion.
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-t', '20', '-filter_complex', '[0:v]fps=2,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=bayer', '-loop', '0', '-map_metadata', '-1', path.join(__dirname, 'demo.gif')], { cwd: output, stdio: 'inherit' });
    console.log(JSON.stringify({ output, durationSeconds: 26, checks: 'Original plugin executed; host and guest drafts preserved; one browser lease; all HTTP intercepted; no account/profile used.' }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
