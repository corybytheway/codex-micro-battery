// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const {MicroDevice} = require('./hid.cjs');
const {batteryFrame} = require('./battery.cjs');
const {locateBattery} = require('./model.cjs');
const {atomicJson} = require('./device-config.cjs');
const {NativeRpcGate} = require('./native-rpc-gate.cjs');
const {cooperativeCall, readKeymapBytes} = require('./cooperative-rpc.cjs');
const {SpareLighting} = require('./spare-lighting.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LAYER_CHECK_MS = 200;

async function runCooperativeService(paths, {once = false, deviceFactory, gateFactory, settingsFrom, onEvent} = {}) {
  const state = JSON.parse(fs.readFileSync(paths.state));
  if (state.phase !== 'installed') throw new Error('Installation is incomplete; use uninstall to recover it.');
  if (fs.existsSync(paths.lock)) {
    const pid = Number(fs.readFileSync(paths.lock, 'utf8'));
    let alive = false;
    if (Number.isSafeInteger(pid) && pid > 0) {try {process.kill(pid, 0); alive = true;} catch {}}
    if (alive) throw new Error('Micro Battery is already running.');
    fs.unlinkSync(paths.lock);
  }
  let running = true, device, gate, rpc, keymap, position, preferences, result;
  let nextKeymap = 0, nextSettings = 0, lastFrame = '', lastEvent = '', lastError = '', failures = 0, transportError = false;
  const pending = fs.existsSync(paths.ambientState) ? JSON.parse(fs.readFileSync(paths.ambientState)) : {};
  const handoff = new SpareLighting(state.ambientChannel, {
    darkKeysChannel: state.darkKeysChannel,
    pending: pending.strategy === 'spare-channel' && pending.channel === state.ambientChannel && pending.overridden === true,
    onOwnershipChange: overridden => atomicJson(paths.ambientState, {strategy: 'spare-channel', channel: state.ambientChannel, darkKeysChannel: state.darkKeysChannel, overridden})
  });
  fs.writeFileSync(paths.lock, String(process.pid), {flag: 'wx', mode: 0o600});
  const stop = () => {running = false;};
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const cleanRpc = (method, params) => cooperativeCall(device, gate, method, params, 2500);
  const release = async () => {
    if (device && handoff.owned) {
      await handoff.release(cleanRpc);
      onEvent({event: 'native-lighting-released'});
    }
  };
  try {
    while (running) {
      const started = Date.now();
      try {
        const connected = !device;
        if (connected) {
          transportError = false;
          gate = gateFactory ? gateFactory() : new NativeRpcGate({onEvent: event => {
            if (event.kind === 'native-parse-error') transportError = true;
          }});
          await gate.wait();
          device = deviceFactory ? deviceFactory() : new MicroDevice({inputApp: state.inputApp});
          rpc = async (method, params, timeout) => {
            if (transportError) throw new Error('Native device communication needs a quiet recovery interval.');
            const value = await cooperativeCall(device, gate, method, params, timeout, {
              now: Date.now, sleep,
              beforeWrite: () => {if (transportError) throw new Error('Native device communication needs a quiet recovery interval.');}
            });
            if (transportError) throw new Error('Native device communication needs a quiet recovery interval.');
            return value;
          };
          handoff.signature = '';
          onEvent({event: 'connected', device: device.identity?.product || 'Codex Micro'});
        }
        if (Date.now() >= nextSettings) {
          preferences = settingsFrom(paths.settings);
          nextSettings = Date.now() + 1000;
        }
        if (!keymap || Date.now() >= nextKeymap) {
          keymap = JSON.parse(await readKeymapBytes(rpc));
          position = locateBattery(keymap, state);
          nextKeymap = Date.now() + 60000;
        }
        // Read after keymap validation so a touch during that transfer cannot
        // select a different layer before the first lighting decision.
        const status = await rpc('device.status', undefined, 1500);
        if (!Number.isInteger(status?.profile_index) || !Number.isInteger(status?.layer_index) || !Number.isFinite(status?.battery) || status.battery < 0 || status.battery > 100) throw new Error('Micro returned an invalid status.');
        const frame = batteryFrame(status.battery, {channels: state.channels});
        const signature = JSON.stringify(frame.levels);
        if (connected || signature !== lastFrame) {
          if ((await rpc('v.oai.thstatus', frame.levels))?.ok !== 1) throw new Error('Battery-light acknowledgment missing.');
          lastFrame = signature;
        }
        const ambient = await handoff.sync(rpc, position, status, preferences.underglow);
        result = {
          updatedAt: new Date().toISOString(), connected: true, battery: status.battery, charging: !!status.is_charging,
          activeProfile: status.profile_index, activeLayer: status.layer_index, color: frame.colorName,
          levels: frame.levels.map(entry => entry.b), underglowRequested: ambient.override, underglowAction: ambient.action,
          underglowSuppressed: false, underglowColor: ambient.color === null ? null : '#' + ambient.color.toString(16).padStart(6, '0'),
          opaqueKeysOff: ambient.opaqueKeysOff, acknowledged: true
        };
        const event = JSON.stringify([result.battery, result.charging, result.activeProfile, result.activeLayer, result.levels, ambient.override, ambient.color]);
        if (event !== lastEvent) {atomicJson(paths.status, result); onEvent({event: 'battery', ...result}); lastEvent = event;}
        lastError = ''; failures = 0;
        if (once) return result;
        while (running && Date.now() < started + LAYER_CHECK_MS) await sleep(Math.min(25, started + LAYER_CHECK_MS - Date.now()));
      } catch (error) {
        try {await release();} catch (cleanup) {onEvent({event: 'restore-pending', reason: cleanup.message});}
        try {device?.close();} catch {}
        device = null; keymap = null; nextKeymap = 0; nextSettings = 0; lastFrame = ''; lastEvent = '';
        atomicJson(paths.status, {updatedAt: new Date().toISOString(), connected: false, reason: error.message});
        if (error.message !== lastError) {onEvent({event: 'waiting', reason: error.message}); lastError = error.message;}
        if (once) throw error;
        const deadline = Date.now() + Math.min(5000, 500 * 2 ** Math.min(failures++, 4));
        while (running && Date.now() < deadline) await sleep(Math.min(100, deadline - Date.now()));
      }
    }
  } finally {
    try {await release();} catch (error) {onEvent({event: 'restore-pending', reason: error.message});}
    try {device?.close();} catch {}
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    try {if (fs.readFileSync(paths.lock, 'utf8') === String(process.pid)) fs.unlinkSync(paths.lock);} catch {}
  }
}
module.exports = {runCooperativeService, LAYER_CHECK_MS};
