# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Description

PhotoVault is a desktop Electron application for importing, organizing, viewing, and editing photos locally with optional cloud sync integrations (Google Photos, Apple Photos, Azure). It focuses on simple, reliable local storage (no database), fast thumbnail generation, an in-browser editor (sharp-based image pipeline), albums and collections, and a small, framework-free renderer that uses direct DOM manipulation.

## Tech Stack

- **Framework:** Electron (renderer uses no frontend framework; direct DOM manipulation)
- **Programming language:** JavaScript (Node.js/Electron, ES modules "type": "module")
- **Styling system:** Plain CSS (renderer/styles.css)
- **Component library:** None — small, custom DOM-based components
- **State management / persistence:** In-memory arrays with `electron-store` for persistent state
- **Image processing & metadata:** `sharp` (image edits), `exifr` (EXIF parsing)
- **Cloud / backend integrations:** `@azure/storage-blob` for Azure uploads; Google Photos & Apple Photos sync adapters (optional)
- **Testing frameworks:** `jest` for unit tests, `@playwright/test` for end-to-end tests
- **Build tooling / packaging:** `electron-builder` (npm scripts: `build`, `build:mac`, `build:win`, `build:linux`)

## Coding Conventions

- **Naming:** Use `camelCase` for variables and functions, `PascalCase` for classes/components, `kebab-case` for filenames and CSS classes, and `UPPER_SNAKE_CASE` for global constants.
- **Component patterns:** Keep DOM-based components small and focused. Prefer a single responsibility per component with clear `init`/`render`/`update` responsibilities. Export a minimal public API from each component file.
- **Typing standards:** This repo is JavaScript; prefer explicit value checks and JSDoc for exported functions. When migrating files, adopt TypeScript incrementally and prefer explicit `null`/`undefined` handling.
- **File size / layout:** Aim to keep files concise (~<400–600 LOC). Split large modules into helpers and keep one component per file.
- **Import conventions:** Group imports in this order with a blank line between groups: Node built-ins, external packages, internal modules. Prefer named imports; use relative paths within the project.
- **Error handling:** Follow the IPC pattern: return `{ success: boolean, ... }` from handlers. Catch and log errors with contextual messages, sanitize user-facing errors, and avoid uncaught exceptions in main and renderer.
- **Comments:** Explain *why* (not *what*). Use JSDoc for public APIs and brief inline comments for non-obvious logic. Keep comments up to date.
- **Async patterns:** Prefer `async/await` for readability. Centralize concurrency control for bulk operations (throttling/queues), avoid unbounded `Promise.all`, and implement timeouts/cancellation where appropriate.

## UI & Design System

- **Visual language:** Maintain a consistent visual language (spacing, typography, color scale). Use a restrained palette and clearly documented tokens for primary/secondary/neutral colors and elevations.
- **Design tokens:** Define CSS variables for colors, spacing, typography, and radii in `renderer/styles.css` and reuse them across components (e.g. `--pv-color-primary`, `--pv-spacing-sm`).
- **Components:** Build small, reusable DOM components (buttons, dialogs, lists, thumbnails) with a single responsibility and well-defined public APIs. Keep styling colocated but minimal.
- **Accessibility:** Ensure keyboard navigability, proper ARIA roles, focus outlines, and text contrast that meets WCAG AA. Provide alt text for images and accessible names for interactive controls.
- **Responsive behavior:** Gallery and grid layouts must adapt to available width; thumbnails should reflow and support pinch/zoom gestures on touch devices where applicable.
- **Icons & imagery:** Use a single icon set and consistent sizing. Prefer SVGs for crisp scaling; name assets clearly (e.g., `icon-archive.svg`, `thumb-400.jpg`).
- **Motion:** Use subtle, performant animations for state changes (transitions under 200ms). Avoid motion that causes layout thrashing or harms accessibility; respect `prefers-reduced-motion`.
- **Theming & dark mode:** Support a dark theme via CSS variables; keep color tokens semantically named (e.g., `--pv-bg`, `--pv-text`) so swapping themes is straightforward.
- **Performance:** Lazy-load large images, generate thumbnails at import, and avoid heavy paint/layout in animations. Optimize critical rendering paths for the gallery view.
- **Localization:** Keep UI strings centralized for easy translation and avoid hard-coded strings in templates.

