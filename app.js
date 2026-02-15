// App State
let photos = [];
let albums = [];
let currentView = 'all';
let selectedPhotos = new Set();
let currentPhotoIndex = 0;
let currentEditingPhoto = null;
let searchQuery = '';

// Editor state
let currentFilter = 'none';
let brightness = 100;
let contrast = 100;
let saturation = 100;
let blur = 0;
let rotation = 0;
let flipH = false;
let flipV = false;

// Initialize app
async function initApp() {
    await loadPhotos();
    await loadAlbums();
    renderGallery();
    renderAlbums();
    updateCounts();
    updateStorageInfo();
}

// Load data from Electron store
async function loadPhotos() {
    console.log('Loading photos from storage...');
    const result = await window.electronAPI.getPhotos();
    console.log('Load photos result:', result);
    
    if (result.success) {
        photos = result.photos;
        console.log(`Loaded ${photos.length} photos`);
        
        // Debug: Check if photos have src
        photos.forEach((photo, index) => {
            if (!photo.src) {
                console.warn(`Photo ${index} (${photo.name}) has no src!`, photo);
            }
        });
    } else {
        console.error('Failed to load photos:', result.error);
    }
}

async function loadAlbums() {
    const result = await window.electronAPI.getAlbums();
    if (result.success) {
        albums = result.albums;
    } else {
        // Create default albums if none exist
        const defaultAlbums = [
            { id: Date.now() + 1, name: 'Favorites', photos: [] },
            { id: Date.now() + 2, name: 'Family', photos: [] }
        ];
        for (const album of defaultAlbums) {
            await window.electronAPI.saveAlbum(album);
        }
        albums = defaultAlbums;
    }
}

// File handling
async function importPhotos() {
    console.log('Opening file dialog...');
    const result = await window.electronAPI.openFileDialog();
    console.log('File dialog result:', result);
    
    if (result.success && result.files.length > 0) {
        console.log(`Importing ${result.files.length} files...`);
        
        for (const file of result.files) {
            console.log('Processing file:', file);
            
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
                faces: Math.floor(Math.random() * 4), // Simulated face detection
                album: null,
                tags: [],
                fileSize: file.fileSize
            };
            
            console.log('Saving photo metadata:', photo);
            const saveResult = await window.electronAPI.savePhoto(photo);
            console.log('Save result:', saveResult);
            
            if (saveResult.success) {
                // Reload photos to get them with src data
                await loadPhotos();
            } else {
                console.error('Failed to save photo:', saveResult.error);
            }
        }
        
        renderGallery();
        updateCounts();
        updateStorageInfo();
    } else {
        console.log('No files selected or import cancelled');
    }
}

// Render functions
function renderGallery() {
    const gallery = document.getElementById('gallery');
    const uploadZone = document.querySelector('.upload-zone');
    const emptyState = document.getElementById('emptyState');

    let filteredPhotos = getFilteredPhotos();
    
    console.log(`Rendering gallery with ${photos.length} total photos, ${filteredPhotos.length} filtered`);

    if (photos.length === 0) {
        uploadZone.style.display = 'block';
        gallery.style.display = 'none';
        emptyState.style.display = 'none';
        return;
    }

    uploadZone.style.display = 'none';

    if (filteredPhotos.length === 0) {
        gallery.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    gallery.style.display = 'grid';
    emptyState.style.display = 'none';

    gallery.innerHTML = filteredPhotos.map((photo) => {
        // Debug each photo
        if (!photo.src) {
            console.error('Photo missing src:', photo);
        }
        
        return `
        <div class="photo-card" onclick="openPhoto('${photo.id}')">
            <img src="${photo.src || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2NjYyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE2IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'}" alt="${photo.name}" onerror="console.error('Image failed to load:', '${photo.name}')">
            <div class="photo-select ${selectedPhotos.has(photo.id) ? 'selected' : ''}" 
                 onclick="event.stopPropagation(); toggleSelect('${photo.id}')"></div>
            ${photo.faces > 0 ? `<div class="face-badge">👤 ${photo.faces} ${photo.faces === 1 ? 'person' : 'people'}</div>` : ''}
            ${photo.favorite ? '<div class="face-badge" style="left: auto; right: 10px; background: #f39c12;">⭐</div>' : ''}
            <div class="photo-info">
                <div class="photo-name">${photo.name}</div>
                <div class="photo-date">${photo.date}</div>
            </div>
        </div>
    `;
    }).join('');

    updateToolbar();
}

function getFilteredPhotos() {
    let filtered = photos;

    // Filter by view
    if (currentView === 'favorites') {
        filtered = filtered.filter(p => p.favorite);
    } else if (currentView === 'people') {
        filtered = filtered.filter(p => p.faces > 0);
    } else if (typeof currentView === 'number') {
        filtered = filtered.filter(p => p.album === currentView);
    }

    // Filter by search
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(query) ||
            p.date.toLowerCase().includes(query) ||
            (p.tags && p.tags.some(tag => tag.toLowerCase().includes(query)))
        );
    }

    return filtered;
}

