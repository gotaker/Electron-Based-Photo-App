import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Photo operations
    savePhoto: (photoData) => ipcRenderer.invoke('save-photo', photoData),
    getPhotos: () => ipcRenderer.invoke('get-photos'),
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
    exportPhoto: (photoData, defaultName) => ipcRenderer.invoke('export-photo', photoData, defaultName),
    
    // Utility
    clearAllData: () => ipcRenderer.invoke('clear-all-data')
});
