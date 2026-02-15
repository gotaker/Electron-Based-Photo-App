import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Store from 'electron-store';

// ES modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize electron-store for persistent data
const store = new Store();

let mainWindow;

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
            preload: path.join(__dirname, 'preload.mjs')
        },
        backgroundColor: '#f5f5f5',
        icon: path.join(__dirname, 'build/icon.png'),
        show: false // Don't show until ready
    });

    // Load the application
    mainWindow.loadFile('renderer/index.html');

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
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
        const photos = store.get('photos', []);
        photos.push(photoData);
        store.set('photos', photos);
        return { success: true, photo: photoData };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-photos', async () => {
    try {
        const photos = store.get('photos', []);
        return { success: true, photos };
    } catch (error) {
        return { success: false, error: error.message, photos: [] };
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
        for (const filePath of result.filePaths) {
            try {
                const data = fs.readFileSync(filePath);
                const base64 = data.toString('base64');
                const ext = path.extname(filePath).toLowerCase();
                const mimeType = {
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.bmp': 'image/bmp',
                    '.webp': 'image/webp'
                }[ext] || 'image/jpeg';
                
                files.push({
                    name: path.basename(filePath),
                    data: `data:${mimeType};base64,${base64}`,
                    path: filePath
                });
            } catch (error) {
                console.error('Error reading file:', error);
            }
        }
        return { success: true, files };
    }
    
    return { success: false, files: [] };
});

// Export photo
ipcMain.handle('export-photo', async (event, photoData, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [
            { name: 'Images', extensions: ['jpg', 'png'] }
        ]
    });

    if (!result.canceled && result.filePath) {
        try {
            const base64Data = photoData.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(result.filePath, buffer);
            return { success: true, path: result.filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    return { success: false };
});

// Clear all data (useful for testing)
ipcMain.handle('clear-all-data', async () => {
    try {
        store.clear();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
