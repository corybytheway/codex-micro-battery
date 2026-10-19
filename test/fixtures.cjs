// Author: Cory McCabe
'use strict';
function fixture() {
  const blank = () => ({keymap: [Array(2).fill('KC_NONE'), Array(4).fill('KC_NONE'), Array(4).fill('KC_NONE'), Array(3).fill('KC_NONE')], encoders: [['KC_NONE', 'KC_NONE', 'KC_NONE']], joystick: {type: 'RADIAL', sectors: []}});
  const native = blank();
  native.keymap[0] = ['KV_OAI_AG00', 'KV_OAI_AG01'];
  native.keymap[1] = ['KV_OAI_AG02', 'KV_OAI_AG03', 'KV_OAI_AG04', 'KV_OAI_AG05'];
  const custom = blank(); custom.keymap[2][0] = 'KA_A0';
  return {version: 1, activeProfileId: 0, profiles: [{id: 10, name: 'Default', layers: [{id: 0, name: 'Codex', layout: native, lights: {underglow: {effect: 'rainbow', brightness: .8, speed: .69, magic: 1, color: 0xffffff}}}, {id: 8, name: 'Shortcuts', layout: custom}], macrosUsed: ['A0']}], macros: [{id: 0, name: 'Example shortcut', keys: []}], unknownFutureField: {keep: true}};
}
class FakeDevice {
  constructor(keymap = fixture(), status = {}) {this.bytes = Buffer.from(JSON.stringify(keymap)); this.calls = []; this.commits = 0; this.statusValue = {version: '0.6.3', profile_index: 0, layer_index: 3, battery: 75, is_charging: false, ...status}; this.identity = {product: 'Test Micro'};}
  status() {return {...this.statusValue};}
  readKeymapBytes() {return Buffer.from(this.bytes);}
  call(method, params) {
    this.calls.push({method, params});
    if (method === 'device.status') return this.status();
    if (method === 'fs.readbin') {
      const chunk=this.bytes.subarray(params.offset,params.offset+params.len);
      return {total_size:this.bytes.length,data:chunk.toString('base64')};
    }
    if (method === 'fs.txbegin') {this.chunks = []; return {tx: 7};}
    if (method === 'fs.writebin') {if (params.tx !== 7 || params.file !== 'keymap.json') throw new Error('Wrong transaction or file'); this.chunks.push({offset: params.offset, bytes: Buffer.from(params.data, 'base64')}); return {data_written: Buffer.from(params.data, 'base64').length};}
    if (method === 'fs.txcommit') {if (this.failCommit) throw new Error('Simulated commit failure'); this.bytes = Buffer.concat(this.chunks.sort((a, b) => a.offset - b.offset).map(chunk => chunk.bytes)); this.commits++; return null;}
    if (method === 'v.oai.thstatus' || method === 'v.oai.rgbcfg') return {ok: 1};
    throw new Error('Unexpected method: ' + method);
  }
  read() {return [];}
  consumeForeignMethods() {return [];}
  close() {this.closed = true;}
}
module.exports = {fixture, FakeDevice};
