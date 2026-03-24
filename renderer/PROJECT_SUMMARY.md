# PhotoVault — Project Summary

## Status: Fully Wired

All five core files are complete and ready to drop into the project folder:

| File | Description |
|------|-------------|
| `main.mjs` | Electron main process — all IPC handlers, Sharp pipeline, EXIF, Google OAuth, Apple sync |
| `preload.js` | Context bridge — exposes `window.electronAPI` to renderer |
| `renderer/index.html` | SVG sprite, app layout, sync modals |
| `renderer/styles.css` | All styles including sync UI |
| `renderer/app.js` | Gallery, editor, sync state machine |

---

## Architecture

```
main.mjs  (Node.js / Electron main)
  ├── Photo CRUD        → electron-store JSON + disk files
  ├── File import       → dialog → copy → Sharp thumbnail → exifr EXIF
  ├── Photo editing     → Sharp pipeline written back to original file
  ├── Album CRUD        → electron-store
  ├── Azure Blob sync   → @azure/storage-blob (env-configured, optional)
  ├── Sync config       → electron-store (separate 'photovault-sync' file)
  ├── Google Photos     → OAuth 2.0 PKCE local-server redirect flow
  │     ├── syncGoogleAuth         OAuth browser flow → tokens
  │     ├── syncGooglePhotoCount   GET /mediaItems?pageSize=1
  │     ├── syncGoogleList         paginated GET /mediaItems (all pages)
  │     ├── syncGoogleDownload     download item → save → thumbnail → EXIF
  │     └── syncGoogleUpload       upload bytes → batchCreate media item
  └── Apple Photos      → osxphotos CLI + AppleScript (macOS only)
        ├── syncAppleConnect       osxphotos info or AppleScript count
        └── syncAppleRun          osxphotos export + AppleScript import

preload.js  (context bridge)
  └── Exposes all 24 IPC channels as window.electronAPI.*

renderer/  (Chromium — zero Node access)
  ├── index.html  SVG sprite (40+ icons), layout, sync modals, OAuth setup modal
  ├── styles.css  CSS variables, toolbar, info panel, sync sheet, pills, progress bar
  └── app.js      Gallery views, editor, sync state machine (syncState, runSync, etc.)
```

---

## IPC API Reference

All channels are invoked via `ipcRenderer.invoke` / `ipcMain.handle`.

### Photos
| Channel | Args | Returns |
|---------|------|---------|
| `get-photos` | — | `{ success, photos[] }` |
| `get-full-photo` | `photoId` | `{ success, photo }` |
| `save-photo` | `metadata` | `{ success }` |
| `update-photo` | `photoId, changes` | `{ success }` |
| `delete-photos` | `photoIds[]` | `{ success }` |

### Import / Export
| Channel | Args | Returns |
|---------|------|---------|
| `open-file-dialog` | — | `{ success, files[] }` |
| `export-photo` | `photoId, suggestedName` | `{ success, savedPath }` |

### Albums
| Channel | Args | Returns |
|---------|------|---------|
| `save-album` | `album` | `{ success }` |
| `get-albums` | — | `{ success, albums[] }` |
| `delete-album` | `albumId` | `{ success }` |

### Editing
| Channel | Args | Returns |
|---------|------|---------|
| `apply-photo-edits` | `photoId, edits` | `{ success }` |

### Storage
| Channel | Args | Returns |
|---------|------|---------|
| `get-storage-info` | — | `{ success, storageLocation, totalBytes }` |
| `change-storage-location` | — | `{ success, newLocation }` |
| `clear-all-data` | — | `{ success }` |

### Azure (optional)
| Channel | Args | Returns |
|---------|------|---------|
| `sync-azure-blob` | `{}` | `{ success, uploaded, container }` or `{ skipped, message }` |
| `get-azure-sync-status` | — | `{ configured }` |

### Sync Config
| Channel | Args | Returns |
|---------|------|---------|
| `get-sync-config` | — | `{ success, config }` |
| `save-sync-config` | `config` | `{ success }` |

### Google Photos
| Channel | Args | Returns |
|---------|------|---------|
| `sync-google-auth` | `{ clientId, clientSecret }` | `{ success, accessToken, refreshToken, email }` |
| `sync-google-photo-count` | `{ accessToken }` | `{ success, count }` |
| `sync-google-list` | `{ accessToken, refreshToken, clientId, clientSecret }` | `{ success, items[], accessToken }` |
| `sync-google-download` | `{ item, accessToken }` | `{ success, photo }` |
| `sync-google-upload` | `{ photo, accessToken, refreshToken, clientId, clientSecret }` | `{ success, googleId, accessToken }` |

