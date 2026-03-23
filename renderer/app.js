// App State
let photos = [];
let albums = [];
let currentView = 'all';
let selectedPhotos = new Set();
let currentPhotoIndex = 0;
let currentEditingPhoto = null;
let searchQuery = '';
let galleryVisibleCount = 48;

// Editor state
let currentFilter = 'none';
let brightness = 100;
let contrast = 100;
let saturation = 100;
let blur = 0;
let rotation = 0;
let flipH = false;
let flipV = false;

// View title map
const VIEW_TITLES = {
    all: 'All Photos',
    people: 'People',
    favorites: 'Favorites',
    timeline: 'Timeline'
};

/**
 * SVG icon helper — returns inline <svg><use> HTML.
 * Matches the sprite symbols defined in index.html.
 */
function icon(id, cssClass) {
    return `<svg class="${cssClass}" aria-hidden="true"><use href="#${id}"/></svg>`;
}

// Initialize app
async function initApp() {
    await loadPhotos();
    await loadAlbums();
    renderGallery();
    renderAlbums();
    updateCounts();
}

// Load data from Electron store
async function loadPhotos() {
    const result = await window.electronAPI.getPhotos();
    if (result.success) photos = result.photos;
}

async function loadAlbums() {
    const result = await window.electronAPI.getAlbums();
    if (result.success) {
        albums = result.albums;
    } else {
        const defaultAlbums = [
            { id: Date.now() + 1, name: 'Favorites', photos: [] },
            { id: Date.now() + 2, name: 'Family', photos: [] }
        ];
        for (const album of defaultAlbums) await window.electronAPI.saveAlbum(album);
        albums = defaultAlbums;
    }
}

// File handling
async function importPhotos() {
    const result = await window.electronAPI.openFileDialog();
    if (result.success && result.files.length > 0) {
        for (const file of result.files) {
            const metadata = {
                id: file.id,
                name: file.name,
                storagePath: file.storagePath,
                relativePath: file.relativePath,
                thumbnailPath: file.thumbnailPath,
                originalPath: file.originalPath,
                date: file.displayDate || new Date().toLocaleDateString(),
                dateAdded: file.dateAdded || new Date().toISOString(),
                captureDateISO: file.captureDateISO || null,
                favorite: false,
                faces: file.faces != null ? file.faces : Math.floor(Math.random() * 4),
                album: null,
                tags: [],
                fileSize: file.fileSize || 0
            };
            const saveResult = await window.electronAPI.savePhoto(metadata);
            if (!saveResult.success) console.error('savePhoto failed:', saveResult.error);
        }
        await loadPhotos();
        galleryVisibleCount = 48;
        renderGallery();
        updateCounts();
    }
}

// ── Escape helpers ───────────────────────────────────────────
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) { return escapeHtml(s); }

