import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Store from 'electron-store';
import crypto from 'crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { getAzureSyncStatus, syncAzureBlob, analyzeFaceCountForImageFile } from './services/azureSync.mjs';

// ES modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize electron-store for persistent data
const store = new Store();

let mainWindow;

// Storage paths - initialize early
let storagePath = store.get('storagePath');
let photosDir = storagePath ? path.join(storagePath, 'PhotoVault', 'photos') : null;
let thumbsDir = storagePath ? path.join(storagePath, 'PhotoVault', 'thumbnails') : null;

console.log('Initial storage paths:', { storagePath, photosDir, thumbsDir });

// Ask user to choose storage location
async function chooseStorageLocation() {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose PhotoVault Storage Location',
        properties: ['openDirectory', 'createDirectory'],
        message: 'Select a folder where PhotoVault will store your photos'
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
}

// Initialize storage with user-chosen or default location
async function initializeStorage() {
    let currentStoragePath = store.get('storagePath');
    
    console.log('initializeStorage called, current path:', currentStoragePath);
    
    // If no storage path set, ask user
    if (!currentStoragePath) {
        console.log('No storage path set, showing dialog...');
        // Show dialog to choose location
        currentStoragePath = await chooseStorageLocation();
        
        // If user cancelled, use default location
        if (!currentStoragePath) {
            currentStoragePath = app.getPath('documents');
            console.log('User cancelled, using default:', currentStoragePath);
        } else {
            console.log('User chose:', currentStoragePath);
        }
        
        // Save the chosen path
        store.set('storagePath', currentStoragePath);
    }
    
    // Set up directories
    storagePath = currentStoragePath;
    photosDir = path.join(storagePath, 'PhotoVault', 'photos');
    thumbsDir = path.join(storagePath, 'PhotoVault', 'thumbnails');
    
    console.log('Setting up directories:', { photosDir, thumbsDir });
    
    // Create directories
    if (!fs.existsSync(photosDir)) {
        console.log('Creating photos directory:', photosDir);
        fs.mkdirSync(photosDir, { recursive: true });
    }
    if (!fs.existsSync(thumbsDir)) {
        console.log('Creating thumbnails directory:', thumbsDir);
        fs.mkdirSync(thumbsDir, { recursive: true });
    }
    
    console.log('📁 Photo storage initialized:');
    console.log('   Storage Root:', storagePath);
    console.log('   Photos:', photosDir);
    console.log('   Thumbnails:', thumbsDir);
    
    return { photosDir, thumbsDir, storagePath };
}

// Generate unique filename
function generatePhotoId() {
    return crypto.randomBytes(16).toString('hex');
}

// Copy photo to app storage
async function copyPhotoToStorage(sourcePath, photoId) {
    if (!photosDir) {
        throw new Error('Storage not initialized - photosDir is null');
    }
    
    const ext = path.extname(sourcePath);
    const date = new Date();
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // Create year-month folder
    const monthDir = path.join(photosDir, yearMonth);
    if (!fs.existsSync(monthDir)) {
        console.log('Creating month directory:', monthDir);
        fs.mkdirSync(monthDir, { recursive: true });
    }
    
    const destPath = path.join(monthDir, `${photoId}${ext}`);
    
    console.log('Copying photo from', sourcePath, 'to', destPath);
    
    // Copy file
    fs.copyFileSync(sourcePath, destPath);
    
    console.log('Photo copied successfully');
    
    return {
        storagePath: destPath,
        relativePath: path.join(yearMonth, `${photoId}${ext}`)
    };
}

async function readExifMetadata(filePath) {
    try {
        const exif = await exifr.parse(filePath, {
            pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'Make', 'Model']
        });
        if (!exif) return {};
        const raw = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
        let dt = raw;
        if (typeof raw === 'string') {
            dt = new Date(raw);
        }
        if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) {
            return {};
        }
        return {
            captureDateISO: dt.toISOString(),
            displayDate: dt.toLocaleDateString(),
            cameraMake: exif.Make || null,
            cameraModel: exif.Model || null
        };
    } catch (e) {
        console.warn('EXIF read skipped:', e.message);
        return {};
    }
}

