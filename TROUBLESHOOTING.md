# PhotoVault Troubleshooting Guide 🔍

## 🐛 Debugging Steps

### Step 1: Open Developer Tools
1. Press **F12** or **Ctrl+Shift+I**
2. Go to the **Console** tab
3. Keep it open while using the app

### Step 2: Check Console Output

When the app starts, you should see:
```
📁 Photo storage initialized:
   Storage Root: C:\Users\You\Pictures
   Photos: C:\Users\You\Pictures\PhotoVault\photos
   Thumbnails: C:\Users\You\Pictures\PhotoVault\thumbnails

Loading photos from storage...
Load photos result: {success: true, photos: [...]}
Loaded 0 photos
Rendering gallery with 0 total photos, 0 filtered
```

### Step 3: Import Photos and Watch Console

When importing, you should see:
```
Opening file dialog...
File dialog result: {success: true, files: [...]}
Importing 3 files...

Processing file: {id: "abc123...", name: "photo1.jpg", ...}
Saving photo metadata: {...}
Save result: {success: true, photo: {...}}

Processing: photo1.jpg
✓ Imported: photo1.jpg
Processing: photo2.png
✓ Imported: photo2.png

Successfully imported 2 photos

Loading photos from storage...
Loaded 2 photos
Rendering gallery with 2 total photos, 2 filtered
```

## ❌ Common Issues & Solutions

### Issue 1: Photos Not Displaying

**Symptoms:**
- Upload zone still showing after import
- Photos count shows 0
- No errors in console

**Solution:**
Check console for this message:
```
Photo 0 (photo.jpg) has no src!
```

If you see this, the thumbnail isn't being loaded. Check:

1. **Verify files exist:**
   ```javascript
   // In console (F12)
   const info = await window.electronAPI.getStorageInfo();
   console.log(info.info.thumbnailsPath);
   ```
   Then navigate to that folder and check if thumbnails exist.

2. **Check file permissions:**
   Make sure the app can read from the storage folder.

3. **Manually check a photo:**
   ```javascript
   // In console
   const photos = await window.electronAPI.getPhotos();
   console.log(photos.photos[0]); // Should have 'src' property
   ```

### Issue 2: "No Image" Placeholder Shows

**Symptoms:**
- Gallery shows gray boxes with "No Image"
- Console shows: `Failed to load thumbnail for: photo.jpg`

**Cause:** Thumbnail file doesn't exist or can't be read

**Solution:**
1. Delete the photo from the app
2. Re-import it
3. Check console for errors during import

### Issue 3: Import Appears to Work but No Photos Show

**Check console for:**
```
Save result: {success: false, error: "..."}
```

**Common errors:**
- **"Permission denied"** - Choose a different storage location
- **"File not found"** - Source file was moved/deleted
- **"ENOENT"** - Storage directories don't exist

**Fix:**
```javascript
// In console - change storage location
await window.electronAPI.changeStorageLocation();
// Then re-import photos
```

### Issue 4: Cannot Delete Photos

**Symptoms:**
- Click delete, confirm, but photos remain
- Console error: `Failed to delete photos: ...`

**Solution:**

1. **Check if files are locked:**
   - Close any image viewers
   - Restart the app

2. **Check permissions:**
   ```javascript
   // In console
   const info = await window.electronAPI.getStorageInfo();
   console.log(info.info.photosPath);
   ```
   Navigate to folder and try manually deleting a file.

3. **Force reload:**
   ```javascript
   // In console
   location.reload();
   ```

### Issue 5: Storage Location Dialog Doesn't Appear

**Symptoms:**
- App starts but no dialog
- Uses default location

**Cause:** Storage path already set from previous run

**Solution - Reset storage:**
```javascript
// In console
await window.electronAPI.clearAllData();
```
Then close and restart the app.

## 🔧 Manual Fixes

### Reset Everything

1. **Close the app**

2. **Find config.json:**
   - Windows: `C:\Users\<You>\AppData\Roaming\photovault-app\config.json`
   - macOS: `~/Library/Application Support/photovault-app/config.json`
   - Linux: `~/.config/photovault-app/config.json`

3. **Delete config.json**

4. **Restart app** - storage dialog will appear

### Move Storage Location

1. **Get current location:**
   ```javascript
   const info = await window.electronAPI.getStorageInfo();
   console.log(info.info.storagePath);
   ```

2. **Copy PhotoVault folder** from old location to new

3. **Change in app:**
   ```javascript
   await window.electronAPI.changeStorageLocation();
   ```
   Select the new location

4. **Verify photos load**

### Check Photo IDs

If photos import but don't display:
```javascript
// In console
const photos = await window.electronAPI.getPhotos();
photos.photos.forEach(p => {
    console.log(`ID: ${p.id}`);
    console.log(`Name: ${p.name}`);
    console.log(`Has src: ${!!p.src}`);
    console.log(`Thumbnail path: ${p.thumbnailPath}`);
    console.log('---');
});
```

## 📊 Expected Console Output

### ✅ Successful Import:
```
Opening file dialog...
Importing 1 files...
Processing file: {id: "f4a8b2...", name: "test.jpg", ...}

Processing: test.jpg
✓ Imported: test.jpg
Successfully imported 1 photos

Loading photos from storage...
Loaded 1 photos
Rendering gallery with 1 total photos, 1 filtered
```

### ✅ Successful Display:
```
Loading 1 photos...
Photo saved: test.jpg
Loaded 1 photos with thumbnails
```

### ✅ Successful Delete:
```
Deleting photos: ["f4a8b2..."]
Delete result: {success: true}
Loading photos from storage...
Loaded 0 photos
Photos deleted successfully
```

## 🆘 Emergency Recovery

If nothing works:

1. **Get your photos:**
   ```javascript
   const info = await window.electronAPI.getStorageInfo();
   console.log(info.info.photosPath);
   ```
   Your originals are in this folder!

2. **Clear everything:**
   ```javascript
   await window.electronAPI.clearAllData();
   ```

3. **Close and restart app**

4. **Choose new storage location**

5. **Re-import photos from the old photos folder**

## 📝 Collecting Debug Info

If you need to report an issue, run this:

```javascript
// In console
const debug = {
    photos: await window.electronAPI.getPhotos(),
    storage: await window.electronAPI.getStorageInfo(),
    count: (await window.electronAPI.getPhotos()).photos.length
};
console.log('DEBUG INFO:', JSON.stringify(debug, null, 2));
```

Copy the output and share it.

## 🎯 Quick Checks

Before asking for help, verify:

- [ ] Developer tools (F12) is open
- [ ] Console shows storage initialization message
- [ ] Storage folder actually exists on disk
- [ ] You have write permissions to storage folder
- [ ] Photo files exist in the thumbnails folder
- [ ] Console shows no red error messages
- [ ] You've tried reimporting photos
- [ ] You've tried restarting the app

---

**Most Common Solution:** Delete config.json, restart app, choose new storage location, reimport photos.
