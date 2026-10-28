# GitHub publication kit — Karasu Helper 1.2.2

The release has been prepared locally for review. No repository or release has been published by the build scripts.

## Repository

Suggested name: `karasu-helper`

Suggested description:

> Auto accept and veto priorities for Karasu, FACEIT ranks, server connect copy, and Loadout Studio with colour/value filters and saved sets. Unofficial community extension.

Make the repository public. Use the source archive or its allowlisted folders/files. Local `research/`, `.research/`, `analysis/`, `node_modules/`, logs and `.env` files are excluded from the source package. The source includes no personal screenshots or local analysis databases.

## Release

Tag: `v1.2.2`

Title: `Karasu Helper 1.2.2 — Loadout Studio`

Attach `karasu-helper-1.2.2.zip` as the installable download. This archive contains `manifest.json` at its root; users should extract it before loading it in the browser. Keep the source archive separate from the installable archive.

The same installer and a SHA-256 checksum are included in `downloads/`. The README links directly to this installer, so a public repository is enough to share the extension before a separate GitHub Release is created.

Suggested release notes:

- New angular red raven/K logo and a wider, minimal popup.
- Loadout Studio: colour presets, minimum indicative market value, rarity filters, favorites and value sorting.
- Lock slots, reroll a single skin or all unlocked slots, and save up to 12 named sets locally.
- Craft a previewed loadout sequentially; identical CT/T selections use one crafted instance. Stop safely after the current skin.
- Selected skin actions stay in a bottom dock outside the scrolling results.
- Background assist improves match-ready detection and short countdowns while Karasu is in the background.
- Exact Doppler/Gamma Doppler phase and gem names are preserved in search and previews.
- Studio features are unlocked for this preview. Karasu cosmetics remain free; market values are only an indicative search filter.

## Installation text

1. Download the extension ZIP under Releases → Assets.
2. Extract it to a permanent folder.
3. Open `chrome://extensions`, `edge://extensions` or `brave://extensions`.
4. Enable Developer mode and choose **Load unpacked**.
5. Select the extracted folder containing `manifest.json`.
6. Refresh Karasu and open the extension from the browser toolbar.

For updates, replace files in the same folder, reload the extension, and refresh Karasu tabs. Unpacked installs require manual updates.

Link the public `PRIVACY.md` from the repository description/release notes. Price updates use optional access to Skinport; bundled prices work without that permission.

## Build the prepared archives

```text
npm ci
npm test
npm run check
npm run build
npm run source
```

The build scripts package local files only. Publishing requires a separate explicit GitHub operation after reviewing the release.