function filterPhotos() {
    searchQuery = document.getElementById('searchInput').value;
    renderGallery();
}

function renderAlbums() {
    const albumList = document.getElementById('albumList');
    albumList.innerHTML = albums.map(album => {
        const count = photos.filter(p => p.album === album.id).length;
        return `
            <div class="album-item" onclick="switchView(${album.id})">
                <span>📁 ${album.name}</span>
                <span class="album-count">${count}</span>
                <button class="album-delete" onclick="event.stopPropagation(); deleteAlbum(${album.id})">×</button>
            </div>
        `;
    }).join('');
}

async function createAlbum() {
    const name = prompt('Enter album name:');
    if (name && name.trim()) {
        const album = {
            id: Date.now(),
            name: name.trim(),
            photos: []
        };
        
        const result = await window.electronAPI.saveAlbum(album);
        if (result.success) {
            albums.push(album);
            renderAlbums();
        }
    }
}

async function deleteAlbum(albumId) {
    if (confirm('Delete this album? Photos will not be deleted.')) {
        const result = await window.electronAPI.deleteAlbum(albumId);
        if (result.success) {
            albums = albums.filter(a => a.id !== albumId);
            // Remove album from photos
            for (const photo of photos.filter(p => p.album === albumId)) {
                await window.electronAPI.updatePhoto(photo.id, { album: null });
                photo.album = null;
            }
            renderAlbums();
            if (currentView === albumId) {
                switchView('all');
            }
        }
    }
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    if (typeof view === 'string') {
        document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
    }
    renderGallery();
}

// Setup nav items
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentView = item.dataset.view;
        renderGallery();
    });
});

// Photo selection
function toggleSelect(photoId) {
    if (selectedPhotos.has(photoId)) {
        selectedPhotos.delete(photoId);
    } else {
        selectedPhotos.add(photoId);
    }
    renderGallery();
}

