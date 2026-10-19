# Troubleshooting

Author: Cory McCabe

**No Micro connected:** use USB with a data-capable cable or an already paired Bluetooth connection. Follow the [vendor connection guide](https://worklouder.cc/micro-setup). Recent Battery/Codex handoff checks used Bluetooth on Apple Silicon; Intel hardware remains unverified.

**Input cannot communicate:** stop Micro Battery before opening Input to edit other layers. Quit Input before restarting the helper. See [Work Louder's communication guide](https://help.worklouder.cc/help/articles/6183782-input-cannot-communicate-with-device-or-is-stuck-on-retrieving). The installer does not change system security settings or Input Monitoring permissions.

**Working chat blue stays on, idle chat white disappears:** expected native Codex behavior. The white selection light for an idle pinned chat lasts about four seconds, then turns off. A pinned chat that is actively working keeps blue. This was checked with the helper stopped and enabled. An unpinned chat can have no underglow.

**Battery lights retain a task color, or Battery color carries onto Codex:** check Status.command. A current install reports `underglowAction: battery-underglow-and-dark-keys` while Battery is active. Reinstall beta 6 if the old state still reports `native-host` / `underglowSuppressed`. Stop and Start perform a fresh connection and release any journaled spare-channel override. Include the observed layer and timing if the issue persists.

**Switching takes longer than a fraction of a second:** the helper targets 200 ms status checks, yielding to native device RPCs before writing. Busy traffic, a keymap refresh, connection failure, or Bluetooth recovery can delay the handoff. `Native device transport did not become quiet` means it could not safely observe the current native timing. Current CodexMicroService log formatting is required for coordination while Codex is running.

**Gauge stays on an old reading:** the Mac must be awake and connected. `connected: false` in Status.command means the helper is waiting to reconnect; retained lights do not establish a fresh measurement. Stop and Start restart the helper without editing the keymap.

**Input hides the Battery-layer editor:** expected for Agent assignments. Use Configure.command for Battery preferences and Input for other layers. `battery` matches underglow to the gauge color; opaque action keys remain completely dark. `inherit`, `white`, and `off` affect only the underglow. The opaque keys stay off in every mode. The six clear gauge keys keep their proportional brightness.

**Fade moves in visible steps:** the helper applies reported battery values and does not animate between them. A whole 1% battery change within a segment changes that light's requested brightness by six percentage points. LED output and perceived brightness can differ from the requested percentage. The old `--dim` setting is no longer used.

**Six layers / insufficient spare channels:** free a layer or remove another Agent-light integration in Input. Installation requires eight unused channels from 6–19. Existing populated layers are preserved.

**Edited layer / channel collision:** updates pause to preserve the other tool's configuration. The service checks at connection and once per minute. Stop it before editing Input settings. An uninstall that refuses an edited layer resumes a previously running service.

**Interrupted installation:** data and backups remain under `~/Library/Application Support/Micro Battery/`. `state.json` records the original bytes and intended managed layer before device mutation. Uninstall can clear a prepared install with no matching layer, or verify and remove a matching managed layer. Avoid replacing the whole current keymap with an old backup after making later changes.

**Login startup failed:** state and the installed layer remain available. Run Start.command. If Node moved or was removed, reinstall Node 22+ and retry.

**Upgrading beta 1–5:** quit Input, run the prior Uninstall.command, then beta 6 Install.command. Backups remain. A beta-5 state intentionally keeps its previous native-protection guard until reinstalled with the two additional reserved channels.

When reporting an issue, include macOS, Node, Input and firmware versions, USB/Bluetooth transport, active layer, and what the lights visibly did. Exclude serial numbers, full keymaps, backups, and private shortcut commands.
