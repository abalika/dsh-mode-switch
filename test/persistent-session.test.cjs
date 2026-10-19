const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const patch = require('../desktop/persistent-session.cjs');

// This is a fabricated ASAR; no upstream binary or user profile is a fixture.
function fixture(source = patch.BEFORE) {
  const data = Buffer.from(source);
  const header = { files: {
    lib: { files: { 'main.js': { offset: '0', size: data.length, integrity: {
      algorithm: 'SHA256', hash: patch.hash(data), blockSize: 1024, blocks: [patch.hash(data)],
    } } } },
    'other.txt': { offset: String(data.length), size: 5 },
  } };
  const json = Buffer.from(JSON.stringify(header)), size = Math.ceil((json.length + 4) / 4) * 4;
  const prefix = Buffer.alloc(size + 12);
  [4, size + 4, size, json.length].forEach((value, i) => prefix.writeUInt32LE(value, i * 4));
  json.copy(prefix, 16);
  return Buffer.concat([prefix, data, Buffer.from('other')]);
}

test('ASAR replacement preserves unrelated entries/data and updates all integrity blocks', () => {
  const original = fixture(), before = patch.readArchive(original);
  const changedSource = Buffer.from('synthetic test data '.repeat(180));
  const changed = patch.replaceMain(original, changedSource), after = patch.readArchive(changed);
  assert.deepEqual(patch.mainSource(changed), changedSource);
  assert.deepEqual(after.header.files['other.txt'], before.header.files['other.txt']);
  assert.deepEqual(after.data.subarray(0, before.data.length), before.data);
  assert.equal(after.header.files.lib.files['main.js'].integrity.blocks.length, 4);
});

test('corrupt/truncated headers and corrupt main integrity are rejected', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(16), fixture().subarray(0, 30)]) assert.throws(() => patch.readArchive(bytes), /archive/i);
  const corrupted = fixture(); corrupted[corrupted.length - 6] ^= 1;
  assert.throws(() => patch.mainSource(corrupted), /integrity/);
  const badBounds = fixture(), parsed = patch.readArchive(badBounds);
  const damaged = patch.replaceMain(badBounds, Buffer.from('valid'));
  // Header remains well formed, but a truncated data section cannot be read.
  assert.throws(() => patch.mainSource(damaged.subarray(0, damaged.length - 1)), /bounds/);
  assert.equal(parsed.header.files['other.txt'].size, 5);
});

test('unknown originals and marker-only impostors cannot bypass exact build approval', () => {
  assert.throws(() => patch.patchMain(patch.BEFORE), /Unsupported/);
  assert.throws(() => patch.patchMain(patch.AFTER), /Unsupported/);
  assert.throws(() => patch.patchArchive(fixture()), /Unsupported/);
  const allowed = { [patch.hash(patch.BEFORE)]: 'test-only' };
  assert.deepEqual(patch.identify(patch.BEFORE, allowed), { version: 'test-only', patched: false });
  assert.deepEqual(patch.identify(patch.AFTER, allowed), { version: 'test-only', patched: true });
  assert.throws(() => patch.identify(patch.AFTER + '\n// changed', allowed), /Unsupported/);
});

test('CLI help is safe and malformed/ambiguous arguments fail without guessing paths', () => {
  const script = path.resolve(__dirname, '../desktop/persistent-session.cjs');
  for (const args of [[], ['--help']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0); assert.match(result.stdout, /Usage:/);
  }
  for (const args of [['--restore'], ['--archive'], ['--force'], ['--check', '--restore'], ['--archive', 'a', '--archive', 'b']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /required|argument|Supply/);
  }
});

test('read-only check rejects unknown archives without writing backups', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-patch-unit-'));
  const archive = path.join(directory, 'app.asar');
  try {
    fs.writeFileSync(archive, fixture());
    assert.throws(() => patch.check(archive), /Unsupported/);
    assert.deepEqual(fs.readdirSync(directory), ['app.asar']);
  } finally { fs.unlinkSync(archive); fs.rmdirSync(directory); }
});

