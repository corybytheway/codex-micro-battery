// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {addBatteryLayer, removeBatteryLayer, locateBattery} = require('./model.cjs');
const {applyKeymap, backupKeymap, atomicJson} = require('./device-config.cjs');

function copyRuntime(source, destination) {
  fs.mkdirSync(destination, {recursive: true, mode: 0o700});
  for (const name of ['bin', 'lib']) fs.cpSync(path.join(source, name), path.join(destination, name), {recursive: true});
  for (const name of ['package.json', 'LICENSE']) fs.copyFileSync(path.join(source, name), path.join(destination, name));
}
function prepare(device, profileId) {
  const status = device.status();
  const version = String(status.version || '').replace(/^v/, '').split('.').map(Number);
  if (version.length < 3 || version.some(n => !Number.isFinite(n)) || version[0] === 0 && (version[1] < 6 || version[1] === 6 && version[2] < 3)) throw new Error('Use vendor firmware 0.6.3 or later before installation. The installer never flashes firmware.');
  const beforeBytes = device.readKeymapBytes();
  const keymap = JSON.parse(beforeBytes);
  const chosen = profileId ?? keymap.profiles?.[status.profile_index]?.id;
  const plan = addBatteryLayer(keymap, chosen);
  return {...plan, beforeBytes, firmware: status.version, profileName: keymap.profiles.find(p => p.id === chosen).name};
}
function install({device, paths, source, plan, agent, inputApp}) {
  if (fs.existsSync(paths.state)) throw new Error('Micro Battery already has installation state here. Use status or uninstall first.');
  const backup = backupKeymap(paths.backups, plan.beforeBytes, 'before-install');
  copyRuntime(source, paths.app);
  const state = {
    schema: 1, author: 'Cory McCabe', installationId: crypto.randomUUID(), phase: 'prepared', installedAt: new Date().toISOString(),
    profileId: plan.profileId, layerId: plan.layerId, channels: plan.channels, ambientChannel: plan.ambientChannel, darkKeysChannel: plan.darkKeysChannel, expectedLayer: plan.expectedLayer,
    backup, firmware: plan.firmware, ...(inputApp ? {inputApp} : {})
  };
  // Write the recovery record before touching the device.
  atomicJson(paths.state, state);
  atomicJson(paths.settings, {pollSeconds: 15, underglow: {mode: 'battery', color: '#FFFFFF', brightness: 1}});
  const receipt = applyKeymap(device, plan.beforeBytes, plan.candidate);
  state.phase = 'installed'; state.receipt = receipt;
  atomicJson(paths.state, state);
  agent.start();
  return {state, layerNumber: plan.layerNumber};
}
function uninstall({device, paths, agent, dryRun = false}) {
  const state = JSON.parse(fs.readFileSync(paths.state));
  const cooperative = state.ambientChannel !== undefined;
  const resume = cooperative && (agent.status?.().running || fs.existsSync(paths.agent));
  let completed = false;
  // The new service polls frequently. Pause it before a multi-report keymap
  // read, then resume it if removal is declined, refused, or fails.
  if (cooperative) agent.stop();
  try {
    const beforeBytes = device.readKeymapBytes();
    const keymap = JSON.parse(beforeBytes);
    const profile = keymap.profiles?.find(p => p.id === state.profileId);
    const target = profile?.layers?.find(l => l.id === state.layerId);
    if (!target && state.phase === 'prepared') {
      if (dryRun) return {alreadyAbsent: true, dryRun: true};
      agent.stop({disable: true});
      fs.renameSync(paths.state, path.join(paths.root, 'uninstalled-' + Date.now() + '.json'));
      completed = true;
      return {alreadyAbsent: true};
    }
    // Confirm ownership before removing anything. Legacy polling stops after this check.
    locateBattery(keymap, state);
    const candidate = removeBatteryLayer(keymap, state);
    if (dryRun) return {dryRun: true, layerId: state.layerId};
    const backup = backupKeymap(paths.backups, beforeBytes, 'before-uninstall');
    agent.stop({disable: true});
    if (cooperative && fs.existsSync(paths.ambientState)) {
      const ambient = JSON.parse(fs.readFileSync(paths.ambientState));
      if (ambient.overridden && ambient.strategy === 'spare-channel' && ambient.channel === state.ambientChannel) {
        const channels = [state.ambientChannel, state.darkKeysChannel].filter(Number.isInteger);
        if (device.call('v.oai.thstatus', channels.map(id => ({id, sk: 0, sa: 0})))?.ok !== 1 || device.call('v.oai.rgbcfg', {})?.ok !== 1) throw new Error('Could not release pending layer lighting; reconnect and retry uninstall.');
        atomicJson(paths.ambientState, {...ambient, overridden: false});
      }
    }
    const receipt = applyKeymap(device, beforeBytes, candidate);
    atomicJson(path.join(paths.root, 'uninstall-receipt-' + Date.now() + '.json'), {receipt, backup, at: new Date().toISOString()});
    fs.renameSync(paths.state, path.join(paths.root, 'uninstalled-' + Date.now() + '.json'));
    completed = true;
    return receipt;
  } finally {
    if (cooperative && resume && !completed) agent.start();
  }
}
module.exports = {prepare, install, uninstall, copyRuntime};
