<p align="center"><img src="docs/assets/header-battery.png" alt="Codex Micro showing a 75% battery display: four bright green lights, one dim green light, and one off" width="560"></p>

# Codex Micro Battery Display

**Six lights. One clear reading.**

An unofficial macOS companion that uses six Agent lights on a dedicated Codex Micro layer to display battery charge with a proportional brightness fade.

[**Download the beta**](https://github.com/corybytheway/codex-micro-battery/releases/tag/v0.1.0-beta.6) · [Install](#install) · [How the lights work](#how-the-lights-work) · [Remove it](#remove-it)

> **Beta 6 adds matching Battery lighting:** its underglow uses the same green, orange, or red as the gauge, while opaque action-key backlights stay off. Leaving Battery releases both zones back to Codex's live lighting. The six clear keys retain their continuous brightness fade.

> **Hardware observations:** orange underglow and dark opaque keys were confirmed on firmware 0.6.3 over Bluetooth. A working pinned chat kept its blue underglow for at least 15 seconds after returning to Codex. Proportional gauge brightness was previously confirmed at 92%. These observations are separate from the automated tests and do not establish an optical brightness curve.

![Animated explanation of the battery gauge](docs/assets/battery-sequence.gif)

Product imagery: [OpenAI × Work Louder](https://openai.com/supply/co-lab/work-louder/). The header visualizes the battery lights; the animation uses superimposed indicators. [Image credit and source](THIRD_PARTY_NOTICES.md).

## Install

You need **macOS**, **Node.js 22 or newer**, **Work Louder Input**, and a battery-equipped Codex Micro running **vendor firmware 0.6.3 or later**. USB and an already paired Bluetooth connection are supported; the recent lighting checks used Bluetooth.

1. Install [Work Louder Input](https://worklouder.cc/input) and [Node.js](https://nodejs.org/en/download) if you do not already have them.
2. Connect the Micro and **quit Input from its application menu**. The helper uses Input's installed HID driver; Input does not have to remain open.
3. [Download Micro-Battery-0.1.0-beta.6.zip](https://github.com/corybytheway/codex-micro-battery/releases/download/v0.1.0-beta.6/Micro-Battery-0.1.0-beta.6.zip), unzip it, and open **Install.command**. Review the displayed profile and new layer, then press Return to install.
4. Tap the Micro's layer sensor to select the new **Battery** layer. The installer tells you its number—usually layer 3 when you already have two layers.

The installer adds a new layer, saves a local backup, verifies the device readback, and enables a small login helper. Existing layers stay in place. A profile with six layers, unsupported layout, or insufficient spare channels is refused rather than overwritten.

Stop Micro Battery before editing layers in Input, quit Input when finished, then start Micro Battery again. This avoids two configuration clients writing to the same HID transport. You can also move or delete the downloaded folder after installation: the runtime is copied to your own `~/Library/Application Support/Micro Battery/` folder.

**Upgrading from beta 1–5:** quit Input, run **Uninstall.command**, then **Install.command** from the new download. Backups are retained. New installs reserve two additional spare channels and default to matching Battery lighting. Existing beta-5 state keeps its protection guard until reinstalled. Native Codex channels and saved layer-1 lighting are preserved.

Prefer Terminal?

```sh
git clone https://github.com/corybytheway/codex-micro-battery.git
cd codex-micro-battery
node bin/micro-battery.cjs install
```

To inspect the proposed change without writing anything, use `node bin/micro-battery.cjs install --dry-run`. Add `--profile ID` to select another profile, or `--input-app "/path/to/input.app"` for a custom Input installation.

## How the lights work

The two upper Agent lights fill first, followed by the four below. As the battery drains, **the bottom row empties right to left, then the top-right light, with top-left last**.

Each light represents one sixth of the battery. The active light's brightness matches the fraction left in its sixth, from 100% down to off: 80% remaining in that segment requests 80% brightness, 20% requests 20%, and zero turns the light off. Earlier lights stay full; later lights are off. The fade uses the full brightness range rather than a fixed halfway switch.

| Visible reading | Color |
| --- | --- |
| Four to six illuminated lights | Green |
| Three lights, or the second light above 50% brightness | Orange |
| One full light plus a second at 50% brightness, or less | Red |

| Battery | Display | Color |
| --- | --- | --- |
| 100% | Six full lights | Green |
| 92% | Five full + one at 52% brightness | Green |
| 80% | Four full + one at 80% brightness | Green |
| 75% | Four full + one at 50% brightness | Green |
| 70% | Four full + one at 20% brightness | Green |
| 50% | Three full | Orange |
| 33⅓% | Two full | Orange |
| 33% | One full + one at 98% brightness | Orange |
| 25% | One full + one at 50% brightness | Red |
| 8% | One at 48% brightness | Red |
| 0% | All off | — |

Battery's underglow uses the same color as the six-button gauge and stays at the configured brightness while the active gauge light fades with charge. The opaque action keys stay completely unlit, including when you click pinned Codex chats on the Mac. After you leave Battery, Codex resumes its own task lighting.

The helper checks the active layer on a 200 ms target cadence and yields while Codex is using the device connection. Successful test transitions took roughly 0.2–0.4 seconds; busy traffic or reconnection can take longer. Battery-key frames are sent only when charge changes or the device reconnects. Configuration ownership is rechecked every minute, and preferences refresh within one second.

**This is a Mac-connected gauge:** the Mac must be awake and connected to the Micro. When disconnected or asleep, hardware can retain its last light state.

The continuous fade describes the proportional brightness mapping; the helper does not animate between battery readings. If the Micro reports only whole battery percentages, a 1% battery change within a segment produces a six-percentage-point change in that light's brightness. LED output and perceived brightness may have their own granularity.

## Adjust it

Battery buttons fade proportionally without configuration. Matching underglow is enabled by default, and the opaque keys stay off:

```sh
node bin/micro-battery.cjs configure --underglow battery
```

Open **Configure.command**, or use `--brightness 50` to lower the underglow to 50%. Gauge brightness continues to represent charge independently. `inherit` releases the underglow to its host; `white` and `off` change only the underglow. The opaque keys remain off on Battery in every mode. White/off modes have automated coverage; matching orange and dark opaque keys received the physical checks.

Settings refresh within one second in a current installation. The former fixed `--dim` option is no longer used.

**A white selection light disappears after a few seconds:** Codex briefly highlights a selected idle pinned chat, then turns that underglow off. A pinned chat that is actively working keeps its blue underglow. This native behavior was checked with the helper stopped and with Battery lighting enabled.

**Why does Input say to edit this layer in ChatGPT?** The gauge uses vendor Agent-light assignments. Input recognizes those assignments and hides the layer editor, even when Codex is idle. Use this package's Configure command for the gauge, and Input for your other layers.

## Start, stop, and status

The matching `.command` files work with a double-click. Terminal equivalents:

```sh
node bin/micro-battery.cjs status
node bin/micro-battery.cjs stop
node bin/micro-battery.cjs start
```

`stop` also disables login startup; `start` enables it again. Reconnection is automatic while the service is running. No firmware flashing, app patching, API key, or npm dependencies are required.

## Remove it

Connect the Micro, quit Input, and open **Uninstall.command**. It removes only the managed Battery layer, preserves current other layers, stops the helper, and disables login startup. Backups are retained locally. If the managed layer has been edited by another tool, uninstall refuses to overwrite those edits.

```sh
node bin/micro-battery.cjs uninstall --dry-run
node bin/micro-battery.cjs uninstall
```

If installation was interrupted, the local recovery journal and original keymap backup remain available. See [troubleshooting](docs/troubleshooting.md).

## Compatibility and verification

| Item | Status |
| --- | --- |
| Apple Silicon, USB, firmware 0.6.3 | Gauge visually verified on a real Micro |
| macOS 27.2, Node 22.9.0, Input 1.0.2 | Development hardware environment |
| Install/service/uninstall lifecycle | Beta 6 ZIP: temporary real-device install, copied runtime, removal, exact original keymap bytes restored |
| Charge thresholds, order, proportional brightness | Explicit examples + 10,001 charge-conservation/monotonicity/contiguity checks |
| Proportional fade on hardware (beta 2) | [Firmware acknowledged 20% and 80%; owner visually confirmed a dimmer last light at 92% battery](docs/proportional-brightness-verification.json) |
| Battery underglow and opaque action keys (beta 6) | Orange underglow and fully dark opaque keys physically confirmed; native handoff checked separately |
| HID coexistence | Waits for native RPC completion and its quiet interval before helper writes; reconnects after errors |
| Bluetooth / Intel Mac | Bluetooth lighting checks on Apple Silicon; Intel hardware unverified |
| Windows / Linux | Hardware service not supported in this release |

The visual confirmation covers the observed 92% frame (five full lights plus one requested at 52%). It does not establish a measured optical brightness curve or verify every intermediate level. The tests verify the requested values across 10,001 battery readings.

## Privacy and implementation

The runtime makes no network requests and includes no telemetry. For HID coordination it reads only CodexMicroService RPC timing entries in Codex's local logs, without retaining chat text or key events. This relies on the current Codex logging format; if the native host is running but its timing cannot be observed, the helper waits instead of writing blindly. It discards key/joystick notifications. Configuration backups and logs remain in your user Library folder; do not upload your full keymap or backups in an issue because they can contain personal shortcuts and commands.

The installer reserves eight unused firmware Agent channels from 6–19: six for the gauge, one for matching underglow, and one to keep opaque keys dark. Codex's normal six channels, 0–5, are reserved. Only interface facts are implemented here: no Work Louder firmware, SDK code, HID binaries, app archives, or personal device configuration are redistributed.

Read the [implementation and protocol notes](docs/implementation.md), [visual notes](docs/visuals.md), and [contributing guide](CONTRIBUTING.md). Run `npm test`; no `npm install` is needed.

Created by **Cory McCabe**. [MIT licensed](LICENSE). This is an independent project, not affiliated with or endorsed by OpenAI or Work Louder. Product names identify compatible hardware.