function escapeJsString(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ── Photo card HTML ─────────────────────────────────────────
function photoCardHtml(photo) {
    const isSelected = selectedPhotos.has(photo.id);
    return `
        <div class="photo-card ${isSelected ? 'is-selected' : ''}"
             data-photo-id="${escapeAttr(photo.id)}"
             onclick="openPhoto('${escapeJsString(photo.id)}')">
            <img src="${photo.src}" alt="${escapeAttr(photo.name)}" loading="lazy">
            <div class="photo-select ${isSelected ? 'selected' : ''}"
                 onclick="event.stopPropagation(); toggleSelect('${escapeJsString(photo.id)}')"></div>
            ${photo.faces > 0 ? `<div class="face-badge">👤 ${photo.faces} ${photo.faces === 1 ? 'person' : 'people'}</div>` : ''}
            ${photo.favorite ? '<div class="fav-badge">♥</div>' : ''}
            <div class="photo-info">
                <div class="photo-name">${escapeHtml(photo.name)}</div>
                <div class="photo-date">${escapeHtml(photo.date || '')}</div>
            </div>
        </div>
    `;
}

function sortPhotosForTimeline(list) {
    return [...list].sort((a, b) => {
        const d1 = new Date(a.captureDateISO || a.dateAdded || 0).getTime();
        const d2 = new Date(b.captureDateISO || b.dateAdded || 0).getTime();
        return d2 - d1;
    });
}

// ── Gallery render ───────────────────────────────────────────
function renderGallery() {
    const gallery = document.getElementById('gallery');
    const uploadZone = document.querySelector('.upload-zone');
    const emptyState = document.getElementById('emptyState');
    const filteredPhotos = getFilteredPhotos();

    if (photos.length === 0) {
        uploadZone.style.display = 'flex';
        gallery.style.display = 'none';
        emptyState.style.display = 'none';
        return;
    }

    uploadZone.style.display = 'none';

    if (filteredPhotos.length === 0) {
        gallery.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    gallery.style.display = 'grid';
    emptyState.style.display = 'none';

    let listForPaging = filteredPhotos;
    if (currentView === 'timeline') listForPaging = sortPhotosForTimeline(filteredPhotos);

    const visible = listForPaging.slice(0, galleryVisibleCount);
    let html = '';

    if (currentView === 'timeline') {
        let lastMonth = '';
        for (const photo of visible) {
            const d = new Date(photo.captureDateISO || photo.dateAdded || Date.now());
            const month = d.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (month !== lastMonth) {
                html += `<h3 class="timeline-heading">${escapeHtml(month)}</h3>`;
                lastMonth = month;
            }
            html += photoCardHtml(photo);
        }
    } else {
        html = visible.map(photoCardHtml).join('');
    }

    gallery.innerHTML = html;

    if (galleryVisibleCount < listForPaging.length) {
        gallery.insertAdjacentHTML('beforeend',
            `<div id="galleryLoadMore" class="gallery-load-more">Loading more…</div>`);
        observeGallerySentinel(listForPaging.length);
    }

    updateToolbar();
}

let galleryObserver = null;

function observeGallerySentinel(totalFiltered) {
    const sentinel = document.getElementById('galleryLoadMore');
    if (!sentinel) return;
    if (galleryObserver) galleryObserver.disconnect();
    galleryObserver = new IntersectionObserver(
        (entries) => {
            if (!entries[0].isIntersecting || galleryVisibleCount >= totalFiltered) return;
            galleryVisibleCount = Math.min(galleryVisibleCount + 48, totalFiltered);
            renderGallery();
        },
        { root: null, rootMargin: '400px' }
    );
    galleryObserver.observe(sentinel);
}

function getFilteredPhotos() {
    let filtered = photos;
    if (currentView === 'favorites') filtered = filtered.filter(p => p.favorite);
    else if (currentView === 'people') filtered = filtered.filter(p => p.faces > 0);
    else if (typeof currentView === 'number') filtered = filtered.filter(p => p.album === currentView);

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.date && p.date.toLowerCase().includes(q)) ||
            (p.captureDateISO && p.captureDateISO.toLowerCase().includes(q)) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
        );
    }
    return filtered;
}

function filterPhotos() {
    searchQuery = document.getElementById('searchInput').value;
    galleryVisibleCount = 48;
    renderGallery();
}

// ── Albums ───────────────────────────────────────────────────
function renderAlbums() {
    const albumList = document.getElementById('albumList');
    albumList.innerHTML = albums.map(album => {
        const count = photos.filter(p => p.album === album.id).length;
        return `
            <div class="album-item" onclick="switchView(${album.id})">
                ${icon('ic-folder', 'nav-icon')}
                <span class="nav-label">${escapeHtml(album.name)}</span>
                <span class="album-count">${count}</span>
                <button class="album-delete"
                        onclick="event.stopPropagation(); deleteAlbum(${album.id})"
                        aria-label="Delete album">×</button>
            </div>
        `;
    }).join('');
}

async function createAlbum() {
    const name = prompt('Enter album name:');
    if (name && name.trim()) {
        const album = { id: Date.now(), name: name.trim(), photos: [] };
        const result = await window.electronAPI.saveAlbum(album);
        if (result.success) { albums.push(album); renderAlbums(); }
    }
}

async function deleteAlbum(albumId) {
    if (confirm('Delete this album? Photos will not be deleted.')) {
        const result = await window.electronAPI.deleteAlbum(albumId);
        if (result.success) {
            albums = albums.filter(a => a.id !== albumId);
            for (const photo of photos.filter(p => p.album === albumId)) {
                await window.electronAPI.updatePhoto(photo.id, { album: null });
                photo.album = null;
            }
            renderAlbums();
            if (currentView === albumId) switchView('all');
        }
    }
}

// ── View switching ───────────────────────────────────────────
function updateViewTitle(view) {
    const el = document.getElementById('viewTitle');
    if (!el) return;
    if (typeof view === 'string') {
        el.textContent = VIEW_TITLES[view] || 'Photos';
    } else {
        const album = albums.find(a => a.id === view);
        el.textContent = album ? album.name : 'Album';
    }
}

function switchView(view) {
    currentView = view;
    galleryVisibleCount = 48;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (typeof view === 'string') {
        document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
    }
    updateViewTitle(view);
    renderGallery();
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentView = item.dataset.view;
        galleryVisibleCount = 48;
        updateViewTitle(currentView);
        renderGallery();
    });
});

