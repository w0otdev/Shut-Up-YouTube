# Shut Up YouTube

A lightweight Chromium browser extension (`v1.2.1`) that fixes YouTube adblocker playback errors, skips content warnings, removes page clutter, and adds ultrawide aspect ratio controls.

## Features

- Fixes the "Ad blockers violate YouTube's Terms of Service" playback error and hides banner and feed ad slots.
- Automatically clicks through age and content warning screens ("I understand") as soon as they appear.
- Hides YouTube Playables mini-games, merchandise shelves, ticket promos, and ambient video glow effects.
- Replaces the standard YouTube header logo with the YouTube Premium logo.
- Adds custom video aspect ratio and ultrawide screen fitting with instant toggles in the player bar and extension popup.

## Video player controls

The extension adds two quick-toggle buttons directly to the bottom-right YouTube player controls:

| Control | Function |
| :--- | :--- |
| `FIT` | Toggles custom video aspect ratio scaling on or off |
| `AUTO` | Applies scaling only in Theater and Fullscreen modes, keeping the default view unchanged |

You can also open the extension popup at any time to switch between five aspect ratio modes:
- `Fill`: Stretches the video to fill the entire player area edge to edge.
- `Cover`: Zooms and crops the video to cover the screen without distortion.
- `16:9`, `21:9`, `32:9`: Forces standard widescreen or ultrawide proportions.

## Installation

1. Download or clone this repository:
   ```bash
   git clone https://github.com/w0otdev/Shut-Up-YouTube.git
   ```
2. Open your Chromium browser (Chrome, Brave, Edge, or Vivaldi) and go to `chrome://extensions`.
3. Turn on Developer mode in the top-right corner.
4. Click Load unpacked and select the `Shut-Up-YouTube` folder.

## Privacy and legal

Shut Up YouTube runs entirely locally on `youtube.com` and `youtube-nocookie.com`. It only uses the `storage` permission to save your toggle preferences locally and collects zero user data or telemetry. See the full [Privacy Policy](PRIVACY_POLICY.md) for details.

This project is an independent open-source tool and is not affiliated with, endorsed by, or sponsored by YouTube, LLC or Google LLC. The extension is provided strictly "AS IS" without warranty of any kind, and users are solely responsible for complying with YouTube's Terms of Service. Read the full [Terms of Service](TERMS_OF_SERVICE.md) before use.

## License

[MIT License](LICENSE) © 2026 w0otdev
