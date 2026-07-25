# AGENTS.md

## Project Overview

This project is a simple, self-hosted bookmark manager built on Cloudflare.

It includes:

* A web application for viewing, searching, organizing, editing, and deleting bookmarks
* A REST API hosted by a Cloudflare Worker
* A browser extension that can save the current page through the API
* A Cloudflare D1 database for persistent storage
* A React and Vite frontend served by the same Worker

The initial version is intended primarily as a personal application. Avoid unnecessary multi-user complexity unless it is explicitly requested.

## Primary Goals

Build a small, maintainable bookmark manager with the following core features:

1. Save a bookmark from the web app
2. Save the current browser tab from a browser extension
3. View bookmarks in reverse chronological order
4. Search bookmarks
5. Add and filter by tags
6. Edit bookmark details
7. Delete bookmarks
8. Prevent or gracefully handle duplicate URLs
9. Protect API write operations with authentication
10. Deploy the full application to Cloudflare Workers

Prefer simple, understandable implementations over abstract or enterprise-style architecture.

## Technology Stack

Use the following stack unless a change is explicitly requested:

* TypeScript
* Cloudflare Workers
* Cloudflare D1
* React
* Vite
* Wrangler
* Standard Fetch API
* Browser Extension Manifest V3
* Plain CSS or CSS modules

Avoid adding large frameworks or dependencies when native platform features are sufficient.

Do not introduce a separate Node.js server, PHP backend, Docker container, or external database.

## Suggested Project Structure

```text
bookmark-manager/
├── src/
│   ├── worker/
│   │   ├── index.ts
│   │   ├── router.ts
│   │   ├── auth.ts
│   │   ├── validation.ts
│   │   └── routes/
│   │       └── bookmarks.ts
│   └── web/
│       ├── App.tsx
│       ├── main.tsx
│       ├── api.ts
│       ├── types.ts
│       ├── components/
│       └── styles/
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.ts
│   ├── popup.css
│   ├── options.html
│   ├── options.ts
│   └── icons/
├── migrations/
│   └── 0001_create_bookmarks.sql
├── public/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── wrangler.jsonc
├── README.md
└── AGENTS.md
```

The exact structure may be adjusted when there is a clear benefit, but keep the Worker, web frontend, browser extension, and database migrations logically separated.

## Initial Data Model

Start with a single `bookmarks` table.

```sql
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    normalized_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookmarks_created_at
ON bookmarks(created_at DESC);

CREATE INDEX idx_bookmarks_title
ON bookmarks(title);
```

Store tags as a JSON array in the initial version.

Example:

```json
["development", "cloudflare"]
```

Do not create separate tag tables unless the application requirements become complex enough to justify them.

## URL Handling

Bookmarks should retain the submitted URL while also storing a normalized form for duplicate detection.

Normalization should be conservative.

Appropriate normalization includes:

* Lowercase the hostname
* Remove a trailing slash from the root path
* Remove the URL fragment
* Remove default ports such as `:80` and `:443`

Do not automatically remove arbitrary query parameters because they may be meaningful.

Only allow:

* `http:`
* `https:`

Reject invalid URLs and unsupported protocols.

## API Design

Use JSON for all API request and response bodies.

Initial endpoints:

```text
GET    /api/bookmarks
GET    /api/bookmarks/:id
POST   /api/bookmarks
PATCH  /api/bookmarks/:id
DELETE /api/bookmarks/:id
```

Supported list parameters should include:

```text
GET /api/bookmarks?search=cloudflare
GET /api/bookmarks?tag=development
GET /api/bookmarks?limit=50
GET /api/bookmarks?offset=0
```

A combined query may also be supported:

```text
GET /api/bookmarks?search=worker&tag=development
```

Use sensible limits.

Recommended defaults:

* Default limit: `50`
* Maximum limit: `100`

## API Response Format

