// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const {version} = require(path.join(root, 'package.json'));
const name = 'Micro-Battery-' + version;
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-battery-release-'));
const folder = path.join(stage, name);
const dist = path.join(root, 'dist');
const allowed = ['bin', 'lib', 'test', 'docs', 'scripts', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'CONTRIBUTING.md', 'Install.command', 'Configure.command', 'Start.command', 'Stop.command', 'Status.command', 'Uninstall.command'];
try {
  fs.mkdirSync(folder);
  for (const item of allowed) fs.cpSync(path.join(root, item), path.join(folder, item), {recursive: true});
  function audit(directory) {
    for (const item of fs.readdirSync(directory, {withFileTypes: true})) {
      const full = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error('Release cannot contain symlinks.');
      if (item.isDirectory()) {if (['backups', 'node_modules', '.local'].includes(item.name)) throw new Error('Private/vendor directory in release.'); audit(full);}
      else if (/\.(?:node|asar|bin|log)$/.test(item.name) || ['state.json', 'settings.json', 'keymap.json', 'smart_actions.json', 'last-status.json', 'underglow-status.json'].includes(item.name)) throw new Error('Private or vendor artifact in release: ' + item.name);
    }
  }
  audit(folder);
  fs.mkdirSync(dist, {recursive: true});
  const archive = path.join(dist, name + '.zip');
  if (fs.existsSync(archive)) fs.unlinkSync(archive);
  const result = cp.spawnSync('zip', ['-qr', archive, name], {cwd: stage, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || 'zip failed');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), hash + '  ' + name + '.zip\n');
  console.log(archive + '\n' + hash);
} finally {fs.rmSync(stage, {recursive: true, force: true});}