function updateToolbar() {
    const editBtn = document.getElementById('editBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const albumBtn = document.getElementById('albumBtn');
    
    if (selectedPhotos.size > 0) {
        editBtn.style.display = selectedPhotos.size === 1 ? 'flex' : 'none';
        deleteBtn.style.display = 'flex';
        albumBtn.style.display = 'flex';
    } else {
        editBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        albumBtn.style.display = 'none';
    }
}

async function deleteSelected() {
    if (confirm(`Delete ${selectedPhotos.size} photo(s)?`)) {
        const photoIds = Array.from(selectedPhotos);
        console.log('Deleting photos:', photoIds);
        
        const result = await window.electronAPI.deletePhotos(photoIds);
        console.log('Delete result:', result);
        
        if (result.success) {
            selectedPhotos.clear();
            // Reload photos from storage to get fresh data
            await loadPhotos();
            renderGallery();
            updateCounts();
            updateStorageInfo();
            console.log('Photos deleted successfully');
        } else {
            console.error('Failed to delete photos:', result.error);
            alert('Failed to delete photos: ' + result.error);
        }
    }
}

// Album assignment
function addToAlbum() {
    const modal = document.getElementById('albumModal');
    const albumSelectList = document.getElementById('albumSelectList');
    
    albumSelectList.innerHTML = albums.map(album => `
        <div class="album-item" onclick="assignToAlbum(${album.id})">
            <span>📁 ${album.name}</span>
        </div>
    `).join('');
    
    modal.classList.add('active');
}

async function assignToAlbum(albumId) {
    for (const photoId of selectedPhotos) {
        const photo = photos.find(p => p.id === photoId);
        if (photo) {
            await window.electronAPI.updatePhoto(photoId, { album: albumId });
            photo.album = albumId;
        }
    }
    
    selectedPhotos.clear();
    closeAlbumModal();
    renderGallery();
    renderAlbums();
}

function closeAlbumModal(event) {
    if (!event || event.target.id === 'albumModal' || event.target.classList.contains('close-btn')) {
        document.getElementById('albumModal').classList.remove('active');
    }
}

// Modal
async function openPhoto(photoId) {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;
    
    currentPhotoIndex = photos.indexOf(photo);
    const modalImage = document.getElementById('modalImage');
    
    // Show thumbnail first for instant display
    modalImage.src = photo.src;
    document.getElementById('photoModal').classList.add('active');
    
    // Load full resolution in background
    const fullPhotoResult = await window.electronAPI.getFullPhoto(photoId);
    if (fullPhotoResult.success) {
        modalImage.src = fullPhotoResult.photo.src;
    }
    
    updateFavoriteButton();
}

function closeModal(event) {
    if (event.target.classList.contains('modal') || event.target.classList.contains('modal-close')) {
        document.getElementById('photoModal').classList.remove('active');
    }
}

function nextPhoto() {
    const filtered = getFilteredPhotos();
    const currentPhoto = photos[currentPhotoIndex];
    const currentIndex = filtered.indexOf(currentPhoto);
    const nextIndex = (currentIndex + 1) % filtered.length;
    const nextPhoto = filtered[nextIndex];
    currentPhotoIndex = photos.indexOf(nextPhoto);
    openPhoto(nextPhoto.id);
}

function previousPhoto() {
    const filtered = getFilteredPhotos();
    const currentPhoto = photos[currentPhotoIndex];
    const currentIndex = filtered.indexOf(currentPhoto);
    const prevIndex = (currentIndex - 1 + filtered.length) % filtered.length;
    const prevPhoto = filtered[prevIndex];
    currentPhotoIndex = photos.indexOf(prevPhoto);
    openPhoto(prevPhoto.id);
}

function rotatePhotoModal() {
    const img = document.getElementById('modalImage');
    const currentRotation = img.style.transform || 'rotate(0deg)';
    const degrees = parseInt(currentRotation.match(/\d+/)?.[0] || 0);
    img.style.transform = `rotate(${degrees + 90}deg)`;
}

async function toggleFavorite() {
    const photo = photos[currentPhotoIndex];
    photo.favorite = !photo.favorite;
    await window.electronAPI.updatePhoto(photo.id, { favorite: photo.favorite });
    renderGallery();
    updateCounts();
    updateFavoriteButton();
}

function updateFavoriteButton() {
    const photo = photos[currentPhotoIndex];
    const favBtn = document.getElementById('favBtn');
    favBtn.style.opacity = photo.favorite ? '1' : '0.5';
}

async function exportCurrentPhoto() {
    const photo = photos[currentPhotoIndex];
    const result = await window.electronAPI.exportPhoto(photo.id, photo.name);
    if (result.success) {
        alert('Photo exported successfully!');
    }
}

// Editor
function toggleEditor() {
    const panel = document.getElementById('editorPanel');
    const isActive = panel.classList.contains('active');
    
    if (!isActive && selectedPhotos.size === 1) {
        const photoId = Array.from(selectedPhotos)[0];
        currentEditingPhoto = photos.find(p => p.id === photoId);
        resetEditorControls();
    }
    
    panel.classList.toggle('active');
}

function resetEditorControls() {
    currentFilter = 'none';
    brightness = 100;
    contrast = 100;
    saturation = 100;
    blur = 0;
    rotation = 0;
    flipH = false;
    flipV = false;
    
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.filter-btn').classList.add('active');
    
    document.querySelector('[oninput="adjustBrightness(this.value)"]').value = 100;
    document.querySelector('[oninput="adjustContrast(this.value)"]').value = 100;
    document.querySelector('[oninput="adjustSaturation(this.value)"]').value = 100;
    document.querySelector('[oninput="adjustBlur(this.value)"]').value = 0;
    
    updatePreview();
}

function applyFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    updatePreview();
}

