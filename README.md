# Bookmark Manager

A small, self-hosted bookmark manager built with Cloudflare Workers, Cloudflare D1, React, Vite, TypeScript, and a Manifest V3 browser extension.

The first version is a personal app. It will use one shared API password/token stored as a Cloudflare Worker secret and saved locally in each browser or extension install so it does not need to be re-entered on every use.

## Stack

- TypeScript
- Cloudflare Workers
- Cloudflare D1
- React
- Vite
- Wrangler
- Vitest
- Browser Extension Manifest V3
- Plain CSS

## Current Status

The app is deployed at:

```text
https://bookmarks.radarapp.us
```

Current implementation includes:

- npm project configuration
- TypeScript configuration
- Vite React entry point
- Wrangler configuration for `bookmarks.radarapp.us`
- Minimal Worker health route
- Bookmark D1 migration
- Authenticated bookmark CRUD API
- Search, tag filtering, limit, and offset support
- Duplicate URL upsert behavior
- Web app password setup stored locally in the browser
- Web app bookmark create, list, search, filter, edit, and delete flows
- Firefox-friendly browser extension for saving the current tab
- Initial Vitest coverage for API behavior
- Production deployment on Cloudflare Workers
- Local secret example

Cloudflare DNS may take a short time to resolve from every local resolver after deployment. Cloudflare's public resolver already returns records for `bookmarks.radarapp.us`.

## Local Setup

Install dependencies:

```bash
npm install
```

Create local Worker secrets:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set a local `EXTENSION_API_TOKEN`. Do not commit `.dev.vars`.

Run the frontend dev server:

```bash
npm run dev
```

Run the Worker locally:

```bash
npm run dev:worker
```

Apply the local D1 migration before using bookmark endpoints:

```bash
npx wrangler d1 migrations apply bookmark-manager --local
```

For the web app to talk to the Worker API locally, open the Worker dev URL from `npm run dev:worker`. The Vite dev server is useful for frontend-only work, but the Worker serves the built app and API together in the deployed shape.

## Development Commands

```bash
npm run typecheck
npm run test
npm run build
npm run build:extension
```

## Cloudflare Setup

Log in to Cloudflare:

```bash
npx wrangler login
```

This deployment uses:

```text
https://bookmarks.radarapp.us
```

Create or confirm the D1 database:

```bash
npx wrangler d1 create bookmark-manager
```

Confirm the database ID in `wrangler.jsonc`:

```jsonc
"database_id": "53c75941-1cc5-4492-bed8-b6e73c60d4c1"
```

Set the production API password/token as a Worker secret:

```bash
npx wrangler secret put EXTENSION_API_TOKEN
```

Do not commit production secrets.

Production CORS is configured with:

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://bookmarks.radarapp.us"
}
```

Firefox and Chromium extension origins are allowed separately by the Worker.

## D1 Migrations

Local migrations:

```bash
npx wrangler d1 migrations apply bookmark-manager --local
```

Remote migrations:

```bash
npx wrangler d1 migrations apply bookmark-manager --remote
```

Only run remote migrations after confirming the target Cloudflare account and database.

## Deployment

Deploy after changes:

```bash
npm run deploy
```

Deployment checklist:

1. Authenticate Wrangler with the intended Cloudflare account.
2. Create or confirm the `bookmark-manager` D1 database.
3. Confirm the D1 database ID in `wrangler.jsonc`.
4. Set the production `EXTENSION_API_TOKEN` secret.
5. Apply remote D1 migrations.
6. Deploy the Worker.
7. Open `https://bookmarks.radarapp.us`.
8. Enter the production API password.
9. Update extension settings to use `https://bookmarks.radarapp.us`.

## Browser Extension

The extension is built for Firefox desktop first and uses the standard WebExtensions shape.

Current extension features:

- Popup save form
- Options page for API URL and API password/token
- Local settings storage
- Current tab URL and title detection
- Optional tags and description
- Success and error feedback

Build the extension scripts:

```bash
npm run build:extension
```

