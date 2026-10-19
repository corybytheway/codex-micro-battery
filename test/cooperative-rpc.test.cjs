// Author: Cory McCabe
const test=require('node:test');
const assert=require('node:assert/strict');
const {cooperativeCall}=require('../lib/cooperative-rpc.cjs');
const {SpareLighting}=require('../lib/spare-lighting.cjs');

test('native command starting during HID cooldown is observed before the write',async()=>{
  let now=1000,nativeBusy=false;
  const order=[];
  const device={lastCall:1000,call(){assert.equal(nativeBusy,false);order.push('write');return{ok:1};}};
  const gate={async wait(){assert.equal(now,1050);assert.equal(nativeBusy,true);order.push('yield');nativeBusy=false;now=1150;}};
  await cooperativeCall(device,gate,'v.oai.rgbcfg',{},1800,{now:()=>now,sleep:async ms=>{assert.equal(ms,50);nativeBusy=true;now+=ms;order.push('cooldown');}});
  assert.deepEqual(order,['cooldown','yield','write']);
});
test('a native parse error observed during the quiet wait prevents the next helper write',async()=>{
  let fault=false,writes=0;
  const device={lastCall:0,call(){writes++;}};
  await assert.rejects(cooperativeCall(device,{async wait(){fault=true;}},'device.status',undefined,1800,{
    now:()=>1000,sleep:async()=>{},beforeWrite(){if(fault)throw new Error('Native recovery');}
  }),/Native recovery/);
  assert.equal(writes,0);
});
test('battery overrides only a reserved channel and restores both native zones without guessed values',async()=>{
  const calls=[],ownership=[];
  const rpc=async(method,params)=>{calls.push({method,params});return{ok:1};};
  const lights=new SpareLighting(12,{darkKeysChannel:13,onOwnershipChange:v=>ownership.push(v)});
  const position={profile:0,layer:2};
  const preferences={mode:'battery',brightness:1};
  await lights.sync(rpc,position,{profile_index:0,layer_index:2,battery:45},preferences);
  await lights.sync(rpc,position,{profile_index:0,layer_index:2,battery:44},preferences);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].params,[{id:12,c:0xff8000,b:1,e:1,s:0,sk:0,sa:1},{id:13,c:0,b:0,e:0,s:0,sk:1,sa:0}]);
  await lights.sync(rpc,position,{profile_index:0,layer_index:1,battery:44},preferences);
  assert.deepEqual(calls.slice(1),[{method:'v.oai.thstatus',params:[{id:12,sk:0,sa:0},{id:13,sk:0,sa:0}]},{method:'v.oai.rgbcfg',params:{}}]);
  assert.deepEqual(ownership,[true,false]);
});
test('failed native refresh retains ownership for restart recovery',async()=>{
  const lights=new SpareLighting(12,{darkKeysChannel:13,pending:true});
  await assert.rejects(lights.release(async method=>{if(method==='v.oai.rgbcfg')throw new Error('Disconnected');return{ok:1};}),/Disconnected/);
  assert.equal(lights.owned,true);
  await lights.release(async()=>({ok:1}));
  assert.equal(lights.owned,false);
});
test('white and off change only underglow while opaque keys remain dark',async()=>{
  const calls=[],lights=new SpareLighting(12,{darkKeysChannel:13});
  const rpc=async(method,params)=>{calls.push({method,params});return{ok:1};};
  const position={profile:0,layer:2},status={profile_index:0,layer_index:2,battery:10};
  await lights.sync(rpc,position,status,{mode:'white',brightness:.4});
  await lights.sync(rpc,position,status,{mode:'off',brightness:.4});
  assert.deepEqual(calls.map(call=>call.params),[
    [{id:12,c:0xffffff,b:.4,e:1,s:0,sk:0,sa:1},{id:13,c:0,b:0,e:0,s:0,sk:1,sa:0}],
    [{id:12,c:0xffffff,b:0,e:0,s:0,sk:0,sa:1},{id:13,c:0,b:0,e:0,s:0,sk:1,sa:0}]
  ]);
});
test('inherit yields underglow but continues suppressing opaque keys on Battery',async()=>{
  const calls=[],lights=new SpareLighting(12,{darkKeysChannel:13});
  const rpc=async(method,params)=>{calls.push({method,params});return{ok:1};};
  const result=await lights.sync(rpc,{profile:0,layer:2},{profile_index:0,layer_index:2,battery:42},{mode:'inherit',brightness:1});
  assert.equal(result.override,false);assert.equal(result.opaqueKeysOff,true);
  assert.deepEqual(calls,[
    {method:'v.oai.thstatus',params:[{id:12,sk:0,sa:0},{id:13,c:0,b:0,e:0,s:0,sk:1,sa:0}]},
    {method:'v.oai.rgbcfg',params:{}}
  ]);
  assert.equal(lights.owned,true);
  await lights.sync(rpc,{profile:0,layer:2},{profile_index:0,layer_index:1,battery:42},{mode:'inherit',brightness:1});
  assert.equal(lights.owned,false);
});
