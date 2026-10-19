'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const patch = require('./persistent-session.cjs');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TASK = Symbol.for('dsh-mode-switch.auto-session');
const MAX_WAIT = 7 * 24 * 60 * 60 * 1000;

function discover({ platform = process.platform, executable = process.execPath,
  profile = process.argv[3], env = process.env } = {}) {
  if (env.DSH_MODE_SWITCH_PERSIST_LOGIN === '0') return null;
  if (platform !== 'win32' || !profile || !path.isAbsolute(profile)
      || path.basename(executable).toLowerCase() !== 'deepseek harness.exe') return null;
  return { archive: path.join(path.dirname(executable), 'resources', 'app.asar'),
    runtime: path.join(path.dirname(executable), 'resources', 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', 'node.exe'),
    profile: path.resolve(profile), packageRoot: PACKAGE_ROOT };
}

// Check only the installation manifest and this package's identity, never
// account settings, browser storage or conversation files.
function registered(plan) {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(plan.profile, 'package.json'), 'utf8'));
    const bundles = metadata.dsh?.profile?.bundles;
    return Array.isArray(bundles) && bundles.includes('dsh-mode-switch')
      && fs.realpathSync(path.join(plan.profile, 'node_modules', 'dsh-mode-switch')) === fs.realpathSync(plan.packageRoot);
  } catch { return false; }
}

function schedule({ plan = discover(), check = patch.check, isRegistered = registered,
  start = spawn, state = globalThis, report = console.warn } = {}) {
  if (!plan || state[TASK] || !isRegistered(plan)) return { status: 'inactive' };
  try {
    const current = check(plan.archive);
    if (current.status === 'patched') return { status: 'ready' };
    const workerEnv = { ...process.env };
    delete workerEnv.ELECTRON_RUN_AS_NODE;
    const worker = start(plan.runtime, [__filename, '--after-exit', '--archive', plan.archive,
      '--profile', plan.profile, '--parent', String(process.pid)], {
      detached: true, windowsHide: true, stdio: 'ignore',
      env: workerEnv,
    });
    // No task service, forced shutdown or elevated process. This one-shot
    // worker exits on uninstall, failure, successful setup or its deadline.
    state[TASK] = worker;
    worker.once('error', () => {
      delete state[TASK];
      report('dsh-mode-switch: automatic login storage could not start; see docs/INSTALL.md.');
    });
    worker.unref();
    report('dsh-mode-switch: login storage will be enabled automatically after fully quitting DSH; it takes effect on the next launch.');
    return { status: 'scheduled' };
  } catch {
    report('dsh-mode-switch: automatic login storage is unavailable for this installation; application files were not changed. See docs/INSTALL.md.');
    return { status: 'unavailable' };
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function afterExit(plan, parent, { isRegistered = registered, isAlive = alive,
  install = patch.install, wait = delay, now = Date.now,
  maxWait = MAX_WAIT } = {}) {
  const deadline = now() + maxWait;
  while (now() < deadline) {
    // A removed/replaced package must not leave a pending desktop modification.
    if (!isRegistered(plan)) return { status: 'cancelled' };
    if (!isAlive(parent)) {
      try {
        // install checks *all* processes belonging to this exact installation,
        // both before preparation and immediately before atomic replacement.
        return install(plan.archive, { beforeWrite() {
          if (!isRegistered(plan)) throw new Error('Automatic setup cancelled: plugin removed or replaced.');
        } });
      } catch (error) {
        if (!['DSH_APP_RUNNING', 'DSH_PATCH_BUSY'].includes(error.code)) throw error;
      }
    }
    await wait(2000);
  }
  return { status: 'expired' };
}

async function run(args) {
  if (args.length !== 7 || args[0] !== '--after-exit' || args[1] !== '--archive'
      || args[3] !== '--profile' || args[5] !== '--parent' || !/^[1-9]\d*$/.test(args[6])
      || !Number.isSafeInteger(Number(args[6])) || Number(args[6]) === process.pid) throw new Error('Invalid automatic setup arguments.');
  const desktop = path.resolve(path.dirname(process.execPath), '..', '..', '..', '..', '..', '..', 'DeepSeek Harness.exe');
  const plan = discover({ executable: desktop, profile: args[4] });
  if (!plan || path.resolve(args[2]) !== plan.archive || process.execPath !== plan.runtime) throw new Error('Automatic setup only targets the current desktop installation.');
  return afterExit(plan, Number(args[6]));
}

module.exports = { discover, registered, schedule, afterExit, run };
if (require.main === module) {
  run(process.argv.slice(2)).catch(() => { process.exitCode = 1; });
}
