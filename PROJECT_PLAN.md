# Bookmark Manager Project Plan

## Purpose

Build a small, self-hosted bookmark manager that runs on Cloudflare Workers, stores data in Cloudflare D1, and includes a browser extension for saving the current tab.

The first version is for personal use. Keep the architecture simple, avoid multi-user features, and prefer readable TypeScript over framework-heavy abstractions.

## Guiding Decisions

- Host the API and built React frontend from the same Cloudflare Worker.
- Store bookmarks in one D1 `bookmarks` table with JSON-encoded tags.
- Use conservative URL normalization for duplicate detection.
- Protect bookmark API requests with one shared password/token stored as a Worker secret.
- Let the browser extension and web app store the user-entered password/token locally per device so it does not need to be re-entered.
- Keep public deployment on Cloudflare; keep admin/server infrastructure private unless explicitly needed.
- Do not introduce Docker, a separate server, external databases, social login, AI features, or public registration for the initial version.

## Target Architecture

```text
Browser Extension ─┐
                   ├─ HTTPS ─ Cloudflare Worker ─ D1 Database
React Web App ─────┘              │
                                  └─ Static frontend assets
```

Expected project areas:

```text
src/worker/      Worker entry point, routing, auth, validation, API handlers
src/web/         React/Vite application and typed API client
extension/       Manifest V3 popup and options page
migrations/      D1 schema migrations
public/          Static assets
tests/           Worker/API tests where useful
```

## Phase 0: Project Foundation

Deliverables:

- Initialize `package.json`, TypeScript, Vite, Wrangler, and Vitest.
- Add `.gitignore` entries for secrets, build output, Wrangler state, coverage, and dependencies.
- Add `wrangler.jsonc` with placeholders for Cloudflare-specific D1 values.
- Add `README.md` with setup, development, deployment, extension, and known-limitation notes.
- Add local development instructions for `.dev.vars` without committing secrets.

Validation:

- `npm run typecheck`
- `npm run build`
- `npm run test`

Manual inputs needed:

- Cloudflare account login.
- D1 database creation.
- Real D1 database ID.
- Production `EXTENSION_API_TOKEN` secret containing the shared API password/token.

## Phase 1: Worker API and D1

Deliverables:

- Create `migrations/0001_create_bookmarks.sql`.
- Define typed Worker `Env` bindings for `DB`, `ASSETS`, `EXTENSION_API_TOKEN`, and optional `ALLOWED_ORIGINS`.
- Implement API routing for:
  - `GET /api/bookmarks`
  - `GET /api/bookmarks/:id`
  - `POST /api/bookmarks`
  - `PATCH /api/bookmarks/:id`
  - `DELETE /api/bookmarks/:id`
- Return JSON for unknown `/api/*` routes instead of falling through to the SPA.
- Add centralized JSON response and error helpers.
- Add bearer-token authentication for all bookmark API routes.
- Support a simple client-side password/token setup flow for the web app and extension.
- Add request body size limits and runtime validation.
- Implement conservative URL normalization.
- Implement duplicate URL upsert behavior while preserving `created_at`.
- Add list filtering by `search`, `tag`, `limit`, and `offset`.
- Add intentional CORS handling for local, deployed web, and extension origins.

Validation:

- Unit or integration tests for validation, auth, CRUD, duplicates, search, tag filtering, malformed JSON, missing records, and unknown API routes.
- Local `curl` smoke tests against `wrangler dev`.

## Phase 2: Web App

Deliverables:

- Build a mobile-first React interface.
- Add a password/token setup screen that stores the value locally in the browser.
- Add a dedicated typed API client in `src/web/api.ts`.
- Implement:
  - Header with app name.
  - Add bookmark form.
  - Recent bookmarks list in reverse chronological order.
  - Search input.
  - Tag filters.
  - Edit bookmark flow.
  - Delete confirmation or undo behavior.
  - Loading, empty, and error states.
- Render bookmark titles, hostnames, URLs, descriptions, tags, and creation dates.
- Open external bookmark links with `target="_blank"` and `rel="noopener noreferrer"`.
- Keep all bookmark content as plain text.

Validation:

- Typecheck and production build.
- Manual keyboard navigation pass.
- Manual mobile and desktop layout pass.
- Verify API errors surface visibly in the UI.

## Phase 3: Browser Extension

Deliverables:

- Create a Manifest V3 extension.
- Add a toolbar popup that reads the active tab title and URL.
- Add optional tags and description fields.
- Add save, loading, success, and error feedback.
- Add an options page for API URL and API password/token.
- Store settings with `chrome.storage.local`.
- Normalize API URL before use.
- Request only necessary permissions, expected to be `activeTab` and `storage`.
- Avoid embedding production secrets in extension source.

Validation:

- Load unpacked extension in Chromium.
- Save the current tab to local Worker API.
- Save the current tab to deployed Worker API after production setup.
- Confirm the password/token is not logged or committed.

## Phase 4: Hardening and Deployment

Deliverables:

- Review auth, CORS, validation, and error handling.
- Confirm all SQL uses prepared statements with bound parameters.
- Confirm API responses use camelCase.
- Confirm server errors do not expose stack traces, SQL, or secrets.
- Improve README with final Cloudflare, D1, secret, and extension installation steps.
- Add a deployment checklist.

Validation:

- `npm run typecheck`
- `npm run test`
- `npm run build`
- Local D1 migration apply.
- Remote D1 migration apply only after explicit confirmation.
- `npm run deploy` after Cloudflare values and secrets are configured.

## Deployment Plan

Local setup:

```bash
npm install
npx wrangler d1 migrations apply bookmark-manager --local
npm run dev
```

Cloudflare setup:

```bash
npx wrangler login
npx wrangler d1 create bookmark-manager
npx wrangler d1 migrations apply bookmark-manager --remote
npx wrangler secret put EXTENSION_API_TOKEN
npm run deploy
```

Do not run remote migration or deployment commands until the D1 database ID, intended Cloudflare account, and production password/token are known.

## Definition of Done

The initial version is complete when:

- Bookmarks can be created from the web app.
- The browser extension can save the current tab.
- Bookmarks can be listed, searched, filtered by tag, edited, and deleted.
- Duplicate normalized URLs update the existing bookmark.
- Bookmark API routes require bearer-token authentication.
- Input is validated on the server.
- D1 migrations are documented and repeatable.
- TypeScript, tests, and production build pass.
- README documents setup, deployment, extension installation, and known limitations.
- No secrets, credentials, build output, extension packages, or local Wrangler state are committed.

## Known Risks and Open Questions

- The deployed app origin and extension origin need to be finalized for the CORS allowlist.
- The D1 `database_id` must be supplied after Cloudflare creates the database.
- The production password/token must be created and stored as a Worker secret.
- Browser extension host permissions may need adjustment after the deployed API hostname is known.
- Local testing strategy should be confirmed after dependencies are installed; prefer Cloudflare-compatible Worker tests where practical.

## Explicit Non-Goals for Version 1

- Public user registration.
- Social login.
- Teams or shared collections.
- Billing or subscriptions.
- AI tagging or summaries.
- Bookmark screenshots or thumbnails.
- Web crawling or automatic metadata extraction.
- Full browser-history synchronization.
- Native mobile apps.
- Real-time collaboration.
- Separate backend server.
- Docker or Kubernetes deployment.
- Complex role-based access control.
