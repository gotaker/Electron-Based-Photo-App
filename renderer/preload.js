/**
 * PhotoVault — Preload Script
 * Exposes all IPC handlers to the renderer via contextBridge.
 * Nothing from Node/Electron leaks directly into the page.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,

    // ── Photos ────────────────────────────────────────────────
    getPhotos:     ()               => ipcRenderer.invoke('get-photos'),
    getFullPhoto:  (id)             => ipcRenderer.invoke('get-full-photo', id),
    savePhoto:     (metadata)       => ipcRenderer.invoke('save-photo', metadata),
    updatePhoto:   (id, changes)    => ipcRenderer.invoke('update-photo', id, changes),
    deletePhotos:  (ids)            => ipcRenderer.invoke('delete-photos', ids),

    // ── Import / Export ───────────────────────────────────────
    openFileDialog: ()              => ipcRenderer.invoke('open-file-dialog'),
    exportPhoto:    (id, name)      => ipcRenderer.invoke('export-photo', id, name),

    // ── Albums ────────────────────────────────────────────────
    saveAlbum:     (album)          => ipcRenderer.invoke('save-album', album),
    getAlbums:     ()               => ipcRenderer.invoke('get-albums'),
    deleteAlbum:   (id)             => ipcRenderer.invoke('delete-album', id),

    // ── Editing ───────────────────────────────────────────────
    applyPhotoEdits: (id, edits)    => ipcRenderer.invoke('apply-photo-edits', id, edits),

    // ── Storage ───────────────────────────────────────────────
    getStorageInfo:       ()        => ipcRenderer.invoke('get-storage-info'),
    changeStorageLocation: ()       => ipcRenderer.invoke('change-storage-location'),
    clearAllData:         ()        => ipcRenderer.invoke('clear-all-data'),

    // ── Azure (optional) ──────────────────────────────────────
    syncAzureBlob:      (opts)      => ipcRenderer.invoke('sync-azure-blob', opts),
    getAzureSyncStatus: ()          => ipcRenderer.invoke('get-azure-sync-status'),

    // ── Sync config (persisted) ───────────────────────────────
    getSyncConfig:  ()              => ipcRenderer.invoke('get-sync-config'),
    saveSyncConfig: (config)        => ipcRenderer.invoke('save-sync-config', config),

    // ── Google Photos ─────────────────────────────────────────
    syncGoogleAuth: (creds)         => ipcRenderer.invoke('sync-google-auth', creds),
    //  creds: { clientId, clientSecret }
    //  returns: { success, accessToken, refreshToken, email }

    syncGooglePhotoCount: (opts)    => ipcRenderer.invoke('sync-google-photo-count', opts),
    //  opts: { accessToken }
    //  returns: { success, count }

    syncGoogleList: (opts)          => ipcRenderer.invoke('sync-google-list', opts),
    //  opts: { accessToken, refreshToken, clientId, clientSecret }
    //  returns: { success, items[], accessToken }

    syncGoogleDownload: (opts)      => ipcRenderer.invoke('sync-google-download', opts),
    //  opts: { item, accessToken }
    //  returns: { success, photo }

    syncGoogleUpload: (opts)        => ipcRenderer.invoke('sync-google-upload', opts),
    //  opts: { photo, accessToken, refreshToken, clientId, clientSecret }
    //  returns: { success, googleId, accessToken }

    // ── Apple Photos (macOS only) ─────────────────────────────
    syncAppleConnect: ()            => ipcRenderer.invoke('sync-apple-connect'),
    //  returns: { success, photoCount, library? }

    syncAppleRun: (opts)            => ipcRenderer.invoke('sync-apple-run', opts),
    //  opts: { direction, localPhotos[] }
    //  returns: { success, downloaded[], uploaded, libraryCount }

});
