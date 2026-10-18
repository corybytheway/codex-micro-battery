// Author: Cory McCabe
const test = require('node:test');
const assert = require('node:assert/strict');
const {batteryFrame, ambientUpdate} = require('../lib/battery.cjs');
test('physical order, half brightness, and the final orange/red boundary', () => {
  const cases = [
    [0, [0,0,0,0,0,0], 'red'], [8, [.5,0,0,0,0,0], 'red'], [9, [1,0,0,0,0,0], 'red'],
    [25, [1,.5,0,0,0,0], 'red'], [26, [1,1,0,0,0,0], 'orange'], [33, [1,1,0,0,0,0], 'orange'],
    [34, [1,1,.5,0,0,0], 'orange'], [50, [1,1,1,0,0,0], 'orange'],
    [51, [1,1,1,.5,0,0], 'green'], [75, [1,1,1,1,.5,0], 'green'],
    [76, [1,1,1,1,1,0], 'green'], [100, [1,1,1,1,1,1], 'green']
  ];
  for (const [percent, levels, colorName] of cases) {
    const actual = batteryFrame(percent);
    assert.deepEqual(actual.levels.map(e => e.b), levels, String(percent));
    assert.equal(actual.colorName, colorName);
  }
  assert.deepEqual(batteryFrame(8).levels.filter(e => e.b).map(e => e.id), [6], 'Top-left remains last');
  assert.deepEqual(batteryFrame(33).levels.filter(e => e.b).map(e => e.id), [6,7], 'Top row remains after bottom row empties');
});
test('10,001 levels are contiguous and monotonic, with correct color transitions', () => {
  let previous = Array(6).fill(0);
  for (let i = 0; i <= 10000; i++) {
    const percent = i / 100, actual = batteryFrame(percent), levels = actual.levels.map(e => e.b);
    for (let j = 0; j < 6; j++) {assert.ok(levels[j] >= previous[j]); if (j) assert.ok(levels[j] <= levels[j-1]);}
    assert.equal(actual.colorName, percent > 50 ? 'green' : percent > 25 ? 'orange' : 'red');
    assert.ok(actual.levels.every(e => e.id >= 6 && e.id <= 19));
    previous = levels;
  }
});
test('exact boundaries and configurable dim light', () => {
  assert.equal(batteryFrame(100 / 12).levels[0].b, .5);
  assert.equal(batteryFrame(25.001).levels[1].b, 1);
  assert.equal(batteryFrame(25.001).colorName, 'orange');
  assert.equal(batteryFrame(75, {dimBrightness: .3}).levels[4].b, .3);
  assert.equal(batteryFrame(75, {channels: [8,9,10,11,12,13]}).levels[0].id, 8);
});
test('invalid measurements and native channels are refused', () => {
  for (const percent of [-1,101,NaN,Infinity,'50',undefined]) assert.throws(() => batteryFrame(percent));
  for (const dimBrightness of [0,1,NaN,-.1,1.1]) assert.throws(() => batteryFrame(50, {dimBrightness}));
  for (const channels of [[0,1,2,3,4,5],[6,6,8,9,10,11],[6,7],[15,16,17,18,19,20]]) assert.throws(() => batteryFrame(50, {channels}));
});
test('ambient writes are limited to the managed active layer and never contain key settings', () => {
  const position = {profile: 1, layer: 3}, preferences = {mode: 'white', color: '#FFFFFF', brightness: .7};
  assert.equal(ambientUpdate({profile_index:0,layer_index:3}, position, preferences), null);
  assert.equal(ambientUpdate({profile_index:1,layer_index:1}, position, preferences), null);
  const actual = ambientUpdate({profile_index:1,layer_index:3}, position, preferences);
  assert.deepEqual(actual, {ambient:{e:1,b:.7,s:0,m:1,c:0xffffff}});
  assert.ok(!('keys' in actual));
  assert.equal(ambientUpdate({profile_index:1,layer_index:3}, position, {...preferences, mode:'inherit'}), null);
  assert.equal(ambientUpdate({profile_index:1,layer_index:3}, position, {...preferences, mode:'off'}).ambient.b, 0);
  assert.throws(() => ambientUpdate({profile_index:1,layer_index:3}, position, {...preferences,brightness:2}));
});
