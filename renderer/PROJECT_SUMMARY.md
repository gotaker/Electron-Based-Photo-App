# PhotoVault — Project Summary

## What is PhotoVault?

PhotoVault is a cross-platform desktop photo management application built with Electron. It is inspired by Apple's Photos app and designed to run natively on Windows, macOS, and Linux, with optional cloud deployment to Microsoft Azure.

---

## Architecture

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 40 (ES modules) |
| Renderer | Vanilla HTML/CSS/JS — no framework |
| Persistence | electron-store 10 (JSON + file system) |
| Image processing | Sharp 0.34 (thumbnails, edits, EXIF rotation) |
| EXIF metadata | exifr 7 |
| Cloud sync | @azure/storage-blob 12 (optional) |
| Face detection | Azure Face API REST (optional) |
| Icons | Inline SVG sprite — 40+ SF Symbols–style paths |
| Tests | Jest (unit) + Playwright (e2e smoke) |
| CI/CD | GitHub Actions → Azure App Service / ACI |

### Process Model

```
main.mjs  (Node.js / Electron main)
  ├── IPC handlers for all file, photo, album, storage operations
  ├── Sharp pipeline for thumbnails and persisted edits
  ├── exifr for capture date + camera metadata on import
  └── azureSync.mjs — optional Blob upload + Face API

preload.js  (context bridge)
  └── Exposes window.electronAPI to the renderer

renderer/  (Chromium — no Node access)
  ├── index.html  — SVG sprite + full layout
  ├── styles.css  — CSS variables, all components
  └── app.js      — 88 functions, ~1200 lines
```

---

## UI Design

### Visual Language
- **Apple Photos aesthetic** — white sidebar, `#F5F5F7` main background, `#007AFF` accent, `-apple-system` font stack
- **SF Symbols–style icons** — 40+ symbols drawn as `<symbol>` SVG paths at `viewBox="0 0 24 24"`, `stroke-width: 1.65`, round linecaps/joins. Used via `<use href="#ic-name">` throughout
- **CSS variables** drive colour, spacing, and the zoom grid column size (`--grid-col-size`)
- **Glassmorphism** for modals, bottom toolbar, and the photo viewer toolbar

### Top Bar (three zones)
```
[Title + date range] | [Zoom ±] [Years|Months|All Photos] | [Tools] [Import +]
```
- **Left** — view title + live date-range subtitle (earliest → latest photo in current view)
- **Center** — ± zoom (7 steps: 80–420 px) + granularity segmented pill
- **Right** — Slideshow, Metadata toggle, More ⋯, Info panel, Share, Favorite, Duplicate, Search toggle, Import

---

## Feature Set

### Core Library
- Import photos from local disk — copied into `PhotoVault/photos/YYYY-MM/` with SHA-hex filenames
- Thumbnails generated at 400×400 px via Sharp
- EXIF capture date extracted on import; used for timeline and date-range display
- Soft delete with 30-day grace period; auto-purge on launch

### Views
| Category | Views |
|----------|-------|
| Library | All Photos, People, Favorites, Timeline |
| Albums | User-created, with photo assignment |
| Utilities | Recently Deleted, Duplicates, Receipts, Handwriting, Illustrations, Recently Saved, Recently Viewed, Recently Edited, Recently Shared, Documents, Imports, Map |

### Gallery Modes
- **Years** — grouped by year with clickable headings that drill into Months
- **Months** — grouped by month/year headings
- **All Photos** — standard auto-fill grid
- **List** — compact rows
- **Zoom** — ± buttons adjust column width from 80 px to 420 px
- **Metadata overlay** — toggleable filename/date captions on every card

### Toolbar Features
| Button | Behaviour |
|--------|-----------|
| Slideshow | Full-screen auto-advance (3.5 s), dot progress, play/pause, keyboard nav |
| Metadata | Toggles gradient overlay with name + date on every grid card |
| More ⋯ | Dropdown: Select All, Deselect All, Grid/List view, Import |
| Info | Slide-in panel: thumbnail, filename, capture date, camera, file size, faces, edited timestamp |
| Share | Exports selected photo(s); tracks in Recently Shared |
| Favorite ♥ | Toggles favorite on selection; icon fills to reflect state |
| Duplicate | Creates a copy with " copy" suffix; appears in Imports |
| Search 🔍 | Slides in inline search bar (Cmd/Ctrl+F); filters name, date, tags |

