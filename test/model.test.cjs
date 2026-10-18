// Author: Cory McCabe
const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./fixtures.cjs');
const {addBatteryLayer, locateBattery, removeBatteryLayer, freeChannels} = require('../lib/model.cjs');
test('installation adds a new layer and preserves every existing configuration field', () => {
  const original = fixture(), plan = addBatteryLayer(original, 10);
  assert.equal(plan.layerId, 9); assert.equal(plan.layerNumber, 3);
  assert.deepEqual(plan.channels, [6,7,8,9,10,11]);
  const roundtrip = structuredClone(plan.candidate); roundtrip.profiles[0].layers.pop();
  assert.deepEqual(roundtrip, original); assert.equal(original.profiles[0].layers.length, 2);
  assert.deepEqual(plan.expectedLayer.layout.keymap[0], ['KV_OAI_AG06','KV_OAI_AG07']);
});
test('channel allocation respects other profiles and never borrows native channels', () => {
  const original = fixture(); const other = structuredClone(original.profiles[0]); other.id = 42;
  other.layers[1].layout.keymap[0] = ['KV_OAI_AG06','KV_OAI_AG08']; original.profiles.push(other);
  assert.deepEqual(addBatteryLayer(original,42).channels, [7,9,10,11,12,13]);
  assert.ok(freeChannels(original).every(id=>id>=6));
});
test('full profiles, exhausted channels, and unsupported layouts cannot be overwritten', () => {
  const full = fixture(); while(full.profiles[0].layers.length<6) {const l=structuredClone(full.profiles[0].layers[1]);l.id+=full.profiles[0].layers.length;full.profiles[0].layers.push(l);}
  assert.throws(()=>addBatteryLayer(full,10),/six layers/);
  const exhausted=fixture();exhausted.profiles[0].layers[1].layout.keymap=[['KV_OAI_AG06','KV_OAI_AG07'],['KV_OAI_AG08','KV_OAI_AG09','KV_OAI_AG10','KV_OAI_AG11'],['KV_OAI_AG12','KV_OAI_AG13','KV_OAI_AG14','KV_OAI_AG15'],['KV_OAI_AG16','KV_OAI_AG17','KV_OAI_AG18']];
  assert.throws(()=>addBatteryLayer(exhausted,10),/spare/);
  const wrong=fixture();wrong.profiles[0].layers[1].layout.keymap[0].push('KC_NONE');assert.throws(()=>addBatteryLayer(wrong,10),/matrix/);
});
test('uninstall preserves later edits to other layers and follows stable layer IDs', () => {
  const original=fixture(),plan=addBatteryLayer(original,10),live=structuredClone(plan.candidate);
  live.profiles[0].layers[1].name='My renamed shortcuts';
  live.profiles[0].layers[1].customFutureField='keep';
  live.profiles[0].layers.reverse();
  const restored=removeBatteryLayer(live,plan);
  assert.equal(restored.profiles[0].layers.length,2);
  assert.equal(restored.profiles[0].layers[0].name,'My renamed shortcuts');
  assert.equal(restored.profiles[0].layers[0].customFutureField,'keep');
});
test('external edits and channel collisions pause the service instead of taking ownership', () => {
  const plan=addBatteryLayer(fixture(),10),edited=structuredClone(plan.candidate);
  edited.profiles[0].layers[2].name='User edit';assert.throws(()=>locateBattery(edited,plan),/edited/);
  const collision=structuredClone(plan.candidate);collision.profiles[0].layers[1].layout.keymap[0][0]='KV_OAI_AG06';assert.throws(()=>locateBattery(collision,plan),/another layer/);
});
