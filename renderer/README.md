# PhotoVault — Modern Photo Management Desktop App

A macOS-inspired photo management application built with Electron, featuring an Apple Photos–style interface with a complete SF Symbols icon system, smart utility views, a full-featured toolbar, and **bidirectional sync with Google Photos and Apple Photos**.

---

## Features

### Interface
- **Apple Photos–style UI** — white sidebar, frosted-glass top bar, `#F5F5F7` gallery background
- **SF Symbols icon system** — 40+ hand-drawn SVG symbols embedded as an inline sprite
- **Adaptive top bar** — title/date-range left, zoom+granularity center, tools right

### Library & Utility Views
| Category | Views |
|----------|-------|
| Library | All Photos, People, Favorites, Timeline |
| Utilities | Recently Deleted (30-day trash), Duplicates, Receipts, Handwriting, Illustrations, Recently Saved, Recently Viewed, Recently Edited, Recently Shared, Documents, Imports, Map |

### Cloud Sync ✨
- **Google Photos** — OAuth 2.0 desktop flow (opens your browser); downloads new photos from Google, uploads local-only photos back. Requires a free Google Cloud OAuth client ID.
- **Apple Photos** — macOS only; uses `osxphotos` CLI for export and AppleScript for import. Shows a "macOS only" notice on other platforms.
- **Sync direction** — Download only, Bidirectional, or Upload only
- **Auto-sync toggle** — fires every 15 minutes while the app is open
- **Sidebar status pills** — pulse while syncing; show green when connected
- **Activity log** — timestamped sync events inside the modal

### Gallery Modes
- ± Zoom (7 steps: 80–420 px)
- Years → Months → All Photos granularity
- List view, Metadata overlay (filename/date captions on cards)

### Toolbar Actions
Slideshow, Info panel, Search (Cmd+F), Share, Favorite, Duplicate, More ⋯, Import

### Photo Editing
8 filters · Brightness / Contrast / Saturation / Blur · Rotate · Flip  
Edits are written back to disk via Sharp and `editedAt` is stamped.

### Photo Management
- Import copies originals to `PhotoVault/photos/YYYY-MM/`; generates 400×400 thumbnails via Sharp
- EXIF date + camera info extracted on import (exifr)
- Soft delete → 30-day trash → permanent deletion
- Albums with photo assignment

---

## Quick Start

```bash
cd photovault-app
npm install
npm start
```

### Apple Photos sync (macOS only)
```bash
pip install osxphotos
# Then grant Automation permission: System Settings → Privacy & Security
```

### Google Photos sync
1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create **OAuth 2.0 Client ID** (Desktop app)
3. Enable **Google Photos Library API**
4. Paste Client ID + Secret in the PhotoVault Sync modal

### Build installers
```bash
npm run build:win    # Windows .exe
npm run build:mac    # macOS .dmg
npm run build:linux  # Linux .AppImage
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ← / → | Prev / next photo |
| F | Toggle favorite |
| Cmd/Ctrl+A | Select all |
| Cmd/Ctrl+F | Open search |
| Delete | Move to trash |
| Escape | Close / deselect |
| Space | Play/pause slideshow |

---

## Project Structure

```
photovault-app/
├── main.mjs       # Electron main — IPC handlers, Sharp, EXIF, Google OAuth, Apple sync
├── preload.js     # Context bridge — exposes window.electronAPI to renderer
├── renderer/
│   ├── index.html # SVG sprite, layout, sync modals
│   ├── styles.css # All styles including sync UI
│   └── app.js     # Gallery, editor, sync state machine
└── ...
```

---

## Environment Variables (optional)

| Variable | Purpose |
|----------|---------|
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob backup |
| `AZURE_STORAGE_CONTAINER` | Blob container (default: `photovault`) |
| `AZURE_FACE_ENDPOINT` | Azure Face API endpoint |
| `AZURE_FACE_KEY` | Azure Face API key |

Google and Apple credentials are stored by the app, not via env vars.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 40 |
| Persistence | electron-store 10 |
| Images | Sharp 0.34 |
| EXIF | exifr 7 |
| Azure | @azure/storage-blob 12 |
| Google sync | Photos Library API v1, OAuth 2.0 PKCE |
| Apple sync | osxphotos + AppleScript (macOS) |
| Icons | Inline SVG sprite |
| Tests | Jest + Playwright |

---

## License

MIT
