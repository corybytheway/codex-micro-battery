// Author: Cory McCabe
'use strict';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function cooperativeCall(device, gate, method, params, timeout=1800, timing={now:Date.now,sleep}) {
  // The driver also enforces this cooldown. Finish it BEFORE checking the
  // native queue, otherwise Codex can start a fragmented write during the gap.
  const delay=50-(timing.now()-device.lastCall);
  if(delay>0)await timing.sleep(delay);
  await gate.wait();
  timing.beforeWrite?.();
  return device.call(method,params,timeout);
}
async function readKeymapBytes(rpc, timeout = 2500) {
  const parts = []; let offset = 0, total = 1;
  while (offset < total) {
    const result = await rpc('fs.readbin', {file: 'keymap.json', offset, len: 2048}, timeout);
    if (!Number.isInteger(result?.total_size) || result.total_size < 1 || result.total_size > 1048576 || typeof result.data !== 'string') throw new Error('Invalid keymap file response.');
    total = result.total_size;
    const bytes = Buffer.from(result.data, 'base64');
    if (!bytes.length || offset + bytes.length > total) throw new Error('Invalid keymap chunk length.');
    parts.push(bytes); offset += bytes.length;
  }
  return Buffer.concat(parts);
}
module.exports={cooperativeCall, readKeymapBytes};
