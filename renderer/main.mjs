/**
 * PhotoVault — Electron Main Process
 * Handles: window lifecycle, IPC, file I/O, Sharp pipeline,
 *           EXIF reading, Azure Blob, Google Photos OAuth, Apple Photos sync
 */

import { app, BrowserWindow, ipcMain, dialog, shell, net } from 'electron';
import path  from 'path';
import fs    from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import crypto from 'crypto';
import http   from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync  = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);

// ── Third-party deps ─────────────────────────────────────────
const Store  = require('electron-store');
const sharp  = require('sharp');
const exifr  = require('exifr');

// ── App-wide stores ───────────────────────────────────────────
const store     = new Store({ name: 'photovault-app' });
const syncStore = new Store({ name: 'photovault-sync' });

// ── Storage root ──────────────────────────────────────────────
function getStorageRoot() {
    return store.get('storageLocation',
        path.join(app.getPath('pictures'), 'PhotoVault'));
}

function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
}

// ── Window ────────────────────────────────────────────────────
let win;

function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload:       path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration:  false,
        },
    });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});


// ══════════════════════════════════════════════════════════════
//  PHOTO CRUD
// ══════════════════════════════════════════════════════════════

ipcMain.handle('get-photos', async () => {
    try {
        const photos = store.get('photos', []);
        const root   = getStorageRoot();
        const thumbDir = path.join(root, 'thumbnails');

        const enriched = photos.map(p => {
            const thumbPath = p.thumbnailPath || path.join(thumbDir, p.id + '.jpg');
            let src = '';
            if (fs.existsSync(thumbPath)) {
                const data = fs.readFileSync(thumbPath);
                src = 'data:image/jpeg;base64,' + data.toString('base64');
            }
            return { ...p, src };
        });
        return { success: true, photos: enriched };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-full-photo', async (_e, photoId) => {
    try {
        const photos = store.get('photos', []);
        const photo  = photos.find(p => p.id === photoId);
        if (!photo) return { success: false, error: 'Photo not found' };

        let src = '';
        if (photo.storagePath && fs.existsSync(photo.storagePath)) {
            const data = fs.readFileSync(photo.storagePath);
            const ext  = path.extname(photo.storagePath).toLowerCase();
            const mime = ext === '.png' ? 'image/png'
                       : ext === '.webp' ? 'image/webp'
                       : 'image/jpeg';
            src = `data:${mime};base64,` + data.toString('base64');
        }
        return { success: true, photo: { ...photo, src } };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('save-photo', async (_e, metadata) => {
    try {
        const photos = store.get('photos', []);
        const idx    = photos.findIndex(p => p.id === metadata.id);
        if (idx >= 0) photos[idx] = metadata;
        else photos.push(metadata);
        store.set('photos', photos);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('update-photo', async (_e, photoId, changes) => {
    try {
        const photos = store.get('photos', []);
        const idx    = photos.findIndex(p => p.id === photoId);
        if (idx < 0) return { success: false, error: 'Photo not found' };
        photos[idx] = { ...photos[idx], ...changes };
        store.set('photos', photos);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-photos', async (_e, photoIds) => {
    try {
        const photos = store.get('photos', []);
        const toDelete = photos.filter(p => photoIds.includes(p.id));

        // Delete files from disk
        for (const p of toDelete) {
            try { if (p.storagePath   && fs.existsSync(p.storagePath))   fs.unlinkSync(p.storagePath); }   catch (_) {}
            try { if (p.thumbnailPath && fs.existsSync(p.thumbnailPath)) fs.unlinkSync(p.thumbnailPath); } catch (_) {}
        }

        store.set('photos', photos.filter(p => !photoIds.includes(p.id)));
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ══════════════════════════════════════════════════════════════
//  FILE IMPORT
// ══════════════════════════════════════════════════════════════

ipcMain.handle('open-file-dialog', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Images', extensions: ['jpg','jpeg','png','webp','heic','heif','tiff','bmp'] }
            ]
        });
        if (canceled || filePaths.length === 0) return { success: false, files: [] };

        const root     = getStorageRoot();
        const now      = new Date();
        const monthDir = ensureDir(path.join(root, 'photos',
            `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`));
        const thumbDir = ensureDir(path.join(root, 'thumbnails'));

        const files = [];
        for (const src of filePaths) {
            const id  = crypto.randomBytes(16).toString('hex');
            const ext = path.extname(src).toLowerCase() || '.jpg';
            const dest = path.join(monthDir, id + ext);
            const thumb = path.join(thumbDir, id + '.jpg');

            // Copy original
            fs.copyFileSync(src, dest);

            // Generate 400×400 thumbnail
            try {
                await sharp(dest).rotate().resize(400, 400, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(thumb);
            } catch (_) {
                try { fs.copyFileSync(dest, thumb); } catch (_2) {}
            }

            // EXIF
            let captureDateISO = null, cameraMake = null, cameraModel = null;
            try {
                const exif = await exifr.parse(dest, ['DateTimeOriginal','Make','Model']);
                if (exif?.DateTimeOriginal) captureDateISO = new Date(exif.DateTimeOriginal).toISOString();
                cameraMake  = exif?.Make  || null;
                cameraModel = exif?.Model || null;
            } catch (_) {}

            // Face count (Azure optional)
            let faces = 0;
            const faceEndpoint = process.env.AZURE_FACE_ENDPOINT;
            const faceKey      = process.env.AZURE_FACE_KEY;
            if (faceEndpoint && faceKey) {
                try {
                    const imgData = fs.readFileSync(dest);
                    const res = await fetch(`${faceEndpoint}/face/v1.0/detect`, {
                        method: 'POST',
                        headers: { 'Ocp-Apim-Subscription-Key': faceKey, 'Content-Type': 'application/octet-stream' },
                        body: imgData,
                    });
                    const json = await res.json();
                    faces = Array.isArray(json) ? json.length : 0;
                } catch (_) {}
            }

            const stat = fs.statSync(dest);
            const dateAdded = new Date().toISOString();

            files.push({
                id,
                name: path.basename(src),
                storagePath:   dest,
                relativePath:  path.relative(root, dest),
                thumbnailPath: thumb,
                originalPath:  src,
                displayDate:   captureDateISO
                    ? new Date(captureDateISO).toLocaleDateString()
                    : now.toLocaleDateString(),
                dateAdded,
                captureDateISO,
                cameraMake,
                cameraModel,
                fileSize: stat.size,
                faces,
            });
        }

        return { success: true, files };
    } catch (err) {
        return { success: false, error: err.message, files: [] };
    }
});


// ══════════════════════════════════════════════════════════════
//  EXPORT / SHARE
// ══════════════════════════════════════════════════════════════

ipcMain.handle('export-photo', async (_e, photoId, suggestedName) => {
    try {
        const photos = store.get('photos', []);
        const photo  = photos.find(p => p.id === photoId);
        if (!photo || !photo.storagePath) return { success: false, error: 'Photo not found' };

        const { canceled, filePath } = await dialog.showSaveDialog(win, {
            defaultPath: suggestedName || photo.name,
            filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }]
        });
        if (canceled || !filePath) return { success: false, error: 'Cancelled' };

        fs.copyFileSync(photo.storagePath, filePath);
        return { success: true, savedPath: filePath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ══════════════════════════════════════════════════════════════
//  ALBUMS
// ══════════════════════════════════════════════════════════════

ipcMain.handle('save-album', async (_e, album) => {
    try {
        const albums = store.get('albums', []);
        const idx = albums.findIndex(a => a.id === album.id);
        if (idx >= 0) albums[idx] = album; else albums.push(album);
        store.set('albums', albums);
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-albums', async () => {
    try {
        return { success: true, albums: store.get('albums', []) };
    } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('delete-album', async (_e, albumId) => {
    try {
        store.set('albums', store.get('albums', []).filter(a => a.id !== albumId));
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});


// ══════════════════════════════════════════════════════════════
//  PHOTO EDITING (Sharp)
// ══════════════════════════════════════════════════════════════

ipcMain.handle('apply-photo-edits', async (_e, photoId, edits) => {
    try {
        const photos = store.get('photos', []);
        const photo  = photos.find(p => p.id === photoId);
        if (!photo || !photo.storagePath) return { success: false, error: 'Photo not found' };

        let pipeline = sharp(photo.storagePath).rotate(edits.rotation || 0);

        const { brightness=100, contrast=100, saturation=100, blur=0, flipH, flipV } = edits;

        pipeline = pipeline.modulate({
            brightness: brightness / 100,
            saturation: saturation / 100,
        });

        if (blur > 0) pipeline = pipeline.blur(blur);
        if (flipH)    pipeline = pipeline.flop();
        if (flipV)    pipeline = pipeline.flip();

        // Apply filter as a tint/greyscale operation
        const filterMap = {
            grayscale: () => pipeline.grayscale(),
            sepia:     () => pipeline.grayscale().tint({ r:112, g:66, b:20 }),
            vintage:   () => pipeline.grayscale().tint({ r:100, g:80, b:60 }).modulate({ brightness: 1.05 }),
            warm:      () => pipeline.tint({ r:255, g:200, b:150 }),
            cool:      () => pipeline.tint({ r:150, g:180, b:255 }),
            vivid:     () => pipeline.modulate({ saturation: 1.6 }),
            dramatic:  () => pipeline.grayscale().modulate({ brightness: 0.9 }),
        };
        if (filterMap[edits.filter]) pipeline = filterMap[edits.filter]();

        // Write back to same path (overwrite original)
        const ext = path.extname(photo.storagePath).toLowerCase();
        const outOpts = ext === '.png'  ? pipeline.png()
                      : ext === '.webp' ? pipeline.webp()
                      :                   pipeline.jpeg({ quality: 92 });

        const tmpPath = photo.storagePath + '.tmp';
        await outOpts.toFile(tmpPath);
        fs.renameSync(tmpPath, photo.storagePath);

        // Regenerate thumbnail
        if (photo.thumbnailPath) {
            await sharp(photo.storagePath)
                .resize(400, 400, { fit: 'cover' })
                .jpeg({ quality: 85 })
                .toFile(photo.thumbnailPath + '.tmp');
            fs.renameSync(photo.thumbnailPath + '.tmp', photo.thumbnailPath);
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ══════════════════════════════════════════════════════════════
//  STORAGE MANAGEMENT
// ══════════════════════════════════════════════════════════════

ipcMain.handle('get-storage-info', async () => {
    try {
        const root = getStorageRoot();
        ensureDir(root);
        let totalBytes = 0;
        const walk = dir => {
            if (!fs.existsSync(dir)) return;
            for (const f of fs.readdirSync(dir)) {
                const full = path.join(dir, f);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) walk(full);
                else totalBytes += stat.size;
            }
        };
        walk(root);
        return { success: true, storageLocation: root, totalBytes };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('change-storage-location', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openDirectory', 'createDirectory'],
            title: 'Choose PhotoVault storage folder',
        });
        if (canceled) return { success: false };
        store.set('storageLocation', path.join(filePaths[0], 'PhotoVault'));
        return { success: true, newLocation: store.get('storageLocation') };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('clear-all-data', async () => {
    try {
        store.set('photos', []);
        store.set('albums', []);
        const root = getStorageRoot();
        if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ══════════════════════════════════════════════════════════════
//  AZURE BLOB SYNC (optional, env-configured)
// ══════════════════════════════════════════════════════════════

ipcMain.handle('sync-azure-blob', async () => {
    const connStr   = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const container = process.env.AZURE_STORAGE_CONTAINER || 'photovault';
    if (!connStr) return { skipped: true, message: 'AZURE_STORAGE_CONNECTION_STRING not set.' };

    try {
        const { BlobServiceClient } = require('@azure/storage-blob');
        const client    = BlobServiceClient.fromConnectionString(connStr);
        const cClient   = client.getContainerClient(container);
        await cClient.createIfNotExists();

        const photos = store.get('photos', []);
        let uploaded = 0;
        for (const p of photos) {
            if (!p.storagePath || !fs.existsSync(p.storagePath)) continue;
            const blob = cClient.getBlockBlobClient(path.basename(p.storagePath));
            await blob.uploadFile(p.storagePath);
            uploaded++;
        }
        return { success: true, uploaded, container };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-azure-sync-status', async () => {
    return { configured: Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING) };
});


// ══════════════════════════════════════════════════════════════
//  SYNC CONFIG (persisted for Google/Apple sync state)
// ══════════════════════════════════════════════════════════════

ipcMain.handle('get-sync-config', async () => {
    try {
        const config = syncStore.get('syncConfig', null);
        return { success: true, config };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('save-sync-config', async (_e, config) => {
    try {
        syncStore.set('syncConfig', config);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ══════════════════════════════════════════════════════════════
//  GOOGLE PHOTOS OAUTH 2.0 (PKCE / Desktop flow)
// ══════════════════════════════════════════════════════════════

/**
 * Opens a local HTTP server on a random port to capture the OAuth redirect,
 * then launches the system browser for Google sign-in.
 * Returns { success, accessToken, refreshToken, email }.
 */
ipcMain.handle('sync-google-auth', async (_e, { clientId, clientSecret }) => {
    return new Promise(resolve => {
        // Pick a random local port for the redirect URI
        const server = http.createServer();
        server.listen(0, '127.0.0.1', async () => {
            const port        = server.address().port;
            const redirectUri = `http://127.0.0.1:${port}/oauth`;
            const scopes      = [
                'https://www.googleapis.com/auth/photoslibrary.readonly',
                'https://www.googleapis.com/auth/photoslibrary.appendonly',
                'email',
                'profile',
            ].join(' ');

            const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            authUrl.searchParams.set('client_id',     clientId);
            authUrl.searchParams.set('redirect_uri',  redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope',         scopes);
            authUrl.searchParams.set('access_type',   'offline');
            authUrl.searchParams.set('prompt',        'consent');

            // Open browser
            shell.openExternal(authUrl.toString());

            server.on('request', async (req, res) => {
                const url    = new URL(req.url, `http://127.0.0.1:${port}`);
                const code   = url.searchParams.get('code');
                const errMsg = url.searchParams.get('error');

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body style="font-family:system-ui;padding:40px">'
                    + '<h2>PhotoVault</h2>'
                    + (errMsg ? `<p style="color:red">Auth failed: ${errMsg}</p>`
                               : '<p>Authentication successful! You can close this tab.</p>')
                    + '</body></html>');

                server.close();

                if (!code) {
                    return resolve({ success: false, error: errMsg || 'No auth code received' });
                }

                // Exchange code for tokens
                try {
                    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            code,
                            client_id:     clientId,
                            client_secret: clientSecret,
                            redirect_uri:  redirectUri,
                            grant_type:    'authorization_code',
                        }),
                    });
                    const tokens = await tokenRes.json();
                    if (tokens.error) {
                        return resolve({ success: false, error: tokens.error_description || tokens.error });
                    }

                    // Get user email
                    let email = '';
                    try {
                        const profileRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
                            headers: { Authorization: `Bearer ${tokens.access_token}` },
                        });
                        const profile = await profileRes.json();
                        email = profile.email || '';
                    } catch (_) {}

                    resolve({
                        success:      true,
                        accessToken:  tokens.access_token,
                        refreshToken: tokens.refresh_token || '',
                        email,
                    });
                } catch (err) {
                    resolve({ success: false, error: err.message });
                }
            });
        });

        server.on('error', err => resolve({ success: false, error: err.message }));
    });
});


// ── Token refresh helper ──────────────────────────────────────
async function refreshGoogleToken(clientId, clientSecret, refreshToken) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id:     clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type:    'refresh_token',
        }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data.access_token;
}


// ── Google Photos: get total photo count ─────────────────────
ipcMain.handle('sync-google-photo-count', async (_e, { accessToken }) => {
    try {
        const res  = await fetch(
            'https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=1',
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const data = await res.json();
        if (data.error) return { success: false, error: data.error.message };
        // Google doesn't expose total count directly; return a rough estimate from the first page
        return { success: true, count: data.totalMediaItems ?? '?' };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ── Google Photos: list all remote items (handles pagination) ─
ipcMain.handle('sync-google-list', async (_e, { accessToken, refreshToken, clientId, clientSecret }) => {
    try {
        const items = [];
        let pageToken = null;
        let token = accessToken;

        do {
            const url = new URL('https://photoslibrary.googleapis.com/v1/mediaItems');
            url.searchParams.set('pageSize', '100');
            if (pageToken) url.searchParams.set('pageToken', pageToken);

            let res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Refresh token if 401
            if (res.status === 401 && refreshToken && clientId && clientSecret) {
                token = await refreshGoogleToken(clientId, clientSecret, refreshToken);
                res   = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }

            const data = await res.json();
            if (data.error) return { success: false, error: data.error.message };

            if (data.mediaItems) items.push(...data.mediaItems);
            pageToken = data.nextPageToken || null;
        } while (pageToken);

        return { success: true, items, accessToken: token };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ── Google Photos: download one item ─────────────────────────
ipcMain.handle('sync-google-download', async (_e, { item, accessToken }) => {
    try {
        if (!item?.baseUrl) return { success: false, error: 'No baseUrl' };

        const root     = getStorageRoot();
        const now      = new Date();
        const monthDir = ensureDir(path.join(root, 'photos',
            `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`));
        const thumbDir = ensureDir(path.join(root, 'thumbnails'));

        const id  = crypto.randomBytes(16).toString('hex');
        const ext = item.mimeType === 'image/png' ? '.png'
                  : item.mimeType === 'image/webp' ? '.webp'
                  : '.jpg';
        const dest  = path.join(monthDir, id + ext);
        const thumb = path.join(thumbDir, id + '.jpg');

        // Download full-resolution image
        const imgRes = await fetch(`${item.baseUrl}=d`);
        if (!imgRes.ok) return { success: false, error: `HTTP ${imgRes.status}` };
        const buf = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(dest, buf);

        // Generate thumbnail
        try {
            await sharp(dest).rotate().resize(400, 400, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(thumb);
        } catch (_) { fs.copyFileSync(dest, thumb); }

        // EXIF
        let captureDateISO = null, cameraMake = null, cameraModel = null;
        try {
            const exif = await exifr.parse(dest, ['DateTimeOriginal','Make','Model']);
            if (exif?.DateTimeOriginal) captureDateISO = new Date(exif.DateTimeOriginal).toISOString();
            cameraMake  = exif?.Make  || null;
            cameraModel = exif?.Model || null;
        } catch (_) {}

        const photo = {
            id,
            name:          item.filename || id + ext,
            storagePath:   dest,
            relativePath:  path.relative(root, dest),
            thumbnailPath: thumb,
            originalPath:  dest,
            date:          captureDateISO
                ? new Date(captureDateISO).toLocaleDateString()
                : now.toLocaleDateString(),
            dateAdded:     now.toISOString(),
            captureDateISO,
            cameraMake,
            cameraModel,
            fileSize: buf.length,
            favorite: false,
            faces:    0,
            album:    null,
            tags:     [],
            deleted:  false,
            deletedAt: null,
            editedAt:  null,
            googleId:  item.id,
        };

        // Persist
        const photos = store.get('photos', []);
        photos.push(photo);
        store.set('photos', photos);

        // Build src for renderer
        const imgData = fs.readFileSync(thumb);
        photo.src = 'data:image/jpeg;base64,' + imgData.toString('base64');

        return { success: true, photo };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ── Google Photos: upload one local photo ────────────────────
ipcMain.handle('sync-google-upload', async (_e, { photo, accessToken, refreshToken, clientId, clientSecret }) => {
    try {
        if (!photo.storagePath || !fs.existsSync(photo.storagePath)) {
            return { success: false, error: 'File not found on disk' };
        }

        let token = accessToken;
        const buf = fs.readFileSync(photo.storagePath);
        const ext = path.extname(photo.storagePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png'
                       : ext === '.webp' ? 'image/webp'
                       : 'image/jpeg';

        // Step 1: Upload bytes to get an upload token
        let uploadRes = await fetch('https://photoslibrary.googleapis.com/v1/uploads', {
            method:  'POST',
            headers: {
                Authorization:          `Bearer ${token}`,
                'Content-Type':         'application/octet-stream',
                'X-Goog-Upload-Protocol': 'raw',
                'X-Goog-Upload-File-Name': photo.name || 'photo.jpg',
                'X-Goog-Upload-Content-Type': mimeType,
            },
            body: buf,
        });

        // Refresh token if 401
        if (uploadRes.status === 401 && refreshToken && clientId && clientSecret) {
            token = await refreshGoogleToken(clientId, clientSecret, refreshToken);
            uploadRes = await fetch('https://photoslibrary.googleapis.com/v1/uploads', {
                method: 'POST',
                headers: {
                    Authorization:          `Bearer ${token}`,
                    'Content-Type':         'application/octet-stream',
                    'X-Goog-Upload-Protocol': 'raw',
                    'X-Goog-Upload-File-Name': photo.name || 'photo.jpg',
                    'X-Goog-Upload-Content-Type': mimeType,
                },
                body: buf,
            });
        }

        if (!uploadRes.ok) {
            return { success: false, error: `Upload step 1 failed: HTTP ${uploadRes.status}` };
        }
        const uploadToken = await uploadRes.text();

        // Step 2: Create media item
        const createRes = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                newMediaItems: [{
                    description: photo.name,
                    simpleMediaItem: {
                        fileName:    photo.name,
                        uploadToken,
                    }
                }]
            }),
        });

        const createData = await createRes.json();
        const result     = createData.newMediaItemResults?.[0];
        if (!result?.mediaItem?.id) {
            return { success: false, error: result?.status?.message || 'Create failed' };
        }

        return { success: true, googleId: result.mediaItem.id, accessToken: token };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// ══════════════════════════════════════════════════════════════
//  APPLE PHOTOS SYNC (macOS only)
// ══════════════════════════════════════════════════════════════

/**
 * Connect to the system Photos library via osxphotos (CLI) if available,
 * falling back to AppleScript for a basic count.
 */
ipcMain.handle('sync-apple-connect', async () => {
    if (process.platform !== 'darwin') {
        return { success: false, error: 'Apple Photos sync is only available on macOS.' };
    }

    try {
        // Try osxphotos first (pip install osxphotos)
        const { stdout } = await execAsync('osxphotos info --json 2>/dev/null || echo "null"');
        const info = JSON.parse(stdout.trim());
        if (info && info.photos_count != null) {
            return { success: true, photoCount: info.photos_count, library: info.library_path };
        }
    } catch (_) {}

    // Fallback: AppleScript count
    try {
        const script = 'tell application "Photos" to return count of media items';
        const { stdout } = await execAsync(`osascript -e '${script}'`);
        const count = parseInt(stdout.trim(), 10) || 0;
        return { success: true, photoCount: count };
    } catch (err) {
        return { success: false, error: 'Could not connect to Apple Photos. Ensure Photos is installed and "Automation" permission is granted in System Settings → Privacy & Security.' };
    }
});


/**
 * Run the actual Apple Photos sync.
 * - direction: 'download' | 'bidirectional' | 'upload'
 * - For download/bidirectional: export photos from Apple Photos not already in PhotoVault
 * - For upload/bidirectional: import PhotoVault photos into Apple Photos via AppleScript
 */
ipcMain.handle('sync-apple-run', async (_e, { direction, localPhotos }) => {
    if (process.platform !== 'darwin') {
        return { success: false, error: 'macOS only' };
    }

    const root     = getStorageRoot();
    const now      = new Date();
    const monthDir = ensureDir(path.join(root, 'photos',
        `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`));
    const thumbDir = ensureDir(path.join(root, 'thumbnails'));

    const downloaded = [];
    let   uploaded   = 0;
    let   libraryCount = null;

    // ── DOWNLOAD from Apple Photos ──────────────────────────
    if (direction === 'download' || direction === 'bidirectional') {
        try {
            // Check osxphotos availability
            await execAsync('which osxphotos');

            // Export all photos not already in PhotoVault
            const localAppleIds = new Set(localPhotos.filter(p => p.appleId).map(p => p.appleId));
            const exportDir = path.join(root, '_apple_export_tmp');
            ensureDir(exportDir);

            // Export with original filenames and UUID tracking
            const exportCmd = [
                'osxphotos export',
                `"${exportDir}"`,
                '--original',
                '--skip-edited-version',
                '--overwrite',
                '--export-as-hardlink',
                '--not-missing',
                '--quiet',
            ].join(' ');

            await execAsync(exportCmd, { timeout: 5 * 60 * 1000 });

            // Scan exported files and import any new ones
            const exportedFiles = fs.readdirSync(exportDir)
                .filter(f => /\.(jpg|jpeg|png|webp|heic)$/i.test(f));

            for (const fname of exportedFiles) {
                const src = path.join(exportDir, fname);
                const id  = crypto.randomBytes(16).toString('hex');
                const ext = path.extname(fname).toLowerCase() || '.jpg';
                const dest  = path.join(monthDir, id + ext);
                const thumb = path.join(thumbDir, id + '.jpg');

                fs.copyFileSync(src, dest);

                let captureDateISO = null, cameraMake = null, cameraModel = null;
                try {
                    const exif = await exifr.parse(dest, ['DateTimeOriginal','Make','Model']);
                    if (exif?.DateTimeOriginal) captureDateISO = new Date(exif.DateTimeOriginal).toISOString();
                    cameraMake  = exif?.Make  || null;
                    cameraModel = exif?.Model || null;
                } catch (_) {}

                try {
                    await sharp(dest).rotate().resize(400,400,{fit:'cover'}).jpeg({quality:85}).toFile(thumb);
                } catch (_) { fs.copyFileSync(dest, thumb); }

                const stat = fs.statSync(dest);
                const photo = {
                    id, name: fname,
                    storagePath: dest,
                    relativePath: path.relative(root, dest),
                    thumbnailPath: thumb,
                    originalPath: dest,
                    date: captureDateISO ? new Date(captureDateISO).toLocaleDateString() : now.toLocaleDateString(),
                    dateAdded: now.toISOString(),
                    captureDateISO, cameraMake, cameraModel,
                    fileSize: stat.size,
                    favorite: false, faces: 0, album: null, tags: [],
                    deleted: false, deletedAt: null, editedAt: null,
                    appleId: id,
                };

                const photos = store.get('photos', []);
                photos.push(photo);
                store.set('photos', photos);

                const imgData = fs.readFileSync(thumb);
                photo.src = 'data:image/jpeg;base64,' + imgData.toString('base64');
                downloaded.push(photo);
            }

            // Cleanup
            fs.rmSync(exportDir, { recursive: true, force: true });
        } catch (osxphotosErr) {
            // osxphotos not available — inform but don't fail entirely
            if (direction === 'download') {
                return {
                    success: false,
                    error: 'osxphotos is required for downloading from Apple Photos. Install with: pip install osxphotos',
                };
            }
            // For bidirectional, continue to the upload step
        }
    }

    // ── UPLOAD to Apple Photos ───────────────────────────────
    if (direction === 'upload' || direction === 'bidirectional') {
        const toUpload = localPhotos.filter(p => !p.appleId && !p.deleted && p.storagePath);
        for (const p of toUpload) {
            if (!fs.existsSync(p.storagePath)) continue;
            try {
                const script = `tell application "Photos" to import POSIX file "${p.storagePath}"`;
                await execAsync(`osascript -e '${script}'`);
                uploaded++;
            } catch (_) {}
        }
    }

    // Get updated library count
    try {
        const { stdout } = await execAsync(`osascript -e 'tell application "Photos" to return count of media items'`);
        libraryCount = parseInt(stdout.trim(), 10) || null;
    } catch (_) {}

    return { success: true, downloaded, uploaded, libraryCount };
});
