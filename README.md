<p align="center"><img src="docs/assets/header-battery.png" alt="Codex Micro showing a 75% battery display: four bright green lights, one dim green light, and one off" width="560"></p>

# Codex Micro Battery Display

**Six lights. One clear reading.**

An unofficial macOS companion that uses six Agent lights on a dedicated Codex Micro layer to display battery charge with a proportional brightness fade.

[**Download the beta**](https://github.com/corybytheway/codex-micro-battery/releases/tag/v0.1.0-beta.4) · [Install](#install) · [How the lights work](#how-the-lights-work) · [Remove it](#remove-it)

> **Public beta:** beta 2's proportional brightness has been observed on a real Micro: at 92% battery, the device owner confirmed five full green lights and a visibly dimmer rightmost light, requested at 52% brightness. The order, colors, and beta 1 install/removal lifecycle were also verified on hardware. Underglow follows the battery color by default. Beta 4 fixes the delayed layer response and battery underglow carrying into other layers. The device owner confirmed matching green underglow at a 51% battery reading. Bluetooth reliability, Intel Macs, other underglow colors, and the revised layer handoff need further hardware verification; underglow remains experimental.

![Animated explanation of the battery gauge](docs/assets/battery-sequence.gif)

Product imagery: [OpenAI × Work Louder](https://openai.com/supply/co-lab/work-louder/). The header visualizes the battery lights; the animation uses superimposed indicators. [Image credit and source](THIRD_PARTY_NOTICES.md).

## Install

You need **macOS**, **Node.js 22 or newer**, **Work Louder Input**, and a battery-equipped Codex Micro running **vendor firmware 0.6.3 or later**. Start with a USB connection.

1. Install [Work Louder Input](https://worklouder.cc/input) and [Node.js](https://nodejs.org/en/download) if you do not already have them.
2. Connect the Micro and **quit Input from its application menu**. The helper uses Input's installed HID driver; Input does not have to remain open.
3. [Download Micro-Battery-0.1.0-beta.4.zip](https://github.com/corybytheway/codex-micro-battery/releases/download/v0.1.0-beta.4/Micro-Battery-0.1.0-beta.4.zip), unzip it, and open **Install.command**. Review the displayed profile and new layer, then press Return to install.
4. Tap the Micro's layer sensor to select the new **Battery** layer. The installer tells you its number—usually layer 3 when you already have two layers.

The installer adds a new layer, saves a local backup, verifies the device readback, and enables a small login helper. Existing layers stay in place. A profile with six layers, unsupported layout, or insufficient spare channels is refused rather than overwritten.

You can reopen Input afterward. You can also move or delete the downloaded folder after installation: the runtime is copied to your own `~/Library/Application Support/Micro Battery/` folder.

**Upgrading from beta 1, beta 2, or beta 3:** quit Input, run **Uninstall.command**, then **Install.command** from the new download. Backups are retained. The new installation defaults to battery-color underglow. Use Configure.command afterward if you prefer white, off, or the vendor’s usual lighting.

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

The underglow follows the same green, orange, or red color while the Battery layer is active. Two full lights remain orange; one full light plus a second at half brightness or less turns both the gauge and underglow red. Underglow brightness is independent of the fading button and defaults to 100%. At an empty reading, all six buttons are off and the requested underglow remains red. The owner has physically confirmed matching green underglow at 51%. Beta 4 restores the newly selected layer’s saved underglow when leaving Battery, then yields to its usual host. Orange/red underglow and the revised cross-layer handoff remain experimental.

The helper checks the current layer and battery about every 500 ms. It sends a new battery-light frame only when the reading changes or the device reconnects. Layer switches trigger a fresh keymap read and an ambient update: Battery gets its current color, and leaving Battery restores the destination layer’s saved effect, brightness, speed, magic, and color. Device communication, competing host writes, and reconnection can add latency; this is a host-driven handoff, not an instant firmware rule. **This is a Mac-connected gauge:** the Mac must be awake and connected to the Micro. When disconnected or asleep, the hardware may retain its last light state; it is not a standalone firmware battery meter.

The continuous fade describes the proportional brightness mapping; the helper does not animate between battery readings. If the Micro reports only whole battery percentages, a 1% battery change within a segment produces a six-percentage-point change in that light's brightness. LED output and perceived brightness may have their own granularity.

## Adjust it

Battery lights fade proportionally without configuration. Open **Configure.command** for the ambient-light preference, or use:

```sh
# Follow the battery color at 70% underglow brightness (default mode).
node bin/micro-battery.cjs configure --underglow battery --brightness 70

# Alternatively, use white underglow.
node bin/micro-battery.cjs configure --underglow white

# Explicitly turn ambient light off on the Battery layer.
node bin/micro-battery.cjs configure --underglow off

# Return ambient-light control to the usual vendor behavior.
node bin/micro-battery.cjs configure --underglow inherit
```

Settings and keymap ownership are refreshed every 15 seconds by default, and on layer changes. The former fixed `--dim` option is no longer used. All underglow overrides use a vendor ambient-light path whose visual behavior is still being tested. `battery` is the default for new beta 3 or later installs; existing settings retain their chosen mode until reconfigured or reinstalled. Leaving Battery restores the destination layer’s saved underglow once; subsequent native Codex lighting updates are left alone. A graceful stop also restores the active layer’s saved underglow. A small local journal records outstanding overrides for recovery after restart.

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
| Install/service/uninstall lifecycle | Beta 1 real hardware round-trip verified; current simulated regression tests |
| Charge thresholds, order, proportional brightness | Explicit examples + 10,001 charge-conservation/monotonicity/contiguity checks |
| Proportional fade on hardware (beta 2) | [Firmware acknowledged 20% and 80%; owner visually confirmed a dimmer last light at 92% battery](docs/proportional-brightness-verification.json) |
| Battery-color underglow | [Owner confirmed green matches at 51%](docs/underglow-verification.json); beta 4 adds automatic restoration and faster layer checks |
| Bluetooth / Intel Mac | Code paths included; hardware verification pending |
| Windows / Linux | Hardware service not supported in this release |

The visual confirmation covers the observed 92% frame (five full lights plus one requested at 52%). It does not establish a measured optical brightness curve or verify every intermediate level. The tests verify the requested values across 10,001 battery readings.

## Privacy and implementation

The runtime makes no network requests and includes no telemetry. It discards key/joystick notifications. Configuration backups and logs remain in your user Library folder; do not upload your full keymap or backups in an issue because they can contain personal shortcuts and commands.

The gauge allocates six unused firmware Agent channels from 6–19. Codex's normal six channels, 0–5, are reserved. Only interface facts are implemented here: no Work Louder firmware, SDK code, HID binaries, app archives, or personal device configuration are redistributed.

Read the [implementation and protocol notes](docs/implementation.md), [visual notes](docs/visuals.md), and [contributing guide](CONTRIBUTING.md). Run `npm test`; no `npm install` is needed.

Created by **Cory McCabe**. [MIT licensed](LICENSE). This is an independent project, not affiliated with or endorsed by OpenAI or Work Louder. Product names identify compatible hardware.
