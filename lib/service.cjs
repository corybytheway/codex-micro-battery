// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const {MicroDevice} = require('./hid.cjs');
const {batteryFrame} = require('./battery.cjs');
const {AmbientHandoff, hasNativeCodexLayer} = require('./ambient.cjs');
const {locateBattery} = require('./model.cjs');
const {atomicJson} = require('./device-config.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LAYER_CHECK_MS = 500;

function settingsFrom(file) {
  const value = JSON.parse(fs.readFileSync(file));
  if (!Number.isInteger(value.pollSeconds) || value.pollSeconds < 5 || value.pollSeconds > 300) throw new Error('Invalid settings: pollSeconds must be 5–300.');
  return value;
}
function update(device, state, preferences, position, status, {handoff = new AmbientHandoff(), keymap, forceAmbient = false, sendFrame = true} = {}) {
  const nativeCodex = hasNativeCodexLayer(keymap);
  // Shared ambient writes invalidate the native host's cached lighting. Until a
  // cooperative handoff exists, keep all ambient control with that host.
  if (nativeCodex) handoff.relinquish();
  const ambient = nativeCodex ? {override: false, action: 'native-host', color: null}
    : handoff.sync(device, keymap, position, status, preferences.underglow, {force: forceAmbient});
  const frame = batteryFrame(status.battery, {channels: state.channels});
  if (sendFrame && device.call('v.oai.thstatus', frame.levels, 2000)?.ok !== 1) throw new Error('Battery-light acknowledgment missing.');
  return {
    updatedAt: new Date().toISOString(), connected: true, battery: status.battery, charging: !!status.is_charging,
    activeProfile: status.profile_index, activeLayer: status.layer_index, color: frame.colorName,
    levels: frame.levels.map(e => e.b), underglowRequested: ambient.override, underglowAction: ambient.action,
    underglowSuppressed: nativeCodex && preferences.underglow?.mode !== 'inherit',
    underglowColor: ambient.color === null ? null : '#' + ambient.color.toString(16).padStart(6, '0'), acknowledged: true
  };
}
async function runService(paths, options = {}) {
  const state = JSON.parse(fs.readFileSync(paths.state));
  if (state.ambientChannel !== undefined) {
    const {runCooperativeService} = require('./cooperative-service.cjs');
    return runCooperativeService(paths, {settingsFrom, onEvent: event => console.log(JSON.stringify({time: new Date().toISOString(), ...event})), ...options});
  }
  return runLegacyService(paths, options);
}
async function runLegacyService(paths, {once = false, deviceFactory, onEvent = event => console.log(JSON.stringify({time: new Date().toISOString(), ...event}))} = {}) {
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
  let running = true, device, keymap, position, preferences, lastEvent = '', lastError = '';
  let nextRefresh = 0, lastLayer = '', lastFrame = '', failures = 0;
  const handoff = new AmbientHandoff({
    pending: fs.existsSync(paths.ambientState) && JSON.parse(fs.readFileSync(paths.ambientState)).overridden === true,
    onOwnershipChange: overridden => atomicJson(paths.ambientState, {overridden})
  });
  const stop = () => {running = false;};
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    while (running) {
      const started = Date.now();
      try {
        const connected = !device;
        if (connected) {
          device = deviceFactory ? deviceFactory() : new MicroDevice({inputApp: state.inputApp});
          onEvent({event: 'connected', device: device.identity?.product || 'Codex Micro'});
        }
        const messages = device.read(1);
        let status = device.status(1500);
        const methods = device.consumeForeignMethods().concat(messages.filter(m => m.id !== undefined).map(m => m.method));
        let activeLayer = status.profile_index + '/' + status.layer_index;
        if (!keymap || activeLayer !== lastLayer || Date.now() >= nextRefresh) {
          preferences = settingsFrom(paths.settings);
          keymap = JSON.parse(device.readKeymapBytes(2000));
          // A touch may have switched layers while the keymap was in flight.
          status = device.status(1500);
          activeLayer = status.profile_index + '/' + status.layer_index;
          try {position = locateBattery(keymap, state);} catch (error) {
            // Release a carried override on another layer even if Battery was edited.
            const profile = keymap.profiles[status.profile_index];
            if (hasNativeCodexLayer(keymap)) handoff.relinquish();
            else if (profile?.id !== state.profileId || profile?.layers[status.layer_index - 1]?.id !== state.layerId) handoff.restore(device, keymap, status);
            throw error;
          }
          nextRefresh = Date.now() + preferences.pollSeconds * 1000;
        }
        const frameSignature = JSON.stringify(batteryFrame(status.battery, {channels: state.channels}).levels);
        const result = update(device, state, preferences, position, status, {
          handoff, keymap, forceAmbient: connected || methods.includes('v.oai.rgbcfg'), sendFrame: connected || frameSignature !== lastFrame
        });
        lastLayer = activeLayer; lastFrame = frameSignature;
        atomicJson(paths.status, result);
        const signature = JSON.stringify([result.battery, result.charging, result.activeProfile, result.activeLayer, result.levels, result.underglowRequested, result.underglowColor]);
        if (signature !== lastEvent) {onEvent({event: 'battery', ...result}); lastEvent = signature;}
        lastError = ''; failures = 0;
        if (once) return result;
        const interval = hasNativeCodexLayer(keymap) || preferences.underglow?.mode === 'inherit' ? preferences.pollSeconds * 1000 : LAYER_CHECK_MS;
        const deadline = started + interval;
        while (running && Date.now() < deadline) await sleep(Math.min(250, deadline - Date.now()));
      } catch (error) {
        try {device?.close();} catch {}
        device = null; keymap = null; nextRefresh = 0; lastLayer = ''; lastFrame = '';
        atomicJson(paths.status, {updatedAt: new Date().toISOString(), connected: false, reason: error.message});
        if (error.message !== lastError) {onEvent({event: 'waiting', reason: error.message}); lastError = error.message;}
        if (once) throw error;
        await sleep(Math.min(5000, 500 * 2 ** Math.min(failures++, 4)));
      }
    }
  } finally {
    if (!once && handoff.owned && device) {
      try {
        const currentKeymap = JSON.parse(device.readKeymapBytes(2000));
        if (hasNativeCodexLayer(currentKeymap)) {
          handoff.relinquish();
          onEvent({event: 'underglow-yielded-to-native-host'});
        } else {
          const status = device.status(1500);
          handoff.restore(device, currentKeymap, status);
          onEvent({event: 'underglow-restored', activeProfile: status.profile_index, activeLayer: status.layer_index});
        }
      } catch (error) {onEvent({event: 'restore-pending', reason: error.message});}
    }
    try {device?.close();} catch {}
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    try {if (fs.readFileSync(paths.lock, 'utf8') === String(process.pid)) fs.unlinkSync(paths.lock);} catch {}
  }
}
module.exports = {runService, update, settingsFrom, LAYER_CHECK_MS};
