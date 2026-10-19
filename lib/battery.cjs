// Author: Cory McCabe
'use strict';
const COLORS = Object.freeze({green: 0x00ff00, orange: 0xff8000, red: 0xff0000});

function batteryFrame(percent, {channels = [6, 7, 8, 9, 10, 11]} = {}) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Battery must be a number from 0 to 100.');
  if (!Array.isArray(channels) || channels.length !== 6 || new Set(channels).size !== 6 || channels.some(id => !Number.isInteger(id) || id < 6 || id > 19)) {
    throw new Error('Six unique spare channels from 6 through 19 are required.');
  }
  const segments = percent * 6 / 100;
  const litCount = Math.max(0, Math.ceil(segments - 1e-10));
  const color = litCount >= 4 ? COLORS.green : segments > 1.5 + 1e-10 ? COLORS.orange : COLORS.red;
  // Top-left, top-right, then the bottom row left to right. Discharge reverses
  // this order: bottom-right first, top-left last.
  const levels = channels.map((id, index) => {
    const fill = segments - index;
    // The active light's brightness is the remaining fraction of its sixth.
    // Snap only numerical noise at exact segment boundaries.
    const brightness = fill <= 1e-10 ? 0 : fill >= 1 - 1e-10 ? 1 : fill;
    return {id, c: color, b: brightness, e: brightness ? 1 : 0, s: 0, sk: 0, sa: 0};
  });
  return {percent, color, colorName: Object.keys(COLORS).find(key => COLORS[key] === color), litCount, levels};
}

function ambientUpdate(status, position, preferences) {
  if (!preferences || preferences.mode === 'inherit' || status.profile_index !== position.profile || status.layer_index !== position.layer) return null;
  if (!['battery', 'white', 'off'].includes(preferences.mode)) throw new Error('Invalid underglow mode.');
  if (!/^#[0-9a-f]{6}$/i.test(preferences.color) || !Number.isFinite(preferences.brightness) || preferences.brightness < 0 || preferences.brightness > 1) {
    throw new Error('Invalid underglow color or brightness.');
  }
  // Ambient only: preserve the host's independent key-light configuration.
  const brightness = preferences.mode === 'off' ? 0 : preferences.brightness;
  const color = preferences.mode === 'battery' ? batteryFrame(status.battery).color : parseInt(preferences.color.slice(1), 16);
  return {ambient: {e: brightness ? 1 : 0, b: brightness, s: 0, m: 1, c: color}};
}
module.exports = {batteryFrame, ambientUpdate, COLORS};
