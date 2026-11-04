# Shut Up YouTube

Shut Up YouTube (`v1.2.1`) is a Manifest V3 Chromium extension for `youtube.com` and `youtube-nocookie.com`. It resolves adblocker playback errors, dismisses content warnings, hides YouTube Playables and promotional shelves, applies custom video aspect ratios, and replaces the standard header logo with the YouTube Premium wordmark.

## Capabilities

### Adblock playback fix and ad slot removal
When `su_adblockFix` is enabled, the extension hides page-level ad containers (`#player-ads`, `.video-ads`, `.ytp-ad-module`, `.ytp-ad-overlay-container`, `ytd-ad-slot-renderer`, `ytd-in-feed-ad-layout-renderer`, `ytd-banner-promo-renderer`, `ytd-display-ad-renderer`, `ytd-statement-banner-renderer`, `ytd-masthead-ad-v3-renderer`, and `#masthead-ad`). In the main page context, `inject.js` intercepts single-page navigation (`history.pushState`, `popstate`, and `yt-navigate-finish`) and triggers a clean page reload when navigating to a new `/watch` or `/shorts/` video ID so the player initializes without adblock enforcement errors. It also stubs `document.requestStorageAccess`, `document.hasStorageAccess`, and `document.requestStorageAccessFor` to resolve immediately.

### Automatic content warning bypass
When `su_warningBypass` is enabled, `content.js` polls for visible age and content confirmation prompts (`#content-warning-ok-button`, `yt-playability-error-supported-renderers`, `yt-player-error-message-renderer`, `#error-screen`, and buttons labeled "I understand" or "Tôi hiểu") and clicks them automatically.

### Playables and promotional shelf removal
When `su_hidePlayables` is enabled, CSS rules hide YouTube Playables sections (`ytd-mini-game-card-view-model` and any rich section, shelf, reel shelf, horizontal card list, or sidebar guide entry linking to `/playables`), merchandise shelves (`ytd-merch-shelf-renderer`), ticket shelves (`#ticket-shelf`), and ambient video cinematics (`#cinematics`, `#cinematics-container`).

### Video aspect ratio and ultrawide stretch controls
The extension adds `FIT` and `AUTO` toggle buttons directly to the YouTube player right-hand control bar (`.ytp-right-controls`) and provides five scaling modes in the popup:

| Mode | Setting value | CSS behavior on `#movie_player video` |
| :--- | :--- | :--- |
| Stretch | `fill` | `object-fit: fill !important` across full viewport width |
| Crop | `cover` | `object-fit: cover !important` |
| 16:9 | `169` | `aspect-ratio: 16 / 9 !important` |
| 21:9 | `219` | `aspect-ratio: 21 / 9 !important` |
| 32:9 | `329` | `aspect-ratio: 32 / 9 !important` |

When Auto Stretch (`ytvr_autoStretch`) is active, a `MutationObserver` watches `ytd-watch-flexy` attributes (`theater` and `fullscreen`) along with `document.fullscreenElement`. Aspect ratio overrides then apply only in Theater and Fullscreen modes, while the default watch layout stays at its native dimensions.

### YouTube Premium logo swap
When `su_premiumLogo` is enabled, `inject.js` replaces the inline SVG inside `ytd-logo` with the YouTube Premium SVG paths (`viewBox="0 0 101 20"`). The original SVG markup and dimensions are cached on the DOM node (`_suOrigSvg`) so toggling the setting off restores the standard logo without reloading the page.

## Installation

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/rainaku/Shut-Up-YouTube.git
   ```
2. Open a Chromium-based browser (Chrome, Edge, Brave, or Vivaldi) and navigate to `chrome://extensions`.
3. Enable Developer mode in the top-right corner.
4. Click Load unpacked and select the project directory containing `manifest.json`.

## Architecture and project structure

```text
Shut-Up-YouTube/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── content.js      # Isolated-world content script (CSS injection, warning bypass, ratio controls)
├── inject.js       # MAIN-world script (Trusted Types policy, storage access stub, SPA reload, logo swap)
├── manifest.json   # Manifest V3 extension definition
├── popup.html      # Extension popup markup and styling
├── popup.js        # Popup state synchronization with chrome.storage.sync
├── sw.js           # Background service worker initializing default settings on install
└── LICENSE         # MIT License
```

`manifest.json` registers two content scripts at `document_start` on `*://*.youtube.com/*` and `*://*.youtube-nocookie.com/*` (`all_frames: false`):

1. `inject.js` executes in `"world": "MAIN"` to access page-level APIs (`window.trustedTypes`, `history.pushState`, and `document.requestStorageAccess`). Because `MAIN` world scripts cannot call `chrome.storage` directly, `inject.js` reads state from `data-su-adblock` and `data-su-logo` attributes on `<html>` and listens for the custom `su-yt-update` window event.
2. `content.js` executes in the isolated extension world. It injects `#su-yt-style` and `<link rel="preconnect">` tags (`https://i.ytimg.com`, `https://yt3.ggpht.com`, `https://www.gstatic.com`), mirrors `chrome.storage.sync` changes to `<html>` classes and data attributes, dispatches `su-yt-update`, manages the player control buttons, and runs the warning bypass interval.

## Configuration and storage keys

All preferences persist in `chrome.storage.sync` and update active YouTube tabs immediately through `chrome.storage.onChanged`:

| Storage key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `su_adblockFix` | `boolean` | `true` | Hides ad slots and reloads video navigations to bypass adblock warnings |
| `su_warningBypass` | `boolean` | `true` | Automatically clicks through age and content warning overlays |
| `su_hidePlayables` | `boolean` | `true` | Hides YouTube Playables, merch shelves, ticket shelves, and ambient cinematics |
| `su_premiumLogo` | `boolean` | `true` | Replaces the header logo with the YouTube Premium SVG |
| `ytvr_enabled` | `boolean` | `true` | Master toggle for video stretching and custom aspect ratios (`FIT` button) |
| `ytvr_ratio` | `string` | `"fill"` | Active aspect ratio preset (`"fill"`, `"cover"`, `"169"`, `"219"`, `"329"`) |
| `ytvr_autoStretch` | `boolean` | `true` | Restricts aspect ratio overrides to Theater and Fullscreen modes (`AUTO` button) |

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 rain.
