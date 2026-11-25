# Publishing The Human on the Google Play Store (later)

The game is already an installable web app (PWA): `manifest.webmanifest`, icons in `public/icons/`
and a service worker (`public/sw.js`) that keeps the game playable offline after the first visit.
The Play Store version wraps this same web app in a Trusted Web Activity (TWA). No separate code base.

## What the owner decides and does (needs his accounts and money)

1. Create a Google Play Console developer account (one-time fee, paid by the owner).
2. Decide the store name, short description, screenshots and age rating questionnaire.
3. Decide whether the game is free, paid or has in-app purchases (none exist today).
4. Write a privacy policy page (the game stores saves only on the device today; no data is collected).

## Technical steps (Claude can do these once the account exists)

1. Generate the Android wrapper with Bubblewrap (`@bubblewrap/cli`) pointing at
   `https://andilie0112-debug.github.io/the-human/manifest.webmanifest`.
2. Publish `/.well-known/assetlinks.json` with the app signing key fingerprint. GitHub Pages
   serves project sites under `/the-human/`, so Digital Asset Links needs a custom domain (or a
   `<user>.github.io` root repository) for the file to live at the domain root.
3. Build the signed `.aab` in GitHub Actions (keystore stored as a repository secret) and upload
   it to the Play Console internal testing track first.
4. Target: Android Chrome 72+; minimum devices as in the performance budget (mid-range phone, 30 fps).

## Checklist before submitting

- Graphics setting on Low runs at 30 fps on a mid-range test phone.
- All assets listed in `Design/ASSET_LICENSES.md` allow commercial use (UBC and UAL are CC0).
- No names, logos or UI from other games or brands.
