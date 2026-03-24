// ── App State ────────────────────────────────────────────────
let photos = [];          // all photos incl. deleted (deleted:true)
let albums = [];
let currentView = 'all';
let selectedPhotos = new Set();
let currentPhotoIndex = 0;
let currentEditingPhoto = null;
let searchQuery = '';
let galleryVisibleCount = 48;
let lastImportBatch = [];     // IDs from the last import session

// Session-only tracking (cleared on app restart)
let recentlyViewedIds  = [];  // opened in viewer this session
let recentlySharedIds  = [];  // exported this session

// Editor state
let currentFilter = 'none';
let brightness = 100, contrast = 100, saturation = 100, blur = 0;
let rotation = 0, flipH = false, flipV = false;

// ── View metadata ─────────────────────────────────────────────
const VIEW_TITLES = {
    all:              'All Photos',
    people:           'People',
    favorites:        'Favorites',
    timeline:         'Timeline',
    'recently-deleted':'Recently Deleted',
    duplicates:       'Duplicates',
    receipts:         'Receipts',
    handwriting:      'Handwriting',
    illustrations:    'Illustrations',
    'recently-saved': 'Recently Saved',
    'recently-viewed':'Recently Viewed',
    'recently-edited':'Recently Edited',
    'recently-shared':'Recently Shared',
    documents:        'Documents',
    imports:          'Imports',
    map:              'Map'
};

// Empty state config per view { icon, title, text }
const EMPTY_STATES = {
    all:              { icon:'#ic-photo',    title:'No Photos', text:'Import photos to get started.' },
    people:           { icon:'#ic-people',   title:'No People Found', text:'Photos with faces will appear here.' },
    favorites:        { icon:'#ic-heart',    title:'No Favorites', text:'Tap ♥ on any photo to add it here.' },
    timeline:         { icon:'#ic-calendar', title:'No Photos', text:'Import photos to see your timeline.' },
    'recently-deleted':{ icon:'#ic-trash',  title:'Recently Deleted is Empty', text:'Photos you delete will be kept here for 30 days before being permanently removed.' },
    duplicates:       { icon:'#ic-duplicate',title:'No Duplicates', text:'All your photos are unique.' },
    receipts:         { icon:'#ic-receipt',  title:'No Receipts', text:'Photos named or tagged as receipts will appear here.' },
    handwriting:      { icon:'#ic-handwriting',title:'No Handwriting', text:'Photos tagged as handwriting will appear here.' },
    illustrations:    { icon:'#ic-illustration',title:'No Illustrations', text:'Photos tagged as illustrations will appear here.' },
    'recently-saved': { icon:'#ic-bookmark', title:'Nothing Recently Saved', text:'Photos added in the last 30 days will appear here.' },
    'recently-viewed':{ icon:'#ic-eye',      title:'Nothing Recently Viewed', text:'Photos you open will appear here during this session.' },
    'recently-edited':{ icon:'#ic-edited',   title:'No Edited Photos', text:'Photos you edit will appear here.' },
    'recently-shared':{ icon:'#ic-share',    title:'Nothing Recently Shared', text:'Photos you export will appear here during this session.' },
    documents:        { icon:'#ic-doc-text', title:'No Documents', text:'Photos tagged or named as documents will appear here.' },
    imports:          { icon:'#ic-import',   title:'No Recent Imports', text:'Your most recently imported batch will appear here.' },
    map:              { icon:'#ic-mappin',   title:'No Location Data', text:'Photos with GPS coordinates will appear on the map.' }
};

// ── SVG icon helper ───────────────────────────────────────────
function icon(id, cssClass) {
    return `<svg class="${cssClass}" aria-hidden="true"><use href="#${id}"/></svg>`;
}

// ── Init ──────────────────────────────────────────────────────
async function initApp() {
    await loadPhotos();
    await loadAlbums();
    autopurgeTrashed();
    applyZoom();
    updateGranularityControl();
    renderGallery();
    renderAlbums();
    updateCounts();
    updateDateRange(photos);
}

async function loadPhotos() {
    const result = await window.electronAPI.getPhotos();
    if (result.success) photos = result.photos;
}

async function loadAlbums() {
    const result = await window.electronAPI.getAlbums();
    if (result.success) {
        albums = result.albums;
    } else {
        const defaults = [
            { id: Date.now() + 1, name: 'Favorites', photos: [] },
            { id: Date.now() + 2, name: 'Family',    photos: [] }
        ];
        for (const a of defaults) await window.electronAPI.saveAlbum(a);
        albums = defaults;
    }
}

// Auto-purge photos that have been in trash > 30 days
function autopurgeTrashed() {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const toDelete = photos.filter(p =>
        p.deleted && p.deletedAt &&
        Date.now() - new Date(p.deletedAt).getTime() > THIRTY_DAYS
    );
    if (toDelete.length) {
        const ids = toDelete.map(p => p.id);
        window.electronAPI.deletePhotos(ids);
        photos = photos.filter(p => !ids.includes(p.id));
    }
}

// Days remaining until permanent deletion
function daysRemaining(deletedAt) {
    if (!deletedAt) return 30;
    const exp = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((exp - Date.now()) / (24 * 60 * 60 * 1000)));
}

// ── Import ────────────────────────────────────────────────────
async function importPhotos() {
    const result = await window.electronAPI.openFileDialog();
    if (!result.success || result.files.length === 0) return;

    const batchIds = [];
    for (const file of result.files) {
        const metadata = {
            id: file.id, name: file.name,
            storagePath: file.storagePath, relativePath: file.relativePath,
            thumbnailPath: file.thumbnailPath, originalPath: file.originalPath,
            date: file.displayDate || new Date().toLocaleDateString(),
            dateAdded: file.dateAdded || new Date().toISOString(),
            captureDateISO: file.captureDateISO || null,
            favorite: false,
            faces: file.faces != null ? file.faces : Math.floor(Math.random() * 4),
            album: null, tags: [], fileSize: file.fileSize || 0,
            deleted: false, deletedAt: null, editedAt: null
        };
        const saveResult = await window.electronAPI.savePhoto(metadata);
        if (saveResult.success) batchIds.push(file.id);
    }

    lastImportBatch = batchIds;
    await loadPhotos();
    galleryVisibleCount = 48;
    renderGallery();
    updateCounts();
}