### Photo Editing
- 8 filters (B&W, Sepia, Vintage, Warm, Cool, Vivid, Dramatic, Original)
- Brightness, Contrast, Saturation, Blur sliders
- Rotate ±90°, Flip horizontal/vertical
- Edits persisted to source file via Sharp; sets `editedAt` field

### Selection Model
- Hover → selection circle appears (top-left of card)
- Multi-select; Cmd/Ctrl+A selects all visible
- Escape clears selection
- Bottom floating toolbar springs up with count and context-sensitive actions
- In Recently Deleted: toolbar shows Restore + Delete Permanently instead of standard actions

---

## Data Model

### Photo record (stored in electron-store)
```js
{
  id:            string,   // 32-char hex (crypto.randomBytes)
  name:          string,   // original filename
  storagePath:   string,   // absolute path to full-res copy
  relativePath:  string,   // YYYY-MM/id.ext
  thumbnailPath: string,   // absolute path to 400×400 thumbnail
  originalPath:  string,   // source path at import time
  date:          string,   // display date string
  dateAdded:     ISO8601,
  captureDateISO:ISO8601 | null,
  cameraMake:    string | null,
  cameraModel:   string | null,
  favorite:      boolean,
  faces:         number,
  album:         number | null,  // album.id
  tags:          string[],
  fileSize:      number,   // bytes
  deleted:       boolean,
  deletedAt:     ISO8601 | null,
  editedAt:      ISO8601 | null
}
```

### Session-only state (cleared on restart)
- `recentlyViewedIds` — photos opened in the viewer
- `recentlySharedIds` — photos exported
- `lastImportBatch`   — IDs from the most recent import dialog

---

## Storage Layout

```
[User-chosen folder]/
└── PhotoVault/
    ├── photos/
    │   └── 2026-03/
    │       └── f4a8b2c1….jpg   ← full-resolution original
    └── thumbnails/
        └── f4a8b2c1….jpg       ← 400×400 JPEG
```

App config and metadata: `%APPDATA%\photovault-app\` (Windows) · `~/Library/Application Support/photovault-app/` (macOS) · `~/.config/photovault-app/` (Linux)

---

## Cloud (Optional)

| Feature | Env var(s) | Behaviour |
|---------|-----------|-----------|
| Azure Blob sync | `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER` | Uploads all local photos to Blob; local is canonical (last-upload-wins) |
| Azure Face API | `AZURE_FACE_ENDPOINT`, `AZURE_FACE_KEY` | Replaces random face counts with real detection on import |

---

## Known Limitations

- Face detection shows random counts unless Azure Face API env vars are set
- Editing supported for JPEG, PNG, WebP only (not RAW, GIF, BMP)
- Map view is ready for GPS data; requires `latitude`/`longitude` fields on photo records
- No video support
- Cloud sync is upload-only (no download/merge from cloud)

---

## Roadmap

### Done ✅
- Full Apple Photos–style UI (sidebar, top bar, gallery, modals)
- SF Symbols icon system (40+ SVG symbols)
- 16 library/utility views with smart filtering
- Zoom + Years/Months/All Photos granularity
- Slideshow, Info panel, Metadata overlay, Search, Share, Favorite, Duplicate
- Soft delete with 30-day trash
- Photo editing with Sharp persistence
- Azure Blob sync + Face API (optional, env-configured)
- Timeline with EXIF dates
- GitHub Actions CI/CD

### Planned
- Crop and resize tools
- RAW format support
- Video support
- Map view with real GPS pins
- Duplicate merging
- Batch tag editor
- Mobile companion app
- Collaborative albums

---

## Cost Estimates (Azure)

| Environment | Monthly estimate |
|-------------|-----------------|
| Dev/testing (B1 App Service + Basic Storage) | ~$14 |
| Production low-traffic (S1 + Standard Storage + CDN) | ~$62 |
| Production high-traffic (P1V2 + Storage + CDN + Face API) | ~$195 |

---

## License

MIT — see `LICENSE`.
