# Karasu Helper — Microsoft Edge submission kit

Status: **prepared locally; not submitted or approved**. Product name: **Karasu Helper**. Version: **1.2.4**. Store text: **English (United States)**. Suggested category: **Productivity**. Price: **Free**.

## Files

- `karasu-helper-1.2.4.zip` inside the downloadable kit is the extension package to upload. Its root contains `manifest.json`.
- `description.en-US.txt`: paste into the full description.
- `listing.json`: links, search terms, purpose and permission justifications.
- `privacy-fields.md`: privacy disclosures and fields the publisher must fill personally.
- `reviewer-notes.txt`: certification notes, including account and live-match requirements.
- `assets/logo-300.png`: store logo, 300 × 300.
- `assets/promo-440x280.png` and `assets/promo-1400x560.png`: optional promotional tiles. These are artwork, not claimed screenshots of a running browser.

## Submit manually

1. [Register for the Microsoft Edge program](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/create-dev-account) using your own Microsoft account. For a personal project, use the appropriate individual-account option and truthful publisher/contact details. Edge program registration has no fee.
2. In [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview), create a new extension and upload the **inner extension ZIP**, not the entire submission-kit ZIP.
3. Use Public visibility and your chosen markets. Enter the fields and assets above; the short description comes from the manifest.
4. Review privacy declarations, add the certification notes, and submit when the draft is complete.

Screenshots are optional. If you add them later, use genuine user-captured images at 640 × 480 or 1280 × 800, with personal details removed. No desktop or browser capture was used to build this kit.

Before submitting, manually load the package in Edge and verify the features you intend to advertise. Store approval and third-party Karasu availability are not guaranteed. The automated checks are synthetic and do not replace this browser/account check.

## Rebuild and check

```text
npm ci
npm test
npm run check
npm run edge
npm run check:edge
npm run source
```

`npm run edge` uses PowerShell/System.Drawing on Windows to generate the native vector-based artwork, build the installer, and assemble `downloads/karasu-helper-edge-submission-1.2.4.zip` plus a checksum. Build scripts do not sign in or publish to Partner Center.

References: [Microsoft publication requirements](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension), [API compatibility](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support), [Chromium manifest description limit](https://developer.chrome.com/docs/extensions/reference/manifest/description).