// ── Escape helpers ────────────────────────────────────────────
function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(s) { return escapeHtml(s); }
function escapeJsString(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// ── Photo card ────────────────────────────────────────────────
function photoCardHtml(photo) {
    const sel  = selectedPhotos.has(photo.id);
    const isDeleted = currentView === 'recently-deleted';
    const days = isDeleted ? daysRemaining(photo.deletedAt) : null;

    return `
    <div class="photo-card ${sel ? 'is-selected' : ''} ${isDeleted ? 'is-deleted' : ''} ${metadataVisible ? 'show-meta' : ''}"
         data-photo-id="${escapeAttr(photo.id)}"
         onclick="${isDeleted ? '' : `openPhoto('${escapeJsString(photo.id)}')`}">
        <img src="${photo.src}" alt="${escapeAttr(photo.name)}" loading="lazy">
        <div class="photo-select ${sel ? 'selected' : ''}"
             onclick="event.stopPropagation(); toggleSelect('${escapeJsString(photo.id)}')"></div>
        ${photo.faces > 0 && !isDeleted ? `<div class="face-badge">👤 ${photo.faces} ${photo.faces===1?'person':'people'}</div>` : ''}
        ${photo.favorite && !isDeleted ? '<div class="fav-badge">♥</div>' : ''}
        ${isDeleted ? `<div class="days-badge">${days}d</div>` : ''}
        <div class="photo-meta-overlay">
            <div class="photo-meta-name">${escapeHtml(photo.name)}</div>
            <div class="photo-meta-date">${escapeHtml(photo.date || '')}</div>
        </div>
        <div class="photo-info">
            <div class="photo-name">${escapeHtml(photo.name)}</div>
            <div class="photo-date">${escapeHtml(photo.date || '')}</div>
        </div>
    </div>`;
}

function sortForTimeline(list) {
    return [...list].sort((a,b) =>
        new Date(b.captureDateISO || b.dateAdded || 0) -
        new Date(a.captureDateISO || a.dateAdded || 0)
    );
}

// ── Gallery render ────────────────────────────────────────────
function renderGallery() {
    const gallery    = document.getElementById('gallery');
    const uploadZone = document.querySelector('.upload-zone');
    const emptyState = document.getElementById('emptyState');

    const filtered = getFilteredPhotos();
    const activePhotos = photos.filter(p => !p.deleted); // for upload zone check

    // Upload zone only in all/timeline views when library is empty
    const showUpload = activePhotos.length === 0 &&
        ['all','timeline','recently-saved','imports'].includes(currentView);

    if (showUpload) {
        uploadZone.style.display = 'flex';
        gallery.style.display    = 'none';
        emptyState.style.display = 'none';
        updateUtilityBar();
        updateGranularityControl();
        updateDateRange([]);
        return;
    }
    uploadZone.style.display = 'none';

    if (filtered.length === 0) {
        gallery.style.display    = 'none';
        emptyState.style.display = 'flex';
        applyEmptyState(currentView);
        updateUtilityBar();
        updateGranularityControl();
        updateDateRange([]);
        return;
    }

    gallery.style.display    = 'grid';
    emptyState.style.display = 'none';

    let list = filtered;
    if (currentView === 'timeline' || currentGranularity !== 'photos') {
        list = sortForTimeline(filtered);
    }

    updateDateRange(filtered);
    updateGranularityControl();

    // Years / Months grouped views
    if (currentGranularity === 'years') {
        gallery.innerHTML = renderByYear(list);
        updateToolbar();
        return;
    }
    if (currentGranularity === 'months') {
        gallery.innerHTML = renderByMonth(list);
        updateToolbar();
        return;
    }

    const visible = list.slice(0, galleryVisibleCount);
    let html = '';

    if (currentView === 'timeline') {
        let lastMonth = '';
        for (const p of visible) {
            const d = new Date(p.captureDateISO || p.dateAdded || Date.now());
            const month = d.toLocaleString('default', { month:'long', year:'numeric' });
            if (month !== lastMonth) {
                html += `<h3 class="timeline-heading">${escapeHtml(month)}</h3>`;
                lastMonth = month;
            }
            html += photoCardHtml(p);
        }
    } else {
        html = visible.map(photoCardHtml).join('');
    }

    gallery.innerHTML = html;

    if (galleryVisibleCount < list.length) {
        gallery.insertAdjacentHTML('beforeend',
            `<div id="galleryLoadMore" class="gallery-load-more">Loading more…</div>`);
        observeGallerySentinel(list.length);
    }

    updateToolbar();
    updateUtilityBar();
}

function applyEmptyState(view) {
    const cfg = EMPTY_STATES[view] || EMPTY_STATES.all;
    document.getElementById('emptyIcon').querySelector('use').setAttribute('href', cfg.icon);
    document.getElementById('emptyTitle').textContent  = cfg.title;
    document.getElementById('emptyText').textContent   = cfg.text;
}

let galleryObserver = null;
function observeGallerySentinel(total) {
    const s = document.getElementById('galleryLoadMore');
    if (!s) return;
    if (galleryObserver) galleryObserver.disconnect();
    galleryObserver = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting || galleryVisibleCount >= total) return;
        galleryVisibleCount = Math.min(galleryVisibleCount + 48, total);
        renderGallery();
    }, { rootMargin: '400px' });
    galleryObserver.observe(s);
}

// ── Filtering ─────────────────────────────────────────────────
function getFilteredPhotos() {
    // Recently Deleted: only show deleted photos
    if (currentView === 'recently-deleted') {
        return photos.filter(p => p.deleted === true);
    }

    // All other views: exclude deleted
    let base = photos.filter(p => !p.deleted);

    switch (currentView) {
        case 'all':      break;
        case 'timeline': break;
        case 'favorites': base = base.filter(p => p.favorite); break;
        case 'people':    base = base.filter(p => p.faces > 0); break;

        case 'duplicates': {
            const counts = {};
            base.forEach(p => { counts[p.name] = (counts[p.name] || 0) + 1; });
            base = base.filter(p => counts[p.name] > 1);
            break;
        }
        case 'recently-saved': {
            const cut = Date.now() - 30 * 24 * 60 * 60 * 1000;
            base = base.filter(p => new Date(p.dateAdded).getTime() > cut);
            break;
        }
        case 'recently-viewed':
            base = base.filter(p => recentlyViewedIds.includes(p.id));
            break;
        case 'recently-edited':
            base = base.filter(p => Boolean(p.editedAt));
            break;
        case 'recently-shared':
            base = base.filter(p => recentlySharedIds.includes(p.id));
            break;
        case 'imports':
            if (lastImportBatch.length) {
                base = base.filter(p => lastImportBatch.includes(p.id));
            } else {
                // Fall back: photos added within the last 5 min of the latest import
                const sorted = [...base].sort((a,b) =>
                    new Date(b.dateAdded) - new Date(a.dateAdded));
                if (sorted.length) {
                    const latest = new Date(sorted[0].dateAdded).getTime();
                    base = sorted.filter(p =>
                        latest - new Date(p.dateAdded).getTime() < 5 * 60 * 1000);
                }
            }
            break;
        case 'receipts':
            base = base.filter(p =>
                p.tags?.includes('receipt') ||
                /\b(receipt|invoice|bill|order)\b/i.test(p.name));
            break;
        case 'handwriting':
            base = base.filter(p =>
                p.tags?.includes('handwriting') ||
                /\b(note|handwrit|letter|written|memo)\b/i.test(p.name));
            break;
        case 'illustrations':
            base = base.filter(p =>
                p.tags?.includes('illustration') ||
                /\b(illust|drawing|sketch|art|design)\b/i.test(p.name));
            break;
        case 'documents':
            base = base.filter(p =>
                p.tags?.includes('document') ||
                /\b(doc|scan|document|form|contract)\b/i.test(p.name));
            break;
        case 'map':
            base = base.filter(p => p.latitude != null || p.longitude != null);
            break;
        default:
            if (typeof currentView === 'number')
                base = base.filter(p => p.album === currentView);
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        base = base.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.date && p.date.toLowerCase().includes(q)) ||
            (p.captureDateISO && p.captureDateISO.toLowerCase().includes(q)) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
        );
    }

    return base;
}

function filterPhotos() {
    searchQuery = document.getElementById('searchInput').value;
    galleryVisibleCount = 48;
    renderGallery();
}

// ── Albums ────────────────────────────────────────────────────
function renderAlbums() {
    document.getElementById('albumList').innerHTML = albums.map(album => {
        const count = photos.filter(p => p.album === album.id && !p.deleted).length;
        return `
        <div class="album-item" onclick="switchView(${album.id})">
            ${icon('ic-folder','nav-icon')}
            <span class="nav-label">${escapeHtml(album.name)}</span>
            <span class="album-count">${count}</span>
            <button class="album-delete"
                    onclick="event.stopPropagation(); deleteAlbum(${album.id})">×</button>
        </div>`;
    }).join('');
}

async function createAlbum() {
    const name = prompt('Enter album name:');
    if (name?.trim()) {
        const album = { id: Date.now(), name: name.trim(), photos: [] };
        const r = await window.electronAPI.saveAlbum(album);
        if (r.success) { albums.push(album); renderAlbums(); }
    }
}

async function deleteAlbum(id) {
    if (!confirm('Delete this album? Photos will not be deleted.')) return;
    const r = await window.electronAPI.deleteAlbum(id);
    if (r.success) {
        albums = albums.filter(a => a.id !== id);
        for (const p of photos.filter(p => p.album === id)) {
            await window.electronAPI.updatePhoto(p.id, { album: null });
            p.album = null;
        }
        renderAlbums();
        if (currentView === id) switchView('all');
    }
}