## Testing & Quality

- **Unit tests:** Use `jest` for unit tests (tests/unit/). Keep unit tests fast, isolated, and deterministic. Mock filesystem and network I/O; avoid hitting cloud APIs in unit tests.
- **End-to-end tests:** Use `@playwright/test` for E2E coverage (e2e/). Reserve E2E for critical flows: import, thumbnail generation, editor pipeline, and sync workflows.
- **Test commands:** `npm test` (unit), `npm run test:e2e` (E2E). Run tests locally before PRs.
- **Coverage & targets:** Aim for high coverage on core modules (>=85% for critical paths). Require tests for new features and bug fixes that affect behaviour.
- **CI & gating:** CI must run unit + E2E (smoke) + lint/format checks on PRs. Do not merge until CI passes and code review approves.
- **Linting & formatting:** Add/maintain ESLint and Prettier in CI to enforce consistent style and catch common errors.
- **Quality bar:** No failing tests, no high-severity vulnerabilities, accessibility checks for UI changes, and measurable performance regressions must be reviewed.
- **Test data & fixtures:** Keep small, versioned fixtures in `tests/fixtures/`. Use deterministic seeds for any randomness.
- **Flakiness & reliability:** Track flaky tests and quarantine until fixed. Prefer explicit waits and robust selectors in E2E.

## Definition of Done

- **CI green:** All CI checks pass (unit tests, E2E smoke, lint/format). No failing checks on the PR.
- **Tests added/updated:** New features and bug fixes include unit tests; critical flows covered by E2E where appropriate.
- **No regressions:** Existing tests pass and no new warnings/errors introduced.
- **Accessibility:** UI changes include accessibility review or automated a11y checks; critical issues fixed before merge.
- **Performance:** No measurable performance regressions in critical paths (gallery load, thumbnail generation).
- **Docs updated:** Relevant docs updated (`README.md`, `CLAUDE.md`, or inline JSDoc) and PR description documents behavior.
- **Code review:** At least one approving review from a project maintainer and any requested changes addressed.
- **Security:** No new high-severity vulnerabilities; dependency changes reviewed.
- **Release/Version:** If applicable, version bump or changelog entries added.
## Safe-change Rules

- **Small, focused PRs:** Keep changes minimal and focused on a single purpose. Large refactors should be split into multiple PRs.
- **Feature flags:** Gate risky or rolling features behind feature flags/toggles so they can be disabled quickly in production.
- **Data safety first:** For destructive photo operations (edits, deletes, bulk changes), require explicit confirmations and keep backups/snapshots where reasonable. Use the atomic edit pattern (temp file + rename) for file-write operations.
- **CI & smoke tests:** All PRs must pass CI; for risky changes include a smoke test that exercises the critical path (app launch, thumbnail generation, open editor).
- **Canary / staged rollouts:** Release high-risk changes to a small subset of users or channels first (canary build), monitor for issues, then roll out broadly.
- **Revert plan:** Every risky change must include a clear revert procedure in the PR description (tag, rollback steps, and expected impact).
- **Monitoring & telemetry:** Add error telemetry and performance metrics for new features so regressions are detected quickly.
- **Manual QA & acceptance:** Document manual QA steps and acceptance criteria in the PR for UI or UX changes (visual checks, keyboard navigation, accessibility assertions).
- **Dependency changes:** Review dependency upgrades for security/behavioral impacts and run full test suites; prefer patch/minor upgrades and audit changes.
- **Database/migration safety:** Although this app uses file-backed state, any migration-like change must be reversible and tested on a copy of real data.
- **Communication:** Document breaking changes in the changelog and call out migration or backup requirements in the PR description and release notes.

