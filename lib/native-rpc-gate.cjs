// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

function nativeHostRunning() {
  const result = cp.spawnSync('/bin/ps', ['-axo', 'comm='], {encoding: 'utf8'});
  // An unavailable process inventory cannot establish that the host is absent.
  if (result.status !== 0) return true;
  return /\/(?:ChatGPT|Codex)\.app\/Contents\/MacOS\/(?:ChatGPT|Codex)\s*$/m.test(result.stdout);
}

// Read-only observation of device RPC timing. It consumes only
// CodexMicroService transport events, never chat messages or keyboard events.
class NativeRpcGate {
  constructor({onEvent = () => {}, quietMs = 100, root = path.join(os.homedir(),'Library/Logs/com.openai.codex'), hostRunning = nativeHostRunning, now = Date.now} = {}) {
    this.root = root;
    this.hostRunning = hostRunning;
    this.now = now;
    this.hostCheckedAt = -Infinity;
    this.hostPresent = true;
    this.files = new Map();
    this.pending = new Map();
    this.quietMs = quietMs;
    this.lastNative = 0;
    this.onEvent = onEvent;
    this.initialized = false;
    this.seenLog = false;
    this.scanFiles();
    this.refresh();
    this.initialized = true;
  }
  scanFiles() {
    const now=this.now();
    for (let days=0;days<2;days++) {
      const date=new Date(now-days*86400000).toISOString().slice(0,10).replaceAll('-','/');
      const directory=path.join(this.root,date);
      if (!fs.existsSync(directory)) continue;
      for (const name of fs.readdirSync(directory)) {
        if (!/-t0-.*\.log$/.test(name)) continue;
        const file=path.join(directory,name);
        const stat=fs.statSync(file);
        if (now-stat.mtimeMs>86400000) continue;
        // A newly created/rotated log can already contain an in-flight command.
        if (!this.files.has(file)) this.files.set(file,{offset:Math.max(0,stat.size-65536),partial:''});
      }
    }
  }
  line(line) {
    if (!line.includes('[CodexMicroService]') || !line.includes('args=')) return;
    let args;
    try {args=JSON.parse(line.slice(line.indexOf('args=')+5));} catch {return;}
    const at=Date.parse(line.slice(0,24));
    if (!Number.isFinite(at)) return;
    const sending=args.indexOf('Sending RPC call, id:');
    const received=args.indexOf('Received answer, id:');
    if (sending<0 && received<0) {
      if (line.includes('without id and method') && this.initialized) this.onEvent({kind:'native-parse-error',at});
      return;
    }
    this.seenLog=true;
    const id=String(args[(sending>=0?sending:received)+1]);
    this.lastNative=Math.max(this.lastNative,at);
    if (sending>=0) this.pending.set(id,at);
    else this.pending.delete(id);
    if (this.initialized) this.onEvent({kind:sending>=0?'native-start':'native-end',id,at,observedDelayMs:Math.max(0,this.now()-at),pending:this.pending.size});
  }
  refresh() {
    this.scanFiles();
    for (const [file,state] of this.files) {
      let size;
      try {size=fs.statSync(file).size;} catch(error) {if(error.code==='ENOENT'){this.files.delete(file);continue;}throw error;}
      if(size<state.offset){state.offset=0;state.partial='';}
      if(size===state.offset) continue;
      const fd=fs.openSync(file,'r');
      let bytes;
      try {bytes=Buffer.alloc(size-state.offset);fs.readSync(fd,bytes,0,bytes.length,state.offset);}finally{fs.closeSync(fd);}
      state.offset=size;
      const lines=(state.partial+bytes.toString('utf8')).split('\n');
      state.partial=lines.pop();
      for (const line of lines) this.line(line);
    }
    // Native timeout/recovery can omit the completion log. Be conservative for
    // the SDK's normal eight-second timeout plus two seconds of recovery.
    for (const [id,at] of this.pending) if(this.now()-at>10000)this.pending.delete(id);
  }
  allowed() {
    this.refresh();
    if(!this.seenLog && this.now()-this.hostCheckedAt>=1000){this.hostPresent=this.hostRunning();this.hostCheckedAt=this.now();}
    return (this.seenLog || !this.hostPresent) && this.pending.size===0 && this.now()-this.lastNative>=this.quietMs;
  }
  async wait(timeout=12000) {
    const deadline=this.now()+timeout;
    while(this.now()<deadline){if(this.allowed())return;await new Promise(r=>setTimeout(r,10));}
    throw new Error('Native device transport did not become quiet.');
  }
}
module.exports={NativeRpcGate};
