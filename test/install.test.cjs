// Author: Cory McCabe
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {fixture,FakeDevice}=require('./fixtures.cjs');
const {pathsFor}=require('../lib/paths.cjs');
const {prepare,install,uninstall}=require('../lib/install.cjs');
const {applyKeymap,atomicJson}=require('../lib/device-config.cjs');
const {runService}=require('../lib/service.cjs');
const {agentXml}=require('../lib/launch-agent.cjs');
const source=path.resolve(__dirname,'..');
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'micro-battery-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {paths:pathsFor(path.join(root,'data'),path.join(root,'agents')),agent:{starts:0,stops:0,start(){this.starts++;},stop(){this.stops++;}}};}
test('install, one real service iteration, and uninstall preserve user configuration',async t=>{
  const {paths,agent}=setup(t),original=fixture(),device=new FakeDevice(original),plan=prepare(device);
  install({device,paths,source,plan,agent});
  assert.equal(agent.starts,1);assert.equal(device.commits,1);
  const state=JSON.parse(fs.readFileSync(paths.state));
  const backup=fs.readFileSync(state.backup.file);
  assert.equal(crypto.createHash('sha256').update(backup).digest('hex'),state.backup.sha256);
  assert.deepEqual(JSON.parse(backup),original);
  assert.ok(fs.existsSync(path.join(paths.app,'bin/micro-battery.cjs')));
  const result=await runService(paths,{once:true,deviceFactory:()=>device,onEvent:()=>{}});
  assert.equal(result.battery,75);assert.deepEqual(result.levels,[1,1,1,1,.5,0]);assert.equal(result.underglowRequested,false);
  assert.ok(!fs.existsSync(paths.lock));
  const current=JSON.parse(device.bytes);current.profiles[0].layers[1].name='Changed later';device.bytes=Buffer.from(JSON.stringify(current));
  uninstall({device,paths,agent});
  assert.equal(agent.stops,1);assert.ok(!fs.existsSync(paths.state));
  const restored=JSON.parse(device.bytes);assert.equal(restored.profiles[0].layers.length,2);assert.equal(restored.profiles[0].layers[1].name,'Changed later');assert.deepEqual(restored.unknownFutureField,original.unknownFutureField);
});
test('stale configuration is rejected before any write',()=>{
  const device=new FakeDevice(),before=device.readKeymapBytes(),plan=prepare(device);
  const changed=JSON.parse(device.bytes);changed.unknownFutureField.keep=false;device.bytes=Buffer.from(JSON.stringify(changed));
  assert.throws(()=>applyKeymap(device,before,plan.candidate),/changed during/);assert.equal(device.calls.length,0);
});
test('failed transaction retains the exact backup and recovery journal',t=>{
  const {paths,agent}=setup(t),device=new FakeDevice(),before=device.readKeymapBytes(),plan=prepare(device);device.failCommit=true;
  assert.throws(()=>install({device,paths,source,plan,agent}),/Simulated/);
  assert.deepEqual(device.bytes,before);assert.equal(agent.starts,0);
  const state=JSON.parse(fs.readFileSync(paths.state));assert.equal(state.phase,'prepared');assert.deepEqual(fs.readFileSync(state.backup.file),before);
  device.failCommit=false;uninstall({device,paths,agent});assert.ok(!fs.existsSync(paths.state));
});
test('an edited managed layer is never removed and its running service is left alone',t=>{
  const {paths,agent}=setup(t),device=new FakeDevice();install({device,paths,source,plan:prepare(device),agent});
  const live=JSON.parse(device.bytes);live.profiles[0].layers[2].name='User customized';device.bytes=Buffer.from(JSON.stringify(live));
  const before=device.readKeymapBytes();assert.throws(()=>uninstall({device,paths,agent}),/edited/);assert.equal(agent.stops,0);assert.deepEqual(device.bytes,before);
});
test('uninstall dry-run changes no files, configuration, or service state',t=>{
  const {paths,agent}=setup(t),device=new FakeDevice();install({device,paths,source,plan:prepare(device),agent});
  const before=device.readKeymapBytes(),commits=device.commits;
  assert.equal(uninstall({device,paths,agent,dryRun:true}).dryRun,true);
  assert.deepEqual(device.bytes,before);assert.equal(device.commits,commits);assert.equal(agent.stops,0);assert.ok(fs.existsSync(paths.state));
});
test('service refuses channel collisions without pushing lighting',async t=>{
  const {paths,agent}=setup(t),device=new FakeDevice();install({device,paths,source,plan:prepare(device),agent});
  const live=JSON.parse(device.bytes);live.profiles[0].layers[1].layout.keymap[0][0]='KV_OAI_AG06';device.bytes=Buffer.from(JSON.stringify(live));device.calls=[];
  await assert.rejects(runService(paths,{once:true,deviceFactory:()=>device,onEvent:()=>{}}),/another layer/);
  assert.ok(!device.calls.some(c=>c.method.startsWith('v.oai.')));assert.ok(!fs.existsSync(paths.lock));
});
test('settings can be changed without Input, while underglow writes remain layer-scoped',async t=>{
  const {paths,agent}=setup(t),device=new FakeDevice();install({device,paths,source,plan:prepare(device),agent});
  const preferences=JSON.parse(fs.readFileSync(paths.settings));preferences.dimBrightness=.3;preferences.underglow.mode='white';atomicJson(paths.settings,preferences);
  const result=await runService(paths,{once:true,deviceFactory:()=>device,onEvent:()=>{}});
  assert.equal(result.levels[4],.3);assert.equal(result.underglowRequested,true);
  const ambient=device.calls.find(c=>c.method==='v.oai.rgbcfg');assert.deepEqual(Object.keys(ambient.params),['ambient']);
  device.statusValue.layer_index=1;device.calls=[];await runService(paths,{once:true,deviceFactory:()=>device,onEvent:()=>{}});assert.ok(!device.calls.some(c=>c.method==='v.oai.rgbcfg'));
});
test('launch-agent paths are XML-escaped and use a copied stable runtime',t=>{
  const {paths}=setup(t);paths.root+='/a&b';const xml=agentXml(paths,'/a&b/node');assert.match(xml,/a&amp;b/);assert.ok(!xml.includes('/a&b/node'));assert.match(xml,/micro-battery\.cjs/);assert.match(xml,/<string>run<\/string>/);
});
test('old firmware is rejected before mutation',()=>{
  const device=new FakeDevice(fixture(),{version:'0.6.1'});assert.throws(()=>prepare(device),/0.6.3/);assert.equal(device.calls.length,0);
});
