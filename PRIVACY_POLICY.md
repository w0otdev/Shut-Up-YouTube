# Privacy Policy

Last updated: November 4, 2026

This Privacy Policy explains how the Shut Up YouTube browser extension ("the Software"), developed by `w0otdev` ("the Developer"), handles data when installed in your Chromium-based web browser.

## 1. Summary: zero data collection

Shut Up YouTube is a strictly local, client-side browser extension.

- We do not collect, log, store, transmit, rent, sell, or share any personal information or user data.
- We do not track your browsing history, search queries, watched videos, IP address, cookies, account credentials, or device identifiers.
- The Software contains zero analytics scripts, zero telemetry reporters, zero advertising SDKs, and zero remote server connections controlled by the Developer.

## 2. How your settings are stored (`storage` permission)

The Software requests the Chromium `storage` permission (`chrome.storage.sync`) for one purpose: saving your extension toggle preferences so they persist when you close your browser or open a new tab.

The only values written to `chrome.storage.sync` are the following seven configuration settings:

| Storage key | Value type | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `su_adblockFix` | `boolean` | `true` | Stores whether the Adblock Bypass toggle is enabled |
| `su_warningBypass` | `boolean` | `true` | Stores whether the Warning Bypass toggle is enabled |
| `su_hidePlayables` | `boolean` | `true` | Stores whether the Hide Playables toggle is enabled |
| `su_premiumLogo` | `boolean` | `true` | Stores whether the Premium Logo toggle is enabled |
| `ytvr_enabled` | `boolean` | `true` | Stores whether Video Stretch is enabled |
| `ytvr_ratio` | `string` | `"fill"` | Stores your selected aspect ratio (`"fill"`, `"cover"`, `"169"`, `"219"`, `"329"`) |
| `ytvr_autoStretch` | `boolean` | `true` | Stores whether Auto Stretch in theater/fullscreen mode is enabled |

These seven keys never leave your browser except through your browser vendor's built-in profile synchronization (for example, Google Chrome Sync or Brave Sync) if you have voluntarily enabled browser sync on your own account. The Developer has no access to your browser storage or synced profile data.

## 3. Host permissions and network activity

### Host permissions (`*://*.youtube.com/*` and `*://*.youtube-nocookie.com/*`)
The Software requests host access only for `youtube.com` and `youtube-nocookie.com`. This permission is required by the Manifest V3 platform so the browser can run the extension's local scripts (`content.js` and `inject.js`) on YouTube pages to apply CSS rules, render the player aspect ratio buttons, click through warning prompts, and manage page reloads during video navigation. The Software cannot read or modify any other websites you visit.

### Preconnect hints and fonts
- When a YouTube page loads, `content.js` inserts standard `<link rel="preconnect">` tags pointing to official Google/YouTube media domains (`https://i.ytimg.com`, `https://yt3.ggpht.com`, and `https://www.gstatic.com`) to reduce latency when YouTube loads thumbnails and static assets.
- When you open the extension popup (`popup.html`), the popup loads the `Google Sans` and `Inter` stylesheets from `https://fonts.googleapis.com` and `https://fonts.gstatic.com` to render the popup interface.
- No requests are ever sent to any server owned or operated by `w0otdev`.

## 4. Chrome Web Store user data policy compliance

The Software's use of information received from Chromium APIs adheres strictly to the Chrome Web Store User Data Policy, including the Limited Use requirements:

1. The Software does not collect or transfer any user data to third parties.
2. The Software does not use or transfer any user data for personalized advertising, creditworthiness, lending, or data brokerage.
3. No human or automated system operated by the Developer can read any user data from your browser.

## 5. GDPR, UK GDPR, and CCPA/CPRA rights

Because the Developer does not collect, receive, or control any personal data (as defined under the EU/UK General Data Protection Regulation or the California Consumer Privacy Act), the Developer holds no personal records that can be queried, exported, corrected, or deleted on an external server.

You have full local control over all extension configuration data on your device:
- You can modify your preferences at any time via the extension popup.
- You can permanently delete all stored preferences by removing the extension from `chrome://extensions`.

## 6. Children's privacy

The Software does not collect any personal information from anyone, including children under the age of 13 (or the applicable age of digital consent in your jurisdiction), in compliance with the Children's Online Privacy Protection Act (COPPA).

## 7. Open-source auditability and contact

All source code for Shut Up YouTube is unminified, unobfuscated, and publicly available for inspection at `https://github.com/w0otdev/Shut-Up-YouTube`.

If you have questions regarding this Privacy Policy, you may open an issue on the repository at `https://github.com/w0otdev/Shut-Up-YouTube/issues`.
