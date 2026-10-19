// Author: Cory McCabe
'use strict';
const {ambientUpdate} = require('./battery.cjs');
const EFFECTS = Object.freeze({off: 0, solid: 1, snake: 2, rainbow: 3, breath: 4, gradient: 5, shallowBreath: 6});

function savedAmbient(keymap, status) {
  const saved = keymap.profiles[status.profile_index]?.layers[status.layer_index - 1]?.lights?.underglow;
  const effect = EFFECTS[saved?.effect];
  if (effect === undefined || !Number.isFinite(saved.brightness) || saved.brightness < 0 || saved.brightness > 1
      || !Number.isFinite(saved.speed) || saved.speed < 0 || saved.speed > 1
      || !Number.isFinite(saved.magic) || saved.magic < 0 || saved.magic > 1
      || !Number.isInteger(saved.color) || saved.color < 0 || saved.color > 0xffffff) {
    throw new Error('Cannot restore this layer’s saved underglow: unrecognized lighting settings.');
  }
  return {ambient: {e: effect, b: saved.brightness, s: saved.speed, m: saved.magic, c: saved.color}};
}

class AmbientHandoff {
  constructor({pending = false, onOwnershipChange = () => {}} = {}) {
    this.owned = pending;
    this.onOwnershipChange = onOwnershipChange;
    this.lastWrite = '';
  }
  write(device, params) {
    if (device.call('v.oai.rgbcfg', params, 2000)?.ok !== 1) throw new Error('Underglow acknowledgment missing.');
  }
  relinquish() {
    if (this.owned) this.onOwnershipChange(false);
    this.owned = false;
    this.lastWrite = '';
  }
  restore(device, keymap, status) {
    if (!this.owned) return null;
    const params = savedAmbient(keymap, status);
    this.write(device, params);
    this.onOwnershipChange(false);
    this.owned = false;
    this.lastWrite = '';
    return params;
  }
  sync(device, keymap, position, status, preferences, {force = false} = {}) {
    const params = ambientUpdate(status, position, preferences);
    if (!params) {
      const restored = this.restore(device, keymap, status);
      return {override: false, action: restored ? 'restore' : 'unchanged', color: restored ? restored.ambient.c : null};
    }
    const signature = JSON.stringify([status.profile_index, status.layer_index, params]);
    if (force || !this.owned || signature !== this.lastWrite) {
      // Journal before writing, so restart/error recovery can release an override.
      if (!this.owned) {this.onOwnershipChange(true); this.owned = true;}
      this.write(device, params);
      this.lastWrite = signature;
      return {override: true, action: 'apply', color: params.ambient.c};
    }
    return {override: true, action: 'unchanged', color: params.ambient.c};
  }
}
function hasNativeCodexLayer(keymap) {
  return keymap.profiles.some(profile => profile.layers.some(layer =>
    layer.layout.keymap.flat().some(token => /^KV_OAI_AG0[0-5]$/.test(token))));
}
module.exports = {AmbientHandoff, savedAmbient, hasNativeCodexLayer};
