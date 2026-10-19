const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const auto = require('../desktop/auto-session.cjs');
const plan = { archive: '/synthetic/resources/app.asar', runtime: '/synthetic/node.exe', profile: '/synthetic/profile', packageRoot: '/synthetic/plugin' };

function scheduledOptions(overrides = {}) {
  return { plan, isRegistered: () => true, check: () => ({ status: 'unpatched' }),
    state: {}, report: () => {}, ...overrides };
}

test('automatic setup is default in desktop, with explicit opt-out and no guessed unrelated installation', () => {
  // Use native separators so this path-only test works on both Windows and Linux.
  const executable = path.resolve('synthetic', 'DeepSeek Harness.exe');
  const profile = path.resolve('synthetic', 'desktop');
  const options = { platform: 'win32', executable, profile, env: {} };
  assert.equal(auto.discover(options).archive, path.resolve('synthetic', 'resources', 'app.asar'));
  assert.equal(auto.discover({ ...options, env: { DSH_MODE_SWITCH_PERSIST_LOGIN: '0' } }), null);
  assert.equal(auto.discover({ ...options, platform: 'linux' }), null);
  assert.equal(auto.discover({ ...options, executable: path.resolve('node.exe') }), null);
  assert.equal(auto.discover({ ...options, profile: 'relative-profile' }), null);
  assert.equal(auto.discover({ ...options, profile: null }), null);
});

test('registration checks the exact active plugin, and cancels on uninstall or replacement', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-auto-registration-'));
  const packageRoot = path.join(profile, 'node_modules', 'dsh-mode-switch');
  fs.mkdirSync(packageRoot, { recursive: true });
  const metadata = path.join(profile, 'package.json');
  const target = { ...plan, profile, packageRoot };
  try {
    fs.writeFileSync(metadata, JSON.stringify({ dsh: { profile: { bundles: ['dsh-mode-switch'] } } }));
    assert.equal(auto.registered(target), true);
    assert.equal(auto.registered({ ...target, packageRoot: profile }), false);
    fs.writeFileSync(metadata, JSON.stringify({ dsh: { profile: { bundles: 'dsh-mode-switch' } } }));
    assert.equal(auto.registered(target), false);
    fs.writeFileSync(metadata, JSON.stringify({ dsh: { profile: { bundles: [] } } }));
    assert.equal(auto.registered(target), false);
    fs.writeFileSync(metadata, '{');
    assert.equal(auto.registered(target), false);
  } finally {
    fs.unlinkSync(metadata); fs.rmdirSync(packageRoot);
    fs.rmdirSync(path.dirname(packageRoot)); fs.rmdirSync(profile);
  }
});

test('default activation schedules one hidden one-shot helper, even without lifecycle scripts', () => {
  let started = 0, detached = 0;
  const options = scheduledOptions({ start(executable, args, settings) {
    started++;
    assert.equal(executable, plan.runtime);
    assert.equal(args[0], path.resolve(__dirname, '../desktop/auto-session.cjs'));
    assert.deepEqual(args.slice(1), ['--after-exit', '--archive', plan.archive, '--profile', plan.profile, '--parent', String(process.pid)]);
    assert.equal(settings.shell, undefined);
    assert.equal(settings.windowsHide, true);
    assert.equal(settings.detached, true);
    assert.equal(settings.stdio, 'ignore');
    assert.equal(settings.env.ELECTRON_RUN_AS_NODE, undefined);
    const worker = new EventEmitter(); worker.unref = () => { detached++; }; return worker;
  } });
  assert.equal(auto.schedule(options).status, 'scheduled');
  assert.equal(auto.schedule(options).status, 'inactive');
  assert.equal(started, 1); assert.equal(detached, 1);
});

test('already-patched, unknown, opted-out or unregistered hosts cannot start a writer', () => {
  const start = () => { throw new Error('must not spawn'); };
  assert.equal(auto.schedule(scheduledOptions({ start, check: () => ({ status: 'patched' }) })).status, 'ready');
  assert.equal(auto.schedule(scheduledOptions({ start, check: () => { throw new Error('unknown build'); } })).status, 'unavailable');
  assert.equal(auto.schedule(scheduledOptions({ start, plan: null })).status, 'inactive');
  assert.equal(auto.schedule(scheduledOptions({ start, isRegistered: () => false })).status, 'inactive');
});

test('a helper spawn failure does not crash the host and permits a later retry', () => {
  let worker;
  const options = scheduledOptions({ start() { worker = new EventEmitter(); worker.unref = () => {}; return worker; } });
  assert.equal(auto.schedule(options).status, 'scheduled');
  worker.emit('error', new Error('synthetic denied'));
  assert.equal(auto.schedule(options).status, 'scheduled');
});