// ── View switching ────────────────────────────────────────────
function updateViewTitle(view) {
    const el = document.getElementById('viewTitle');
    if (!el) return;
    if (typeof view === 'string') {
        el.textContent = VIEW_TITLES[view] || 'Photos';
    } else {
        el.textContent = albums.find(a => a.id === view)?.name || 'Album';
    }
}

function switchView(view) {
    currentView = view;
    galleryVisibleCount = 48;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (typeof view === 'string')
        document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
    updateViewTitle(view);
    selectedPhotos.clear();
    updateGranularityControl();
    renderGallery();
    updateCounts();
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentView = item.dataset.view;
        galleryVisibleCount = 48;
        updateViewTitle(currentView);
        selectedPhotos.clear();
        updateGranularityControl();
        renderGallery();
        updateCounts();
    });
});

// ── Utility Bar (bulk actions for special views) ──────────────
function updateUtilityBar() {
    const bar  = document.getElementById('utilityBar');
    const info = document.getElementById('utilityBarInfo');
    const b1   = document.getElementById('uBtn1');
    const b2   = document.getElementById('uBtn2');

    if (currentView === 'recently-deleted') {
        const deleted = photos.filter(p => p.deleted);
        if (deleted.length === 0) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        info.textContent = `${deleted.length} item${deleted.length!==1?'s':''} — deleted photos are removed after 30 days`;
        b1.textContent = 'Restore All';
        b1.className   = 'utility-bar-btn';
        b2.textContent = 'Delete All Permanently';
        b2.className   = 'utility-bar-btn danger';
    } else {
        bar.style.display = 'none';
    }
}

function utilityAction1() {
    if (currentView === 'recently-deleted') restoreAllDeleted();
}

function utilityAction2() {
    if (currentView === 'recently-deleted') deleteAllPermanently();
}

// ── Trash / Soft Delete ───────────────────────────────────────
async function deleteSelected() {
    if (currentView === 'recently-deleted') {
        if (!confirm(`Permanently delete ${selectedPhotos.size} photo(s)? This cannot be undone.`)) return;
        const ids = Array.from(selectedPhotos);
        const r = await window.electronAPI.deletePhotos(ids);
        if (r.success) {
            photos = photos.filter(p => !selectedPhotos.has(p.id));
            selectedPhotos.clear();
            renderGallery(); updateCounts();
        }
    } else {
        if (!confirm(`Move ${selectedPhotos.size} photo(s) to Recently Deleted?`)) return;
        const now = new Date().toISOString();
        for (const id of selectedPhotos) {
            await window.electronAPI.updatePhoto(id, { deleted: true, deletedAt: now });
            const p = photos.find(x => x.id === id);
            if (p) { p.deleted = true; p.deletedAt = now; }
        }
        selectedPhotos.clear();
        renderGallery(); updateCounts();
    }
}

async function restoreAllDeleted() {
    const deleted = photos.filter(p => p.deleted);
    for (const p of deleted) {
        await window.electronAPI.updatePhoto(p.id, { deleted: false, deletedAt: null });
        p.deleted = false; p.deletedAt = null;
    }
    renderGallery(); updateCounts();
}

async function deleteAllPermanently() {
    const deleted = photos.filter(p => p.deleted);
    if (!deleted.length) return;
    if (!confirm(`Permanently delete all ${deleted.length} photo(s)? This cannot be undone.`)) return;
    const ids = deleted.map(p => p.id);
    const r = await window.electronAPI.deletePhotos(ids);
    if (r.success) {
        photos = photos.filter(p => !p.deleted);
        renderGallery(); updateCounts();
    }
}

async function restoreSelected() {
    for (const id of selectedPhotos) {
        await window.electronAPI.updatePhoto(id, { deleted: false, deletedAt: null });
        const p = photos.find(x => x.id === id);
        if (p) { p.deleted = false; p.deletedAt = null; }
    }
    selectedPhotos.clear();
    renderGallery(); updateCounts();
}

// ── Selection & Toolbar ───────────────────────────────────────
function toggleSelect(id) {
    if (selectedPhotos.has(id)) selectedPhotos.delete(id);
    else selectedPhotos.add(id);
    renderGallery();
    // Refresh info panel if open
    if (infoPanelOpen && selectedPhotos.size > 0) {
        populateInfoPanel(Array.from(selectedPhotos)[0]);
    }
    // Update toolbar favorite icon
    updateToolbarFavIcon();
}

function clearSelection() {
    selectedPhotos.clear();
    renderGallery();
    updateToolbar();
    updateToolbarFavIcon();
}

function updateToolbar() {
    const tb      = document.getElementById('bottomToolbar');
    const actions = document.getElementById('toolbarActions');
    const countEl = document.getElementById('selectionCount');

    if (selectedPhotos.size === 0) { tb.classList.remove('visible'); return; }
    tb.classList.add('visible');
    if (countEl) countEl.textContent = `${selectedPhotos.size} selected`;

    const inTrash = currentView === 'recently-deleted';
    actions.innerHTML = inTrash ? `
        <button class="toolbar-btn success" onclick="restoreSelected()">
            ${icon('ic-restore','toolbar-icon')}<span>Restore</span>
        </button>
        <button class="toolbar-btn danger" onclick="deleteSelected()">
            ${icon('ic-trash','toolbar-icon')}<span>Delete Permanently</span>
        </button>
    ` : `
        <button class="toolbar-btn" id="editBtn" onclick="toggleEditor()" style="display:${selectedPhotos.size===1?'flex':'none'}">
            ${icon('ic-pencil','toolbar-icon')}<span>Edit</span>
        </button>
        <button class="toolbar-btn" onclick="addToAlbum()">
            ${icon('ic-folder-plus','toolbar-icon')}<span>Album</span>
        </button>
        <button class="toolbar-btn danger" onclick="deleteSelected()">
            ${icon('ic-trash','toolbar-icon')}<span>Delete</span>
        </button>
    `;
}

// ── Album assignment ──────────────────────────────────────────
function addToAlbum() {
    document.getElementById('albumSelectList').innerHTML = albums.map(a => `
        <div class="album-item" onclick="assignToAlbum(${a.id})">
            ${icon('ic-folder','nav-icon')}
            <span class="nav-label">${escapeHtml(a.name)}</span>
        </div>`).join('');
    document.getElementById('albumModal').classList.add('active');
}

async function assignToAlbum(albumId) {
    for (const id of selectedPhotos) {
        await window.electronAPI.updatePhoto(id, { album: albumId });
        const p = photos.find(x => x.id === id);
        if (p) p.album = albumId;
    }
    selectedPhotos.clear();
    closeAlbumModal();
    renderGallery(); renderAlbums();
}

function closeAlbumModal(e) {
    if (!e || e.target.id === 'albumModal' || e.target.classList.contains('close-btn'))
        document.getElementById('albumModal').classList.remove('active');
}

// ── Photo viewer ──────────────────────────────────────────────
async function openPhoto(photoId) {
    const photo = photos.find(p => p.id === photoId);
    if (!photo || photo.deleted) return;
    currentPhotoIndex = photos.indexOf(photo);

    // Track recently viewed
    if (!recentlyViewedIds.includes(photoId)) recentlyViewedIds.unshift(photoId);
    if (recentlyViewedIds.length > 50) recentlyViewedIds.pop();

    const modal = document.getElementById('photoModal');
    const img   = document.getElementById('modalImage');
    img.style.transform = ''; img.src = ''; img.alt = photo.name;
    modal.classList.add('active');

    const full = await window.electronAPI.getFullPhoto(photoId);
    img.src = (full.success && full.photo?.src) ? full.photo.src : photo.src;
    updateFavoriteButton();
}

function closeModal(e) {
    if (e.target.classList.contains('modal') || e.target.classList.contains('modal-close'))
        document.getElementById('photoModal').classList.remove('active');
}

