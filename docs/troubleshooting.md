# Troubleshooting

Author: Cory McCabe

**No Micro connected:** start with USB and a data-capable cable. If Bluetooth was selected on the device, follow the [vendor's connection guide](https://worklouder.cc/micro-setup). Bluetooth support in this beta still needs hardware verification. A USB or firmware acknowledgment alone is not visual proof that LEDs changed.

**Input cannot communicate:** see [Work Louder's official communication troubleshooting](https://help.worklouder.cc/help/articles/6183782-input-cannot-communicate-with-device-or-is-stuck-on-retrieving). This installer does not change system security settings or manage Input Monitoring permissions.

**Gauge stays on an old reading:** the service needs an awake, connected Mac. Check `Status.command`. `connected: false` means it is waiting to reconnect, not that the old light state is a fresh battery measurement. Stop and Start restart the helper without editing the device keymap.

**Input's Battery-layer editor is hidden:** expected for vendor Agent assignments. Battery-light brightness follows the remaining charge automatically. Use Configure.command for experimental ambient preferences. The native Codex layer and other custom layers remain managed by their usual apps.

**Old dim setting:** beta 2 uses proportional brightness throughout each light's range. Existing `dimBrightness` fields are ignored, and `--dim` reports that the old fixed step has been replaced.

**Fade changes in visible steps:** with native Codex lighting present, the helper reads battery every 15 seconds by default and updates changed readings. Within one light's segment, a whole 1% battery change corresponds to six percentage points of requested brightness. It does not animate between readings, and the LEDs' visible response can differ from the requested percentage.

**Six layers / no spare channels:** the installer leaves the device unchanged. Free a layer yourself in Input or remove another custom Agent-light integration before retrying. Existing populated layers are never silently reused.

**Interrupted installation:** user data is under `~/Library/Application Support/Micro Battery/`. `state.json` is written before any device mutation and records the backup plus intended managed layer. A `prepared` installation with no matching layer can be cleared with Uninstall.command. If the matching layer exists, uninstall verifies it before removing it. Backups stay in `backups/`. Do not overwrite your whole current keymap with an old backup if you have made subsequent changes.

**Layer was edited / channel collision:** updates pause rather than overwrite another tool's configuration. Inspect the changes before removing the Battery layer manually. The service can be stopped independently with Stop.command.

**Login startup failed after successful device installation:** installation state and the battery layer are retained. Run Start.command again. If Node was removed or moved, install a supported Node version and rerun Start.command.

**Underglow is off or follows a Codex task:** beta 5 defaults to `inherit` and suppresses helper ambient overrides when native Agent channels 0–5 exist. That protects live task lighting. Separate battery-colored underglow is unresolved with the native Codex layer, even if an older preference requests it. Check `underglowSuppressed` in Status.command. The earlier ambient-sync and generic preview tests did not establish a working handoff.

When reporting an issue, include macOS, Node, Input and firmware versions, USB/Bluetooth transport, and what the lights visibly did. Exclude serial numbers, full backups, personal keymaps, and private shortcut commands.

**Upgrading from beta 3/4 ambient overrides:** upgrade to beta 5, which avoids global ambient writes and saved-rainbow restoration whenever native Codex Agent mappings exist. After installing, select an unpinned chat and then a pinned chat so Codex refreshes any old override. Native Codex mode uses the default 15-second battery polling interval; no underglow handoff latency is promised because isolated ambient control is disabled.

**Battery underglow changes when you select a Codex task:** the layers currently share the vendor ambient state. Beta 5 protects native lighting by suppressing helper ambient writes when reserved native Agent mappings exist. The six-button gauge continues working, but isolated battery-colored underglow remains unsupported. After beta 3/4, select an unpinned chat and then a pinned chat to make Codex refresh its native colors. Do not select a fixed rainbow as a substitute for live task lighting.
