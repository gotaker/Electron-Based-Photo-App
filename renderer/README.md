# PhotoVault — Modern Photo Management Desktop App

A macOS-inspired photo management application built with Electron, featuring an Apple Photos–style interface with a complete SF Symbols icon system, smart utility views, and a full-featured toolbar.

---

## Features

### Interface
- **Apple Photos–style UI** — clean white sidebar, frosted-glass top bar, light gray gallery background (#F5F5F7)
- **SF Symbols icon system** — 40+ hand-drawn SVG symbols embedded as a sprite, matching Apple's stroke weight (1.65px), round linecaps, and geometry throughout every surface
- **Adaptive top bar** with three zones:
  - *Left:* view title + live date-range subtitle computed from visible photos
  - *Center:* ± zoom controls (7 steps, 80–420px) + Years / Months / All Photos segmented pill
  - *Right:* tool buttons (Slideshow, Metadata, More ⋯, Info, Share, Favorite, Duplicate, Search, Import)

### Library Views
- **All Photos** — full grid of every non-deleted photo
- **People** — photos with detected faces
- **Favorites** — heart-starred photos
- **Timeline** — reverse-chronological with month headings, uses EXIF capture dates when available

### Utility Views
| View | Behaviour |
|------|-----------|
| Recently Deleted | Soft-delete with 30-day countdown badge; Restore / Delete Permanently bulk actions |
| Duplicates | Auto-detects photos sharing the same filename |
| Receipts | Matches by filename keyword or `receipt` tag |
| Handwriting | Matches by filename keyword or `handwriting` tag |
| Illustrations | Matches by filename keyword or `illustration` tag |
| Recently Saved | Photos added in the last 30 days |
| Recently Viewed | Session-tracked — photos opened in the viewer |
| Recently Edited | Photos where edits have been saved |
| Recently Shared | Photos exported this session |
| Documents | Matches by filename keyword or `document` tag |
| Imports | The most recently imported batch |
| Map | Photos with GPS coordinates (ready for location data) |

### Gallery Modes
- **Zoom** — ± buttons resize grid columns from 80 px to 420 px via CSS variable
- **Years** — one large clickable heading per year with a photo preview strip; clicking drills into Months
- **Months** — photos grouped under month/year headings
- **All Photos** — standard auto-fill grid
- **List view** — compact rows with thumbnail, name, and date
- **Metadata overlay** — toggle filename/date captions on every card

### Toolbar Actions
- **Slideshow** — full-screen auto-advancing show (3.5 s interval), dot progress, spacebar play/pause, arrow key navigation, Escape to exit
- **Info panel** — slides in from the right showing thumbnail, filename, capture date, camera make/model, file size, face count, favorite status, and last-edited time; refreshes on selection change
- **Search** — inline search bar slides in below the top bar (Cmd/Ctrl+F); filters by name, date, or tags
- **Share** — exports selected photo(s) and records them in Recently Shared
- **Favorite** — toggles on selection; heart icon fills/unfills to reflect state
- **Duplicate** — copies selected photo(s) with " copy" suffix; appears in Imports view
- **More ⋯** — dropdown with Select All, Deselect All, Grid/List toggle, Import Photos

### Photo Editing
- 8 filters: Original, B&W, Sepia, Vintage, Warm, Cool, Vivid, Dramatic
- Brightness, Contrast, Saturation, and Blur sliders
- Rotate left/right, Flip horizontal/vertical
- Edits are persisted to disk via Sharp (JPEG/PNG/WebP); sets `editedAt` timestamp

### Photo Management
- Import from local files — copies to organised `PhotoVault/photos/YYYY-MM/` storage
- Thumbnails generated at 400×400 via Sharp for fast gallery loading
- EXIF date extraction on import (capture date used for timeline and date range)
- Optional Azure Face API face count on import
- Soft delete → Recently Deleted → permanent deletion after 30 days
- Albums — create, rename, delete; assign photos via bottom toolbar
- Favorites toggle in viewer and toolbar
- Export photo to any location

### Selection & Bulk Actions
- Click selection circle (appears on hover) to multi-select
- Cmd/Ctrl+A to select all visible photos
- Escape to deselect
- Bottom floating toolbar springs up with count + context-sensitive actions (changes for Recently Deleted)

### Cloud Sync (optional)
- Set `AZURE_STORAGE_CONNECTION_STRING` to enable upload to Azure Blob Storage
- Set `AZURE_FACE_ENDPOINT` + `AZURE_FACE_KEY` for real face-count detection on import

---

## Quick Start

```bash
cd photovault-app
npm install
npm start
```

On first launch you will be prompted to choose a storage location for your photos.

### Build installers

```bash
npm run build:win    # Windows (.exe)
npm run build:mac    # macOS (.dmg)
npm run build:linux  # Linux (.AppImage)
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ← / → | Previous / next photo in viewer |
| F | Toggle favorite in viewer |
| Cmd/Ctrl+A | Select all visible photos |
| Cmd/Ctrl+F | Open search bar |
| Delete | Move selected to Recently Deleted |
| Escape | Close viewer / deselect all / close slideshow |
| Space | Play/pause slideshow |
| ← / → | Previous / next in slideshow |

---

## Project Structure

```
photovault-app/
├── main.mjs                  # Electron main process
├── preload.js                # IPC bridge
├── renderer/
│   ├── index.html            # UI — SVG sprite + layout
│   ├── styles.css            # All styles (CSS variables, toolbar, panels)
│   └── app.js                # Application logic (88 functions)
├── services/
│   └── azureSync.mjs         # Optional Azure Blob + Face API
├── lib/
│   └── stringUtils.cjs       # escapeHtml / escapeJsString helpers
├── tests/
│   └── unit/                 # Jest unit tests
├── e2e/
│   └── smoke.spec.js         # Playwright smoke test
├── Dockerfile
├── docker-compose.yml
├── deploy-azure.sh
└── AZURE_DEPLOYMENT_GUIDE.md
```

---

## Storage

Photos are stored on disk, not in a database:

```
[Chosen Location]/
└── PhotoVault/
    ├── photos/
    │   └── YYYY-MM/          ← full-resolution originals
    └── thumbnails/           ← 400×400 JPEG previews
```

Metadata (names, dates, tags, favorites, etc.) is stored in `electron-store` (a small JSON file in the app's data directory).

---

## Azure Deployment

See `AZURE_DEPLOYMENT_GUIDE.md` for full instructions. Three options:

- **Azure App Service** — easiest, ~$13–55/month
- **Azure Container Instances** — containerised, ~$10–30/month
- **GitHub Actions CI/CD** — push to `main` to auto-deploy

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 40 |
| Storage | electron-store 10 |
| Image processing | Sharp 0.34 |
| EXIF reading | exifr 7 |
| Cloud storage | @azure/storage-blob 12 |
| Icons | Hand-drawn SVG sprite (SF Symbols–style) |
| Tests | Jest + Playwright |
| CI/CD | GitHub Actions |

---

## License

MIT — see `LICENSE` for details.