function nextPhoto() {
    const f = getFilteredPhotos();
    const i = f.indexOf(photos[currentPhotoIndex]);
    const next = f[(i + 1) % f.length];
    currentPhotoIndex = photos.indexOf(next);
    openPhoto(next.id);
}

function previousPhoto() {
    const f = getFilteredPhotos();
    const i = f.indexOf(photos[currentPhotoIndex]);
    const prev = f[(i - 1 + f.length) % f.length];
    currentPhotoIndex = photos.indexOf(prev);
    openPhoto(prev.id);
}

function rotatePhotoModal() {
    const img = document.getElementById('modalImage');
    const deg = parseInt((img.style.transform.match(/\d+/) || [0])[0]);
    img.style.transform = `rotate(${deg + 90}deg)`;
}

async function toggleFavorite() {
    const p = photos[currentPhotoIndex];
    p.favorite = !p.favorite;
    await window.electronAPI.updatePhoto(p.id, { favorite: p.favorite });
    renderGallery(); updateCounts(); updateFavoriteButton();
}

function updateFavoriteButton() {
    const p = photos[currentPhotoIndex];
    const el = document.getElementById('favIcon');
    if (!el) return;
    el.querySelector('use').setAttribute('href', p.favorite ? '#ic-heart-fill' : '#ic-heart');
    el.classList.toggle('is-fav', p.favorite);
}

async function exportCurrentPhoto() {
    const p = photos[currentPhotoIndex];
    const r = await window.electronAPI.exportPhoto(p.id, p.name);
    if (r.success) {
        if (!recentlySharedIds.includes(p.id)) recentlySharedIds.unshift(p.id);
        alert('Photo exported successfully!');
    }
}

// ── Editor ────────────────────────────────────────────────────
function toggleEditor() {
    const panel = document.getElementById('editorPanel');
    if (!panel.classList.contains('active') && selectedPhotos.size === 1) {
        currentEditingPhoto = photos.find(p => p.id === Array.from(selectedPhotos)[0]);
        resetEditorControls();
    }
    panel.classList.toggle('active');
}

function resetEditorControls() {
    currentFilter = 'none'; brightness = contrast = saturation = 100; blur = rotation = 0; flipH = flipV = false;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn')?.classList.add('active');
    document.querySelector('[oninput="adjustBrightness(this.value)"]').value = 100;
    document.querySelector('[oninput="adjustContrast(this.value)"]').value   = 100;
    document.querySelector('[oninput="adjustSaturation(this.value)"]').value = 100;
    document.querySelector('[oninput="adjustBlur(this.value)"]').value       = 0;
    updatePreview();
}

function applyFilter(f, ev) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    (ev?.target || (typeof event!=='undefined'?event.target:null))?.classList.add('active');
    updatePreview();
}

function adjustBrightness(v) { brightness = v; document.getElementById('brightnessValue').textContent = v+'%'; updatePreview(); }
function adjustContrast(v)   { contrast   = v; document.getElementById('contrastValue').textContent   = v+'%'; updatePreview(); }
function adjustSaturation(v) { saturation = v; document.getElementById('saturationValue').textContent = v+'%'; updatePreview(); }
function adjustBlur(v)       { blur       = v; document.getElementById('blurValue').textContent       = v+'px'; updatePreview(); }
function rotateLeft()  { rotation = (rotation - 90) % 360; updatePreview(); }
function rotateRight() { rotation = (rotation + 90) % 360; updatePreview(); }
function flipHorizontal() { flipH = !flipH; updatePreview(); }
function flipVertical()   { flipV = !flipV; updatePreview(); }