- **Do not rename public API routes** unless explicitly requested; preserve existing route contracts and document breaking changes.
- **Do not change database schema** without calling it out clearly in the PR description and providing a migration/rollback plan.
- **Do not modify auth flows** unless the task explicitly requires it; such changes must include security review and test plans.
- **Preserve backward compatibility** for shared components and public APIs; deprecate before removing and provide migration guidance.
- **Flag major architectural changes** before implementing them — discuss design, trade-offs, and rollout plan with maintainers.


## Commands

```bash
npm start              # Run app in development
npm test               # Jest unit tests (tests/unit/**/*.test.js)
npm run test:e2e       # Playwright E2E tests (e2e/)
npm run build:mac      # macOS build (.dmg, arm64 + x64)
npm run build:win      # Windows build (NSIS, x64)
npm run build:linux    # Linux build (AppImage + deb)
```

## Architecture

### Process Structure

```
main.mjs (Main Process)
  └── 25+ ipcMain.handle() handlers: photo/album CRUD, file I/O, cloud sync
  └── Two electron-store instances:
        photovault-app  → photos[], albums[], storageLocation
        photovault-sync → Google/Apple OAuth tokens, sync config
        (stored at ~/Library/Application Support/photovault-app/ on macOS)

preload.js (Context Bridge)
  └── Exposes window.electronAPI (36 methods)
  └── contextIsolation: true, nodeIntegration: false

renderer/app.js (Renderer Process)
  └── In-memory state: photos[], albums[], currentView, selectedPhotos, editor vars
  └── 15+ views: all, timeline, favorites, recently-deleted, duplicates, albumId, etc.
  └── Gallery grid, photo editor, sync state machine — all vanilla JS DOM
```

### IPC Pattern

All IPC is request-response. Every handler returns `{ success: boolean, ...data }` or `{ success: false, error: string }`.

```js
// Renderer
const result = await window.electronAPI.updatePhoto(id, changes);

// Main
ipcMain.handle('update-photo', async (_, id, changes) => {
  try { /* ... */ return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});
```

### Key Design Decisions

- **No database**: all state is flat JSON arrays in electron-store. `photos[]` holds all records including soft-deleted ones (`deleted: true, deletedAt`). Auto-purge runs after 30 days.
- **Destructive photo edits**: Sharp pipeline (brightness, contrast, saturation, blur, rotation, flip, filters) overwrites the original file atomically via a temp file + `fs.renameSync`.
- **Thumbnails**: generated at import time as 400×400 JPEG in `PhotoVault/thumbnails/`. `get-photos` returns them as base64; `get-full-photo` returns the full image as a base64 data URI.
- **Cloud sync**: Google Photos uses OAuth 2.0 PKCE with a local HTTP server to capture the redirect. Apple Photos uses `osxphotos` CLI or AppleScript (macOS only). Azure Blob upload is separate and environment-configured.
- **XSS prevention**: all user-derived strings rendered into HTML go through `escapeHtml()` / `escapeJs()` from `lib/stringUtils.cjs`.

### IPC Handler Groups

| Group | Handlers |
|-------|----------|
| Photos | get-photos, get-full-photo, save-photo, update-photo, delete-photo, delete-photos, apply-photo-edits, export-photo |
| Albums | get-albums, save-album, update-album, delete-album |
| Files | open-file-dialog, get-storage-info, change-storage-location, clear-all-data |
| Google Photos | sync-google-auth, sync-google-photo-count, sync-google-list, sync-google-download, sync-google-upload |
| Apple Photos | sync-apple-connect, sync-apple-run |
| Azure | sync-azure-blob, get-azure-sync-status |
| Sync Config | get-sync-config, save-sync-config |

### Optional Environment Variables

```
AZURE_STORAGE_CONNECTION_STRING
AZURE_STORAGE_CONTAINER        # default: 'photovault'
AZURE_FACE_ENDPOINT            # enables face counting on import
AZURE_FACE_KEY
```