test('verified desktop archive: install, restart-safe partition, idempotence and byte-exact rollback', {
  skip: !process.env.DSH_TEST_ARCHIVE || process.platform !== 'win32' ? 'Set DSH_TEST_ARCHIVE to a pristine supported Windows app.asar for integration tests.' : false,
}, async () => {
  const original = fs.readFileSync(process.env.DSH_TEST_ARCHIVE);
  assert.equal(patch.identify(patch.mainSource(original)).patched, false, 'integration fixture must be pristine');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-patch-integration-'));
  const resources = path.join(root, 'resources'), archive = path.join(resources, 'app.asar');
  fs.mkdirSync(resources);
  fs.writeFileSync(path.join(root, 'DeepSeek Harness.exe'), 'test placeholder, never executed');
  fs.writeFileSync(archive, original);
  try {
    assert.equal(patch.check(archive).status, 'unpatched');
    assert.throws(() => patch.install(archive, { beforeWrite() { throw new Error('synthetic uninstall'); } }), /synthetic uninstall/);
    assert.deepEqual(fs.readFileSync(archive), original, 'cancellation must preserve the entire original archive');
    const auto = require('../desktop/auto-session.cjs');
    const result = await auto.afterExit({ archive }, process.pid, { isRegistered: () => true, isAlive: () => false });
    assert.equal(result.status, 'installed', 'default after-exit workflow must perform the real verified patch');
    assert.equal(patch.install(archive).status, 'already-installed');
    assert.equal(patch.check(archive).restoreAvailable, true);
    const installed = fs.readFileSync(archive);
    assert.equal(patch.patchArchive(installed), installed);
    const source = patch.mainSource(installed).toString();
    assert.ok(source.includes(patch.AFTER));
    assert.deepEqual(patch.readArchive(installed).data.subarray(0, patch.readArchive(original).data.length), patch.readArchive(original).data);
    fs.writeFileSync(archive, Buffer.concat([installed, Buffer.from('changed')]));
    assert.throws(() => patch.restore(archive), /Refusing to overwrite/);
    fs.writeFileSync(archive, installed);
    const paths = `${archive}.dsh-mode-switch-backup`, manifest = JSON.parse(fs.readFileSync(path.join(paths, 'manifest.json')));
    const backup = path.join(paths, manifest.backupName);
    fs.writeFileSync(backup, Buffer.from('corrupt'));
    assert.throws(() => patch.restore(archive), /Backup verification/);
    fs.writeFileSync(backup, original);
    fs.writeFileSync(path.join(paths, 'manifest.json'), JSON.stringify({ ...manifest, backupName: '../outside.asar' }));
    assert.throws(() => patch.restore(archive), /Invalid backup manifest/);
    fs.writeFileSync(path.join(paths, 'manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(`${archive}.dsh-mode-switch.lock`, 'test');
    assert.throws(() => patch.restore(archive), /lock/);
    fs.unlinkSync(`${archive}.dsh-mode-switch.lock`);
    assert.equal(patch.restore(archive).status, 'restored');
    assert.deepEqual(fs.readFileSync(archive), original);
    assert.equal(patch.restore(archive).status, 'already-restored');
  } finally {
    // Only remove the exact test-owned files, never recurse into a user profile.
    const backupDir = `${archive}.dsh-mode-switch-backup`;
    if (fs.existsSync(backupDir)) {
      for (const file of fs.readdirSync(backupDir)) fs.unlinkSync(path.join(backupDir, file));
      fs.rmdirSync(backupDir);
    }
    for (const file of [archive, `${archive}.dsh-mode-switch.lock`]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(resources); fs.unlinkSync(path.join(root, 'DeepSeek Harness.exe')); fs.rmdirSync(root);
  }
});
