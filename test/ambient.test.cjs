// Author: Cory McCabe
const test = require('node:test');
const assert = require('node:assert/strict');
const {AmbientHandoff} = require('../lib/ambient.cjs');
const {FakeDevice, fixture} = require('./fixtures.cjs');
const position = {profile: 0, layer: 3};
const preferences = {mode: 'battery', color: '#FFFFFF', brightness: 1};
const battery = {profile_index: 0, layer_index: 3, battery: 50};
const main = {...battery, layer_index: 1};

test('leaving Battery restores the destination effect once and then yields to its host', () => {
  const device = new FakeDevice(), keymap = fixture(), ownership = [];
  const handoff = new AmbientHandoff({onOwnershipChange: value => ownership.push(value)});
  handoff.sync(device, keymap, position, battery, preferences);
  handoff.sync(device, keymap, position, battery, preferences);
  assert.equal(device.calls.length, 1); // No repeated battery-color writes while unchanged.
  const result = handoff.sync(device, keymap, position, main, preferences);
  assert.equal(result.action, 'restore');
  assert.deepEqual(device.calls[1].params, {ambient: {e: 3, b: .8, s: .69, m: 1, c: 0xffffff}});
  handoff.sync(device, keymap, position, main, preferences, {force: true});
  assert.equal(device.calls.length, 2); // Never reassert Battery on the native layer.
  assert.deepEqual(ownership, [true, false]);
  handoff.sync(device, keymap, position, battery, preferences);
  assert.equal(device.calls[2].params.ambient.c, 0xff8000);
});
test('handoff restores the newly active profile’s settings, including off', () => {
  const device = new FakeDevice(), keymap = fixture(), handoff = new AmbientHandoff();
  keymap.profiles.push({layers: [{lights: {underglow: {effect: 'off', brightness: 0, speed: 0, magic: 1, color: 123}}}]});
  handoff.sync(device, keymap, position, battery, preferences);
  handoff.sync(device, keymap, position, {...main, profile_index: 1}, preferences);
  assert.deepEqual(device.calls[1].params, {ambient: {e: 0, b: 0, s: 0, m: 1, c: 123}});
});
test('a foreign ambient refresh is corrected only on Battery, and inherit releases ownership', () => {
  const device = new FakeDevice(), keymap = fixture(), handoff = new AmbientHandoff();
  handoff.sync(device, keymap, position, battery, preferences);
  handoff.sync(device, keymap, position, battery, preferences, {force: true});
  assert.equal(device.calls.length, 2);
  // A preference change on Battery restores its saved ambient effect.
  keymap.profiles[0].layers.push({lights: {underglow: {effect: 'solid', brightness: .3, speed: 0, magic: 1, color: 0xffffff}}});
  handoff.sync(device, keymap, position, battery, {...preferences, mode: 'inherit'});
  assert.deepEqual(device.calls[2].params, {ambient: {e: 1, b: .3, s: 0, m: 1, c: 0xffffff}});
  assert.equal(handoff.owned, false);
});
test('restart recovery restores a pending override; failed restoration remains pending', () => {
  const device = new FakeDevice(), keymap = fixture(), handoff = new AmbientHandoff({pending: true});
  const call = device.call.bind(device);
  device.call = () => {throw new Error('Disconnected');};
  assert.throws(() => handoff.sync(device, keymap, position, main, preferences), /Disconnected/);
  assert.equal(handoff.owned, true);
  device.call = call;
  assert.equal(handoff.sync(device, keymap, position, main, preferences).action, 'restore');
  assert.equal(handoff.owned, false);
});
test('unknown destination lighting is refused rather than replaced with an assumed color', () => {
  const device = new FakeDevice(), handoff = new AmbientHandoff({pending: true}), keymap = fixture();
  keymap.profiles[0].layers[0].lights.underglow.effect = 'future-effect';
  assert.throws(() => handoff.sync(device, keymap, position, main, preferences), /unrecognized lighting/);
  assert.equal(device.calls.length, 0); assert.equal(handoff.owned, true);
});