function updatePreview() {
    if (!currentEditingPhoto) return;
    const img = document.querySelector(`.photo-card[data-photo-id="${currentEditingPhoto.id}"] img`);
    if (!img) return;
    const filterMap = {
        grayscale:'grayscale(100%)', sepia:'sepia(100%)',
        vintage:'sepia(50%) contrast(110%)', warm:'sepia(20%) saturate(120%)',
        cool:'hue-rotate(180deg) saturate(80%)', vivid:'saturate(150%) contrast(110%)',
        dramatic:'contrast(130%) brightness(90%)'
    };
    img.style.filter    = `${filterMap[currentFilter]||''} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;
    img.style.transform = `rotate(${rotation}deg) scaleX(${flipH?-1:1}) scaleY(${flipV?-1:1})`;
}

async function saveEdits() {
    if (!currentEditingPhoto) return;
    const r = await window.electronAPI.applyPhotoEdits(currentEditingPhoto.id, {
        filter: currentFilter, brightness:+brightness, contrast:+contrast,
        saturation:+saturation, blur:+blur, rotation:+rotation, flipH, flipV
    });
    if (!r.success) { alert(r.error || 'Could not save edits'); return; }

    // Mark as edited
    const now = new Date().toISOString();
    await window.electronAPI.updatePhoto(currentEditingPhoto.id, { editedAt: now });
    const p = photos.find(x => x.id === currentEditingPhoto.id);
    if (p) p.editedAt = now;

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
    const r = await window.electronAPI.exportPhoto(currentEditingPhoto.id, currentEditingPhoto.name);
    if (r.success) {
        if (!recentlySharedIds.includes(currentEditingPhoto.id))
            recentlySharedIds.unshift(currentEditingPhoto.id);
        alert('Photo exported successfully!');
    }
}

function setView(view, ev) {
    if (ev?.target) {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        ev.target.classList.add('active');
    }
    document.getElementById('gallery').classList.toggle('list-view', view === 'list');
    renderGallery();
}

// ── Counts ────────────────────────────────────────────────────
function updateCounts() {
    const active = photos.filter(p => !p.deleted);
    document.getElementById('photoCount').textContent   = active.length;
    document.getElementById('allCount').textContent     = active.length;
    document.getElementById('peopleCount').textContent  = active.filter(p => p.faces > 0).length;
    document.getElementById('favCount').textContent     = active.filter(p => p.favorite).length;
    document.getElementById('timelineCount').textContent= active.length;

    // Duplicates count
    const names = {};
    active.forEach(p => { names[p.name] = (names[p.name]||0)+1; });
    const dupCount = active.filter(p => names[p.name] > 1).length;
    const dupEl = document.getElementById('duplicatesCount');
    if (dupEl) dupEl.textContent = dupCount > 0 ? dupCount : '';
}

// ── Toolbar fav icon state ────────────────────────────────────
function updateToolbarFavIcon() {
    const ids = Array.from(selectedPhotos);
    const allFav = ids.length > 0 && ids.every(id => photos.find(p => p.id === id)?.favorite);
    const icon = document.getElementById('tbFavIcon');
    if (icon) icon.querySelector('use').setAttribute('href', allFav ? '#ic-heart-fill' : '#ic-heart');
    document.getElementById('tbFavBtn')?.classList.toggle('active', allFav);
}

// ── Sync ──────────────────────────────────────────────────────
async function syncAzure() {
    const r = await window.electronAPI.syncAzureBlob({});
    if (r.skipped) { alert(r.message || 'Azure Blob sync is not configured.'); return; }
    alert(r.success ? `Uploaded ${r.uploaded} file(s) to "${r.container}".` : r.error || 'Sync failed');
}

// ── Zoom ──────────────────────────────────────────────────────
const ZOOM_STEPS = [80, 110, 140, 180, 240, 320, 420];
let zoomIndex = 3; // default 180px

function applyZoom() {
    document.documentElement.style.setProperty('--grid-col-size', ZOOM_STEPS[zoomIndex] + 'px');
    document.getElementById('gallery')?.classList.toggle('list-view', false);
}

function zoomIn() {
    if (zoomIndex < ZOOM_STEPS.length - 1) { zoomIndex++; applyZoom(); }
}

function zoomOut() {
    if (zoomIndex > 0) { zoomIndex--; applyZoom(); }
}

// ── Granularity (Years / Months / All Photos) ─────────────────
let currentGranularity = 'photos';

function setGranularity(gran, ev) {
    currentGranularity = gran;
    document.querySelectorAll('.gran-btn').forEach(b => b.classList.remove('active'));
    if (ev?.target) ev.target.classList.add('active');
    else document.querySelector(`[data-gran="${gran}"]`)?.classList.add('active');
    galleryVisibleCount = 48;
    renderGallery();
}

// Update granularity control visibility (only for views that make sense)
function updateGranularityControl() {
    const showGran = ['all','timeline','recently-saved','imports','people'].includes(
        typeof currentView === 'string' ? currentView : '__album__'
    );
    const ctrl = document.getElementById('granularityControl');
    if (ctrl) ctrl.style.display = showGran ? 'flex' : 'none';
}

// ── Render grouped by year ────────────────────────────────────
function renderByYear(list) {
    const byYear = {};
    list.forEach(p => {
        const yr = new Date(p.captureDateISO || p.dateAdded || Date.now()).getFullYear();
        (byYear[yr] = byYear[yr] || []).push(p);
    });
    const years = Object.keys(byYear).sort((a,b) => b - a);
    let html = '';
    years.forEach(yr => {
        html += `<h2 class="year-heading" onclick="drillIntoYear(${yr})">${yr}</h2>`;
        // Show up to first 6 photos per year as a preview
        byYear[yr].slice(0, 6).forEach(p => { html += photoCardHtml(p); });
    });
    return html;
}

function renderByMonth(list) {
    const byMonth = {};
    list.forEach(p => {
        const d = new Date(p.captureDateISO || p.dateAdded || Date.now());
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const label = d.toLocaleString('default', { month:'long', year:'numeric' });
        byMonth[key] = byMonth[key] || { label, photos: [] };
        byMonth[key].photos.push(p);
    });
    const keys = Object.keys(byMonth).sort((a,b) => b.localeCompare(a));
    let html = '';
    keys.forEach(k => {
        html += `<h3 class="month-heading">${escapeHtml(byMonth[k].label)}</h3>`;
        byMonth[k].photos.forEach(p => { html += photoCardHtml(p); });
    });
    return html;
}

function drillIntoYear(year) {
    setGranularity('months', null);
    searchQuery = String(year);
    document.getElementById('searchInput').value = year;
    renderGallery();
}

// ── Date range display ────────────────────────────────────────
function updateDateRange(list) {
    const el = document.getElementById('viewDateRange');
    if (!el) return;
    const active = (list || []).filter(p => !p.deleted && (p.captureDateISO || p.dateAdded));
    if (active.length < 2) { el.textContent = ''; return; }
    const dates = active.map(p => new Date(p.captureDateISO || p.dateAdded)).sort((a,b) => a-b);
    const fmt = d => d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
    el.textContent = `${fmt(dates[0])} – ${fmt(dates[dates.length-1])}`;
}

// ── Search toggle ─────────────────────────────────────────────
let searchVisible = false;

function toggleSearch() {
    searchVisible = !searchVisible;
    const bar = document.getElementById('inlineSearchBar');
    const btn = document.getElementById('searchToggleBtn');
    bar.style.display = searchVisible ? 'block' : 'none';
    btn?.classList.toggle('active', searchVisible);
    if (searchVisible) {
        document.getElementById('searchInput')?.focus();
    } else {
        searchQuery = '';
        if (document.getElementById('searchInput'))
            document.getElementById('searchInput').value = '';
        renderGallery();
    }
}

// ── Metadata toggle (overlay captions on cards) ───────────────
let metadataVisible = false;

function toggleMetadata() {
    metadataVisible = !metadataVisible;
    document.getElementById('metaBtn')?.classList.toggle('active', metadataVisible);
    document.getElementById('gallery').querySelectorAll('.photo-card').forEach(card => {
        card.classList.toggle('show-meta', metadataVisible);
    });
    galleryVisibleCount = 48;
    renderGallery(); // re-render so new cards get show-meta class
}

// ── More menu ─────────────────────────────────────────────────
function toggleMoreMenu(ev) {
    const menu = document.getElementById('moreMenu');
    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        // Close on outside click
        setTimeout(() => document.addEventListener('click', closeMoreMenuOutside, { once: true }), 0);
    }
    ev?.stopPropagation();
}

function closeMoreMenuOutside() {
    closeMoreMenu();
}

function closeMoreMenu() {
    const menu = document.getElementById('moreMenu');
    if (menu) menu.style.display = 'none';
}

function selectAllPhotos() {
    getFilteredPhotos().forEach(p => selectedPhotos.add(p.id));
    renderGallery();
}

// ── Info Panel ────────────────────────────────────────────────
let infoPanelOpen = false;
let infoPanelPhotoId = null;

function toggleInfoPanel() {
    infoPanelOpen = !infoPanelOpen;
    const panel = document.getElementById('infoPanel');
    const btn   = document.getElementById('infoBtn');
    panel.style.display = infoPanelOpen ? 'flex' : 'none';
    btn?.classList.toggle('active', infoPanelOpen);

    if (infoPanelOpen) {
        // Show info for the first selected photo, or last viewed
        const id = selectedPhotos.size > 0
            ? Array.from(selectedPhotos)[0]
            : (recentlyViewedIds[0] || null);
        if (id) populateInfoPanel(id);
    }
}

async function populateInfoPanel(photoId) {
    infoPanelPhotoId = photoId;
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    const body = document.getElementById('infoPanelBody');
    body.innerHTML = `
        <div class="info-thumb-wrap">
            <img src="${photo.src || ''}" alt="${escapeAttr(photo.name)}">
        </div>
        <div class="info-row">
            <span class="info-label">Filename</span>
            <span class="info-value">${escapeHtml(photo.name)}</span>
        </div>
        ${photo.date ? `<div class="info-row">
            <span class="info-label">Date</span>
            <span class="info-value">${escapeHtml(photo.date)}</span>
        </div>` : ''}
        ${photo.captureDateISO ? `<div class="info-row">
            <span class="info-label">Captured</span>
            <span class="info-value">${escapeHtml(new Date(photo.captureDateISO).toLocaleString())}</span>
        </div>` : ''}
        <div class="info-separator"></div>
        ${photo.cameraMake ? `<div class="info-row">
            <span class="info-label">Camera</span>
            <span class="info-value">${escapeHtml(photo.cameraMake)}${photo.cameraModel ? ' ' + escapeHtml(photo.cameraModel) : ''}</span>
        </div>` : ''}
        ${photo.fileSize ? `<div class="info-row">
            <span class="info-label">File Size</span>
            <span class="info-value">${(photo.fileSize / (1024*1024)).toFixed(2)} MB</span>
        </div>` : ''}
        ${photo.faces > 0 ? `<div class="info-row">
            <span class="info-label">People</span>
            <span class="info-value">${photo.faces} ${photo.faces === 1 ? 'person' : 'people'}</span>
        </div>` : ''}
        <div class="info-separator"></div>
        <div class="info-row">
            <span class="info-label">Status</span>
            <span class="info-value">${photo.favorite ? '♥ Favorite' : 'Not favorited'}</span>
        </div>
        ${photo.editedAt ? `<div class="info-row">
            <span class="info-label">Last Edited</span>
            <span class="info-value">${escapeHtml(new Date(photo.editedAt).toLocaleString())}</span>
        </div>` : ''}
    `;
}

// ── Share selected ────────────────────────────────────────────
async function shareSelected() {
    const ids = selectedPhotos.size > 0
        ? Array.from(selectedPhotos)
        : (recentlyViewedIds[0] ? [recentlyViewedIds[0]] : []);
    if (ids.length === 0) { alert('Select a photo to share.'); return; }
    for (const id of ids) {
        const p = photos.find(x => x.id === id);
        if (!p) continue;
        const r = await window.electronAPI.exportPhoto(id, p.name);
        if (r.success && !recentlySharedIds.includes(id)) recentlySharedIds.unshift(id);
    }
    alert(`Exported ${ids.length} photo${ids.length > 1 ? 's' : ''} successfully.`);
}

// ── Favorite selected (toolbar heart) ────────────────────────
async function favoriteSelected() {
    const ids = selectedPhotos.size > 0
        ? Array.from(selectedPhotos)
        : (recentlyViewedIds[0] ? [recentlyViewedIds[0]] : []);
    if (ids.length === 0) return;

    const allFav = ids.every(id => photos.find(p => p.id === id)?.favorite);
    const newFav = !allFav;

    for (const id of ids) {
        const p = photos.find(x => x.id === id);
        if (!p) continue;
        p.favorite = newFav;
        await window.electronAPI.updatePhoto(id, { favorite: newFav });
    }

    // Update toolbar heart icon
    const icon = document.getElementById('tbFavIcon');
    if (icon) icon.querySelector('use').setAttribute('href', newFav ? '#ic-heart-fill' : '#ic-heart');
    const btn = document.getElementById('tbFavBtn');
    btn?.classList.toggle('active', newFav);

    renderGallery(); updateCounts();
}

// ── Duplicate selected ────────────────────────────────────────
async function duplicateSelected() {
    const ids = selectedPhotos.size > 0
        ? Array.from(selectedPhotos)
        : (recentlyViewedIds[0] ? [recentlyViewedIds[0]] : []);
    if (ids.length === 0) { alert('Select a photo to duplicate.'); return; }

    for (const id of ids) {
        const orig = photos.find(p => p.id === id);
        if (!orig) continue;
        const dup = {
            ...orig,
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(36),
            name: orig.name.replace(/(\.[^.]+)$/, ' copy$1'),
            dateAdded: new Date().toISOString(),
            favorite: false, editedAt: null, deleted: false, deletedAt: null
        };
        const r = await window.electronAPI.savePhoto(dup);
        if (r.success) { photos.push({ ...dup, src: orig.src }); lastImportBatch.push(dup.id); }
    }
    renderGallery(); updateCounts();
}

// ── Slideshow ─────────────────────────────────────────────────
let ssPhotos = [];
let ssIndex  = 0;
let ssTimer  = null;
let ssPlaying = true;
const SS_INTERVAL = 3500;

function startSlideshow() {
    ssPhotos = getFilteredPhotos().filter(p => p.src);
    if (ssPhotos.length === 0) { alert('No photos to show.'); return; }
    ssIndex = 0; ssPlaying = true;
    document.getElementById('slideshowOverlay').style.display = 'flex';
    renderSlideshowFrame();
    ssTimer = setInterval(slideshowTick, SS_INTERVAL);
}

function stopSlideshow() {
    clearInterval(ssTimer); ssTimer = null;
    document.getElementById('slideshowOverlay').style.display = 'none';
}

function renderSlideshowFrame() {
    const p = ssPhotos[ssIndex];
    if (!p) return;
    const img = document.getElementById('slideshowImg');
    img.style.opacity = '0';
    img.src = p.src;
    img.onload = () => { img.style.opacity = '1'; };
    document.getElementById('slideshowCaption').textContent = `${p.name}  ·  ${p.date || ''}`.trim().replace(/·\s*$/, '');
    // Dots (max 10 shown)
    const dotsEl = document.getElementById('slideshowDots');
    if (ssPhotos.length <= 20) {
        dotsEl.innerHTML = ssPhotos.map((_, i) =>
            `<div class="slideshow-dot ${i === ssIndex ? 'active' : ''}"></div>`
        ).join('');
    } else {
        dotsEl.innerHTML = `<span style="color:rgba(255,255,255,0.5);font-size:12px">${ssIndex+1} / ${ssPhotos.length}</span>`;
    }
    // Play icon
    const icon = document.getElementById('ssPlayIcon');
    if (icon) {
        icon.innerHTML = ssPlaying
            ? `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`
            : `<polygon points="5,3 19,12 5,21"/>`;
    }
}

function slideshowTick() {
    ssIndex = (ssIndex + 1) % ssPhotos.length;
    renderSlideshowFrame();
}

function slideshowStep(dir) {
    clearInterval(ssTimer);
    ssIndex = (ssIndex + dir + ssPhotos.length) % ssPhotos.length;
    renderSlideshowFrame();
    if (ssPlaying) ssTimer = setInterval(slideshowTick, SS_INTERVAL);
}

function toggleSlideshowPlay() {
    ssPlaying = !ssPlaying;
    if (ssPlaying) {
        ssTimer = setInterval(slideshowTick, SS_INTERVAL);
    } else {
        clearInterval(ssTimer); ssTimer = null;
    }
    renderSlideshowFrame();
}

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', e => {
    // Slideshow shortcuts
    if (document.getElementById('slideshowOverlay')?.style.display !== 'none') {
        if (e.key === 'Escape')     { stopSlideshow(); return; }
        if (e.key === 'ArrowRight') { slideshowStep(1); return; }
        if (e.key === 'ArrowLeft')  { slideshowStep(-1); return; }
        if (e.key === ' ')          { e.preventDefault(); toggleSlideshowPlay(); return; }
    }

    const modal = document.getElementById('photoModal');
    if (modal.classList.contains('active')) {
        if (e.key === 'Escape')      closeModal({ target: modal });
        if (e.key === 'ArrowRight')  nextPhoto();
        if (e.key === 'ArrowLeft')   previousPhoto();
        if (e.key === 'f' || e.key === 'F') toggleFavorite();
    }
    if (e.key === 'Delete' && selectedPhotos.size > 0) deleteSelected();
    if (e.key === 'Escape') { clearSelection(); closeMoreMenu(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        getFilteredPhotos().forEach(p => selectedPhotos.add(p.id));
        renderGallery();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); toggleSearch();
    }
});

// ── Boot ──────────────────────────────────────────────────────
if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initApp);
else
    initApp();

/* ═══════════════════════════════════════════════════════════════
   SYNC — Google Photos + Apple Photos bidirectional
═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────
let syncState = {
    google: {
        connected: false,
        clientId: '', clientSecret: '',
        accessToken: '', refreshToken: '',
        accountEmail: '', lastSync: null, photoCount: null
    },
    apple: {
        connected: false,
        lastSync: null, photoCount: null
    },
    direction: 'bidirectional',
    autoSync: false,
    running: false,
    log: []
};

let _autoSyncTimer = null;

// ── Persist ───────────────────────────────────────────────────
async function loadSyncState() {
    try {
        const r = await window.electronAPI.getSyncConfig?.();
        if (r?.success && r.config) Object.assign(syncState, r.config);
    } catch (_) {}
    renderSyncPills();
}

async function saveSyncState() {
    try {
        await window.electronAPI.saveSyncConfig?.({
            google: { ...syncState.google },
            apple:  { ...syncState.apple },
            direction: syncState.direction,
            autoSync:  syncState.autoSync,
            log: syncState.log.slice(0, 60)
        });
    } catch (_) {}
}

// ── Log helper ────────────────────────────────────────────────
function addSyncLog(msg, type = 'inf') {
    syncState.log.unshift({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        msg, type
    });
    if (syncState.log.length > 60) syncState.log.pop();
    renderSyncLog();
}

function renderSyncLog() {
    const el = document.getElementById('syncLog');
    if (!el) return;
    el.innerHTML = syncState.log.map(e =>
        `<div class="sync-log-entry">
           <span class="sync-log-time">${e.time}</span>
           <span class="sync-log-msg ${e.type}">${escapeHtml(e.msg)}</span>
         </div>`
    ).join('');
}

// ── Modal open/close ──────────────────────────────────────────
function openSyncModal() {
    document.getElementById('syncModal').classList.add('active');
    refreshSyncUI();
}
function closeSyncModal() {
    document.getElementById('syncModal').classList.remove('active');
}
function closeSyncModalOutside(e) {
    if (e.target === document.getElementById('syncModal')) closeSyncModal();
}
function closeOAuthModal() {
    document.getElementById('oauthModal').classList.remove('active');
}

// ── Full UI refresh ───────────────────────────────────────────
function refreshSyncUI() {
    const g = syncState.google;
    const a = syncState.apple;

    /* Google card */
    const gCard = document.getElementById('googleCard');
    const gBtn  = document.getElementById('googleConnectBtn');
    const gSub  = document.getElementById('googleStatus');
    const gDet  = document.getElementById('googleDetail');
    const gBadge = document.getElementById('googleBadge');

    if (g.connected) {
        gCard.className     = 'sync-svc-card connected';
        gSub.textContent    = g.accountEmail || 'Connected';
        gSub.className      = 'sync-svc-sub connected';
        gBtn.textContent    = 'Disconnect';
        gBtn.className      = 'sync-connect-btn disconnect';
        gBtn.onclick        = disconnectGoogle;
        gDet.style.display  = 'flex';
        gBadge.style.display = 'block';
        gBadge.className    = 'sync-badge connected';
        document.getElementById('googleAccount').textContent    = g.accountEmail || '—';
        document.getElementById('googleLastSync').textContent   = g.lastSync ? new Date(g.lastSync).toLocaleString() : 'Never';
        document.getElementById('googlePhotoCount').textContent = g.photoCount != null ? g.photoCount.toLocaleString() + ' photos' : '—';
    } else {
        gCard.className     = 'sync-svc-card';
        gSub.textContent    = 'Not connected';
        gSub.className      = 'sync-svc-sub';
        gBtn.textContent    = 'Connect';
        gBtn.className      = 'sync-connect-btn';
        gBtn.onclick        = connectGoogle;
        gDet.style.display  = 'none';
        gBadge.style.display = 'none';
    }

    /* Apple card */
    const isMac  = /mac/i.test(navigator.platform || navigator.userAgent);
    const aCard  = document.getElementById('appleCard');
    const aBtn   = document.getElementById('appleConnectBtn');
    const aSub   = document.getElementById('appleStatus');
    const aDet   = document.getElementById('appleDetail');
    const aBadge = document.getElementById('appleBadge');
    const aNote  = document.getElementById('applePlatformNote');

    aNote.style.display   = isMac ? 'none' : 'flex';
    aBtn.disabled         = !isMac;
    aBtn.style.opacity    = isMac ? '1' : '0.4';

    if (a.connected) {
        aCard.className     = 'sync-svc-card connected';
        aSub.textContent    = 'Connected — System Photos Library';
        aSub.className      = 'sync-svc-sub connected';
        aBtn.textContent    = 'Disconnect';
        aBtn.className      = 'sync-connect-btn disconnect';
        aBtn.onclick        = disconnectApple;
        aDet.style.display  = 'flex';
        aBadge.style.display = 'block';
        aBadge.className    = 'sync-badge connected';
        document.getElementById('appleLastSync').textContent   = a.lastSync ? new Date(a.lastSync).toLocaleString() : 'Never';
        document.getElementById('applePhotoCount').textContent = a.photoCount != null ? a.photoCount.toLocaleString() + ' photos' : '—';
    } else {
        aCard.className     = 'sync-svc-card';
        aSub.textContent    = isMac ? 'Not connected' : 'macOS only';
        aSub.className      = 'sync-svc-sub';
        aBtn.textContent    = 'Connect';
        aBtn.className      = 'sync-connect-btn';
        aBtn.onclick        = connectApple;
        aDet.style.display  = 'none';
        aBadge.style.display = 'none';
    }

    /* Options section */
    const anyConn = g.connected || a.connected;
    document.getElementById('syncOptionsWrap').style.display = anyConn ? 'block' : 'none';
    document.getElementById('syncLogWrap').style.display     = syncState.log.length ? 'block' : 'none';

    const dirEl = document.querySelector(`input[name="syncDir"][value="${syncState.direction}"]`);
    if (dirEl) dirEl.checked = true;

    const tog = document.getElementById('autoSyncToggle');
    if (tog) tog.setAttribute('aria-checked', syncState.autoSync ? 'true' : 'false');

    /* Sync Now button */
    const btn = document.getElementById('syncNowBtn');
    if (btn) {
        btn.disabled   = !anyConn || syncState.running;
        btn.innerHTML  = syncState.running
            ? '⟳ Syncing…'
            : `<svg style="width:13px;height:13px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg> Sync Now`;
    }

    /* Last run timestamp */
    const runs = [g.lastSync, a.lastSync].filter(Boolean).sort();
    const last  = runs.pop();
    document.getElementById('syncLastRun').textContent = last
        ? 'Last sync: ' + new Date(last).toLocaleString()
        : 'Last sync: Never';

    renderSyncLog();
}

