// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {encodeMessage, Decoder} = require('./framing.cjs');
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function loadBinding(inputApp) {
  if (process.platform !== 'darwin') throw new Error('Micro Battery currently supports macOS only.');
  const apps = inputApp ? [inputApp] : ['/Applications/input.app', '/Applications/Input.app', path.join(os.homedir(), 'Applications/input.app')];
  for (const app of apps) {
    const binding = path.join(app, 'Contents/Resources/app.asar.unpacked/node_modules/node-hid/prebuilds', 'HID-darwin-' + process.arch, 'node-napi-v4.node');
    if (fs.existsSync(binding)) return require(binding);
  }
  throw new Error('Install Work Louder Input first. Its bundled HID driver is required; no vendor binaries are redistributed.');
}
class MicroDevice {
  constructor({inputApp, binding} = {}) {
    const driver = binding || loadBinding(inputApp);
    const matching = driver.devices().filter(d => d.vendorId === 0x303a && (d.productId === 0x8360 || /^Codex Micro(?: #\d+)?$/.test(d.product || '')));
    const vendor = matching.filter(d => d.usagePage === 0xff00);
    const endpoints = vendor.length ? vendor : matching.filter(d => d.usagePage === 1 && d.usage === 6);
    if (endpoints.length !== 1) throw new Error(endpoints.length ? 'More than one Micro is connected. Connect one at a time.' : 'No Codex Micro is connected. Connect it by USB or its paired Bluetooth channel.');
    this.identity = {product: endpoints[0].product, vendorId: endpoints[0].vendorId, productId: endpoints[0].productId};
    this.handle = new driver.HID(endpoints[0].path, {nonExclusive: true});
    this.decoder = new Decoder();
    this.sequence = crypto.randomInt(1000000, 1000000000);
    this.lastCall = 0;
    this.foreignMethods = [];
  }
  close() { this.handle.close(); }
  read(timeout = 25) { return this.decoder.push(this.handle.readTimeout(timeout)); }
  call(method, params, timeout = 8000) {
    const delay = 50 - (Date.now() - this.lastCall);
    if (delay > 0) pause(delay);
    const id = this.sequence++;
    const request = params === undefined ? {method, id} : {method, params, id};
    for (const report of encodeMessage(request)) this.handle.write([...report]);
    const deadline = Date.now() + timeout;
    let response;
    while (Date.now() < deadline && !response) {
      for (const message of this.read(50)) {
        if (message.id === id && (!message.method || message.method === method)) response = message;
        else if (message.id !== undefined && message.method && this.foreignMethods.length < 100) this.foreignMethods.push(message.method);
        // Key/joystick notifications are not stored or logged.
      }
    }
    this.lastCall = Date.now();
    if (!response) throw new Error('Timed out waiting for ' + method + '.');
    if (response.error) throw new Error(method + ': ' + (response.error.message || response.error.code));
    return response.result;
  }
  status(timeout = 8000) {
    const status = this.call('device.status', undefined, timeout);
    if (!status || !Number.isInteger(status.profile_index) || !Number.isInteger(status.layer_index) || !Number.isFinite(status.battery) || status.battery < 0 || status.battery > 100) throw new Error('Micro returned an invalid status.');
    return status;
  }
  readKeymapBytes(timeout = 8000) {
    const parts = []; let offset = 0, total = 1;
    while (offset < total) {
      const result = this.call('fs.readbin', {file: 'keymap.json', offset, len: 2048}, timeout);
      if (!Number.isInteger(result?.total_size) || result.total_size < 1 || result.total_size > 1048576 || typeof result.data !== 'string') throw new Error('Invalid keymap file response.');
      total = result.total_size;
      const bytes = Buffer.from(result.data, 'base64');
      if (!bytes.length || offset + bytes.length > total) throw new Error('Invalid keymap chunk length.');
      parts.push(bytes); offset += bytes.length;
    }
    return Buffer.concat(parts);
  }
  consumeForeignMethods() { const methods = this.foreignMethods; this.foreignMethods = []; return methods; }
}
module.exports = {MicroDevice, loadBinding};
