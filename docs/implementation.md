# Implementation notes

Author: Cory McCabe

This is an original implementation of the Micro's observed HID interface. The Node wrapper loads the HID binding already installed with Work Louder Input. No vendor SDK, firmware, native binary, or app archive is redistributed or patched.

## Gauge

HID report ID 6 carries RPC channel 2 with up to 61 payload bytes per report. Each fragment carries its own length. Newline-delimited messages are accumulated as bytes before UTF-8 decoding. Responses are correlated to a random numeric request ID. Foreign replies cannot satisfy a helper request, and unrelated key/joystick notifications are discarded.

`device.status` supplies battery, charging state, and active profile/layer. `v.oai.thstatus` sets per-Agent light color, brightness, effect, and zone-sync flags. Firmware 0.6.3 defines Agent channels 0–19. The installer reserves eight unused channels from 6–19, scanning keys, encoders, and joystick assignments. Native channels 0–5 are never allocated or written.

Six reserved channels are mapped to the two upper clear keys followed by the four below. For battery `p` and fill index `i` (0–5), brightness is `clamp(p × 6 / 100 − i, 0, 1)`, with floating-point noise snapped at exact boundaries. At most one light is partially bright. The bottom row drains right to left, then top-right, then top-left. More than three light-equivalents is green; more than 1.5 through three is orange; 1.5 or less is red.

The owner visually confirmed five full lights plus a dimmer sixth at 92% battery, where the request was `[1, 1, 1, 1, 1, 0.52]`. This establishes that observed frame, not a measured optical response curve. See the [proportional-brightness record](proportional-brightness-verification.json).

## Matching Battery lighting

Two reserved channels are not assigned to keys. On Battery, one carries the battery color with `sk: 0` and `sa: 1` to drive the underglow. The other carries an off state (`c: 0`, `b: 0`, `e: 0`) with `sk: 1` and `sa: 0`, keeping opaque action-key backlights dark even when Codex sends a white selection highlight. The six gauge channels retain their independent brightness fractions. Native host updates can continue while Battery is selected.

On exit, the helper clears both reserved channels' sync flags, then sends an empty `v.oai.rgbcfg` object. In tested firmware 0.6.3, omitted RGB fields retain the native cached values while the update makes the controller reapply them. The helper supplies no replacement native colors, effects, or saved Input defaults. This avoids the earlier rainbow restoration error.

The opaque keys remain off on Battery in every underglow mode, including `inherit`. That mode clears the ambient source and reapplies the native cache while the separate off source continues suppressing action-key backlights.

This is a Mac-managed handoff: the helper watches the active profile/layer on a 200 ms target cadence. The successful prototype observed about 0.2–0.4 second transitions. Ongoing native RPC traffic, a keymap refresh, Bluetooth latency, or reconnection can extend that time. Unchanged gauge frames and matching colors are not repeatedly rewritten. Preferences refresh within one second; keymap ownership is checked at connection and every minute.

`ambient-state.json` records both channels and ownership before a sync write. Both flag clearing and native-cache reapplication must be acknowledged before ownership is cleared. Stop, one-shot execution, errors, and return to another layer all attempt release. A failed release remains journaled for reconnection/restart. Uninstall pauses polling before reading the keymap and retries any journaled release before removing the managed layer. Refused removal resumes a previously running helper.

The owner confirmed orange underglow and completely dark opaque keys while selecting pinned chats, then confirmed a working pinned chat kept blue after returning to Codex. An earlier handoff build passed a roughly one-minute mixed-layer check; the revised dark-key runtime then passed the Battery check and a 15-second working-chat blue check. See the [handoff verification record](layer-lighting-verification.json).

## Coordinating HID traffic

Two independently queued clients can interleave the fragments of a long RPC request. The helper therefore observes only CodexMicroService RPC start/answer timing entries in the native app's existing local logs. It waits for pending native calls to finish and a 100 ms quiet interval. The driver's 50 ms cooldown is awaited **before** this check; putting it afterward allowed a native command to start in that gap.

A prototype run completed 1,130 status polls alongside 65 native command starts with no observed native parsing errors. That is bounded test evidence, not an exclusive transport lock or proof against every race. Current native logging is an implementation dependency. If Codex is running and its timing cannot be observed, the helper waits. If Codex is absent, it can operate without those log entries. It stores neither chat text nor key events. Codex may log unmatched helper reply IDs; helper replies do not resolve native requests.

Requests retain distinct numeric IDs. A shorter empty-ID experiment was rejected after communication errors and is not shipped. Input should remain closed while the helper runs; stop the helper before editing other layers, quit Input, then restart it.

## Installation and compatibility

The installer saves the original keymap bytes and a recovery journal before mutation. It checks that the live bytes still match, then uses `fs.txbegin`, chunked `fs.writebin`, and `fs.txcommit`. Exact decoded readback is required. Existing layers and unknown fields are preserved. Uninstall verifies the recorded layer by stable IDs and refuses edited managed layers or reused channels.

Existing beta-5 installation state lacks the two additional reserved channels and continues through its original native-protection route. Reinstalling creates the current state and enables matching lighting by default. No firmware is flashed, native settings are changed, or vendor application is patched.

Beta 3 wrote shared ambient RGB without releasing it. Beta 4 restored saved Input settings, which did not preserve live Codex lighting. Beta 5 disabled shared overrides when native Agent mappings existed. Beta 6 uses the spare-channel handoff described above.

## Sources

- [Work Louder firmware 0.6.3](https://github.com/worklouder/cm-v2-fw-releases/releases/tag/v0.6.3)
- [Work Louder 0.6.1 isolation notes](https://github.com/worklouder/cm-v2-fw-releases/releases/tag/v0.6.1)
- [OpenAI Codex Micro guide](https://learn.chatgpt.com/docs/features/codex-micro)
- [Independent HID protocol measurements](https://github.com/thannous/claude-codex-micro/blob/main/docs/research/hid-lighting-protocol.md)

Interface behavior and the project's own observations are implemented here. Vendor code and third-party implementations are not copied into the package.