### Apple Photos (macOS)
| Channel | Args | Returns |
|---------|------|---------|
| `sync-apple-connect` | — | `{ success, photoCount, library? }` |
| `sync-apple-run` | `{ direction, localPhotos[] }` | `{ success, downloaded[], uploaded, libraryCount }` |

---

## Data Model

### Photo record
```js
{
  id:            string,       // 32-char hex
  name:          string,       // original filename
  storagePath:   string,       // absolute path to full-res copy
  relativePath:  string,       // relative to storage root
  thumbnailPath: string,       // 400×400 JPEG path
  originalPath:  string,       // source path at import time
  date:          string,       // display date
  dateAdded:     ISO8601,
  captureDateISO: ISO8601|null, // from EXIF
  cameraMake:    string|null,
  cameraModel:   string|null,
  favorite:      boolean,
  faces:         number,
  album:         number|null,
  tags:          string[],
  fileSize:      number,        // bytes
  deleted:       boolean,
  deletedAt:     ISO8601|null,
  editedAt:      ISO8601|null,
  googleId:      string|null,   // Google Photos media item ID
  appleId:       string|null,   // local ID used for Apple dedup
}
```

### Session-only state (cleared on restart)
- `recentlyViewedIds` — photos opened in viewer
- `recentlySharedIds` — photos exported
- `lastImportBatch`   — IDs from most recent import

---

## Storage Layout

```
[User-chosen folder]/
└── PhotoVault/
    ├── photos/
    │   └── 2026-03/        ← originals copied here on import
    └── thumbnails/         ← 400×400 JPEG previews
```

App data: `%APPDATA%\photovault-app\` · `~/Library/Application Support/photovault-app/` · `~/.config/photovault-app/`

Two electron-store files:
- `photovault-app.json` — photos, albums, storage location
- `photovault-sync.json` — sync tokens, last-sync timestamps, direction, log

---

## Google Photos OAuth Flow

1. Renderer calls `syncGoogleAuth({ clientId, clientSecret })`
2. Main process opens a local HTTP server on a random port
3. Builds Google OAuth URL with `access_type=offline&prompt=consent`
4. Opens URL in system browser via `shell.openExternal`
5. Browser redirects to `http://127.0.0.1:{port}/oauth?code=…`
6. Main process exchanges code for `access_token` + `refresh_token`
7. Fetches user email from `/oauth2/v1/userinfo`
8. Returns tokens to renderer; stored in `syncState` and persisted via `save-sync-config`
9. On subsequent calls tokens are refreshed automatically if a 401 is received

---

## Apple Photos Sync Flow

### Download (macOS, requires osxphotos)
1. `osxphotos export <exportDir> --original --not-missing`
2. For each exported file: copy to `PhotoVault/photos/YYYY-MM/`, generate thumbnail, extract EXIF
3. Save each as a new photo record with `appleId` set to prevent re-importing

### Upload (macOS, AppleScript)
1. For each local photo without `appleId`:
   `osascript -e 'tell application "Photos" to import POSIX file "<path>"'`
2. Increments `uploaded` counter

### Connect (probe)
- Tries `osxphotos info --json` for rich library info
- Falls back to `osascript -e 'tell application "Photos" to return count of media items'`
- Returns `{ success: false }` on non-macOS with a helpful error message

---

## Roadmap

### Done ✅
- Full Apple Photos–style UI + SF Symbols sprite
- 16 library/utility views
- Zoom + granularity controls
- Slideshow, Info panel, Search, Share, Favorite, Duplicate, Metadata overlay
- Soft delete with 30-day trash
- Photo editing (Sharp, persisted)
- Azure Blob sync (optional, env-configured)
- Google Photos bidirectional sync (OAuth 2.0 PKCE)
- Apple Photos bidirectional sync (osxphotos + AppleScript, macOS)
- Sync modal with direction selector, auto-sync toggle, activity log
- Sidebar sync status pills + progress bar
- `main.mjs` — all IPC handlers fully wired
- `preload.js` — full context bridge (24 channels)

### Planned
- Crop and resize tools
- RAW format support
- Video support
- Map view with real GPS pins (lat/lon fields exist on photo records)
- Duplicate merging (currently shows duplicates, doesn't merge)
- Batch tag editor

---

## Cost Estimates (Azure, optional)

| Environment | Monthly estimate |
|-------------|-----------------|
| Dev/testing | ~$14 |
| Production low-traffic | ~$62 |
| Production high-traffic | ~$195 |

---

## License

MIT
