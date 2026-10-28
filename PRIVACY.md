# Karasu Helper — Privacy

Last updated: 28 October 2026. Applies to version 1.2.3.

Karasu Helper is an unofficial community extension. It has no analytics, advertising SDK, license server or developer-operated data collection endpoint.

## Local data

The browser stores automation preferences, appearance, FACEIT display preferences, favorite catalog IDs, up to 12 named loadouts and an indicative market-price snapshot on the device. Session storage coordinates duplicate prevention, short status/history records, copied server commands and previous tab auto-discard settings. The extension does not read browser history, passwords, Steam Guard codes, Steam API keys or the previous clipboard contents.

## Karasu

The extension runs on `https://karasu.live/*`. It reads the page's already loaded match/player state and uses Karasu's existing actions for enabled accept/ban features. Skin catalog reads and explicitly selected cosmetic crafting/equipping use `https://inventory.karasu.live/api` and the site's normal session credentials. These requests go to Karasu; no separate developer server receives them. Karasu's own policies apply to its service.

FACEIT ranks come from fields already supplied by Karasu. The extension makes no FACEIT synchronization request and asks for no FACEIT API key.

## Optional market-price updates

A dated public Skinport price snapshot is bundled locally. The first time the user clicks **Update prices**, the browser may ask for optional access to `https://api.skinport.com/*`. If granted, the extension reads the public Items endpoint for CS2 prices in USD without cookies or account identifiers. A normal network request exposes standard connection information such as the IP address to that provider. No Karasu loadout, Steam ID, match data or favorite selections are sent. There is no automatic price-provider polling. Skinport's own privacy policy governs its endpoint.

## Clipboard and background assist

**Auto-copy connect** is off by default. When enabled, a ready server command is validated and written to the clipboard; the extension does not read what was there before. It requests `clipboardWrite` and uses an `offscreen` document for this operation.

When automation is enabled, Queue/match tabs are temporarily marked ineligible for automatic memory discard. The extension restores the recorded preference when automation is switched off or the page unloads. It does not control the game, press keys or move the mouse.

## Optional donations

The footer's **Buy me a coffee** link opens `https://ko-fi.com/totalnabaklaszka` only when clicked. The extension does not load Ko-fi scripts, payment widgets or tracking pixels. Voluntary payments take place on Ko-fi; the extension does not collect payment details, process payments, or receive a user's donation status. Ko-fi's own policies apply to its website. All extension features remain available without a donation.

## Removal

Uninstalling the extension removes its browser storage. Browser data can also be cleared through the browser's extension/site-data controls. Uninstalling does not reverse cosmetic changes already saved to Karasu; manage those through Karasu's inventory/loadout page.