Load it temporarily in Firefox on Linux Mint:

1. Open `about:debugging`.
2. Select `This Firefox`.
3. Select `Load Temporary Add-on`.
4. Choose `extension/manifest.json`.

For local development, open the extension settings and use:

```text
API URL: http://localhost:8787
API Password: the value from .dev.vars
```

Use `Test Connection` on the settings page before trying the popup. A good local setup should show `Connection works.`. If it says `Bad password.`, update the API password. If it shows an HTTP or network error, confirm `npm run dev:worker` is running and the API URL matches the Worker URL. Firefox extension pages use a `moz-extension://` origin, which the Worker intentionally allows for API requests.

For production, use:

```text
API URL: https://bookmarks.radarapp.us
API Password: your production EXTENSION_API_TOKEN value
```

The production token must be entered by the user in extension settings. It must not be committed in extension source code.

Firefox on Android has more limited extension workflows. The web app at `https://bookmarks.radarapp.us` is expected to be the main phone experience.

## Web App

The web app can be used from a browser without the extension.

On first use in a browser, it asks for the shared API password/token and stores it in `localStorage`. Future visits on that browser use the saved token automatically until you sign out or clear browser data.

Current web features:

- Add bookmarks
- List recent bookmarks
- Search bookmarks
- Filter by tag
- Edit bookmark URL, title, description, and tags
- Delete bookmarks with confirmation
- Show loading, empty, success, and error states

Bookmark URLs can be entered with or without a scheme. For example,
`example.com` is accepted and saved as `https://example.com`. Explicit URLs
must still use `http` or `https`; unsupported protocols are rejected.

## API

Health check:

```text
GET /api/health
```

Bookmark endpoints:

```text
GET    /api/bookmarks
GET    /api/bookmarks/:id
POST   /api/bookmarks
PATCH  /api/bookmarks/:id
DELETE /api/bookmarks/:id
```

All bookmark API routes will require:

```http
Authorization: Bearer YOUR_TOKEN
```

List parameters:

```text
GET /api/bookmarks?search=cloudflare
GET /api/bookmarks?tag=development
GET /api/bookmarks?limit=50
GET /api/bookmarks?offset=0
GET /api/bookmarks?search=worker&tag=development
```

Default `limit` is `50`. Maximum `limit` is `100`.

Create or update a duplicate bookmark:

```bash
curl -X POST http://localhost:8787/api/bookmarks \
  -H "Authorization: Bearer local-development-token" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://developers.cloudflare.com/workers/",
    "title": "Cloudflare Workers",
    "description": "Worker platform documentation",
    "tags": ["cloudflare", "workers"]
  }'
```

List bookmarks:

```bash
curl http://localhost:8787/api/bookmarks \
  -H "Authorization: Bearer local-development-token"
```

Search bookmarks:

```bash
curl "http://localhost:8787/api/bookmarks?search=worker" \
  -H "Authorization: Bearer local-development-token"
```

Update a bookmark:

```bash
curl -X PATCH http://localhost:8787/api/bookmarks/1 \
  -H "Authorization: Bearer local-development-token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated title",
    "tags": ["reference"]
  }'
```

Delete a bookmark:

```bash
curl -X DELETE http://localhost:8787/api/bookmarks/1 \
  -H "Authorization: Bearer local-development-token"
```

Successful bookmark response:

```json
{
  "bookmark": {
    "id": 1,
    "url": "https://example.com",
    "title": "Example",
    "description": "",
    "tags": ["reference"],
    "createdAt": "2026-07-25T15:00:00.000Z",
    "updatedAt": "2026-07-25T15:00:00.000Z"
  }
}
```

Successful list response:

```json
{
  "bookmarks": [],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "count": 0
  }
}
```

Error response:

```json
{
  "error": {
    "code": "INVALID_URL",
    "message": "A valid website URL is required."
  }
}
```

## Known Limitations

- Tag filtering uses simple SQL matching against JSON-encoded tags for the first version.
- Firefox Android extension support may require later packaging/distribution work.
