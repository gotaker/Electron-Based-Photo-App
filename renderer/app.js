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
    renderGallery();
    renderAlbums();
    updateCounts();
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
    <div class="photo-card ${sel ? 'is-selected' : ''} ${isDeleted ? 'is-deleted' : ''}"
         data-photo-id="${escapeAttr(photo.id)}"
         onclick="${isDeleted ? '' : `openPhoto('${escapeJsString(photo.id)}')`}">
        <img src="${photo.src}" alt="${escapeAttr(photo.name)}" loading="lazy">
        <div class="photo-select ${sel ? 'selected' : ''}"
             onclick="event.stopPropagation(); toggleSelect('${escapeJsString(photo.id)}')"></div>
        ${photo.faces > 0 && !isDeleted ? `<div class="face-badge">👤 ${photo.faces} ${photo.faces===1?'person':'people'}</div>` : ''}
        ${photo.favorite && !isDeleted ? '<div class="fav-badge">♥</div>' : ''}
        ${isDeleted ? `<div class="days-badge">${days}d</div>` : ''}
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
        return;
    }
    uploadZone.style.display = 'none';

    if (filtered.length === 0) {
        gallery.style.display    = 'none';
        emptyState.style.display = 'flex';
        applyEmptyState(currentView);
        updateUtilityBar();
        return;
    }

    gallery.style.display    = 'grid';
    emptyState.style.display = 'none';

    let list = filtered;
    if (currentView === 'timeline') list = sortForTimeline(filtered);

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
}

function clearSelection() { selectedPhotos.clear(); renderGallery(); updateToolbar(); }

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
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    (ev?.target || (typeof event!=='undefined'?event.target:null))?.classList.add('active');
    document.getElementById('gallery').classList.toggle('list-view', view === 'list');
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

// ── Sync ──────────────────────────────────────────────────────
async function syncAzure() {
    const r = await window.electronAPI.syncAzureBlob({});
    if (r.skipped) { alert(r.message || 'Azure Blob sync is not configured.'); return; }
    alert(r.success ? `Uploaded ${r.uploaded} file(s) to "${r.container}".` : r.error || 'Sync failed');
}

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', e => {
    const modal = document.getElementById('photoModal');
    if (modal.classList.contains('active')) {
        if (e.key === 'Escape')      closeModal({ target: modal });
        if (e.key === 'ArrowRight')  nextPhoto();
        if (e.key === 'ArrowLeft')   previousPhoto();
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

// ── Boot ──────────────────────────────────────────────────────
if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initApp);
else
    initApp();