// Create thumbnail (resized for gallery performance)
async function createThumbnail(sourcePath, photoId) {
    if (!thumbsDir) {
        throw new Error('Storage not initialized - thumbsDir is null');
    }

    const thumbPath = path.join(thumbsDir, `${photoId}.jpg`);

    console.log('Creating thumbnail from', sourcePath, 'to', thumbPath);

    await sharp(sourcePath)
        .rotate()
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(thumbPath);

    console.log('Thumbnail created successfully');

    return thumbPath;
}

function buildEditedImagePipeline(sourcePath, edits) {
    const {
        filter = 'none',
        brightness = 100,
        contrast = 100,
        saturation = 100,
        blur = 0,
        rotation = 0,
        flipH = false,
        flipV = false
    } = edits;

    let pipeline = sharp(sourcePath).rotate(rotation);
    if (flipH) pipeline = pipeline.flop();
    if (flipV) pipeline = pipeline.flip();
    if (blur > 0) {
        pipeline = pipeline.blur(Math.min(10, Math.max(0.1, blur)));
    }

    switch (filter) {
        case 'grayscale':
            pipeline = pipeline.grayscale();
            break;
        case 'sepia':
            pipeline = pipeline.grayscale().tint({ r: 243, g: 229, b: 171 });
            break;
        case 'vintage':
            pipeline = pipeline.modulate({ saturation: 0.85 }).gamma(1.05);
            break;
        case 'warm':
            pipeline = pipeline.tint({ r: 255, g: 235, b: 210 });
            break;
        case 'cool':
            pipeline = pipeline.tint({ r: 210, g: 230, b: 255 });
            break;
        case 'vivid':
            pipeline = pipeline.modulate({ saturation: 1.45, brightness: 1.05 });
            break;
        case 'dramatic':
            pipeline = pipeline.gamma(0.92).linear(1.15, -18);
            break;
        default:
            break;
    }

    const b = Math.max(0.25, Math.min(2, brightness / 100));
    const s = Math.max(0, Math.min(2, saturation / 100));
    pipeline = pipeline.modulate({ brightness: b, saturation: s });

    const c = Math.max(0.5, Math.min(1.5, contrast / 100));
    const gamma = 1 / c;
    pipeline = pipeline.gamma(gamma);

    return pipeline;
}

// Get file as base64 (for displaying in browser)
function getPhotoAsBase64(photoPath) {
    try {
        console.log('Reading photo as Base64:', photoPath);
        
        if (!fs.existsSync(photoPath)) {
            console.error('❌ Photo file not found:', photoPath);
            return null;
        }
        
        const data = fs.readFileSync(photoPath);
        const ext = path.extname(photoPath).toLowerCase();
        const mimeType = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp'
        }[ext] || 'image/jpeg';
        
        const base64 = `data:${mimeType};base64,${data.toString('base64')}`;
        console.log(`✅ Read photo successfully (${data.length} bytes, Base64: ${base64.length} chars)`);
        
        return base64;
    } catch (error) {
        console.error('❌ Error reading photo:', error);
        return null;
    }
}

// Delete photo files
function deletePhotoFiles(photoId, relativePath) {
    try {
        if (!photosDir || !thumbsDir) {
            throw new Error('Storage not initialized');
        }
        
        // Delete main photo
        const photoPath = path.join(photosDir, relativePath);
        if (fs.existsSync(photoPath)) {
            console.log('Deleting photo:', photoPath);
            fs.unlinkSync(photoPath);
        }
        
        const thumbJpg = path.join(thumbsDir, `${photoId}.jpg`);
        if (fs.existsSync(thumbJpg)) {
            console.log('Deleting thumbnail:', thumbJpg);
            fs.unlinkSync(thumbJpg);
        }
        const thumbExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        for (const ext of thumbExtensions) {
            const thumbPath = path.join(thumbsDir, `${photoId}${ext}`);
            if (fs.existsSync(thumbPath)) {
                console.log('Deleting thumbnail:', thumbPath);
                fs.unlinkSync(thumbPath);
                break;
            }
        }
    } catch (error) {
        console.error('Error deleting photo files:', error);
    }
}

