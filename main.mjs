import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Store from 'electron-store';
import crypto from 'crypto';

// ES modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize electron-store for persistent data
const store = new Store();

let mainWindow;
let photosDir;
let thumbsDir;

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
    let storagePath = store.get('storagePath');
    
    // If no storage path set, ask user
    if (!storagePath) {
        // Show dialog to choose location
        storagePath = await chooseStorageLocation();
        
        // If user cancelled, use default location
        if (!storagePath) {
            storagePath = app.getPath('documents');
        }
        
        // Save the chosen path
        store.set('storagePath', storagePath);
    }
    
    // Set up directories
    photosDir = path.join(storagePath, 'PhotoVault', 'photos');
    thumbsDir = path.join(storagePath, 'PhotoVault', 'thumbnails');
    
    // Create directories
    if (!fs.existsSync(photosDir)) {
        fs.mkdirSync(photosDir, { recursive: true });
    }
    if (!fs.existsSync(thumbsDir)) {
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
    const ext = path.extname(sourcePath);
    const date = new Date();
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // Create year-month folder
    const monthDir = path.join(photosDir, yearMonth);
    if (!fs.existsSync(monthDir)) {
        fs.mkdirSync(monthDir, { recursive: true });
    }
    
    const destPath = path.join(monthDir, `${photoId}${ext}`);
    
    // Copy file
    fs.copyFileSync(sourcePath, destPath);
    
    return {
        storagePath: destPath,
        relativePath: path.join(yearMonth, `${photoId}${ext}`)
    };
}

// Create thumbnail (simple copy, resized in browser)
async function createThumbnail(sourcePath, photoId) {
    const ext = path.extname(sourcePath);
    const thumbPath = path.join(thumbsDir, `${photoId}${ext}`);
    
    // Just copy the file (browser will resize it)
    fs.copyFileSync(sourcePath, thumbPath);
    return thumbPath;
}

// Get file as base64 (for displaying in browser)
function getPhotoAsBase64(photoPath) {
    try {
        if (!fs.existsSync(photoPath)) {
            console.error('Photo file not found:', photoPath);
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
        
        return `data:${mimeType};base64,${data.toString('base64')}`;
    } catch (error) {
        console.error('Error reading photo:', error);
        return null;
    }
}

// Delete photo files
function deletePhotoFiles(photoId, relativePath) {
    try {
        // Delete main photo
        const photoPath = path.join(photosDir, relativePath);
        if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
        }
        
        // Delete thumbnail (check for multiple extensions)
        const thumbExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        for (const ext of thumbExtensions) {
            const thumbPath = path.join(thumbsDir, `${photoId}${ext}`);
            if (fs.existsSync(thumbPath)) {
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
        // Get current photos metadata
        const photos = store.get('photos', []);
        
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
            favorite: photoData.favorite || false,
            faces: photoData.faces || 0,
            album: photoData.album || null,
            tags: photoData.tags || [],
            fileSize: photoData.fileSize || 0
        };
        
        photos.push(metadata);
        store.set('photos', photos);
        
        console.log('Photo saved:', metadata.name);
        
        return { success: true, photo: metadata };
    } catch (error) {
        console.error('Error saving photo:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-photos', async () => {
    try {
        const photos = store.get('photos', []);
        
        console.log(`Loading ${photos.length} photos...`);
        
        // Add base64 data for thumbnails
        const photosWithData = photos.map(photo => {
            const thumbData = getPhotoAsBase64(photo.thumbnailPath);
            
            if (!thumbData) {
                console.warn('Failed to load thumbnail for:', photo.name);
            }
            
            return {
                ...photo,
                src: thumbData || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2NjYyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE2IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+' // Fallback placeholder
            };
        });
        
        console.log(`Loaded ${photosWithData.length} photos with thumbnails`);
        
        return { success: true, photos: photosWithData };
    } catch (error) {
        console.error('Error getting photos:', error);
        return { success: false, error: error.message, photos: [] };
    }
});

ipcMain.handle('get-full-photo', async (event, photoId) => {
    try {
        const photos = store.get('photos', []);
        const photo = photos.find(p => p.id === photoId);
        
        if (!photo) {
            return { success: false, error: 'Photo not found' };
        }
        
        // Return full resolution image
        const fullData = getPhotoAsBase64(photo.storagePath);
        
        if (!fullData) {
            return { success: false, error: 'Could not load photo file' };
        }
        
        return { 
            success: true, 
            photo: {
                ...photo,
                src: fullData
            }
        };
    } catch (error) {
        console.error('Error getting full photo:', error);
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
        const photos = store.get('photos', []);
        const photo = photos.find(p => p.id === photoId);
        
        if (photo) {
            // Delete physical files
            deletePhotoFiles(photo.id, photo.relativePath);
        }
        
        const filtered = photos.filter(p => p.id !== photoId);
        store.set('photos', filtered);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-photos', async (event, photoIds) => {
    try {
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
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
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
        
        console.log(`Importing ${result.filePaths.length} photos...`);
        
        for (const filePath of result.filePaths) {
            try {
                const photoId = generatePhotoId();
                
                console.log(`Processing: ${path.basename(filePath)}`);
                
                // Copy photo to storage
                const { storagePath, relativePath } = await copyPhotoToStorage(filePath, photoId);
                
                // Create thumbnail
                const thumbnailPath = await createThumbnail(filePath, photoId);
                
                // Get file stats
                const stats = fs.statSync(filePath);
                
                files.push({
                    id: photoId,
                    name: path.basename(filePath),
                    storagePath: storagePath,
                    relativePath: relativePath,
                    thumbnailPath: thumbnailPath,
                    originalPath: filePath,
                    fileSize: stats.size
                });
                
                console.log(`✓ Imported: ${path.basename(filePath)}`);
            } catch (error) {
                console.error('Error processing file:', filePath, error);
            }
        }
        
        console.log(`Successfully imported ${files.length} photos`);
        
        return { success: true, files };
    }
    
    return { success: false, files: [] };
});

// Export photo
ipcMain.handle('export-photo', async (event, photoId, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [
            { name: 'Images', extensions: ['jpg', 'png'] }
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
        const storagePath = store.get('storagePath') || app.getPath('documents');
        
        return {
            success: true,
            info: {
                photoCount: photos.length,
                totalSize: totalSize,
                storagePath: storagePath,
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
