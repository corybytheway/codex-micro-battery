// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {validateKeymap} = require('./model.cjs');

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  const temp = file + '.tmp-' + crypto.randomUUID();
  try { fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', {mode: 0o600, flag: 'wx'}); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function backupKeymap(directory, bytes, purpose) {
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const name = purpose + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex') + '.json';
  const file = path.join(directory, name);
  fs.writeFileSync(file, bytes, {mode: 0o600, flag: 'wx'});
  return {file, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
}
function applyKeymap(device, beforeBytes, candidate) {
  validateKeymap(candidate);
  const current = device.readKeymapBytes();
  if (!current.equals(beforeBytes)) throw new Error('The device changed during preparation. Nothing was written; run the command again.');
  const tx = device.call('fs.txbegin')?.tx;
  if (!Number.isInteger(tx)) throw new Error('Firmware does not support configuration transactions. Use vendor firmware 0.6.3 or later.');
  const bytes = Buffer.from(JSON.stringify(candidate));
  for (let offset = 0; offset < bytes.length; offset += 1536) {
    const chunk = bytes.subarray(offset, offset + 1536);
    device.call('fs.writebin', {file: 'keymap.json', data: chunk.toString('base64'), append: true, completed: offset + chunk.length === bytes.length, offset, tx}, 10000);
  }
  device.call('fs.txcommit', {tx}, 10000);
  const readback = device.readKeymapBytes();
  if (!isDeepStrictEqual(JSON.parse(readback), candidate)) throw new Error('Configuration readback differs. Your pre-change backup is retained; do not repeat installation blindly.');
  return {verified: true, sha256: crypto.createHash('sha256').update(readback).digest('hex')};
}
module.exports = {atomicJson, backupKeymap, applyKeymap};
