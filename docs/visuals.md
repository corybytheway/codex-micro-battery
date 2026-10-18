# Visuals

Author: Cory McCabe

The README header is the user-selected `docs/assets/header-battery.png`, copied unchanged from the supplied image. It is an AI-assisted LED lighting edit based on the official top-down Codex Micro image from the [OpenAI × Work Louder product page](https://openai.com/supply/co-lab/work-louder/). It depicts 75%: four bright green lights, one dim green light, and one off. It is a visualization rather than a photograph of the installed helper.

The animation uses a separate, unchanged official angled product image. Code-native SVG annotations are superimposed on the six Agent keys. `1` means full brightness, `½` means the configured dim brightness, and `–` means off. These annotations illustrate logical LED states rather than measured optical output.

The animation reads this repository's actual `batteryFrame` function for all 25 frames, keeping color thresholds, dim steps, and depletion order in sync with the implementation. The original image is embedded unchanged underneath the annotations in every SVG frame.

To regenerate the animation, install the optional development tools `@resvg/resvg-js` and Python Pillow, then run `python3 scripts/render-animation.py`. This leaves the supplied header image untouched. These tools are not needed to install or run Micro Battery. The SVG composition lives in `scripts/render-visuals.cjs`.

See [image credit and source](../THIRD_PARTY_NOTICES.md). Vendor imagery is excluded from the MIT software license.