// Create the main application window
function createWindow() {
    win.setIcon(path.join(__dirname, 'icon.png'));
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        backgroundColor: '#667eea',
        icon: path.join(__dirname, 'build/icon.png'),
        show: false // Don't show until ready
    });

    // Load the application
    mainWindow.loadFile('renderer/index.html');

    // Show window when ready
    mainWindow.once('ready-to-show', async () => {
        // Initialize storage before showing window
        await initializeStorage();
        mainWindow.show();
    });

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// App lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers for file operations
ipcMain.handle('save-photo', async (event, photoData) => {
    try {
        console.log('\n=== SAVE PHOTO ===');
        console.log('Received photo data:', photoData);
        
        // Get current photos metadata
        const photos = store.get('photos', []);
        console.log(`Current photo count: ${photos.length}`);
        
        // Add metadata without base64 data
        const metadata = {
            id: photoData.id,
            name: photoData.name,
            storagePath: photoData.storagePath,
            relativePath: photoData.relativePath,
            thumbnailPath: photoData.thumbnailPath,
            originalPath: photoData.originalPath,
            date: photoData.date,
            dateAdded: photoData.dateAdded,
            captureDateISO: photoData.captureDateISO || null,
            cameraMake: photoData.cameraMake || null,
            cameraModel: photoData.cameraModel || null,
            favorite: photoData.favorite || false,
            faces: photoData.faces || 0,
            album: photoData.album || null,
            tags: photoData.tags || [],
            fileSize: photoData.fileSize || 0
        };
        
        photos.push(metadata);
        store.set('photos', photos);
        
        console.log('✅ Photo saved:', metadata.name);
        console.log(`New photo count: ${photos.length}`);
        
        return { success: true, photo: metadata };
    } catch (error) {
        console.error('❌ Error saving photo:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-photos', async () => {
    try {
        console.log('\n=== GET PHOTOS ===');
        const photos = store.get('photos', []);
        
        console.log(`Loading ${photos.length} photos...`);
        
        // Add base64 data for thumbnails
        const photosWithData = photos.map((photo, index) => {
            console.log(`Processing photo ${index + 1}: ${photo.name}`);
            const thumbData = getPhotoAsBase64(photo.thumbnailPath);
            
            if (!thumbData) {
                console.warn(`⚠️ Failed to load thumbnail for: ${photo.name}`);
            }
            
            return {
                ...photo,
                src: thumbData || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2NjYyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE2IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
            };
        });
        
        console.log(`✅ Loaded ${photosWithData.length} photos with thumbnails`);
        
        return { success: true, photos: photosWithData };
    } catch (error) {
        console.error('❌ Error getting photos:', error);
        return { success: false, error: error.message, photos: [] };
    }
});

ipcMain.handle('get-full-photo', async (event, photoId) => {
    try {
        console.log('\n=== GET FULL PHOTO ===');
        console.log('Photo ID:', photoId);
        
        const photos = store.get('photos', []);
        const photo = photos.find(p => p.id === photoId);
        
        if (!photo) {
            console.error('❌ Photo not found');
            return { success: false, error: 'Photo not found' };
        }
        
        // Return full resolution image
        const fullData = getPhotoAsBase64(photo.storagePath);
        
        if (!fullData) {
            console.error('❌ Could not load photo file');
            return { success: false, error: 'Could not load photo file' };
        }
        
        console.log('✅ Full photo loaded');
        
        return { 
            success: true, 
            photo: {
                ...photo,
                src: fullData
            }
        };
    } catch (error) {
        console.error('❌ Error getting full photo:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('update-photo', async (event, photoId, updates) => {
    try {
        const photos = store.get('photos', []);
        const index = photos.findIndex(p => p.id === photoId);
        if (index !== -1) {
            photos[index] = { ...photos[index], ...updates };
            store.set('photos', photos);
            return { success: true, photo: photos[index] };
        }
        return { success: false, error: 'Photo not found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-photo', async (event, photoId) => {
    try {
        console.log('\n=== DELETE PHOTO ===');
        console.log('Photo ID:', photoId);
        
        const photos = store.get('photos', []);
        const photo = photos.find(p => p.id === photoId);
        
        if (photo) {
            // Delete physical files
            deletePhotoFiles(photo.id, photo.relativePath);
        }
        
        const filtered = photos.filter(p => p.id !== photoId);
        store.set('photos', filtered);
        
        console.log('✅ Photo deleted');
        
        return { success: true };
    } catch (error) {
        console.error('❌ Error deleting photo:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-photos', async (event, photoIds) => {
    try {
        console.log('\n=== DELETE PHOTOS ===');
        console.log('Photo IDs:', photoIds);
        
        const photos = store.get('photos', []);
        
        // Delete physical files for each photo
        for (const photoId of photoIds) {
            const photo = photos.find(p => p.id === photoId);
            if (photo) {
                deletePhotoFiles(photo.id, photo.relativePath);
            }
        }
        
        const filtered = photos.filter(p => !photoIds.includes(p.id));
        store.set('photos', filtered);
        
        console.log(`✅ Deleted ${photoIds.length} photos`);
        
        return { success: true };
    } catch (error) {
        console.error('❌ Error deleting photos:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('apply-photo-edits', async (event, photoId, edits) => {
    try {
        const photos = store.get('photos', []);
        const index = photos.findIndex(p => p.id === photoId);
        if (index === -1) {
            return { success: false, error: 'Photo not found' };
        }
        const photo = photos[index];
        const ext = path.extname(photo.storagePath).toLowerCase();
        const supported = ['.jpg', '.jpeg', '.png', '.webp'];
        if (!supported.includes(ext)) {
            return { success: false, error: 'Editing is supported for JPEG, PNG, and WebP only.' };
        }
        const pipeline = buildEditedImagePipeline(photo.storagePath, edits);
        let buffer;
        if (ext === '.png') {
            buffer = await pipeline.png().toBuffer();
        } else if (ext === '.webp') {
            buffer = await pipeline.webp({ quality: 90 }).toBuffer();
        } else {
            buffer = await pipeline.jpeg({ quality: 92 }).toBuffer();
        }
        fs.writeFileSync(photo.storagePath, buffer);
        const stats = fs.statSync(photo.storagePath);
        const newThumb = await createThumbnail(photo.storagePath, photoId);
        photos[index] = {
            ...photo,
            fileSize: stats.size,
            thumbnailPath: newThumb
        };
        store.set('photos', photos);
        return { success: true };
    } catch (error) {
        console.error('apply-photo-edits:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('azure-sync-status', async () => {
    return getAzureSyncStatus();
});

ipcMain.handle('azure-blob-sync', async (event, options) => {
    return syncAzureBlob(store, options);
});

// Album operations
ipcMain.handle('save-album', async (event, albumData) => {
    try {
        const albums = store.get('albums', []);
        albums.push(albumData);
        store.set('albums', albums);
        return { success: true, album: albumData };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-albums', async () => {
    try {
        const albums = store.get('albums', []);
        return { success: true, albums };
    } catch (error) {
        return { success: false, error: error.message, albums: [] };
    }
});

ipcMain.handle('update-album', async (event, albumId, updates) => {
    try {
        const albums = store.get('albums', []);
        const index = albums.findIndex(a => a.id === albumId);
        if (index !== -1) {
            albums[index] = { ...albums[index], ...updates };
            store.set('albums', albums);
            return { success: true, album: albums[index] };
        }
        return { success: false, error: 'Album not found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-album', async (event, albumId) => {
    try {
        const albums = store.get('albums', []);
        const filtered = albums.filter(a => a.id !== albumId);
        store.set('albums', filtered);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Change storage location
ipcMain.handle('change-storage-location', async () => {
    try {
        const newPath = await chooseStorageLocation();
        
        if (!newPath) {
            return { success: false, error: 'No location selected' };
        }
        
        const oldPath = store.get('storagePath');
        
        // Update storage path
        store.set('storagePath', newPath);
        
        // Reinitialize storage
        await initializeStorage();
        
        return { 
            success: true, 
            oldPath,
            newPath,
            message: 'Storage location updated. Please move your photos manually if needed.'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// File dialog for importing photos
ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const files = [];
        
        console.log(`\n=== IMPORTING ${result.filePaths.length} PHOTOS ===`);
        
        for (const filePath of result.filePaths) {
            try {
                const photoId = generatePhotoId();
                
                console.log(`\nProcessing: ${path.basename(filePath)}`);
                console.log('  Source:', filePath);
                console.log('  ID:', photoId);
                
                // Copy photo to storage
                const { storagePath, relativePath } = await copyPhotoToStorage(filePath, photoId);
                
                // Create thumbnail
                const thumbnailPath = await createThumbnail(filePath, photoId);
                
                // Get file stats
                const stats = fs.statSync(filePath);
                const exif = await readExifMetadata(filePath);

                let faces = Math.floor(Math.random() * 4);
                const faceResult = await analyzeFaceCountForImageFile(filePath);
                if (typeof faceResult.faces === 'number') {
                    faces = faceResult.faces;
                }

                const fileData = {
                    id: photoId,
                    name: path.basename(filePath),
                    storagePath: storagePath,
                    relativePath: relativePath,
                    thumbnailPath: thumbnailPath,
                    originalPath: filePath,
                    fileSize: stats.size,
                    dateAdded: new Date().toISOString(),
                    date: exif.displayDate || new Date().toLocaleDateString(),
                    captureDateISO: exif.captureDateISO || null,
                    cameraMake: exif.cameraMake || null,
                    cameraModel: exif.cameraModel || null,
                    faces
                };

                files.push(fileData);
                
                console.log(`✅ Imported: ${path.basename(filePath)}`);
            } catch (error) {
                console.error(`❌ Error processing file ${filePath}:`, error);
            }
        }
        
        console.log(`\n=== Successfully imported ${files.length} photos ===\n`);
        
        return { success: true, files };
    }
    
    return { success: false, files: [] };
});

// Export photo
ipcMain.handle('export-photo', async (event, photoId, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [
            { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }
        ]
    });

    if (!result.canceled && result.filePath) {
        try {
            const photos = store.get('photos', []);
            const photo = photos.find(p => p.id === photoId);
            
            if (!photo) {
                return { success: false, error: 'Photo not found' };
            }
            
            // Copy the original file
            fs.copyFileSync(photo.storagePath, result.filePath);
            
            return { success: true, path: result.filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    return { success: false };
});

// Get storage info
ipcMain.handle('get-storage-info', async () => {
    try {
        const photos = store.get('photos', []);
        const totalSize = photos.reduce((sum, photo) => sum + (photo.fileSize || 0), 0);
        const currentStoragePath = store.get('storagePath') || app.getPath('documents');
        
        return {
            success: true,
            info: {
                photoCount: photos.length,
                totalSize: totalSize,
                storagePath: currentStoragePath,
                photosPath: photosDir,
                thumbnailsPath: thumbsDir
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Clear all data (useful for testing)
ipcMain.handle('clear-all-data', async () => {
    try {
        const photos = store.get('photos', []);
        
        // Delete all photo files
        for (const photo of photos) {
            deletePhotoFiles(photo.id, photo.relativePath);
        }
        
        store.clear();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
