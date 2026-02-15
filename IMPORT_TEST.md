# PhotoVault Import Test

Run this in the browser console (F12) after opening the file dialog:

```javascript
// Test 1: Check if electronAPI exists
console.log('electronAPI available:', !!window.electronAPI);
console.log('openFileDialog available:', !!window.electronAPI?.openFileDialog);

// Test 2: Manually test import
async function testImport() {
    console.log('=== STARTING IMPORT TEST ===');
    
    // Open file dialog
    console.log('1. Opening file dialog...');
    const result = await window.electronAPI.openFileDialog();
    console.log('2. File dialog result:', result);
    
    if (!result.success) {
        console.error('File dialog failed or cancelled');
        return;
    }
    
    if (result.files.length === 0) {
        console.error('No files selected');
        return;
    }
    
    console.log(`3. Processing ${result.files.length} files...`);
    
    for (let i = 0; i < result.files.length; i++) {
        const file = result.files[i];
        console.log(`\n--- File ${i + 1} ---`);
        console.log('File object:', file);
        console.log('Has id:', !!file.id);
        console.log('Has name:', !!file.name);
        console.log('Has storagePath:', !!file.storagePath);
        console.log('Has thumbnailPath:', !!file.thumbnailPath);
        
        const photo = {
            id: file.id,
            name: file.name,
            storagePath: file.storagePath,
            relativePath: file.relativePath,
            thumbnailPath: file.thumbnailPath,
            originalPath: file.originalPath,
            date: new Date().toLocaleDateString(),
            dateAdded: new Date().toISOString(),
            favorite: false,
            faces: 0,
            album: null,
            tags: [],
            fileSize: file.fileSize
        };
        
        console.log('4. Photo object to save:', photo);
        console.log('5. Calling savePhoto...');
        
        const saveResult = await window.electronAPI.savePhoto(photo);
        console.log('6. Save result:', saveResult);
        
        if (!saveResult.success) {
            console.error('❌ Failed to save:', saveResult.error);
        } else {
            console.log('✅ Saved successfully');
        }
    }
    
    console.log('\n7. Reloading photos...');
    const getResult = await window.electronAPI.getPhotos();
    console.log('8. Get photos result:', getResult);
    console.log('9. Photo count:', getResult.photos?.length || 0);
    
    if (getResult.photos && getResult.photos.length > 0) {
        console.log('10. First photo:', getResult.photos[0]);
        console.log('    Has src:', !!getResult.photos[0].src);
        console.log('    Src length:', getResult.photos[0].src?.length || 0);
    }
    
    console.log('\n=== IMPORT TEST COMPLETE ===');
}

// Run the test
testImport();
```

After running this, also check:

```javascript
// Check if files exist on disk
const info = await window.electronAPI.getStorageInfo();
console.log('Storage paths:', info.info);

// Check what's in the store
const photos = await window.electronAPI.getPhotos();
console.log('Photos in store:', photos);
```

Look for these specific errors:
- "Failed to save: ..." 
- "Photo has no src"
- "File not found"
- Any red error messages

Copy and paste the console output here so I can see what's failing.
