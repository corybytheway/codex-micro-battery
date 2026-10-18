# Visuals

Author: Cory McCabe

The README cover and animation use an actual official Codex Micro product image from the [OpenAI × Work Louder product page](https://openai.com/supply/co-lab/work-louder/). The device is not recreated with AI. Its chassis, keycaps, dial, joystick, printed symbols, and perspective are the original supplied pixels.

Code-native SVG annotations are superimposed on the six Agent keys. `1` means full brightness, `½` means the configured dim brightness, and `–` means off. These annotations illustrate logical LED states; they are not measured optical output or a photograph of the installed helper. The cover depicts 75%: four full, one dim, and one off. No white underglow is added to the source image.

The animation reads this repository's actual `batteryFrame` function for all 25 frames, keeping color thresholds, dim steps, and depletion order in sync with the implementation. The original image is embedded unchanged underneath the annotations in every SVG frame.

To regenerate both visuals, install the optional development tools `@resvg/resvg-js` and Python Pillow, then run `python3 scripts/render-animation.py`. These tools are not needed to install or run Micro Battery. The SVG composition lives in `scripts/render-visuals.cjs`.

See [image credit and source](../THIRD_PARTY_NOTICES.md). Vendor imagery is excluded from the MIT software license. Generated illustration experiments are not included in the repository or release.
