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
    profileId: plan.profileId, layerId: plan.layerId, channels: plan.channels, expectedLayer: plan.expectedLayer,
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
  const beforeBytes = device.readKeymapBytes();
  const keymap = JSON.parse(beforeBytes);
  const profile = keymap.profiles?.find(p => p.id === state.profileId);
  const target = profile?.layers?.find(l => l.id === state.layerId);
  if (!target && state.phase === 'prepared') {
    if (dryRun) return {alreadyAbsent: true, dryRun: true};
    agent.stop({disable: true});
    fs.renameSync(paths.state, path.join(paths.root, 'uninstalled-' + Date.now() + '.json'));
    return {alreadyAbsent: true};
  }
  // Confirm ownership before stopping a working service or removing anything.
  locateBattery(keymap, state);
  const candidate = removeBatteryLayer(keymap, state);
  if (dryRun) return {dryRun: true, layerId: state.layerId};
  const backup = backupKeymap(paths.backups, beforeBytes, 'before-uninstall');
  agent.stop({disable: true});
  const receipt = applyKeymap(device, beforeBytes, candidate);
  atomicJson(path.join(paths.root, 'uninstall-receipt-' + Date.now() + '.json'), {receipt, backup, at: new Date().toISOString()});
  fs.renameSync(paths.state, path.join(paths.root, 'uninstalled-' + Date.now() + '.json'));
  return receipt;
}
module.exports = {prepare, install, uninstall, copyRuntime};
