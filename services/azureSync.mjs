/**
 * Optional Azure Blob sync and Face API helpers.
 *
 * Offline / conflict policy:
 * - Local library is always canonical on disk; sync uploads local files to Blob.
 * - If the same blob name exists in Azure, upload overwrites it (last upload wins).
 * - No automatic download merge; restoring from cloud is out of scope for this stub.
 */

import fs from 'fs';
import path from 'path';

function env(name) {
    return process.env[name] || '';
}

export function getAzureSyncStatus() {
    const storageConfigured = Boolean(env('AZURE_STORAGE_CONNECTION_STRING'));
    const faceConfigured = Boolean(env('AZURE_FACE_ENDPOINT') && env('AZURE_FACE_KEY'));
    return {
        storageConfigured,
        faceConfigured,
        container: env('AZURE_STORAGE_CONTAINER') || 'photovault',
        offlineMode: !storageConfigured,
        conflictPolicy: 'local_canonical_last_upload_overwrites_cloud'
    };
}

/**
 * Upload all photos in the store to Azure Blob (when configured).
 */
export async function syncAzureBlob(store, _options = {}) {
    const status = getAzureSyncStatus();
    if (!status.storageConfigured) {
        return {
            success: false,
            skipped: true,
            reason: 'not_configured',
            message: 'Set AZURE_STORAGE_CONNECTION_STRING (and optionally AZURE_STORAGE_CONTAINER) to enable sync.'
        };
    }

    try {
        const { BlobServiceClient } = await import('@azure/storage-blob');
        const client = BlobServiceClient.fromConnectionString(env('AZURE_STORAGE_CONNECTION_STRING'));
        const containerName = status.container;
        const container = client.getContainerClient(containerName);
        await container.createIfNotExists({ access: 'blob' });

        const photos = store.get('photos', []);
        let uploaded = 0;
        for (const photo of photos) {
            if (!photo.storagePath || !fs.existsSync(photo.storagePath)) continue;
            const blobName = (photo.relativePath || path.basename(photo.storagePath)).replace(/\\/g, '/');
            const block = container.getBlockBlobClient(blobName);
            const data = fs.readFileSync(photo.storagePath);
            await block.uploadData(data);
            uploaded += 1;
        }
        return { success: true, uploaded, container: containerName };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Optional: detect face count via Azure Face API (REST).
 */
export async function analyzeFaceCountForImageFile(filePath) {
    const endpoint = env('AZURE_FACE_ENDPOINT').replace(/\/$/, '');
    const key = env('AZURE_FACE_KEY');
    if (!endpoint || !key || !fs.existsSync(filePath)) {
        return { faces: null, skipped: true };
    }

    const buf = fs.readFileSync(filePath);
    const url = `${endpoint}/face/v1.0/detect?returnFaceId=false`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/octet-stream'
        },
        body: buf
    });
    if (!res.ok) {
        const text = await res.text();
        console.warn('Azure Face API:', res.status, text);
        return { faces: null, error: text };
    }
    const data = await res.json();
    return { faces: Array.isArray(data) ? data.length : 0 };
}
