# Changelog

## 1.0.0 - 2026-07-25

Initial personal-release version of Bookmark Manager.

### Added

- Cloudflare Worker API with D1-backed bookmark storage.
- Password-protected bookmark API using a shared bearer token.
- Bookmark create, read, update, delete, search, exact tag filtering, pagination parameters, and duplicate URL upsert behavior.
- JSON export and duplicate-safe JSON import for backups.
- React web app served by the Worker.
- Browser login flow that stores the API password locally.
- Default-dark web UI with a saved light/dark toggle.
- Collapsed Search and Add panels.
- Compact bookmark rows with copy URL, expand/collapse, edit, and delete actions.
- Mobile layout with header actions behind a settings menu.
- Firefox desktop extension with popup save flow and settings page.
- Extension packaging script and local release zip workflow.
- Server-side validation for URLs, text fields, tags, request size, bookmark IDs, import payloads, and list parameters.
- Vitest coverage for API behavior, auth, CORS, validation, pagination, tag filtering, export, and import.
- Production deployment at `https://bookmarks.radarapp.us`.

### Known Follow-Ups

- Update Wrangler from v3 to v4 and re-verify deployment.
- Add pagination or load-more UI once the bookmark count grows beyond the current 100-item web load.
- Add tag management tools for rename, delete, and merge workflows.
- Consider a signed/self-distributed Firefox extension path if temporary installs become annoying.
