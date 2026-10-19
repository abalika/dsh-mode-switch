#!/usr/bin/env node
'use strict';
// Local Windows patch, also used by default automatic setup after desktop exit.
// No downloads, account/profile contents or login automation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const PARTITION = 'persist:dsh-deepseek-chat-v1';
const BEFORE = 'partition = `dsh-sidebar-browser-${randomUUID()}`;';
const AFTER = 'partition = workspace === "dsh-mode-switch:deepseek" ? "persist:dsh-deepseek-chat-v1" : `dsh-sidebar-browser-${randomUUID()}`;';
const BUILDS = Object.freeze({
  '10325004a1ddbd8118ed0607ea28d50a7b0d692dcaeb25a67a7d8aea9165019d': '0.2.0-rc.2',
  '6f3d1ddd1106371452c2204be6dfb2e5460a8e8259cdd05cdccb5387b3f9a85a': '0.2.1-rc.2',
});
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function readArchive(bytes) {
  const invalid = () => { throw new Error('Invalid or unsupported ASAR archive.'); };
  if (!Buffer.isBuffer(bytes) || bytes.length < 16) invalid();
  const headerSize = bytes.readUInt32LE(4), jsonSize = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(0) !== 4 || headerSize < 8 || headerSize % 4 !== 0
      || bytes.readUInt32LE(8) !== headerSize - 4 || jsonSize > headerSize - 8
      || 8 + headerSize > bytes.length || jsonSize > 16 * 1024 * 1024) invalid();
  let header;
  try { header = JSON.parse(bytes.subarray(16, 16 + jsonSize).toString('utf8')); } catch { invalid(); }
  if (!header?.files || typeof header.files !== 'object') invalid();
  return { header, data: bytes.subarray(8 + headerSize) };
}
function mainEntry(header) {
  const entry = header.files.lib?.files?.['main.js'];
  if (!entry || entry.unpacked || entry.link) throw new Error('Expected packed lib/main.js in desktop archive.');
  return entry;
}
function mainSource(bytes) {
  const { header, data } = readArchive(bytes), entry = mainEntry(header);
  const offset = Number(entry.offset);
  if (!/^\d+$/.test(String(entry.offset)) || !Number.isSafeInteger(offset)
      || !Number.isSafeInteger(entry.size) || entry.size < 0 || offset + entry.size > data.length) throw new Error('Invalid main.js bounds.');
  const source = data.subarray(offset, offset + entry.size);
  if (entry.integrity) {
    const { algorithm, blockSize, blocks } = entry.integrity;
    if (algorithm !== 'SHA256' || !Number.isSafeInteger(blockSize) || blockSize <= 0
        || !Array.isArray(blocks) || blocks.length !== Math.ceil(source.length / blockSize)
        || entry.integrity.hash !== hash(source)) throw new Error('main.js integrity check failed.');
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] !== hash(source.subarray(i * blockSize, (i + 1) * blockSize))) throw new Error('main.js block integrity check failed.');
    }
  }
  return source;
}
function identify(source, builds = BUILDS) {
  const text = source.toString('utf8'), patched = text.split(AFTER).length === 2;
  const original = patched ? text.replace(AFTER, BEFORE) : text;
  const version = Object.hasOwn(builds, hash(original)) ? builds[hash(original)] : undefined;
  if (!version || original.split(BEFORE).length !== 2) throw new Error('Unsupported desktop build: main.js is not an exact verified version. Archive unchanged.');
  return { version, patched };
}
// Serialization is separate from build approval to test with synthetic fixtures.
// Public CLI install/restore always use the fixed BUILDS allowlist above.
function replaceMain(bytes, main) {
  const { header, data } = readArchive(bytes), entry = mainEntry(header);
  entry.offset = String(data.length); entry.size = main.length;
  if (entry.integrity) {
    const blockSize = entry.integrity.blockSize, blocks = [];
    if (!Number.isSafeInteger(blockSize) || blockSize <= 0) throw new Error('Invalid integrity block size.');
    for (let i = 0; i < main.length; i += blockSize) blocks.push(hash(main.subarray(i, i + blockSize)));
    entry.integrity = { algorithm: 'SHA256', hash: hash(main), blockSize, blocks };
  }
  const json = Buffer.from(JSON.stringify(header)), payloadSize = Math.ceil((4 + json.length) / 4) * 4;
  const prefix = Buffer.alloc(12 + payloadSize);
  prefix.writeUInt32LE(4, 0); prefix.writeUInt32LE(4 + payloadSize, 4);
  prefix.writeUInt32LE(payloadSize, 8); prefix.writeUInt32LE(json.length, 12); json.copy(prefix, 16);
  return Buffer.concat([prefix, data, main]);
}
function patchMain(source) {
  const state = identify(source);
  return state.patched ? source.toString() : source.toString().replace(BEFORE, AFTER);
}
function patchArchive(bytes) {
  const source = mainSource(bytes), changed = patchMain(source);
  return changed === source.toString() ? bytes : replaceMain(bytes, Buffer.from(changed));
}
function resolveArchive(file) {
  if (!file) throw new Error('Supply --archive with the path to your desktop resources/app.asar.');
  const archive = path.resolve(file);
  if (path.basename(archive) !== 'app.asar' || fs.lstatSync(archive).isSymbolicLink() || !fs.statSync(archive).isFile()) throw new Error('Expected an ordinary app.asar file.');
  const real = fs.realpathSync(archive);
  if (path.relative(archive, real) !== '') throw new Error('Use the real archive path, without directory links.');
  return real;
}
function assertAppStopped(archive) {
  if (process.platform !== 'win32') throw new Error('Writing desktop patches is supported on Windows only.');
  const exe = path.resolve(path.dirname(archive), '..', 'DeepSeek Harness.exe');
  if (!fs.existsSync(exe)) throw new Error('DeepSeek Harness.exe was not found next to resources.');
  // Constant script; the target path is an environment value, never executable code.
  const script = '$ErrorActionPreference="Stop"; $matches = @(Get-CimInstance Win32_Process -Filter "Name = \'DeepSeek Harness.exe\'" | Where-Object { -not $_.ExecutablePath -or $_.ExecutablePath -eq $env:DSH_MODE_SWITCH_EXE }); if ($matches.Count -gt 0) { exit 9 }';
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  try { execFileSync(shell, ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, DSH_MODE_SWITCH_EXE: exe }, windowsHide: true, stdio: 'pipe', timeout: 15000 }); }
  catch (error) {
    if (error.status === 9) throw Object.assign(new Error('Fully quit this DeepSeek Harness installation from its application menu before patching.'), { code: 'DSH_APP_RUNNING' });
    throw new Error('Could not verify that DeepSeek Harness is stopped. No application files changed.');
  }
}
function exclusive(archive, action) {
  const lock = `${archive}.dsh-mode-switch.lock`;
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw Object.assign(new Error('Another patch operation or a stale lock exists. See docs/INSTALL.md.'), { code: 'DSH_PATCH_BUSY' }); throw error; }
  try { return action(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
function writeNew(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function atomicReplace(file, bytes) {
  const stage = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    writeNew(stage, bytes);
    if (hash(fs.readFileSync(stage)) !== hash(bytes)) throw new Error('Staged file verification failed.');
    fs.renameSync(stage, file);
  } finally { if (fs.existsSync(stage)) fs.unlinkSync(stage); }
}
function backupPaths(archive) {
  const directory = `${archive}.dsh-mode-switch-backup`;
  if (fs.existsSync(directory) && (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory())) throw new Error('Backup location must be an ordinary directory.');
  return { directory, manifest: path.join(directory, 'manifest.json') };
}
function readManifest(archive) {
  const paths = backupPaths(archive);
  if (fs.lstatSync(paths.manifest).isSymbolicLink()) throw new Error('Manifest must not be a link.');
  const manifest = JSON.parse(fs.readFileSync(paths.manifest, 'utf8'));
  if (manifest.schema !== 1 || manifest.archiveName !== path.basename(archive)
      || !/^[a-f0-9]{64}$/.test(manifest.originalHash) || !/^[a-f0-9]{64}$/.test(manifest.patchedHash)
      || manifest.backupName !== `original-${manifest.originalHash}.asar`) throw new Error('Invalid backup manifest.');
  const backup = path.join(paths.directory, manifest.backupName);
  if (fs.lstatSync(backup).isSymbolicLink()) throw new Error('Backup must not be a link.');
  const original = fs.readFileSync(backup);
  if (hash(original) !== manifest.originalHash) throw new Error('Backup verification failed.');
  return { manifest, original };
}
function check(file) {
  const archive = resolveArchive(file), bytes = fs.readFileSync(archive), state = identify(mainSource(bytes));
  let restoreAvailable = false, backupStatus = 'missing';
  if (fs.existsSync(backupPaths(archive).manifest)) {
    try { const { manifest } = readManifest(archive); restoreAvailable = state.patched && manifest.patchedHash === hash(bytes); backupStatus = restoreAvailable ? 'verified' : 'different-archive'; }
    catch { backupStatus = 'invalid'; }
  }
  return { status: state.patched ? 'patched' : 'unpatched', version: state.version, partition: PARTITION, restoreAvailable, backupStatus };
}
function install(file, { beforeWrite = () => {} } = {}) {
  const archive = resolveArchive(file);
  assertAppStopped(archive);
  return exclusive(archive, () => {
    const original = fs.readFileSync(archive), patched = patchArchive(original);
    if (patched === original) return { ...check(archive), status: 'already-installed' };
    beforeWrite();
    const paths = backupPaths(archive);
    fs.mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
    const originalHash = hash(original), backupName = `original-${originalHash}.asar`, backup = path.join(paths.directory, backupName);
    if (!fs.existsSync(backup)) writeNew(backup, original);
    if (fs.lstatSync(backup).isSymbolicLink() || hash(fs.readFileSync(backup)) !== originalHash) throw new Error('Backup verification failed.');
    const manifest = { schema: 1, archiveName: path.basename(archive), backupName, originalHash, patchedHash: hash(patched), partition: PARTITION };
    // Journal before replacing the archive: a crash leaves either the original,
    // or a patched archive with its recovery information already on disk.
    atomicReplace(paths.manifest, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
    if (hash(fs.readFileSync(archive)) !== originalHash) throw new Error('Archive changed during installation; refusing to overwrite.');
    assertAppStopped(archive);
    beforeWrite();
    atomicReplace(archive, patched);
    return { status: 'installed', version: identify(mainSource(patched)).version, partition: PARTITION, backup };
  });
}
function restore(file) {
  const archive = resolveArchive(file);
  assertAppStopped(archive);
  return exclusive(archive, () => {
    const { manifest, original } = readManifest(archive), currentHash = hash(fs.readFileSync(archive));
    if (currentHash === manifest.originalHash) return { status: 'already-restored' };
    if (currentHash !== manifest.patchedHash) throw new Error('Desktop changed since patching. Refusing to overwrite an update or other modification.');
    if (hash(patchArchive(original)) !== manifest.patchedHash) throw new Error('Backup does not reproduce the installed patch.');
    assertAppStopped(archive);
    if (hash(fs.readFileSync(archive)) !== currentHash) throw new Error('Archive changed during restoration; refusing to overwrite.');
    atomicReplace(archive, original);
    return { status: 'restored' };
  });
}
function run(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    console.log('Usage: node desktop/persistent-session.cjs --archive "<resources/app.asar>" [--check | --restore]\nManual fallback: install the persistent-session patch. The plugin schedules this automatically after desktop exit.\n--check is read-only. Writes are supported on Windows only. Fully quit DSH before writing. No version bypass option.'); return;
  }
  let archive, operation = 'install';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archive' && archive === undefined && args[i + 1] && !args[i + 1].startsWith('--')) archive = args[++i];
    else if ((args[i] === '--check' || args[i] === '--restore') && operation === 'install') operation = args[i].slice(2);
    else throw new Error(`Unknown, duplicate or incomplete argument: ${args[i]}`);
  }
  if (!archive) throw new Error('--archive is required; no installation path is assumed.');
  console.log(JSON.stringify(({ install, check, restore })[operation](archive), null, 2));
}
module.exports = { PARTITION, BEFORE, AFTER, BUILDS, hash, readArchive, mainSource, replaceMain, identify, patchMain, patchArchive, check, install, restore, run };
if (require.main === module) {
  try { run(process.argv.slice(2)); } catch (error) { console.error(`dsh-mode-switch: ${error.message}`); process.exitCode = 1; }
}
