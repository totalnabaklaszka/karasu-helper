# Privacy fields for Partner Center

Use the `singlePurpose` and `permissionJustifications` text in [listing.json](listing.json). The Karasu URL is the content-script scope, not an extra required host permission. `api.skinport.com` is optional. The extension has no `tabs`, `cookies`, `history`, `clipboardRead` or all-sites permission.

For **Are you using remote code?**, choose **No**. JSON API responses and images are data; executable code and the font are bundled.

Use this policy URL:

https://github.com/totalnabaklaszka/karasu-helper/blob/main/PRIVACY.md

## Data-use disclosure

Do not describe this product as processing no user data. The developer receives no telemetry, but the website features handle data locally and send user-requested operations directly to Karasu.

Disclose **Website content**: Karasu match/player state, rank fields, catalog/inventory/loadout records and available server addresses. Also disclose **Personally identifiable information** for player/account identifiers and display names already supplied by Karasu, where the form includes these identifiers in that category. This is limited to providing the Karasu features and is not advertising or general browsing-history collection.

Normal authenticated Karasu API requests use the existing browser session; the extension does not ask for, read out or store passwords, Steam Guard codes or API keys. If the current form treats the site's normal session-authenticated requests as authentication-information use, describe this specific behavior rather than claiming the extension collects passwords. Inspect the displayed definitions before certifying; do not automatically tick every category or assert that there is no data use.

An optional public price update exposes standard connection details, including IP, to Skinport, without Karasu/player identifiers or cookies. A voluntary Ko-fi payment is handled on the external Ko-fi site after a click; the extension receives no donation status or payment details.

No information is sold, used for advertising, used to determine creditworthiness or transferred to a developer-operated service. Match and cosmetic operations are used only for the stated Karasu functionality. Certify only declarations whose displayed wording matches this implementation and the public policy.

## Publisher fields

The support website is https://github.com/totalnabaklaszka/karasu-helper/issues. If Partner Center requires a public contact email, the publisher must enter an address they control in Partner Center; none is guessed or inserted into this repository. Personal legal identity, country and trader status are completed by the publisher directly in their Microsoft account.