Successful single-bookmark response:

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
    "message": "A valid HTTP or HTTPS URL is required."
  }
}
```

Use consistent camelCase field names in API responses, even if the database uses snake_case.

## HTTP Status Codes

Use appropriate HTTP status codes:

* `200` for successful reads and updates
* `201` for successful creation
* `204` for successful deletion with no response body
* `400` for invalid input
* `401` for missing or invalid authentication
* `404` when a bookmark does not exist
* `409` for duplicate conflicts when an upsert is not appropriate
* `500` for unexpected server errors

Do not expose stack traces, SQL statements, secrets, or internal implementation details in API responses.

## Duplicate Behavior

For the initial version, saving an existing normalized URL should update the existing bookmark rather than create a duplicate.

The API may return:

```json
{
  "bookmark": {},
  "created": false
}
```

For a new bookmark:

```json
{
  "bookmark": {},
  "created": true
}
```

Preserve the original `created_at` value when updating a duplicate.

## Authentication

The first version is a personal application.

Protect all mutating API routes with a bearer token:

```http
Authorization: Bearer YOUR_TOKEN
```

Protected routes:

* `POST`
* `PATCH`
* `DELETE`

The project may also protect read endpoints if configured as a private bookmark collection.

Store the production token as a Worker secret:

```bash
npx wrangler secret put EXTENSION_API_TOKEN
```

Never commit secrets to:

* Git
* `wrangler.jsonc`
* `.env` files intended for source control
* Browser extension source code
* Frontend source code

For local development, use `.dev.vars`.

Example:

```text
EXTENSION_API_TOKEN=local-development-token
```

Ensure `.dev.vars` is ignored by Git.

The browser extension may store a user-provided token using the browser storage API. This is acceptable for the initial personal-use version.

Do not embed a shared production token in a publicly distributed extension.

## CORS

The browser extension must be able to call the API.

Handle CORS intentionally rather than returning unrestricted headers everywhere.

Support:

* The deployed web application origin
* The browser extension origin when necessary
* Local development origins

Respond to `OPTIONS` preflight requests.

Do not use `Access-Control-Allow-Origin: *` together with credentials.

For bearer-token requests without cookies, a restricted origin allowlist is preferred.

## Worker Environment

Define Worker bindings with a typed environment interface.

Example:

```ts
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EXTENSION_API_TOKEN: string;
  ALLOWED_ORIGINS?: string;
}
```

Use `env` bindings for configuration and secrets.

Do not access Node.js environment variables through `process.env` in Worker runtime code.

## Wrangler Configuration

Use `wrangler.jsonc`.

Expected configuration shape:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "bookmark-manager",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-07-25",

  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "bookmark-manager",
      "database_id": "REPLACE_WITH_DATABASE_ID"
    }
  ]
}
```

Do not fabricate a Cloudflare account ID or D1 database ID.

Use visible placeholders when configuration values must be supplied by the developer.

## Static Assets and Routing

The Worker should handle `/api/*` routes.

The React application should handle normal web routes.

Expected routing behavior:

```text
/api/*        → Worker API
/assets/*     → Static frontend assets
everything else → React application entry point
```

Do not allow the SPA fallback to convert unknown `/api/*` requests into HTML responses.

Unknown API routes should return a JSON `404`.

## Browser Extension

Use Manifest V3.

The initial extension should include:

* A toolbar action
* A popup
* A settings/options page
* API URL configuration
* API token configuration
* Current tab title
* Current tab URL
* Optional tags
* Optional description
* Save button
* Success and error feedback

The extension should request only the permissions it needs.

Likely permissions:

```json
{
  "permissions": [
    "activeTab",
    "storage"
  ]
}
```

Use `host_permissions` for the configured API hostname when required.

Avoid broad permissions such as access to all sites unless they are genuinely necessary.

## Extension Configuration

Store extension settings using:

```ts
chrome.storage.local
```

or the compatible browser API when practical.

Settings:

```ts
interface ExtensionSettings {
  apiUrl: string;
  apiToken: string;
}
```

Normalize the API URL before using it:

* Trim whitespace
* Remove trailing slashes
* Require HTTPS in production
* Allow localhost HTTP during development

Never log the API token.

## Web Application

The web interface should be mobile-first.

Initial screens and features:

* Header with application name
* Search input
* Tag filters
* Add bookmark form
* Recent bookmarks list
* Edit action
* Delete action
* Loading state
* Empty state
* Error state

Bookmark cards or rows should display:

* Title
* Hostname
* URL
* Description when present
* Tags
* Creation date
* Edit and delete controls

Open bookmark links in a new tab using:

```html
target="_blank"
rel="noopener noreferrer"
```

Favor a clean text-oriented design. Bookmark images and screenshots are not required for the initial version.

## Frontend API Layer

Keep network requests in a dedicated module such as:

```text
src/web/api.ts
```