// ── Sidebar pills ─────────────────────────────────────────────
function renderSyncPills() {
    const row = document.getElementById('syncStatusRow');
    const gP  = document.getElementById('syncPillGoogle');
    const aP  = document.getElementById('syncPillApple');
    if (!row) return;
    const anyConn = syncState.google.connected || syncState.apple.connected;
    row.style.display = anyConn ? 'flex' : 'none';
    if (gP) {
        gP.style.display = syncState.google.connected ? 'flex' : 'none';
        gP.className = 'sync-pill ' + (syncState.running ? 'syncing' : 'connected');
        document.getElementById('syncPillGoogleLabel').textContent = syncState.running ? 'Syncing…' : 'Google';
    }
    if (aP) {
        aP.style.display = syncState.apple.connected ? 'flex' : 'none';
        aP.className = 'sync-pill ' + (syncState.running ? 'syncing' : 'connected');
        document.getElementById('syncPillAppleLabel').textContent = syncState.running ? 'Syncing…' : 'Apple';
    }
}

function setSyncProgress(pct, label) {
    const wrap = document.getElementById('syncProgressWrap');
    const bar  = document.getElementById('syncProgressBar');
    const lbl  = document.getElementById('syncProgressLabel');
    if (!wrap) return;
    if (pct == null) { wrap.style.display = 'none'; return; }
    wrap.style.display  = 'flex';
    bar.style.width     = pct + '%';
    if (lbl && label) lbl.textContent = label;
}