test('helper waits for parent exit, retries while desktop is still running, then installs automatically', async () => {
  let clock = 0, attempts = 0, waits = 0;
  const result = await auto.afterExit(plan, 100, {
    isRegistered: () => true, isAlive: () => clock === 0,
    now: () => clock, wait: async () => { clock += 2000; waits++; },
    install(_archive, guards) {
      attempts++; guards.beforeWrite();
      if (attempts === 1) throw Object.assign(new Error('still running'), { code: 'DSH_APP_RUNNING' });
      if (attempts === 2) throw Object.assign(new Error('other writer'), { code: 'DSH_PATCH_BUSY' });
      return { status: 'installed' };
    },
  });
  assert.equal(result.status, 'installed'); assert.equal(attempts, 3); assert.equal(waits, 3);
});

test('pending automatic setup cancels on uninstall and never kills or restarts the desktop', async () => {
  let clock = 0;
  const result = await auto.afterExit(plan, 100, {
    isRegistered: () => clock === 0, isAlive: () => true,
    now: () => clock, wait: async () => { clock += 2000; },
    install: () => assert.fail('must not write'),
  });
  assert.equal(result.status, 'cancelled');
});

test('uninstall immediately before archive replacement cancels the final write', async () => {
  let active = true;
  await assert.rejects(auto.afterExit(plan, 100, {
    isRegistered: () => active, isAlive: () => false,
    install(_archive, guards) { active = false; guards.beforeWrite(); assert.fail('must not reach write'); },
  }), /cancelled/);
});

test('deadline bounds the helper lifetime, and non-retryable failures are not bypassed', async () => {
  let clock = 0;
  assert.equal((await auto.afterExit(plan, 100, {
    isRegistered: () => true, isAlive: () => true, maxWait: 4000,
    now: () => clock, wait: async () => { clock += 2000; },
    install: () => assert.fail('must not write'),
  })).status, 'expired');
  await assert.rejects(auto.afterExit(plan, 100, {
    isRegistered: () => true, isAlive: () => false,
    install: () => { throw new Error('Unsupported desktop build'); },
    wait: () => assert.fail('must not retry unsupported build'),
  }), /Unsupported/);
});

test('worker CLI rejects path guessing and ambiguous arguments without writing', () => {
  const script = path.resolve(__dirname, '../desktop/auto-session.cjs');
  for (const args of [[], ['--force'], ['--after-exit', '--archive', 'unrelated.asar', '--profile', '.', '--parent', '1']]) {
    assert.equal(spawnSync(process.execPath, [script, ...args]).status, 1);
  }
});

test('real native helper waits for a test parent, patches only its fake installation and rolls back exactly', {
  skip: !process.env.DSH_TEST_ARCHIVE || process.platform !== 'win32' ? 'Requires a pristine supported Windows archive.' : false,
  timeout: 60000,
}, async () => {
  const patch = require('../desktop/persistent-session.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-auto-integration-'));
  const resources = path.join(root, 'resources'), archive = path.join(resources, 'app.asar');
  const runtime = path.join(resources, 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', 'node.exe');
  const profile = path.join(root, 'profile');
  const plugin = path.join(profile, 'node_modules', 'dsh-mode-switch');
  const helper = path.join(plugin, 'desktop', 'auto-session.cjs');
  let parent, worker;
  try {
    fs.mkdirSync(path.dirname(runtime), { recursive: true });
    fs.mkdirSync(path.dirname(helper), { recursive: true });
    fs.copyFileSync(process.execPath, runtime);
    fs.writeFileSync(path.join(root, 'DeepSeek Harness.exe'), 'test placeholder, never executed');
    fs.copyFileSync(process.env.DSH_TEST_ARCHIVE, archive);
    const originalHash = patch.hash(fs.readFileSync(archive));
    fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['dsh-mode-switch'] } } }));
    for (const name of ['auto-session.cjs', 'persistent-session.cjs']) fs.copyFileSync(path.resolve(__dirname, '..', 'desktop', name), path.join(plugin, 'desktop', name));
    const env = { ...process.env, DSH_MODE_SWITCH_PERSIST_LOGIN: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    parent = spawn(runtime, ['-e', 'setTimeout(() => {}, 5000)'], { windowsHide: true, stdio: 'ignore', env });
    const parentExit = once(parent, 'exit');
    worker = spawn(runtime, [helper, '--after-exit', '--archive', archive, '--profile', profile, '--parent', String(parent.pid)], { windowsHide: true, stdio: 'ignore', env });
    const workerExit = once(worker, 'exit');
    await delay(300);
    assert.equal(worker.exitCode, null);
    assert.equal(patch.hash(fs.readFileSync(archive)), originalHash, 'must not modify before parent exits');
    await parentExit;
    const result = await workerExit;
    assert.equal(result[0], 0); assert.equal(result[1], null);
    assert.equal(patch.check(archive).status, 'patched');
    assert.equal(patch.check(archive).restoreAvailable, true);
    assert.equal(patch.restore(archive).status, 'restored');
    assert.equal(patch.hash(fs.readFileSync(archive)), originalHash);
    assert.equal(patch.hash(fs.readFileSync(process.env.DSH_TEST_ARCHIVE)), originalHash);
  } finally {
    for (const child of [parent, worker]) if (child?.pid && child.exitCode === null) {
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
    // Recursive cleanup is confined to this exact, test-created temp root.
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('dsh-auto-integration-'));
    assert.equal(fs.realpathSync(root), root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
