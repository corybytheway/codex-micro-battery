#!/usr/bin/env node
// Author: Cory McCabe
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const readline = require('node:readline/promises');
const {pathsFor} = require('../lib/paths.cjs');
const {MicroDevice} = require('../lib/hid.cjs');
const {control} = require('../lib/launch-agent.cjs');
const {prepare, install, uninstall} = require('../lib/install.cjs');
const {atomicJson} = require('../lib/device-config.cjs');
const {batteryFrame} = require('../lib/battery.cjs');
const {runService} = require('../lib/service.cjs');
const packageInfo = require('../package.json');

function parse(argv) {
  const positional = [], flags = {};
  const switches = new Set(['yes', 'dry-run', 'once', 'help', 'version']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {positional.push(arg); continue;}
    const key = arg.slice(2);
    if (!['data-dir', 'profile', 'input-app', 'dim', 'underglow', 'brightness', ...switches].includes(key)) throw new Error('Unknown option: ' + arg);
    if (switches.has(key)) flags[key] = true;
    else {if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Missing value for ' + arg); flags[key] = argv[++i];}
  }
  return {command: positional[0] || 'help', positional, flags};
}
function requireMac() {
  if (process.platform !== 'darwin') throw new Error('Hardware installation and service commands currently require macOS.');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
}
function requireInputClosed() {
  const result = cp.spawnSync('/bin/ps', ['-axo', 'comm='], {encoding: 'utf8'});
  if (/\/input\.app\/Contents\/MacOS\/input\s*$/im.test(result.stdout || '')) throw new Error('Quit Input from its application menu, then run installation again. This prevents its cached configuration from overwriting the change.');
}
function percentage(value, label, {allowEnds = true} = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100 || !allowEnds && (number === 0 || number === 100)) throw new Error(label + ' must be ' + (allowEnds ? '0–100' : 'greater than 0 and less than 100') + '.');
  return number / 100;
}
async function main(argv = process.argv.slice(2)) {
  const parsed = parse(argv), {positional, flags} = parsed;
  const command = flags.help ? 'help' : parsed.command;
  if (flags.version) {console.log(packageInfo.version); return;}
  const paths = pathsFor(flags['data-dir']);
  if (command === 'help') {
    console.log(`Micro Battery ${packageInfo.version} — unofficial Codex Micro battery lights\n\nCommands:\n  install [--yes] [--profile ID] [--dry-run]\n  status\n  start | stop\n  configure [--dim 50] [--underglow inherit|white|off] [--brightness 100]\n  uninstall [--yes] [--dry-run]\n  preview [PERCENT]\n\nHardware commands require macOS, Node 22+, Work Louder Input, and a connected Micro.\nAll commands accept --data-dir PATH. Install accepts --input-app PATH.\n`); return;
  }
  if (command === 'preview') {
    const frame = batteryFrame(Number(positional[1] ?? 75));
    const dot = value => value === 1 ? '●' : value === 0 ? '○' : '◐';
    console.log(`${frame.percent}% · ${frame.colorName}\n      ${frame.levels.slice(0, 2).map(e => dot(e.b)).join('  ')}\n${frame.levels.slice(2).map(e => dot(e.b)).join('  ')}\n\nBottom row empties right to left; top-left stays on last.`); return;
  }
  requireMac();
  const agent = control(paths);
  if (command === 'run') {await runService(paths, {once: !!flags.once, ...(flags['input-app'] ? {deviceFactory: () => new MicroDevice({inputApp: flags['input-app']})} : {})}); return;}
  if (command === 'status') {
    console.log(JSON.stringify({service: agent.status(), latest: fs.existsSync(paths.status) ? JSON.parse(fs.readFileSync(paths.status)) : null}, null, 2)); return;
  }
  if (command === 'start') {
    if (!fs.existsSync(paths.state)) throw new Error('Install Micro Battery first.');
    agent.start(); console.log('Micro Battery is running and will start at login.'); return;
  }
  if (command === 'stop') {agent.stop({disable: true}); console.log('Stopped; login startup is disabled.'); return;}
  if (command === 'configure') {
    const value = JSON.parse(fs.readFileSync(paths.settings));
    if (flags.dim !== undefined) value.dimBrightness = percentage(flags.dim, 'Dim brightness', {allowEnds: false});
    if (flags.underglow !== undefined) {
      if (!['white', 'off', 'inherit'].includes(flags.underglow)) throw new Error('Underglow must be white, off, or inherit.');
      value.underglow.mode = flags.underglow;
      value.underglow.color = '#FFFFFF';
    }
    if (flags.brightness !== undefined) value.underglow.brightness = percentage(flags.brightness, 'Underglow brightness');
    if (flags.dim === undefined && flags.underglow === undefined && flags.brightness === undefined) {
      const prompt = readline.createInterface({input: process.stdin, output: process.stdout});
      try {
        const dim = (await prompt.question(`Dim light brightness (1–99%) [${Math.round(value.dimBrightness * 100)}]: `)).trim();
        if (dim) value.dimBrightness = percentage(dim, 'Dim brightness', {allowEnds: false});
        const mode = (await prompt.question(`Underglow: inherit, white, or off [${value.underglow.mode}]; white/off are experimental: `)).trim();
        if (mode && !['inherit', 'white', 'off'].includes(mode)) throw new Error('Choose inherit, white, or off.');
        if (mode) value.underglow.mode = mode;
      } finally {prompt.close();}
    }
    atomicJson(paths.settings, value);
    console.log('Settings saved. The running helper picks them up within 15 seconds. Underglow support is experimental.'); return;
  }
  if (!['install', 'uninstall'].includes(command)) throw new Error('Unknown command: ' + command);
  if (!flags['dry-run']) requireInputClosed();
  if (command === 'install' && fs.existsSync(paths.state)) throw new Error('Already installed or prepared. Use status or uninstall before installing again.');
  const device = new MicroDevice({inputApp: flags['input-app']});
  const prompt = flags.yes || flags['dry-run'] ? null : readline.createInterface({input: process.stdin, output: process.stdout});
  try {
    if (command === 'install') {
      const profileId = flags.profile === undefined ? undefined : Number(flags.profile);
      if (profileId !== undefined && !Number.isInteger(profileId)) throw new Error('Profile ID must be an integer.');
      const plan = prepare(device, profileId);
      console.log(`Add “${plan.expectedLayer.name}” as layer ${plan.layerNumber} in profile “${plan.profileName}”.\nExisting layers stay in place. A local backup is saved before the change.\nSpare light channels: ${plan.channels.join(', ')}.\n`);
      if (flags['dry-run']) {console.log('Dry run: no files or device configuration were written.'); return;}
      if (prompt && /^n(o)?$/i.test((await prompt.question('Install and enable login startup? [Y/n]: ')).trim())) return;
      const source = path.resolve(__dirname, '..');
      install({device, paths, source, plan, agent, inputApp: flags['input-app']});
      console.log(`Installed. Tap the Micro’s layer sensor until layer ${plan.layerNumber}.\nThe gauge updates every 15 seconds while connected to this awake Mac.\nReopen Input when you want to configure your other layers.\nData and backups: ${paths.root}\n`);
    } else {
      if (prompt && !/^y(es)?$/i.test((await prompt.question('Remove only Micro Battery’s managed layer and stop its helper? [y/N]: ')).trim())) return;
      uninstall({device, paths, agent, dryRun: !!flags['dry-run']});
      console.log(flags['dry-run'] ? 'Dry run: managed layer identified; nothing changed.' : 'Battery layer removed and verified. Current other layers and local backups are preserved.');
    }
  } finally {prompt?.close(); device.close();}
}
if (require.main === module) main().catch(error => {console.error('Micro Battery: ' + error.message); process.exitCode = 1;});
module.exports = {main, parse};
