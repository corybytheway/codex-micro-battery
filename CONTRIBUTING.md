# Contributing

Author: Cory McCabe

Use Node.js 22 or newer. There are no npm dependencies.

```sh
npm test
node bin/micro-battery.cjs preview 75
npm run build:release
```

Tests exercise battery boundaries, physical ordering, channel allocation, packet framing, stale-write rejection, backup/recovery, install/service/uninstall integration, and ownership protection. Fixtures are synthetic; never commit a personal keymap or device backup.

Keep firmware flashing and app patching out of scope. Preserve native Agent channels 0–5, unknown configuration fields, and current other layers. New hardware support needs a correlated status round trip plus an actual visual LED check; an ACK alone is insufficient. Record tested hardware/firmware and leave unverified paths clearly labeled.

To regenerate the animation, install Pillow in your development Python environment and run `python3 scripts/render-animation.py`. It loads state from the real JavaScript battery function. The release builder includes an explicit file allowlist and rejects native binaries, app archives, personal state and backup directories.

This project is MIT licensed. Product names refer to compatibility; do not imply vendor affiliation or use generated illustrations as hardware test evidence.
