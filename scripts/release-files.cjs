'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Explicit source allowlist. Never recurse into the working directory itself.
const sourceEntries = ['.gitignore', '.gitattributes', '.github', 'package.json', 'package-lock.json', 'cordis.patch.yml', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'README.en.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'lib', 'desktop/persistent-session.cjs', 'desktop/auto-session.cjs', 'test', 'scripts', 'docs'];
function walk(entry) {
  const absolute = path.join(root, entry), stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Release source cannot contain links: ${entry}`);
  if (stat.isDirectory()) return fs.readdirSync(absolute).sort().flatMap(name => walk(`${entry}/${name}`));
  if (!stat.isFile()) throw new Error(`Not an ordinary file: ${entry}`);
  return [entry];
}
function files() { return sourceEntries.flatMap(walk).sort(); }
function assertPublic(name) {
  if (/(^|\/)(backup|node_modules|dist|release|storage-smoke-[^/]*)(\/|$)/.test(name)
      || /\.(asar|tgz|zip|log|tmp|db|sqlite)$/i.test(name)
      || /(^|\/)\.?env(?:\.|$)/i.test(name) || /desktop\/.*-main\.js$/.test(name)) throw new Error(`Private/generated file in release: ${name}`);
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  // Reject personal absolute paths and common live credential formats.
  if (/[A-Z]:[\\/](?:Users|Documents and Settings)[\\/](?!<)[^\\/\s]+/i.test(text)
      || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
      || /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/.test(text)) throw new Error(`Potential local/private data in ${name}`);
}
module.exports = { root, files, assertPublic };
