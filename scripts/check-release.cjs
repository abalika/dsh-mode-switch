'use strict';
const { execFileSync } = require('node:child_process');
const { root, files, assertPublic } = require('./release-files.cjs');
const source = files();
source.forEach(assertPublic);
// Run npm's JS entry point directly; avoid a command-shell interpolation layer.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run with npm run check:release.');
const result = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const shipped = result[0].files.map(file => file.path);
for (const name of shipped) {
  if (!source.includes(name)) throw new Error(`Unexpected package file: ${name}`);
  assertPublic(name);
}
for (const required of ['lib/client.js', 'lib/index.js', 'desktop/persistent-session.cjs', 'desktop/auto-session.cjs', 'LICENSE', 'README.md', 'README.en.md']) if (!shipped.includes(required)) throw new Error(`Missing package file: ${required}`);
console.log(`Release check passed: ${source.length} source files, ${shipped.length} package files. No local backups or profiles included.`);
