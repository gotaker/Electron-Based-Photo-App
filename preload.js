const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Photo operations
    savePhoto: (photoData) => ipcRenderer.invoke('save-photo', photoData),
    getPhotos: () => ipcRenderer.invoke('get-photos'),
    getFullPhoto: (photoId) => ipcRenderer.invoke('get-full-photo', photoId),
    updatePhoto: (photoId, updates) => ipcRenderer.invoke('update-photo', photoId, updates),
    deletePhoto: (photoId) => ipcRenderer.invoke('delete-photo', photoId),
    deletePhotos: (photoIds) => ipcRenderer.invoke('delete-photos', photoIds),
    
    // Album operations
    saveAlbum: (albumData) => ipcRenderer.invoke('save-album', albumData),
    getAlbums: () => ipcRenderer.invoke('get-albums'),
    updateAlbum: (albumId, updates) => ipcRenderer.invoke('update-album', albumId, updates),
    deleteAlbum: (albumId) => ipcRenderer.invoke('delete-album', albumId),
    
    // File operations
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    exportPhoto: (photoId, defaultName) => ipcRenderer.invoke('export-photo', photoId, defaultName),
    
    // Storage info
    getStorageInfo: () => ipcRenderer.invoke('get-storage-info'),
    
    // Utility
    clearAllData: () => ipcRenderer.invoke('clear-all-data')
});
