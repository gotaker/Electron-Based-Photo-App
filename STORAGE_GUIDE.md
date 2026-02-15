# PhotoVault - Improved Storage System 📸✨

## 🎉 What's New?

Your PhotoVault app now has a **professional file-based storage system** instead of storing everything in a single JSON file!

## 📁 New Storage Structure

### Where Your Photos Are Stored:

**Windows:**
```
C:\Users\<YourUsername>\AppData\Roaming\photovault-app\
├── photos\                    ← Full-resolution photos
│   ├── 2026-02\               ← Organized by year-month
│   │   ├── a1b2c3d4...jpg
│   │   └── e5f6g7h8...png
│   └── 2026-03\
│       └── i9j0k1l2...jpg
├── thumbnails\                ← Smaller versions for fast loading
│   ├── a1b2c3d4...jpg
│   ├── e5f6g7h8...jpg
│   └── i9j0k1l2...jpg
└── config.json               ← Only metadata (tiny file!)
```

**macOS:**
```
~/Library/Application Support/photovault-app/
```

**Linux:**
```
~/.config/photovault-app/
```

## ✨ Key Improvements

### 1. **Actual File Storage**
- Photos are copied to the app's folder
- Organized automatically by year and month
- Original files remain untouched

### 2. **Thumbnail System**
- Fast loading with smaller preview images
- Full-resolution images load on-demand
- Smooth, instant gallery browsing

### 3. **Efficient Metadata**
Before:
```json
{
  "photos": [
    {
      "id": 123,
      "src": "data:image/jpeg;base64,/9j/4AAQSkZJRgAB..." // HUGE!
    }
  ]
}
```

After:
```json
{
  "photos": [
    {
      "id": "a1b2c3d4e5f6...",
      "name": "vacation.jpg",
      "relativePath": "2026-02/a1b2c3d4e5f6...jpg",
      "fileSize": 2458624,
      "favorite": false
    }
  ]
}
```

### 4. **Better Performance**
- ⚡ Faster app startup (no huge JSON to parse)
- 💾 Smaller memory usage
- 🚀 Instant gallery loading with thumbnails
- 📊 Storage size tracking

### 5. **Data Safety**
- Photos are backed up as real files
- Easy to backup the entire photos folder
- Can manually access photos outside the app
- Photos organized chronologically

## 🔧 How It Works

### When You Import Photos:

1. **Copy to Storage**
   - App creates a unique ID for the photo
   - Copies file to `photos/YYYY-MM/` folder
   
2. **Create Thumbnail**
   - Generates 400x400 preview
   - Stored in `thumbnails/` folder
   
3. **Save Metadata**
   - Stores info in config.json (tiny!)
   - Includes: name, date, size, favorite status, albums, tags

### When You View Photos:

1. **Gallery loads instantly** using thumbnails
2. **Click to enlarge** loads full-resolution image
3. **Export** copies the original file

### When You Delete Photos:

- Both the full photo and thumbnail are deleted
- Metadata is removed from config.json
- Folders cleaned up automatically

## 📊 Storage Info Display

The sidebar now shows:
- **Total photo count**
- **Storage used** (in MB)

Example: `127 photos • 342.5 MB`

## 🔄 Migration from Old System

If you have photos in the old system (Base64 in JSON):

1. They will still display (backward compatible)
2. New photos use the improved system
3. You can manually migrate:
   - Export old photos
   - Delete them
   - Re-import them

## 🎨 Optional Enhancement: Sharp

For even better thumbnail quality, install the `sharp` library:

```bash
npm install sharp
```

The app automatically uses it if available, otherwise falls back to file copying.

## 🚀 Benefits Summary

| Feature | Old System | New System |
|---------|-----------|------------|
| File size | Huge JSON (33% larger) | Actual files + tiny JSON |
| Loading speed | Slow (parse all Base64) | Fast (thumbnails) |
| Organization | None | By year/month |
| Backup | Difficult | Easy (copy folder) |
| Memory usage | High | Low |
| External access | No | Yes (real files) |

## 📝 Files Updated

1. **main.mjs** - New storage logic
2. **preload.js** - Added `getFullPhoto` and `getStorageInfo` APIs
3. **app.js** - Updated to use file-based system

## 🔐 Data Location

To find your photos, open DevTools (F12) and run:

```javascript
await window.electronAPI.getStorageInfo()
```

This returns the full path to your photo storage!

## 🎯 Next Steps

Your app now has professional-grade photo storage! Enjoy:
- ✅ Faster performance
- ✅ Better organization  
- ✅ Easy backups
- ✅ Lower memory usage
- ✅ Real file storage

---

**Note:** The app will print storage paths to console on startup:
```
📁 Photo storage initialized:
   Photos: C:\Users\...\photovault-app\photos
   Thumbnails: C:\Users\...\photovault-app\thumbnails
```
