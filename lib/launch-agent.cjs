// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const LABEL = 'com.corymccabe.micro-battery';
const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function agentXml(paths, nodePath) {
  const value = escapeXml;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>${value(nodePath)}</string><string>${value(path.join(paths.app, 'bin/micro-battery.cjs'))}</string><string>run</string><string>--data-dir</string><string>${value(paths.root)}</string></array>
<key>WorkingDirectory</key><string>${value(paths.root)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>15</integer><key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${value(path.join(paths.logs, 'service.log'))}</string>
<key>StandardErrorPath</key><string>${value(path.join(paths.logs, 'error.log'))}</string>
</dict></plist>\n`;
}
function selectedNode() {
  for (const candidate of ['/opt/homebrew/bin/node', '/usr/local/bin/node', process.execPath]) if (fs.existsSync(candidate)) return candidate;
  return process.execPath;
}
function control(paths) {
  const domain = 'gui/' + process.getuid();
  const launch = (...args) => cp.spawnSync('/bin/launchctl', args, {encoding: 'utf8'});
  return {
    stop({disable = false} = {}) {
      launch('bootout', domain + '/' + LABEL);
      // Give the service time to release its spare-channel lighting flags.
      // Uninstall must not begin a keymap transfer while that cleanup is active.
      const deadline = Date.now() + 15000;
      while (fs.existsSync(paths.lock)) {
        let pid;
        try {pid = Number(fs.readFileSync(paths.lock, 'utf8'));}
        catch (error) {if (error.code === 'ENOENT') break; throw error;}
        let alive = false;
        if (Number.isSafeInteger(pid) && pid > 0) {try {process.kill(pid, 0); alive = true;} catch {}}
        if (!alive) {try {fs.unlinkSync(paths.lock);} catch (error) {if (error.code !== 'ENOENT') throw error;} break;}
        if (Date.now() >= deadline) throw new Error('The helper is still stopping. Wait a moment and retry.');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
      if (disable && fs.existsSync(paths.agent)) fs.unlinkSync(paths.agent);
    },
    start() {
      fs.mkdirSync(paths.logs, {recursive: true, mode: 0o700});
      fs.mkdirSync(path.dirname(paths.agent), {recursive: true});
      fs.writeFileSync(paths.agent, agentXml(paths, selectedNode()), {mode: 0o600});
      this.stop();
      let result;
      for (let attempt = 0; attempt < 5; attempt++) {
        result = launch('bootstrap', domain, paths.agent);
        if (result.status === 0) return;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      }
      throw new Error('The layer is installed, but login startup failed: ' + (result.stderr || result.stdout).trim() + '. Run the start command to retry.');
    },
    status() {
      const result = launch('print', domain + '/' + LABEL);
      return {running: result.status === 0 && /state = running/.test(result.stdout), pid: Number(result.stdout?.match(/\n\s*pid = (\d+)/)?.[1]) || null};
    }
  };
}
module.exports = {control, agentXml, LABEL};
