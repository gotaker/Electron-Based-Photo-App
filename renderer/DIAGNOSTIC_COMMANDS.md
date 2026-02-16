# Quick Diagnostic Commands 🔍

Run these in the browser console (F12) one by one and share the output:

## Command 1: Check Storage
```javascript
const storage = await window.electronAPI.getStorageInfo();
console.log('Storage Info:', storage);
```

## Command 2: Check Photos in Database
```javascript
const photos = await window.electronAPI.getPhotos();
console.log('Photo Count:', photos.photos.length);
if (photos.photos.length > 0) {
    const photo = photos.photos[0];
    console.log('First Photo:');
    console.log('  ID:', photo.id);
    console.log('  Name:', photo.name);
    console.log('  storagePath:', photo.storagePath);
    console.log('  thumbnailPath:', photo.thumbnailPath);
    console.log('  Has src:', !!photo.src);
    console.log('  Src length:', photo.src ? photo.src.length : 0);
}
```

## Command 3: Try to Get Full Photo
```javascript
const photos = await window.electronAPI.getPhotos();
if (photos.photos.length > 0) {
    const photoId = photos.photos[0].id;
    console.log('Getting full photo for ID:', photoId);
    const full = await window.electronAPI.getFullPhoto(photoId);
    console.log('Full photo result:', full);
    if (full.success) {
        console.log('Has src:', !!full.photo.src);
        console.log('Src length:', full.photo.src?.length);
    }
}
```

## Command 4: Test Image Rendering
```javascript
const photos = await window.electronAPI.getPhotos();
if (photos.photos.length > 0 && photos.photos[0].src) {
    const img = new Image();
    img.onload = () => console.log('✅ Image loaded successfully!');
    img.onerror = (e) => console.log('❌ Image failed to load:', e);
    img.src = photos.photos[0].src;
    console.log('Testing image with src length:', photos.photos[0].src.length);
}
```

## Use the Diagnostic Tool

1. Put `diagnostic.html` in your `renderer` folder
2. Change main.mjs line to load it:
   ```javascript
   mainWindow.loadFile('renderer/diagnostic.html');
   ```
3. Run `npm start`
4. Click the buttons in order:
   - "1. Test Storage"
   - "5. Clear All Data" (to remove bad photos)
   - "2. Test Import" (select a photo)
   - "3. Test Get Photos"
   - "4. Test Render"

This will show EXACTLY where the problem is!

## What We're Looking For

### ✅ Good Output:
```
File dialog result:
{
  "files": [{
    "id": "f110693c25...",     // ✅ Hex ID
    "storagePath": "I:\\...",  // ✅ Has path
    "thumbnailPath": "I:\\..." // ✅ Has path
  }]
}

Photo in database:
{
  "id": "f110693c25...",       // ✅ Same hex ID
  "storagePath": "I:\\...",    // ✅ Has path
  "thumbnailPath": "I:\\...",  // ✅ Has path
  "src": "data:image/jpeg;base64,/9j/4AAQ..." // ✅ Has Base64
}
```

### ❌ Bad Output:
```
Photo in database:
{
  "id": 1771199350149.7126,   // ❌ Timestamp ID
  "storagePath": undefined,    // ❌ No path
  "thumbnailPath": undefined,  // ❌ No path
  "src": undefined             // ❌ No src
}
```

Share the output and we'll know exactly what's wrong!
