// Author: Cory McCabe
'use strict';
function encodeMessage(message) {
  const bytes = Buffer.from(JSON.stringify(message) + '\r\n');
  const reports = [];
  for (let offset = 0; offset < bytes.length; offset += 61) {
    const chunk = bytes.subarray(offset, offset + 61);
    const report = Buffer.alloc(64);
    report[0] = 6; report[1] = 2; report[2] = chunk.length;
    chunk.copy(report, 3);
    reports.push(report);
  }
  return reports;
}
class Decoder {
  constructor() { this.buffer = Buffer.alloc(0); this.malformed = 0; }
  push(input) {
    const bytes = Buffer.from(input);
    if (!bytes.length) return [];
    const start = bytes[0] === 6 ? 1 : 0;
    const channel = bytes[start], length = bytes[start + 1];
    if (channel !== 2) return [];
    if (!Number.isInteger(length) || length > 61 || start + 2 + length > bytes.length) { this.malformed++; return []; }
    this.buffer = Buffer.concat([this.buffer, bytes.subarray(start + 2, start + 2 + length)]);
    if (this.buffer.length > 65536) { this.buffer = Buffer.alloc(0); this.malformed++; return []; }
    const messages = [];
    let newline;
    while ((newline = this.buffer.indexOf(10)) >= 0) {
      const line = this.buffer.subarray(0, newline).toString('utf8').trim();
      this.buffer = this.buffer.subarray(newline + 1);
      if (!line) continue;
      try {
        const value = JSON.parse(line);
        if (!value || typeof value !== 'object' || Array.isArray(value)) { this.malformed++; continue; }
        messages.push({...value, method: value.method ?? value.m, params: value.params ?? value.p, id: value.id ?? value.i});
      } catch { this.malformed++; }
    }
    return messages;
  }
}
module.exports = {encodeMessage, Decoder};
