// Author: Cory McCabe
const test=require('node:test');
const assert=require('node:assert/strict');
const {MicroDevice}=require('../lib/hid.cjs');
const {Decoder,encodeMessage}=require('../lib/framing.cjs');
function binding({bluetooth=false}={}){
  let options,path;
  const driver={
    devices:()=>[{vendorId:0x303a,productId:0x8360,product:bluetooth?'Codex Micro #1':'Codex Micro',path:'fixture',usagePage:bluetooth?1:0xff00,usage:bluetooth?6:1}],
    HID:class{
      constructor(p,o){path=p;options=o;this.requests=new Decoder();this.queue=[];}
      write(report){
        for(const request of this.requests.push(report)){
          this.queue.push(...encodeMessage({method:'v.oai.hid',params:{k:'DO_NOT_STORE',act:1}}));
          this.queue.push(...encodeMessage({method:'v.oai.rgbcfg',id:request.id+100,result:{ok:1}}));
          this.queue.push(...encodeMessage({method:request.method,id:request.id,result:{version:'0.6.3',profile_index:0,layer_index:3,battery:74,is_charging:true}}));
        }
        return report.length;
      }
      readTimeout(){return this.queue.shift()||[];}
      close(){}
    }
  };
  return {driver,inspect:()=>({options,path})};
}
test('non-exclusive USB transport correlates its own reply and discards key notifications',()=>{
  const fixture=binding(),device=new MicroDevice({binding:fixture.driver});
  assert.equal(device.status().battery,74);
  assert.deepEqual(fixture.inspect(),{options:{nonExclusive:true},path:'fixture'});
  assert.deepEqual(device.consumeForeignMethods(),['v.oai.rgbcfg']);
  assert.ok(!JSON.stringify(device).includes('DO_NOT_STORE'));device.close();
});
test('Bluetooth primary-keyboard fallback still requires a correlated status response',()=>{
  const fixture=binding({bluetooth:true}),device=new MicroDevice({binding:fixture.driver});
  assert.equal(device.status().version,'0.6.3');device.close();
});
test('ambiguous hardware is refused',()=>{
  const fixture=binding();const one=fixture.driver.devices()[0];fixture.driver.devices=()=>[one,{...one,path:'second'}];
  assert.throws(()=>new MicroDevice({binding:fixture.driver}),/More than one/);
});