Do not scatter raw `fetch()` calls throughout React components.

The API layer should:

* Set request headers
* Parse JSON safely
* Detect non-JSON errors
* Normalize error handling
* Expose typed functions
* Support cancellation where useful

Example API functions:

```ts
getBookmarks()
createBookmark()
updateBookmark()
deleteBookmark()
```

## TypeScript Guidelines

Use strict TypeScript settings.

Avoid:

* `any`
* Unsafe type assertions
* Ignoring TypeScript errors
* Duplicating API types in multiple locations

Prefer:

* `unknown` followed by validation
* Shared interfaces for API contracts
* Small functions with clear inputs and outputs
* Explicit return types for exported functions

Do not assume that parsed JSON matches a TypeScript interface. Validate untrusted input at runtime.

## Input Validation

Validate all API input on the server.

At minimum, validate:

* URL
* Title length
* Description length
* Tag count
* Tag length
* Request body size
* Pagination parameters
* Bookmark ID

Suggested initial limits:

```text
URL:          2,048 characters
Title:        500 characters
Description:  5,000 characters
Tags:         20 maximum
Tag length:   50 characters
```

Trim tag values.

Remove empty tags.

Deduplicate tags case-insensitively while preserving a clean display value.

Do not rely only on frontend validation.

## Database Practices

Always use prepared statements and bound parameters.

Example:

```ts
env.DB.prepare(
  "SELECT * FROM bookmarks WHERE id = ?"
).bind(id);
```

Never construct SQL by directly concatenating user input.

Database schema changes must be added as migration files.

Do not silently modify an existing migration after it may have been applied. Create a new numbered migration instead.

## Search

The first version may use SQL `LIKE` queries across:

* Title
* URL
* Description
* Tags

Escape wildcard characters where necessary.

Keep the implementation simple initially.

Do not add a separate search service.

If search performance becomes inadequate, consider D1 full-text search only as a later enhancement.

## Error Handling

Use a centralized error response helper.

Example:

```ts
jsonError(
  "INVALID_URL",
  "A valid HTTP or HTTPS URL is required.",
  400
);
```

Unexpected errors should:

* Be logged without exposing secrets
* Return a generic error to the client
* Preserve enough context for debugging
* Avoid including raw database errors in responses

## Logging

Log useful operational information sparingly.

Appropriate information:

* Request method
* Route
* Response status
* Unexpected error name
* Request identifier

Do not log:

* Authorization headers
* API tokens
* Full request bodies containing sensitive information
* Secret bindings

## Testing

Add tests for important server behavior.

High-priority test cases:

* Creating a valid bookmark
* Rejecting an invalid URL
* Rejecting unsupported protocols
* Rejecting unauthorized requests
* Updating a duplicate URL
* Listing bookmarks
* Searching bookmarks
* Filtering by tag
* Updating a bookmark
* Deleting a bookmark
* Returning `404` for missing bookmarks
* Returning JSON for unknown API routes
* Handling malformed JSON

Prefer tests that verify behavior rather than implementation details.

When practical, use Cloudflare-compatible testing tools rather than mocking the entire Worker runtime manually.

## Commands

Expected development commands:

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run test
npm run deploy
```

Suggested package scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "dev:worker": "wrangler dev",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "deploy": "npm run build && wrangler deploy"
  }
}
```

Adjust scripts as needed so local frontend and Worker development work together cleanly.

Document any non-obvious development workflow in `README.md`.

## Cloudflare Setup Commands

Typical setup commands:

```bash
npm install
npx wrangler login
npx wrangler d1 create bookmark-manager
npx wrangler d1 migrations apply bookmark-manager --local
npx wrangler d1 migrations apply bookmark-manager --remote
npx wrangler secret put EXTENSION_API_TOKEN
npm run deploy
```

Do not automatically run destructive remote database commands.

Clearly distinguish between local and remote migration commands.

## Code Style

Use these general conventions:

* Two-space indentation
* Semicolons
* Double quotes in TypeScript
* Descriptive function and variable names
* Small modules
* Early returns
* Minimal nesting
* Comments that explain why, not obvious syntax

Avoid premature abstractions.

Do not create generic repositories, service containers, dependency injection systems, or elaborate class hierarchies for a small CRUD application.

Prefer functions and straightforward modules.

## Accessibility

The web app and extension popup should be keyboard accessible.

Include:

* Proper labels for form fields
* Visible focus states
* Semantic buttons
* Accessible error messages
* Sufficient color contrast
* Keyboard-operable menus and dialogs
* Confirmation or undo behavior for destructive actions

Do not rely only on color to communicate status.

## Security

Follow these rules:

* Never commit secrets
* Validate all untrusted input
* Use parameterized SQL
* Restrict CORS origins
* Authenticate mutating routes
* Use constant-time token comparison when practical
* Limit request body size
* Return safe error messages
* Avoid rendering unsanitized HTML
* Treat bookmark titles and descriptions as plain text
* Add `noopener noreferrer` to external links
* Do not fetch arbitrary bookmark URLs from the Worker without SSRF protections

Automatic metadata extraction is not part of the initial version.

If metadata extraction is added later, protect against requests to:

* Localhost
* Private IP ranges
* Link-local addresses
* Cloud metadata endpoints
* Internal hostnames
* Redirects into protected networks

## Git Practices

Keep commits focused.

Before considering a task complete:

```bash
npm run typecheck
npm run test
npm run build
```

Do not commit:

* `.dev.vars`
* API tokens
* Cloudflare credentials
* Build output unless intentionally tracked
* Extension packages
* Temporary database files
* Editor-specific files not shared by the project

Recommended `.gitignore` entries:

```gitignore
node_modules/
dist/
.dev.vars
.env
.env.*
!.env.example
.wrangler/
coverage/
*.zip
.DS_Store
```

## Documentation Expectations

Keep `README.md` updated with:

* Project purpose
* Stack
* Local setup
* Cloudflare setup
* D1 setup
* Migration commands
* Secret configuration
* Development commands
* Deployment commands
* Extension installation instructions
* API examples
* Known limitations

When behavior or setup changes, update the documentation in the same change.

## Initial Implementation Plan

Build the project in small working phases.

### Phase 1: Worker and Database

* Initialize the TypeScript Worker
* Create the D1 database binding
* Add the first migration
* Implement health-check route
* Implement bookmark CRUD routes
* Add bearer-token authentication
* Add input validation
* Test with `curl`

### Phase 2: Web Interface

* Initialize React and Vite
* Add typed API client
* Display bookmarks
* Add bookmark form
* Add editing and deletion
* Add search
* Add tag filtering
* Add responsive styling

### Phase 3: Browser Extension

* Create Manifest V3 extension
* Add settings page
* Add popup
* Read the active tab
* Submit bookmarks to the Worker
* Display success and error feedback
* Test in Chromium and Firefox when practical

### Phase 4: Hardening

* Add automated tests
* Improve validation
* Add CORS allowlist
* Add pagination
* Improve duplicate handling
* Review accessibility
* Review security
* Complete deployment documentation

Each phase should leave the application in a runnable state.

## Definition of Done

A feature is complete when:

* It works locally
* TypeScript passes without ignored errors
* Relevant tests pass
* The production build succeeds
* Errors are handled visibly
* Server input is validated
* Secrets are not exposed
* Documentation is updated
* The implementation remains understandable

## Codex Instructions

When working in this repository:

1. Read this file and the current `README.md` before making changes.
2. Inspect the existing implementation before proposing a replacement.
3. Preserve working behavior unless a change is required.
4. Make the smallest coherent change that completes the task.
5. Do not introduce dependencies without explaining the benefit.
6. Do not fabricate configuration values or credentials.
7. Use placeholders for account-specific Cloudflare values.
8. Do not run destructive remote commands without explicit approval.
9. Keep the web app, Worker API, and extension contracts synchronized.
10. Update tests and documentation when behavior changes.
11. Run type checking, tests, and builds after meaningful changes.
12. Report any commands that could not be run and explain why.
13. Clearly identify remaining manual Cloudflare dashboard or browser-extension steps.
14. Prefer a working simple solution over a partially implemented complex one.

## Out of Scope for the Initial Version

Do not implement these unless explicitly requested:

* Public user registration
* Social login
* Teams or shared bookmark collections
* Billing
* Paid subscriptions
* AI tagging
* Automatic summaries
* Screenshots or thumbnails
* Website crawling
* Full browser-history synchronization
* Native mobile applications
* Real-time collaboration
* A separate backend server
* Kubernetes or Docker deployment
* Complex role-based access control

These may be considered later, but the initial application should remain small and reliable.

