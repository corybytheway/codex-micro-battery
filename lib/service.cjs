// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const {MicroDevice} = require('./hid.cjs');
const {batteryFrame, ambientUpdate} = require('./battery.cjs');
const {locateBattery} = require('./model.cjs');
const {atomicJson} = require('./device-config.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function settingsFrom(file) {
  const value = JSON.parse(fs.readFileSync(file));
  if (!Number.isInteger(value.pollSeconds) || value.pollSeconds < 5 || value.pollSeconds > 300) throw new Error('Invalid settings: pollSeconds must be 5–300.');
  return value;
}
function update(device, state, preferences, position, status) {
  const ambient = ambientUpdate(status, position, preferences.underglow);
  if (ambient && device.call('v.oai.rgbcfg', ambient)?.ok !== 1) throw new Error('Underglow acknowledgment missing.');
  const frame = batteryFrame(status.battery, {channels: state.channels});
  if (device.call('v.oai.thstatus', frame.levels)?.ok !== 1) throw new Error('Battery-light acknowledgment missing.');
  return {
    updatedAt: new Date().toISOString(), connected: true, battery: status.battery, charging: !!status.is_charging,
    activeProfile: status.profile_index, activeLayer: status.layer_index, color: frame.colorName,
    levels: frame.levels.map(e => e.b), underglowRequested: !!ambient, acknowledged: true
  };
}
async function runService(paths, {once = false, deviceFactory, onEvent = event => console.log(JSON.stringify({time: new Date().toISOString(), ...event}))} = {}) {
  const state = JSON.parse(fs.readFileSync(paths.state));
  if (state.phase !== 'installed') throw new Error('Installation is incomplete. Reconnect the Micro and use uninstall to recover the prepared installation.');
  if (fs.existsSync(paths.lock)) {
    const pid = Number(fs.readFileSync(paths.lock, 'utf8'));
    let alive = false;
    if (Number.isSafeInteger(pid) && pid > 0) {try {process.kill(pid, 0); alive = true;} catch {}}
    if (alive) throw new Error('Micro Battery is already running.');
    fs.unlinkSync(paths.lock);
  }
  fs.writeFileSync(paths.lock, String(process.pid), {flag: 'wx', mode: 0o600});
  let running = true, device, position, lastEvent = '', lastError = '';
  const stop = () => {running = false;};
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    while (running) {
      try {
        const preferences = settingsFrom(paths.settings);
        if (!device) {
          device = deviceFactory ? deviceFactory() : new MicroDevice({inputApp: state.inputApp});
          position = locateBattery(JSON.parse(device.readKeymapBytes()), state);
          onEvent({event: 'connected', device: device.identity?.product || 'Codex Micro'});
        }
        const status = device.status();
        const result = update(device, state, preferences, position, status);
        atomicJson(paths.status, result);
        const signature = JSON.stringify([result.battery, result.charging, result.activeLayer, result.levels, result.underglowRequested]);
        if (signature !== lastEvent) {onEvent({event: 'battery', ...result}); lastEvent = signature;}
        lastError = '';
        if (once) return result;
        const deadline = Date.now() + preferences.pollSeconds * 1000;
        while (running && Date.now() < deadline) {
          const messages = device.read(25);
          const methods = device.consumeForeignMethods().concat(messages.filter(m => m.id !== undefined).map(m => m.method));
          if (preferences.underglow?.mode !== 'inherit' && methods.includes('v.oai.rgbcfg')) {
            const current = device.status();
            const ambient = ambientUpdate(current, position, preferences.underglow);
            if (ambient) device.call('v.oai.rgbcfg', ambient);
          }
          await sleep(225);
        }
        if (running) position = locateBattery(JSON.parse(device.readKeymapBytes()), state);
      } catch (error) {
        try {device?.close();} catch {}
        device = null;
        atomicJson(paths.status, {updatedAt: new Date().toISOString(), connected: false, reason: error.message});
        if (error.message !== lastError) {onEvent({event: 'waiting', reason: error.message}); lastError = error.message;}
        if (once) throw error;
        for (let i = 0; running && i < 40; i++) await sleep(250);
      }
    }
  } finally {
    try {device?.close();} catch {}
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    try {if (fs.readFileSync(paths.lock, 'utf8') === String(process.pid)) fs.unlinkSync(paths.lock);} catch {}
  }
}
module.exports = {runService, update, settingsFrom};