// ── Google — connect ──────────────────────────────────────────
function connectGoogle() {
    if (!syncState.google.clientId) {
        document.getElementById('oauthModal').classList.add('active');
        return;
    }
    startGoogleOAuth();
}

function validateOAuth() {
    const id  = document.getElementById('oauthClientId')?.value.trim();
    const sec = document.getElementById('oauthClientSecret')?.value.trim();
    const btn = document.getElementById('oauthSaveBtn');
    if (btn) btn.disabled = !(id && sec);
}

function saveOAuthAndConnect() {
    const id  = document.getElementById('oauthClientId')?.value.trim();
    const sec = document.getElementById('oauthClientSecret')?.value.trim();
    if (!id || !sec) return;
    syncState.google.clientId     = id;
    syncState.google.clientSecret = sec;
    saveSyncState();
    closeOAuthModal();
    startGoogleOAuth();
}

async function startGoogleOAuth() {
    const r = await window.electronAPI.syncGoogleAuth?.({
        clientId:     syncState.google.clientId,
        clientSecret: syncState.google.clientSecret
    });
    if (!r) { addSyncLog('Google Auth: IPC handler not available', 'err'); return; }
    if (r.success) {
        Object.assign(syncState.google, {
            connected: true,
            accessToken: r.accessToken, refreshToken: r.refreshToken,
            accountEmail: r.email || ''
        });
        const cr = await window.electronAPI.syncGooglePhotoCount?.({ accessToken: r.accessToken });
        if (cr?.success) syncState.google.photoCount = cr.count;
        addSyncLog('Connected to Google Photos' + (r.email ? ' as ' + r.email : ''), 'ok');
    } else {
        syncState.google.connected = false;
        addSyncLog('Google auth failed: ' + (r.error || 'unknown'), 'err');
    }
    await saveSyncState();
    refreshSyncUI();
    renderSyncPills();
}

