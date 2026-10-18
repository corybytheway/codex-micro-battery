// Author: Cory McCabe
const test=require('node:test');
const assert=require('node:assert/strict');
const {encodeMessage,Decoder}=require('../lib/framing.cjs');
test('wire fixture: report 6, RPC channel 2, per-chunk length, zero padding',()=>{
  const message={method:'device.status',id:7},reports=encodeMessage(message);
  assert.equal(reports.length,1);assert.equal(reports[0].length,64);
  const literal=Buffer.from('{"method":"device.status","id":7}\r\n');
  assert.deepEqual([...reports[0].subarray(0,3)],[6,2,literal.length]);
  assert.deepEqual(reports[0].subarray(3,3+literal.length),literal);
  assert.ok(reports[0].subarray(3+literal.length).every(n=>n===0));
});
test('long multi-report JSON and split UTF-8 are reassembled exactly',()=>{
  const expected={method:'test',params:{text:'x'.repeat(37)+'🔋'+'y'.repeat(130)},id:91};
  const reports=encodeMessage(expected),decoder=new Decoder();
  assert.ok(reports.length>3);let result=[];
  for(const report of reports)result.push(...decoder.push(report));
  assert.equal(result.length,1);assert.deepEqual(result[0].params,expected.params);
});
test('both native report prefixes and stripped USB payloads work',()=>{
  const report=encodeMessage({result:{battery:75},id:9})[0];
  assert.equal(new Decoder().push(report)[0].result.battery,75);
  assert.equal(new Decoder().push(report.subarray(1))[0].result.battery,75);
});
test('multiple replies in a packet survive, debug is ignored, malformed input is bounded',()=>{
  const decoder=new Decoder(),payload=Buffer.from('{"id":1}\n{"id":2}\n'),report=Buffer.alloc(64);
  report[0]=6;report[1]=2;report[2]=payload.length;payload.copy(report,3);
  assert.deepEqual(decoder.push(report).map(x=>x.id),[1,2]);
  const debug=Buffer.from(report);debug[1]=1;assert.deepEqual(decoder.push(debug),[]);
  const malformed=Buffer.from(report);malformed[2]=62;assert.deepEqual(decoder.push(malformed),[]);
  assert.equal(decoder.malformed,1);
  const endless=Buffer.alloc(64,65);endless[0]=6;endless[1]=2;endless[2]=61;
  for(let i=0;i<1100;i++)decoder.push(endless);assert.ok(decoder.buffer.length<=65536);
});
