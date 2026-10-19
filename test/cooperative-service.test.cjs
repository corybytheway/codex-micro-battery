// Author: Cory McCabe
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {FakeDevice} = require('./fixtures.cjs');
const {pathsFor} = require('../lib/paths.cjs');
const {prepare, install, uninstall} = require('../lib/install.cjs');
const {runService} = require('../lib/service.cjs');
const {NativeRpcGate} = require('../lib/native-rpc-gate.cjs');

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-cooperative-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const paths = pathsFor(root), device = new FakeDevice();
  install({paths, device, source: path.resolve(__dirname, '..'), plan: prepare(device), agent: {start() {}}});
  device.calls = [];
  return {paths, device, gateFactory: () => ({async wait() {}})};
}
test('installed cooperative service switches underglow and keeps opaque keys dark without changing native colors', async t => {
  const {paths, device, gateFactory} = setup(t);
  const state = JSON.parse(fs.readFileSync(paths.state));
  assert.equal(state.ambientChannel, 12);
  assert.equal(state.darkKeysChannel, 13);
  assert.equal(JSON.parse(fs.readFileSync(paths.settings)).underglow.mode, 'battery');
  let checks = 0, events = 0;
  device.status = () => ({...device.statusValue, layer_index: [3,3,1,1,3][Math.min(checks++,4)]});
  await runService(paths, {deviceFactory: () => device, gateFactory, onEvent: event => {
    if (event.event === 'battery' && ++events === 3) process.emit('SIGTERM');
  }});
  const threads = device.calls.filter(call => call.method === 'v.oai.thstatus');
  assert.equal(threads.filter(call => call.params.length === 6).length, 1);
  assert.deepEqual(threads.filter(call => call.params.length === 2).map(call => call.params[0].sa), [1,0,1,0]);
  assert.ok(threads.every(call => call.params.every(entry => entry.id >= 6)));
  assert.deepEqual(device.calls.filter(call => call.method === 'v.oai.rgbcfg').map(call => call.params), [{},{}]);
  assert.equal(JSON.parse(fs.readFileSync(paths.ambientState)).overridden, false);
  assert.equal(fs.existsSync(paths.lock), false);
});
test('one-shot service also releases its global sync flags before returning', async t => {
  const {paths, device, gateFactory} = setup(t);
  const result = await runService(paths, {once: true, deviceFactory: () => device, gateFactory, onEvent() {}});
  assert.equal(result.underglowRequested, true);
  assert.equal(result.opaqueKeysOff, true);
  assert.equal(JSON.parse(fs.readFileSync(paths.ambientState)).overridden, false);
});
test('an encoder assignment cannot collide with the reserved lighting channel', async t => {
  const {paths, device, gateFactory} = setup(t);
  const keymap = JSON.parse(device.bytes);
  keymap.profiles[0].layers[0].layout.encoders[0][0] = 'KV_OAI_AG12';
  device.bytes = Buffer.from(JSON.stringify(keymap));
  await assert.rejects(runService(paths, {once: true, deviceFactory: () => device, gateFactory, onEvent() {}}), /reserved.*assigned/);
  assert.equal(device.calls.some(call => call.method.startsWith('v.oai.')), false);
});
test('native transport gate preserves a command across log rotation and ignores foreign replies', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-gate-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  let now = Date.now();
  const dir = path.join(root, new Date(now).toISOString().slice(0,10).replaceAll('-','/'));
  fs.mkdirSync(dir, {recursive: true});
  const gate = new NativeRpcGate({root, now: () => now, hostRunning: () => false});
  assert.equal(gate.allowed(), true);
  const file = path.join(dir, 'app-t0-new.log');
  const line = (...args) => new Date(now).toISOString() + ' info [CodexMicroService] args=' + JSON.stringify(args) + '\n';
  fs.writeFileSync(file, line('Sending RPC call, id:', 23));
  assert.equal(gate.allowed(), false);
  fs.appendFileSync(file, line('No resolver found for id:', 999999));
  now += 200;
  assert.equal(gate.allowed(), false);
  fs.appendFileSync(file, line('Received answer, id:', 23));
  assert.equal(gate.allowed(), false);
  now += 100;
  assert.equal(gate.allowed(), true);
});
test('uninstall pauses polling before device reads and resumes a refused removal', t => {
  const {paths,device}=setup(t);
  let running=true,starts=0,stops=0;
  const agent={status:()=>({running}),stop(){running=false;stops++;},start(){running=true;starts++;}};
  const bytes=device.readKeymapBytes.bind(device);
  device.readKeymapBytes=()=>{assert.equal(running,false);return bytes();};
  const edited=JSON.parse(device.bytes);edited.profiles[0].layers[2].name='User edit';device.bytes=Buffer.from(JSON.stringify(edited));
  assert.throws(()=>uninstall({paths,device,agent}),/edited/);
  assert.equal(stops,1);assert.equal(starts,1);assert.equal(running,true);
  assert.ok(fs.existsSync(paths.state));
});
