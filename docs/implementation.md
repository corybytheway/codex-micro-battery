# Implementation notes

Author: Cory McCabe

This is an original implementation of the Micro's observed HID interface. The Node wrapper loads the HID binding already installed with Work Louder Input. The project does not copy, patch, or distribute vendor SDKs, firmware, or native binaries.

The JSON-RPC channel uses report ID 6, channel 2, and up to 61 payload bytes in each 64-byte report. Each fragment carries its own length. Newline-delimited messages are accumulated as bytes before UTF-8 decoding. Responses are correlated to a per-request ID; foreign replies cannot satisfy our request. Unrelated key/joystick notifications are discarded.

`device.status` supplies battery, charging state, and active profile/layer. `v.oai.thstatus` supplies per-Agent light color, brightness and effect. The initial hardware experiments confirmed the firmware's spare `KV_OAI_AG06` through `KV_OAI_AG11` assignments render independently of native Codex slots 0–5. The official 0.6.3 firmware image also defines Agent tokens through 19; the installer allocates unused channels within that range.

For reported battery `p` and light index `i` in fill order (0–5), requested brightness is `clamp(p × 6 / 100 − i, 0, 1)`, with numerical noise snapped at exact boundaries. Only one light can be partially bright; the sum of all six brightness fractions represents the reported charge. The physical discharge order and the orange/red boundary at one-and-a-half light-equivalents are unchanged. Legacy `dimBrightness` settings do not affect this calculation.

The installer reads the current keymap, computes a new layer, saves the original bytes locally, and checks that the live bytes still match before starting a filesystem transaction. `fs.txbegin`, chunked `fs.writebin`, and `fs.txcommit` apply the single keymap change. Exact decoded readback is required. Installation state is journaled before mutation so an interrupted operation remains inspectable.

Uninstall compares the managed layer to its recorded expected state, removes only that layer by stable ID, and preserves current other layers. It refuses edited layers or reused channels. The service uses the same ownership checks before writing lights. These checks do not grant the service exclusive hardware ownership; external applications can still write concurrently, so a configuration change during a transaction is a reason to stop and inspect the retained backup.

The optional `v.oai.rgbcfg` ambient path sends only an `ambient` object, and only while the Battery layer is active. Its optical result and handoff to native Codex ambient behavior are still experimental. Default `inherit` sends no ambient override. `white` and `off` are explicit opt-ins. The runtime never sends general-key RGB changes through that path.

## Research and provenance

- [Work Louder: official firmware 0.6.3](https://github.com/worklouder/cm-v2-fw-releases/releases/tag/v0.6.3)
- [thannous: measured HID lighting protocol](https://github.com/thannous/claude-codex-micro/blob/main/docs/research/hid-lighting-protocol.md)
- [thannous: custom-layer Agent-light measurements](https://github.com/thannous/claude-codex-micro/blob/main/docs/research/thread-status-feasibility.md)
- [FreeMicro: independent protocol research](https://github.com/eliBenven/freemicro/blob/main/docs/PROTOCOL.md)

These sources describe interface behavior, sometimes on different firmware versions. The hardware verification table in the README distinguishes this project's own observations from unverified compatibility paths. No vendor code or community implementation was copied into the package.
