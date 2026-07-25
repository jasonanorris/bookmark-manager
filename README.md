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

Phase 0 is the project foundation:

- npm project configuration
- TypeScript configuration
- Vite React entry point
- Wrangler configuration with placeholder D1 values
- Minimal Worker health route
- Initial Vitest coverage
- Local secret example

The bookmark CRUD API, D1 migration, web interface, and browser extension are planned next.

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

## Development Commands

```bash
npm run typecheck
npm run test
npm run build
```

## Cloudflare Setup

Log in to Cloudflare:

```bash
npx wrangler login
```

Create the D1 database:

```bash
npx wrangler d1 create bookmark-manager
```

Copy the returned database ID into `wrangler.jsonc`:

```jsonc
"database_id": "REPLACE_WITH_DATABASE_ID"
```

Set the production API password/token as a Worker secret:

```bash
npx wrangler secret put EXTENSION_API_TOKEN
```

Do not commit production secrets.

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

After the D1 database ID and Worker secret are configured:

```bash
npm run deploy
```

## Browser Extension

The extension is planned for a later phase. It will include:

- Popup save form
- Options page for API URL and API password/token
- Local settings storage
- Current tab URL and title detection

The production token must be entered by the user in extension settings. It must not be committed in extension source code.

## API Notes

Planned bookmark endpoints:

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

The current scaffold includes:

```text
GET /api/health
```

## Known Limitations

- Bookmark CRUD is not implemented yet.
- D1 schema migration is planned for Phase 1.
- Web bookmark management UI is not implemented yet.
- Browser extension is not implemented yet.
- `wrangler.jsonc` contains a placeholder D1 database ID.
