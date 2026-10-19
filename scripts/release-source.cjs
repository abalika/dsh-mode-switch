'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { root, files, assertPublic } = require('./release-files.cjs');
const version = require('../package.json').version;
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version)) throw new Error('Invalid release version.');
const entries = files(); entries.forEach(assertPublic);
const output = path.join(root, 'release');
fs.mkdirSync(output, { recursive: true });
if (fs.lstatSync(output).isSymbolicLink()) throw new Error('Release output must not be a link.');
const staging = fs.mkdtempSync(path.join(output, 'source-'));
const name = `dsh-mode-switch-${version}-source`, destination = path.join(staging, name);
fs.mkdirSync(destination);
for (const file of entries) {
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target, fs.constants.COPYFILE_EXCL);
}
const archive = path.join(output, `${name}.tar.gz`);
if (fs.existsSync(archive)) throw new Error('Source archive already exists. Move it aside before creating another release.');
// tar ships with Windows 10/11 and standard Unix distributions.
execFileSync('tar', ['-czf', archive, '-C', staging, name], { stdio: 'pipe', windowsHide: true });
const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(`${archive}.sha256`, `${digest}  ${path.basename(archive)}\n`, { flag: 'wx' });
console.log(`Clean source folder: ${destination}\nSource archive: ${archive}\nSHA256: ${digest}`);