async function disconnectGoogle() {
    if (!confirm('Disconnect Google Photos? Your local photos will not be deleted.')) return;
    Object.assign(syncState.google, {
        connected: false, accessToken: '', refreshToken: '', accountEmail: '', lastSync: null, photoCount: null
    });
    addSyncLog('Disconnected from Google Photos');
    await saveSyncState();
    refreshSyncUI();
    renderSyncPills();
}

// ── Apple — connect ───────────────────────────────────────────
async function connectApple() {
    const r = await window.electronAPI.syncAppleConnect?.();
    if (!r) { addSyncLog('Apple Photos: IPC handler not available', 'err'); return; }
    if (r.success) {
        Object.assign(syncState.apple, { connected: true, photoCount: r.photoCount ?? null });
        addSyncLog('Connected to Apple Photos (' + (r.photoCount ?? '?') + ' photos)', 'ok');
    } else {
        addSyncLog('Apple Photos connection failed: ' + (r.error || 'unknown'), 'err');
    }
    await saveSyncState();
    refreshSyncUI();
    renderSyncPills();
}

async function disconnectApple() {
    if (!confirm('Disconnect Apple Photos? Your local photos will not be deleted.')) return;
    Object.assign(syncState.apple, { connected: false, lastSync: null, photoCount: null });
    addSyncLog('Disconnected from Apple Photos');
    await saveSyncState();
    refreshSyncUI();
    renderSyncPills();
}

// ── Direction + auto-sync ─────────────────────────────────────
document.addEventListener('change', e => {
    if (e.target.name === 'syncDir') {
        syncState.direction = e.target.value;
        saveSyncState();
    }
});

function toggleAutoSync() {
    syncState.autoSync = !syncState.autoSync;
    const tog = document.getElementById('autoSyncToggle');
    if (tog) tog.setAttribute('aria-checked', syncState.autoSync ? 'true' : 'false');
    saveSyncState();
    if (syncState.autoSync) {
        scheduleAutoSync();
        addSyncLog('Auto-sync enabled (every 15 min)');
    } else {
        clearInterval(_autoSyncTimer);
        addSyncLog('Auto-sync disabled');
    }
}

function scheduleAutoSync() {
    clearInterval(_autoSyncTimer);
    _autoSyncTimer = setInterval(() => { if (!syncState.running) runSync(true); }, 15 * 60 * 1000);
}

// ── Run sync ──────────────────────────────────────────────────
async function runSync(silent = false) {
    if (syncState.running) return;
    if (!syncState.google.connected && !syncState.apple.connected) {
        if (!silent) alert('Connect at least one service before syncing.');
        return;
    }

    syncState.running = true;
    renderSyncPills();
    refreshSyncUI();
    setSyncProgress(4, 'Starting sync…');

    const dir = syncState.direction;
    let gDown = 0, gUp = 0, aDown = 0, aUp = 0;

    try {
        // ── Google Photos ────────────────────────────────────
        if (syncState.google.connected) {
            addSyncLog('Google Photos: starting ' + dir + ' sync…');

            if (dir !== 'upload') {
                setSyncProgress(12, 'Fetching Google library…');
                const listRes = await window.electronAPI.syncGoogleList?.({
                    accessToken:  syncState.google.accessToken,
                    refreshToken: syncState.google.refreshToken,
                    clientId:     syncState.google.clientId,
                    clientSecret: syncState.google.clientSecret
                });

                if (listRes?.success) {
                    if (listRes.accessToken) syncState.google.accessToken = listRes.accessToken;
                    syncState.google.photoCount = listRes.items.length;

                    const localGIds = new Set(photos.filter(p => p.googleId).map(p => p.googleId));
                    const toDownload = listRes.items.filter(i => !localGIds.has(i.id));
                    addSyncLog('Google: ' + toDownload.length + ' new photos to download');

                    for (let i = 0; i < toDownload.length; i++) {
                        setSyncProgress(12 + Math.round(i / Math.max(toDownload.length, 1) * 33),
                            'Downloading ' + (i + 1) + ' / ' + toDownload.length + '…');
                        const dl = await window.electronAPI.syncGoogleDownload?.({
                            item: toDownload[i],
                            accessToken: syncState.google.accessToken
                        });
                        if (dl?.success) {
                            const meta = { ...dl.photo, googleId: toDownload[i].id,
                                dateAdded: new Date().toISOString(), favorite: false, faces: 0,
                                album: null, tags: [], deleted: false, deletedAt: null, editedAt: null };
                            await window.electronAPI.savePhoto(meta);
                            photos.push({ ...meta, src: dl.photo.src });
                            gDown++;
                        }
                    }
                } else {
                    addSyncLog('Google list error: ' + (listRes?.error || 'unknown'), 'err');
                }
            }

            if (dir !== 'download') {
                setSyncProgress(47, 'Uploading to Google Photos…');
                const toUpload = photos.filter(p => !p.deleted && !p.googleId);
                addSyncLog('Google: ' + toUpload.length + ' photos to upload');

                for (let i = 0; i < toUpload.length; i++) {
                    setSyncProgress(47 + Math.round(i / Math.max(toUpload.length, 1) * 35),
                        'Uploading ' + (i + 1) + ' / ' + toUpload.length + '…');
                    const up = await window.electronAPI.syncGoogleUpload?.({
                        photo: toUpload[i],
                        accessToken:  syncState.google.accessToken,
                        refreshToken: syncState.google.refreshToken,
                        clientId:     syncState.google.clientId,
                        clientSecret: syncState.google.clientSecret
                    });
                    if (up?.success) {
                        if (up.accessToken) syncState.google.accessToken = up.accessToken;
                        await window.electronAPI.updatePhoto(toUpload[i].id, { googleId: up.googleId });
                        const loc = photos.find(x => x.id === toUpload[i].id);
                        if (loc) loc.googleId = up.googleId;
                        gUp++;
                    }
                }
            }

            syncState.google.lastSync = new Date().toISOString();
            addSyncLog('Google sync done — ↓' + gDown + ' downloaded, ↑' + gUp + ' uploaded', 'ok');
        }

        // ── Apple Photos ─────────────────────────────────────
        if (syncState.apple.connected) {
            setSyncProgress(85, 'Syncing Apple Photos…');
            addSyncLog('Apple Photos: starting ' + dir + ' sync…');

            const ar = await window.electronAPI.syncAppleRun?.({
                direction: dir,
                localPhotos: photos.filter(p => !p.deleted)
            });

            if (ar?.success) {
                if (ar.downloaded?.length) {
                    for (const dl of ar.downloaded) {
                        const meta = { ...dl, dateAdded: new Date().toISOString(),
                            favorite: false, faces: 0, album: null, tags: [],
                            deleted: false, deletedAt: null, editedAt: null };
                        await window.electronAPI.savePhoto(meta);
                        photos.push({ ...meta, src: dl.src });
                        aDown++;
                    }
                }
                aUp = ar.uploaded || 0;
                syncState.apple.photoCount = ar.libraryCount ?? syncState.apple.photoCount;
                syncState.apple.lastSync   = new Date().toISOString();
                addSyncLog('Apple sync done — ↓' + aDown + ' downloaded, ↑' + aUp + ' uploaded', 'ok');
            } else {
                addSyncLog('Apple sync error: ' + (ar?.error || 'unknown'), 'err');
            }
        }

        setSyncProgress(100, 'Sync complete');
        setTimeout(() => setSyncProgress(null), 1800);

        await loadPhotos();
        renderGallery();
        updateCounts();

    } catch (err) {
        addSyncLog('Sync error: ' + err.message, 'err');
        setSyncProgress(null);
    } finally {
        syncState.running = false;
        await saveSyncState();
        renderSyncPills();
        refreshSyncUI();
    }
}

// ── Boot integration ──────────────────────────────────────────
// Wrap the existing initApp to also load sync config
(function patchInit() {
    const _orig = window.initApp;
    window.initApp = async function () {
        await loadSyncState();
        if (_orig) await _orig.call(this);
        if (syncState.autoSync) scheduleAutoSync();
    };
})();
