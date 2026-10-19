// Author: Cory McCabe
'use strict';
const {isDeepStrictEqual} = require('node:util');
const AGENT_PATTERN = /^KV_OAI_AG(\d{2})$/;
const MATRIX = [2, 4, 4, 3];

function validateKeymap(keymap) {
  if (!keymap || !Array.isArray(keymap.profiles) || !keymap.profiles.length) throw new Error('Unrecognized device keymap.');
  const profiles = new Set();
  for (const profile of keymap.profiles) {
    if (!Number.isInteger(profile.id) || profiles.has(profile.id) || !Array.isArray(profile.layers) || !profile.layers.length) throw new Error('Invalid profiles in keymap.');
    profiles.add(profile.id);
    const ids = new Set();
    for (const layer of profile.layers) {
      if (!Number.isInteger(layer.id) || ids.has(layer.id)) throw new Error('Invalid layer IDs in keymap.');
      ids.add(layer.id);
      if (!Array.isArray(layer.layout?.keymap) || layer.layout.keymap.length !== 4 || MATRIX.some((n, row) => layer.layout.keymap[row]?.length !== n)) {
        throw new Error('This release supports the Codex Micro 2 / 4 / 4 / 3 key matrix only.');
      }
    }
  }
  return keymap;
}
function assignedChannels(layer) {
  const channels = [];
  const visit = value => {
    if (typeof value === 'string') {
      const match = AGENT_PATTERN.exec(value);
      if (match) channels.push(Number(match[1]));
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(layer.layout);
  return channels;
}
function freeChannels(keymap) {
  const used = new Set(keymap.profiles.flatMap(p => p.layers.flatMap(assignedChannels)));
  return Array.from({length: 14}, (_, index) => index + 6).filter(id => !used.has(id));
}
function addBatteryLayer(keymap, profileId) {
  validateKeymap(keymap);
  const candidate = structuredClone(keymap);
  const profile = candidate.profiles.find(p => p.id === profileId);
  if (!profile) throw new Error('Selected profile was not found.');
  if (profile.layers.length >= 6) throw new Error('This profile already has six layers. Free one in Input before installing.');
  const available = freeChannels(candidate);
  const channels = available.slice(0, 6), ambientChannel = available[6], darkKeysChannel = available[7];
  if (darkKeysChannel === undefined) throw new Error('Eight spare Agent-light channels are required for the gauge, underglow, and unlit action keys.');
  const tokens = channels.map(id => 'KV_OAI_AG' + String(id).padStart(2, '0'));
  const id = Math.max(...profile.layers.map(layer => layer.id)) + 1;
  let name = 'Battery';
  for (let suffix = 2; profile.layers.some(layer => layer.name === name); suffix++) name = 'Battery ' + suffix;
  const off = {effect: 'off', brightness: 0, speed: 0, magic: 1, color: 0xffffff};
  const layer = {
    id, name, color: 0x00ff00,
    layout: {
      keymap: [tokens.slice(0, 2), tokens.slice(2), Array(4).fill('KC_NONE'), Array(3).fill('KC_NONE')],
      encoders: [['KC_NONE', 'KC_NONE', 'KC_NONE']],
      joystick: {type: 'RADIAL', sectors: []}
    },
    lights: {backlight: {...off}, underglow: {...off}}
  };
  profile.layers.push(layer);
  return {candidate, profileId, layerId: id, channels, ambientChannel, darkKeysChannel, expectedLayer: structuredClone(layer), layerNumber: profile.layers.length};
}
function locateBattery(keymap, state) {
  validateKeymap(keymap);
  const profileIndex = keymap.profiles.findIndex(p => p.id === state.profileId);
  if (profileIndex < 0) throw new Error('Battery profile was removed.');
  const profile = keymap.profiles[profileIndex];
  const layerIndex = profile.layers.findIndex(layer => layer.id === state.layerId);
  if (layerIndex < 0) throw new Error('Battery layer was removed.');
  const target = profile.layers[layerIndex];
  if (!isDeepStrictEqual(target, state.expectedLayer)) throw new Error('Battery layer was edited outside this helper; updates are paused to preserve your changes.');
  if (state.ambientChannel !== undefined) {
    if (!Number.isInteger(state.ambientChannel) || state.ambientChannel < 6 || state.ambientChannel > 19 || state.channels.includes(state.ambientChannel)) throw new Error('Invalid reserved layer-lighting channel.');
    if (keymap.profiles.some(p => p.layers.some(layer => assignedChannels(layer).includes(state.ambientChannel)))) throw new Error('The reserved layer-lighting channel is now assigned to a key; updates are paused.');
  }
  if (state.darkKeysChannel !== undefined) {
    if (!Number.isInteger(state.darkKeysChannel) || state.darkKeysChannel < 6 || state.darkKeysChannel > 19 || state.channels.includes(state.darkKeysChannel) || state.darkKeysChannel === state.ambientChannel) throw new Error('Invalid reserved dark-key channel.');
    if (keymap.profiles.some(p => p.layers.some(layer => assignedChannels(layer).includes(state.darkKeysChannel)))) throw new Error('The reserved dark-key channel is now assigned to a key; updates are paused.');
  }
  for (const p of keymap.profiles) for (const layer of p.layers) {
    if (p.id === state.profileId && layer.id === state.layerId) continue;
    if (assignedChannels(layer).some(id => state.channels.includes(id))) throw new Error('Battery channels are now assigned on another layer; updates are paused.');
  }
  return {profile: profileIndex, layer: layerIndex + 1};
}
function removeBatteryLayer(keymap, state) {
  locateBattery(keymap, state);
  const candidate = structuredClone(keymap);
  const profile = candidate.profiles.find(p => p.id === state.profileId);
  profile.layers.splice(profile.layers.findIndex(layer => layer.id === state.layerId), 1);
  return candidate;
}
module.exports = {validateKeymap, addBatteryLayer, locateBattery, removeBatteryLayer, freeChannels};