// ── Selection ────────────────────────────────────────────────
function toggleSelect(photoId) {
    if (selectedPhotos.has(photoId)) selectedPhotos.delete(photoId);
    else selectedPhotos.add(photoId);
    renderGallery();
}

function clearSelection() {
    selectedPhotos.clear();
    renderGallery();
    updateToolbar();
}

function updateToolbar() {
    const tb = document.getElementById('bottomToolbar');
    const editBtn = document.getElementById('editBtn');
    const countEl = document.getElementById('selectionCount');

    if (selectedPhotos.size > 0) {
        tb?.classList.add('visible');
        if (countEl) countEl.textContent = `${selectedPhotos.size} selected`;
        if (editBtn) editBtn.style.display = selectedPhotos.size === 1 ? 'flex' : 'none';
    } else {
        tb?.classList.remove('visible');
    }
}

async function deleteSelected() {
    if (confirm(`Delete ${selectedPhotos.size} photo(s)?`)) {
        const ids = Array.from(selectedPhotos);
        const result = await window.electronAPI.deletePhotos(ids);
        if (result.success) {
            photos = photos.filter(p => !selectedPhotos.has(p.id));
            selectedPhotos.clear();
            renderGallery();
            updateCounts();
        }
    }
}

// ── Album assignment ─────────────────────────────────────────
function addToAlbum() {
    const modal = document.getElementById('albumModal');
    document.getElementById('albumSelectList').innerHTML = albums.map(album => `
        <div class="album-item" onclick="assignToAlbum(${album.id})">
            ${icon('ic-folder', 'nav-icon')}
            <span class="nav-label">${escapeHtml(album.name)}</span>
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

// ── Photo viewer ─────────────────────────────────────────────
async function openPhoto(photoId) {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;
    currentPhotoIndex = photos.indexOf(photo);

    const modal = document.getElementById('photoModal');
    const img = document.getElementById('modalImage');
    img.style.transform = '';
    modal.classList.add('active');
    img.alt = photo.name;
    img.src = '';

    const full = await window.electronAPI.getFullPhoto(photoId);
    img.src = (full.success && full.photo?.src) ? full.photo.src : photo.src;
    updateFavoriteButton();
}

function closeModal(event) {
    if (event.target.classList.contains('modal') || event.target.classList.contains('modal-close')) {
        document.getElementById('photoModal').classList.remove('active');
    }
}

function nextPhoto() {
    const filtered = getFilteredPhotos();
    const idx = filtered.indexOf(photos[currentPhotoIndex]);
    const next = filtered[(idx + 1) % filtered.length];
    currentPhotoIndex = photos.indexOf(next);
    openPhoto(next.id);
}

function previousPhoto() {
    const filtered = getFilteredPhotos();
    const idx = filtered.indexOf(photos[currentPhotoIndex]);
    const prev = filtered[(idx - 1 + filtered.length) % filtered.length];
    currentPhotoIndex = photos.indexOf(prev);
    openPhoto(prev.id);
}

function rotatePhotoModal() {
    const img = document.getElementById('modalImage');
    const deg = parseInt((img.style.transform.match(/\d+/) || [0])[0]);
    img.style.transform = `rotate(${deg + 90}deg)`;
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
    const favIconEl = document.getElementById('favIcon');
    if (!favIconEl) return;
    // Swap between heart and heart.fill symbol
    favIconEl.querySelector('use').setAttribute('href',
        photo.favorite ? '#ic-heart-fill' : '#ic-heart');
    favIconEl.classList.toggle('is-fav', photo.favorite);
}

async function exportCurrentPhoto() {
    const photo = photos[currentPhotoIndex];
    const result = await window.electronAPI.exportPhoto(photo.id, photo.name);
    if (result.success) alert('Photo exported successfully!');
}

// ── Editor ───────────────────────────────────────────────────
function toggleEditor() {
    const panel = document.getElementById('editorPanel');
    const isActive = panel.classList.contains('active');
    if (!isActive && selectedPhotos.size === 1) {
        currentEditingPhoto = photos.find(p => p.id === Array.from(selectedPhotos)[0]);
        resetEditorControls();
    }
    panel.classList.toggle('active');
}

function resetEditorControls() {
    currentFilter = 'none';
    brightness = contrast = saturation = 100;
    blur = rotation = 0;
    flipH = flipV = false;

    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn')?.classList.add('active');
    document.querySelector('[oninput="adjustBrightness(this.value)"]').value = 100;
    document.querySelector('[oninput="adjustContrast(this.value)"]').value = 100;
    document.querySelector('[oninput="adjustSaturation(this.value)"]').value = 100;
    document.querySelector('[oninput="adjustBlur(this.value)"]').value = 0;
    updatePreview();
}

function applyFilter(filter, ev) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const t = (ev?.target) || (typeof event !== 'undefined' ? event.target : null);
    if (t?.classList) t.classList.add('active');
    updatePreview();
}

function adjustBrightness(v) { brightness = v; document.getElementById('brightnessValue').textContent = v + '%'; updatePreview(); }
function adjustContrast(v) { contrast = v; document.getElementById('contrastValue').textContent = v + '%'; updatePreview(); }
function adjustSaturation(v) { saturation = v; document.getElementById('saturationValue').textContent = v + '%'; updatePreview(); }
function adjustBlur(v) { blur = v; document.getElementById('blurValue').textContent = v + 'px'; updatePreview(); }
function rotateLeft() { rotation = (rotation - 90) % 360; updatePreview(); }
function rotateRight() { rotation = (rotation + 90) % 360; updatePreview(); }
function flipHorizontal() { flipH = !flipH; updatePreview(); }
function flipVertical() { flipV = !flipV; updatePreview(); }

function updatePreview() {
    if (!currentEditingPhoto) return;
    const img = document.querySelector(`.photo-card[data-photo-id="${currentEditingPhoto.id}"] img`);
    if (!img) return;

    const filterMap = {
        grayscale: 'grayscale(100%)',
        sepia: 'sepia(100%)',
        vintage: 'sepia(50%) contrast(110%)',
        warm: 'sepia(20%) saturate(120%)',
        cool: 'hue-rotate(180deg) saturate(80%)',
        vivid: 'saturate(150%) contrast(110%)',
        dramatic: 'contrast(130%) brightness(90%)'
    };
    const f = filterMap[currentFilter] || '';
    img.style.filter = `${f} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;
    img.style.transform = `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;
}

async function saveEdits() {
    if (!currentEditingPhoto) return;
    const result = await window.electronAPI.applyPhotoEdits(currentEditingPhoto.id, {
        filter: currentFilter,
        brightness: +brightness, contrast: +contrast,
        saturation: +saturation, blur: +blur,
        rotation: +rotation, flipH, flipV
    });
    if (!result.success) { alert(result.error || 'Could not save edits'); return; }

    const img = document.querySelector(`.photo-card[data-photo-id="${currentEditingPhoto.id}"] img`);
    if (img) { img.style.filter = ''; img.style.transform = ''; }

    await loadPhotos();
    galleryVisibleCount = Math.max(galleryVisibleCount, photos.length);
    renderGallery();
    toggleEditor();
}

function resetEdits() { resetEditorControls(); }

async function exportPhoto() {
    if (!currentEditingPhoto) return;
    const result = await window.electronAPI.exportPhoto(currentEditingPhoto.id, currentEditingPhoto.name);
    if (result.success) alert('Photo exported successfully!');
}

function setView(view, ev) {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    const t = (ev?.target) || (typeof event !== 'undefined' ? event.target : null);
    if (t?.classList) t.classList.add('active');
    document.getElementById('gallery').classList.toggle('list-view', view === 'list');
}

function updateCounts() {
    document.getElementById('photoCount').textContent = photos.length;
    document.getElementById('allCount').textContent = photos.length;
    document.getElementById('peopleCount').textContent = photos.filter(p => p.faces > 0).length;
    document.getElementById('favCount').textContent = photos.filter(p => p.favorite).length;
    const tl = document.getElementById('timelineCount');
    if (tl) tl.textContent = photos.length;
}

async function syncAzure() {
    const result = await window.electronAPI.syncAzureBlob({});
    if (result.skipped) { alert(result.message || 'Azure Blob sync is not configured.'); return; }
    alert(result.success
        ? `Uploaded ${result.uploaded} file(s) to "${result.container}".`
        : result.error || 'Sync failed');
}

// ── Keyboard shortcuts ───────────────────────────────────────
document.addEventListener('keydown', e => {
    const modal = document.getElementById('photoModal');
    if (modal.classList.contains('active')) {
        if (e.key === 'Escape') closeModal({ target: modal });
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'ArrowLeft') previousPhoto();
        if (e.key === 'f' || e.key === 'F') toggleFavorite();
    }
    if (e.key === 'Delete' && selectedPhotos.size > 0) deleteSelected();
    if (e.key === 'Escape' && selectedPhotos.size > 0) clearSelection();
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        getFilteredPhotos().forEach(p => selectedPhotos.add(p.id));
        renderGallery();
    }
});

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
