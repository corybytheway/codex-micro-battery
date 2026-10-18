// Author: Cory McCabe
'use strict';
const os = require('node:os');
const path = require('node:path');
function pathsFor(dataDirectory, launchDirectory) {
  const root = path.resolve(dataDirectory || path.join(os.homedir(), 'Library/Application Support/Micro Battery'));
  return {
    root, app: path.join(root, 'app'), state: path.join(root, 'state.json'),
    settings: path.join(root, 'settings.json'), backups: path.join(root, 'backups'),
    logs: path.join(root, 'logs'), status: path.join(root, 'last-status.json'),
    lock: path.join(root, 'service.lock'),
    agent: path.join(launchDirectory || path.join(os.homedir(), 'Library/LaunchAgents'), 'com.corymccabe.micro-battery.plist')
  };
}
module.exports = {pathsFor};
