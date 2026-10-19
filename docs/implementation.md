# Implementation notes

Author: Cory McCabe

This is an original implementation of the Micro's observed HID interface. The Node wrapper loads the HID binding already installed with Work Louder Input. The project does not copy, patch, or distribute vendor SDKs, firmware, or native binaries.

The JSON-RPC channel uses report ID 6, channel 2, and up to 61 payload bytes in each 64-byte report. Each fragment carries its own length. Newline-delimited messages are accumulated as bytes before UTF-8 decoding. Responses are correlated to a per-request ID; foreign replies cannot satisfy our request. Unrelated key/joystick notifications are discarded.

`device.status` supplies battery, charging state, and active profile/layer. `v.oai.thstatus` supplies per-Agent light color, brightness and effect. The initial hardware experiments confirmed the firmware's spare `KV_OAI_AG06` through `KV_OAI_AG11` assignments render independently of native Codex slots 0–5. The official 0.6.3 firmware image also defines Agent tokens through 19; the installer allocates unused channels within that range.

For reported battery `p` and light index `i` in fill order (0–5), requested brightness is `clamp(p × 6 / 100 − i, 0, 1)`, with numerical noise snapped at exact boundaries. Only one light can be partially bright; the sum of all six brightness fractions represents the reported charge. The physical discharge order and the orange/red boundary at one-and-a-half light-equivalents are unchanged. Legacy `dimBrightness` settings do not affect this calculation.

The service checks status about every 500 ms, applies this calculation when the reported charge changes, and does not interpolate between readings. Settings and keymap ownership are refreshed every 15 seconds by default and on layer changes. Thus the brightness mapping is proportional, while the observed updates depend on the device's reported battery resolution. The device owner visually confirmed five full green lights and a dimmer sixth light at 92% battery, for which the helper requested `[1, 1, 1, 1, 1, 0.52]`. This confirms the observed frame, not optical linearity across the entire range. The [verification record](proportional-brightness-verification.json) separates firmware acknowledgments from this physical observation.

The installer reads the current keymap, computes a new layer, saves the original bytes locally, and checks that the live bytes still match before starting a filesystem transaction. `fs.txbegin`, chunked `fs.writebin`, and `fs.txcommit` apply the single keymap change. Exact decoded readback is required. Installation state is journaled before mutation so an interrupted operation remains inspectable.

Uninstall compares the managed layer to its recorded expected state, removes only that layer by stable ID, and preserves current other layers. It refuses edited layers or reused channels. The service uses the same ownership checks before writing lights. These checks do not grant the service exclusive hardware ownership; external applications can still write concurrently, so a configuration change during a transaction is a reason to stop and inspect the retained backup.

The `v.oai.rgbcfg` path sends only an `ambient` object. Battery color overrides are applied only while Battery is active; handoff and graceful stop explicitly restore the active layer’s saved ambient settings. The owner physically confirmed matching green underglow at 51% battery on the local companion; orange/red underglow and the revised handoff to native Codex ambient behavior remain experimental. New beta 3 installations default to `battery`, which derives the ambient RGB value from the same `batteryFrame(status.battery)` color as the buttons on every reading and host-lighting refresh. Ambient brightness is independent of the partial button and remains at the configured level. `white` and `off` remain available; `inherit` sends no ambient override. Existing saved modes are preserved. Status reports the requested `underglowColor`; a firmware acknowledgment does not prove visible illumination. The runtime never sends general-key RGB changes through that path.

## Research and provenance

- [Work Louder: official firmware 0.6.3](https://github.com/worklouder/cm-v2-fw-releases/releases/tag/v0.6.3)
- [thannous: measured HID lighting protocol](https://github.com/thannous/claude-codex-micro/blob/main/docs/research/hid-lighting-protocol.md)
- [thannous: custom-layer Agent-light measurements](https://github.com/thannous/claude-codex-micro/blob/main/docs/research/thread-status-feasibility.md)
- [FreeMicro: independent protocol research](https://github.com/eliBenven/freemicro/blob/main/docs/PROTOCOL.md)

These sources describe interface behavior, sometimes on different firmware versions. The hardware verification table in the README distinguishes this project's own observations from unverified compatibility paths. No vendor code or community implementation was copied into the package.

## Ambient handoff (beta 4)

`v.oai.rgbcfg` changes a shared device setting. Merely checking the active layer before writing does not make the resulting color layer-local. Beta 3 never released that setting on exit, and its 15-second loop delayed entry; both caused the reported carryover.

The runtime now checks status on a 500 ms cadence, with one RPC in flight and fewer repeated writes. It reloads the keymap on a layer/profile transition, validates the managed layer, and restores the active destination layer’s saved underglow effect and parameters when it releases a Battery override. Only the ambient zone is written. Once restored, ordinary host lighting is left alone. Changing to `inherit` or stopping gracefully also releases the override.

`ambient-state.json` journals ownership before an override. A reconnect or restart can therefore release a pending override even if the service missed the transition. Failed restoration remains pending; unrecognized saved lighting is refused instead of replaced with an assumed color. Status includes `underglowAction` (`apply`, `restore`, or `unchanged`). The 500 ms cadence is a target between successful calls, not a guarantee while USB/Bluetooth communication is blocked.

## Owner follow-up after beta 4

Physical testing found roughly 3-second switching delay and restoration of a rainbow effect on layer 1 instead of live Codex task lighting. The task keypad and underglow returned to blue after selecting an active task with the helper paused. Restoring saved keymap lighting is not a correct release strategy for a host-controlled layer. The published saved-layer tests therefore do not establish native Codex coexistence. Further experiments must preserve live host lighting, not substitute Input defaults.
