// Author: Cory McCabe
const test = require('node:test');
const assert = require('node:assert/strict');
const {batteryFrame, ambientUpdate} = require('../lib/battery.cjs');
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, message || `${actual} != ${expected}`);
test('physical order, proportional brightness, and the final orange/red boundary', () => {
  const cases = [
    [0, [0,0,0,0,0,0], 'red'], [1, [.06,0,0,0,0,0], 'red'],
    [8, [.48,0,0,0,0,0], 'red'], [9, [.54,0,0,0,0,0], 'red'],
    [25, [1,.5,0,0,0,0], 'red'], [26, [1,.56,0,0,0,0], 'orange'],
    [33, [1,.98,0,0,0,0], 'orange'], [34, [1,1,.04,0,0,0], 'orange'],
    [50, [1,1,1,0,0,0], 'orange'], [51, [1,1,1,.06,0,0], 'green'],
    [70, [1,1,1,1,.2,0], 'green'], [75, [1,1,1,1,.5,0], 'green'],
    [76, [1,1,1,1,.56,0], 'green'], [80, [1,1,1,1,.8,0], 'green'],
    [100, [1,1,1,1,1,1], 'green']
  ];
  for (const [percent, levels, colorName] of cases) {
    const actual = batteryFrame(percent);
    actual.levels.forEach((entry, index) => close(entry.b, levels[index], `${percent}%: light ${index}`));
    assert.equal(actual.colorName, colorName);
  }
  assert.deepEqual(batteryFrame(8).levels.filter(e => e.b).map(e => e.id), [6], 'Top-left remains last');
  assert.deepEqual(batteryFrame(100 / 3).levels.filter(e => e.b).map(e => e.id), [6,7], 'Top row remains after bottom row empties');
});
test('10,001 levels conserve charge and remain contiguous and monotonic', () => {
  let previous = Array(6).fill(0);
  for (let i = 0; i <= 10000; i++) {
    const percent = i / 100, actual = batteryFrame(percent), levels = actual.levels.map(e => e.b);
    for (let j = 0; j < 6; j++) {
      assert.ok(levels[j] >= 0 && levels[j] <= 1);
      assert.ok(levels[j] >= previous[j]);
      if (j) assert.ok(levels[j] <= levels[j-1]);
      assert.equal(actual.levels[j].e, levels[j] > 0 ? 1 : 0);
    }
    assert.ok(levels.filter(b => b > 0 && b < 1).length <= 1, 'Only the current light may be partial');
    close(levels.reduce((sum, level) => sum + level, 0) / 6 * 100, percent, 'Brightness must represent the reported charge');
    assert.equal(actual.litCount, levels.filter(b => b > 0).length);
    assert.equal(actual.colorName, percent > 50 ? 'green' : percent > 25 ? 'orange' : 'red');
    previous = levels;
  }
});
test('brightness passes halfway continuously and resets only at segment boundaries', () => {
  close(batteryFrame(100 / 12).levels[0].b, .5);
  close(batteryFrame(25.001).levels[1].b, .50006);
  close(batteryFrame(24.999).levels[1].b, .49994);
  assert.equal(batteryFrame(25.001).colorName, 'orange');
  for (let light = 0; light < 6; light++) {
    const boundary = (light + 1) * 100 / 6;
    const exact = batteryFrame(boundary).levels.map(e => e.b);
    assert.deepEqual(exact, Array.from({length: 6}, (_, index) => index <= light ? 1 : 0));
    close(batteryFrame(boundary - .001).levels[light].b, .99994);
    if (light < 5) close(batteryFrame(boundary + .001).levels[light + 1].b, .00006);
  }
  assert.equal(batteryFrame(75, {channels: [8,9,10,11,12,13]}).levels[0].id, 8);
});
test('invalid measurements and native channels are refused', () => {
  for (const percent of [-1,101,NaN,Infinity,'50',undefined]) assert.throws(() => batteryFrame(percent));
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
test('battery underglow shares the exact gauge color thresholds and independent brightness', () => {
  const position = {profile: 1, layer: 3};
  const preferences = {mode: 'battery', color: '#FFFFFF', brightness: .7};
  for (const [battery, color] of [[100, 0x00ff00], [50.001, 0x00ff00], [50, 0xff8000], [100/3, 0xff8000], [25.001, 0xff8000], [25, 0xff0000], [0, 0xff0000]]) {
    const status = {profile_index: 1, layer_index: 3, battery};
    assert.deepEqual(ambientUpdate(status, position, preferences), {ambient: {e: 1, b: .7, s: 0, m: 1, c: color}});
    assert.equal(ambientUpdate({...status, layer_index: 2}, position, preferences), null);
    assert.equal(ambientUpdate({...status, profile_index: 0}, position, preferences), null);
  }
  assert.equal(ambientUpdate({profile_index: 1, layer_index: 3, battery: 80}, position, {...preferences, brightness: 0}).ambient.e, 0);
});
