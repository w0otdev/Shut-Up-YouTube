# Shut Up YouTube

A lightweight Chromium browser extension (`v1.2.3`) that filters player ads, confirms content warnings, removes page clutter, and adds aspect ratio controls.

## Features

- Removes ad fields from initial player data and subsequent player responses (fetch/XHR), hides banner/feed ad slots, and clicks visible Skip Ad buttons.
- Reports recognized adblock playback errors in the popup. It leaves the actual error visible and does not force page reloads or substitute a broken embedded player.
- Automatically confirms supported viewer-discretion and age-warning prompts, including the current YouTube interstitial's link-based Continue control. It supports "I understand", "Tôi hiểu", and "Tiếp tục" in warning dialogs, preserves YouTube's original confirmation parameters, and retries up to four times if the control has not finished initializing. It does not click Sign in, Verify age, or Learn more.
- Hides YouTube Playables mini-games, merchandise shelves, ticket promos, and ambient video glow effects.
- Replaces the standard YouTube header logo with the YouTube Premium logo.
- Adds custom video aspect ratio and ultrawide screen fitting with instant toggles in the player bar and extension popup.

Ad filtering is best effort. A server-side playback denial cannot be overridden when YouTube does not provide playable media. Login/age verification, embedding restrictions, and some ad formats cannot be removed by this extension. The Premium logo is cosmetic and does not grant a subscription.

**Content confirmation and identity verification are different.** Warning Bypass handles the native Continue / I understand action when YouTube offers it. If YouTube only offers Sign in or Verify your age, this version reports that requirement in the popup and leaves the prompt visible. A confirmation click is not reported as successful playback; the popup distinguishes waiting, confirming, video ready, and failed confirmation.

## Video player controls

The extension adds two quick-toggle buttons directly to the bottom-right YouTube player controls:

| Control | Function |
| :--- | :--- |
| `FIT` | Toggles custom video aspect ratio scaling on or off |
| `AUTO` | Applies scaling only in Theater and Fullscreen modes, keeping the default view unchanged |

You can also open the extension popup at any time to switch between five aspect ratio modes:
- `Fill`: Stretches the video to fill the entire player area edge to edge.
- `Cover`: Zooms and crops the video to cover the screen without distortion.
- `16:9`, `21:9`, `32:9`: Reshapes the video to those proportions within the player bounds. This can distort the source image; use `Cover` to preserve its proportions.

**AUTO is on by default.** In the standard viewing mode, FIT waits until you switch to Theater/Fullscreen. Turn AUTO off to apply your ratio in the standard player too. Dimensions follow the player when it resizes, and disabling FIT restores YouTube's original video layout. Controls also run inside YouTube embeds.

## Installation

1. Download or clone this repository:
   ```bash
   git clone https://github.com/w0otdev/Shut-Up-YouTube.git
   ```
2. Open your Chromium browser (Chrome, Brave, Edge, or Vivaldi) and go to `chrome://extensions`.
3. Turn on Developer mode in the top-right corner.
4. Click Load unpacked and select the `Shut-Up-YouTube` folder.

After updating an existing installation, click **Reload** on its card in `chrome://extensions`, then refresh your open YouTube tabs. Already-open pages keep their old content scripts until refreshed. Changes in the popup apply immediately afterward; ad data already consumed by the player may require a video reload.

## Development and verification

No build step or runtime dependency is required. Browser regression tests use Node.js 20+ and a separately installed Chromium:

```sh
npm ci
npx playwright install chromium
npm test
```

Tests load the real unpacked extension, including its isolated and MAIN worlds, against controlled YouTube fixtures. They check popup/player synchronization, persisted OFF settings, all fit modes, delayed warnings, link-based interstitials, late initialization and bounded retries, SPA navigation, logo restoration under Trusted Types, response filtering, ad skipping, existing YouTube embeds, and honest reporting of server-side playback blocks.

Optional checks against the real YouTube site:

```sh
npm run test:live
npm run test:warning -- "https://www.youtube.com/watch?v=NtKX__-qPSI"
npm run test:warning -- "https://www.youtube.com/watch?v=NtKX__-qPSI" --cold
```

This reports actual playback progress, controls, errors, and a screenshot in `test-results/`; network, consent, and bot restrictions can affect the result. Successful playback of an unrestricted video does not prove that a server-side adblock restriction can be bypassed.

`test:warning` checks the supplied video's real content-warning screen with Warning Bypass OFF, enables it, then requires YouTube to return `OK`, dismiss the warning, and advance playback. `--cold` checks a fresh browser profile with the feature already enabled. These tests use a temporary signed-out profile; they do not read your personal browser profile.

## Privacy and legal

Shut Up YouTube runs entirely locally on `youtube.com` and `youtube-nocookie.com`. It only uses the `storage` permission to save your toggle preferences locally and collects zero user data or telemetry. See the full [Privacy Policy](PRIVACY_POLICY.md) for details.

This project is an independent open-source tool and is not affiliated with, endorsed by, or sponsored by YouTube, LLC or Google LLC. The extension is provided strictly "AS IS" without warranty of any kind, and users are solely responsible for complying with YouTube's Terms of Service. Read the full [Terms of Service](TERMS_OF_SERVICE.md) before use.

## License

[MIT License](LICENSE) © 2026 w0otdev
