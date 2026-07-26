# Bookmark Manager Extension

Firefox extension for saving the current tab to the self-hosted bookmark manager.

## Build

From the project root:

```bash
npm run package:extension
```

This builds the extension scripts and writes:

```text
extension/releases/bookmark-manager-1.0.0.zip
```

The zip is a local release artifact and is intentionally ignored by Git.

## Temporary Install On Firefox Desktop

Use this for local testing on Linux Mint:

1. Open `about:debugging`.
2. Select `This Firefox`.
3. Select `Load Temporary Add-on`.
4. Choose `extension/manifest.json`.

Temporary add-ons are removed when Firefox restarts.

## Reinstall Or Update

For a temporary install:

1. Build the latest scripts with `npm run build:extension`.
2. Open `about:debugging`.
3. Remove the old temporary Bookmark Manager extension.
4. Load `extension/manifest.json` again.
5. Confirm the popup or settings page shows the expected version.

Firefox keeps extension local storage by extension ID in many reload/update cases, but
temporary installs can be reset during browser restarts. If the popup asks for setup
again, re-enter:

```text
API URL: https://bookmarks.radarapp.us
API Password: your production EXTENSION_API_TOKEN value
```

## Settings

Open the extension settings and configure:

```text
API URL: https://bookmarks.radarapp.us
API Password: your production EXTENSION_API_TOKEN value
```

Use `Test Connection` before saving bookmarks. Expected messages:

- `Connection works.` means the API URL and password are valid.
- `Bad password.` means the API URL responded, but the password is wrong.
- A network or HTTP error usually means the API URL is wrong, unreachable, or not deployed.

## Firefox Android

Firefox Android extension installation is more constrained than desktop Firefox. For
this project, the supported phone workflow is the web app:

```text
https://bookmarks.radarapp.us
```

Open it on the phone, enter the shared API password once, and Firefox should keep the
session in browser storage until you sign out or clear site data.