function adjustBrightness(value) {
    brightness = value;
    document.getElementById('brightnessValue').textContent = value + '%';
    updatePreview();
}

function adjustContrast(value) {
    contrast = value;
    document.getElementById('contrastValue').textContent = value + '%';
    updatePreview();
}

function adjustSaturation(value) {
    saturation = value;
    document.getElementById('saturationValue').textContent = value + '%';
    updatePreview();
}

function adjustBlur(value) {
    blur = value;
    document.getElementById('blurValue').textContent = value + 'px';
    updatePreview();
}

function rotateLeft() {
    rotation = (rotation - 90) % 360;
    updatePreview();
}

function rotateRight() {
    rotation = (rotation + 90) % 360;
    updatePreview();
}

function flipHorizontal() {
    flipH = !flipH;
    updatePreview();
}

function flipVertical() {
    flipV = !flipV;
    updatePreview();
}

function updatePreview() {
    if (!currentEditingPhoto) return;
    
    const photoCard = document.querySelector(`[onclick*="${currentEditingPhoto.id}"] img`);
    if (!photoCard) return;

    let filterCSS = '';
    
    switch(currentFilter) {
        case 'grayscale':
            filterCSS = 'grayscale(100%)';
            break;
        case 'sepia':
            filterCSS = 'sepia(100%)';
            break;
        case 'vintage':
            filterCSS = 'sepia(50%) contrast(110%)';
            break;
        case 'warm':
            filterCSS = 'sepia(20%) saturate(120%)';
            break;
        case 'cool':
            filterCSS = 'hue-rotate(180deg) saturate(80%)';
            break;
        case 'vivid':
            filterCSS = 'saturate(150%) contrast(110%)';
            break;
        case 'dramatic':
            filterCSS = 'contrast(130%) brightness(90%)';
            break;
    }

    const fullFilter = `${filterCSS} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;
    const transform = `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;
    
    photoCard.style.filter = fullFilter;
    photoCard.style.transform = transform;
}

async function saveEdits() {
    if (!currentEditingPhoto) return;
    
    // In a production app, you would apply the edits to the actual image
    // For now, we'll just show a confirmation
    alert('Edits saved! In a full version, this would permanently apply changes to the image.');
    
    // Reset the preview
    const photoCard = document.querySelector(`[onclick*="${currentEditingPhoto.id}"] img`);
    if (photoCard) {
        photoCard.style.filter = '';
        photoCard.style.transform = '';
    }
    
    toggleEditor();
}

function resetEdits() {
    resetEditorControls();
}

async function exportPhoto() {
    if (!currentEditingPhoto) return;
    
    const result = await window.electronAPI.exportPhoto(currentEditingPhoto.id, currentEditingPhoto.name);
    if (result.success) {
        alert('Photo exported successfully!');
    }
}

function setView(view) {
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const gallery = document.getElementById('gallery');
    if (view === 'list') {
        gallery.classList.add('list-view');
    } else {
        gallery.classList.remove('list-view');
    }
}

function updateCounts() {
    document.getElementById('photoCount').textContent = photos.length;
    document.getElementById('allCount').textContent = photos.length;
    document.getElementById('peopleCount').textContent = photos.filter(p => p.faces > 0).length;
    document.getElementById('favCount').textContent = photos.filter(p => p.favorite).length;
}

// Update storage info display
async function updateStorageInfo() {
    const result = await window.electronAPI.getStorageInfo();
    if (result.success) {
        const { totalSize, photoCount } = result.info;
        const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
        
        const storageText = document.querySelector('.storage-info .storage-text');
        if (storageText) {
            storageText.innerHTML = `
                <span>${photoCount} photos</span>
                <span style="font-size: 11px; opacity: 0.7;">${sizeInMB} MB</span>
            `;
        }
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('photoModal');
    if (modal.classList.contains('active')) {
        if (e.key === 'Escape') closeModal({ target: modal });
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'ArrowLeft') previousPhoto();
        if (e.key === 'f' || e.key === 'F') toggleFavorite();
    }
    
    // Delete selected photos
    if (e.key === 'Delete' && selectedPhotos.size > 0) {
        deleteSelected();
    }
    
    // Select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const filtered = getFilteredPhotos();
        filtered.forEach(p => selectedPhotos.add(p.id));
        renderGallery();
    }
});

// Initialize the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
