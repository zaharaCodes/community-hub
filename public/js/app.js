/* =============================================
   COMMUNITY HUB — app.js
   TIER 2 FEATURES:
   6. Pagination (Load More)
   7. Resource tags
   8. Timestamps (improved)
   9. Smart empty state per category
   10. Field-level form validation
============================================= */

var API_URL         = '/api/resources';
var allResources    = [];
var currentFilter   = 'all';
var currentSort     = 'newest';
var pendingDeleteId = null;
var pendingEditId   = null;

// FEATURE 6: Pagination state
var PAGE_SIZE       = 6;   // cards per page
var currentPage     = 1;

var myIds = JSON.parse(localStorage.getItem('ch_mine')  || '[]');
var saved = JSON.parse(localStorage.getItem('ch_saved') || '[]');
var voted = JSON.parse(localStorage.getItem('ch_voted') || '[]');

var CAT_LABEL = {
    food:'Food Assistance', shelter:'Shelter & Housing', health:'Healthcare',
    mental:'Mental Health', job:'Job Training', education:'Education',
    legal:'Legal Aid', other:'Other Services'
};

// FEATURE 9: Per-category empty messages
var CAT_EMPTY = {
    all:      { icon:'🔍', msg:'No resources match your search. Try different keywords.' },
    food:     { icon:'🥗', msg:'No food resources yet — be the first to add one!' },
    shelter:  { icon:'🏠', msg:'No shelter resources yet — be the first to add one!' },
    health:   { icon:'❤️', msg:'No health resources yet — be the first to add one!' },
    mental:   { icon:'🧠', msg:'No mental health resources yet — be the first to add one!' },
    job:      { icon:'💼', msg:'No job resources yet — be the first to add one!' },
    education:{ icon:'📚', msg:'No education resources yet — be the first to add one!' },
    legal:    { icon:'⚖️', msg:'No legal resources yet — be the first to add one!' },
    other:    { icon:'✨', msg:'No other resources yet — be the first to add one!' }
};

/* =============================================
   BOOT
============================================= */
document.addEventListener('DOMContentLoaded', function () {

    if (localStorage.getItem('ch_theme') === 'light') {
        document.body.classList.add('light');
        document.getElementById('themeBtn').textContent = '☀️';
    }

    bindNav('nav-brand-logo', 'home');
    bindNav('nav-home',       'home');
    bindNav('nav-resources',  'resources');
    bindNav('nav-saved',      'saved');
    bindNav('nav-mine',       'mine');
    bindNav('nav-about',      'about');
    bindNav('nav-share',      'share');

    bindClick('hero-browse-btn', function(){ showPage('resources'); });
    bindClick('hero-share-btn',  function(){ showPage('share'); });
    bindClick('themeBtn',        toggleTheme);
    bindClick('submitBtn',       submitResource);
    bindClick('confirmDeleteBtn',confirmDelete);
    bindClick('cancelDeleteBtn', closeDeleteModal);
    bindClick('confirmEditBtn',  confirmEdit);
    bindClick('cancelEditBtn',   closeEditModal);
    bindNav('footer-about',     'about');
    bindNav('footer-share',     'share');
    bindNav('empty-share-link', 'share');
    bindNav('mine-share-link',  'share');
    bindClick('about-share-btn', function(){ showPage('share'); });

    document.getElementById('deleteModal').addEventListener('click', function(e){
        if (e.target === this) closeDeleteModal();
    });
    document.getElementById('editModal').addEventListener('click', function(e){
        if (e.target === this) closeEditModal();
    });

    document.getElementById('filterChips').addEventListener('click', function(e){
        var chip = e.target.closest('.chip');
        if (!chip) return;
        currentFilter = chip.getAttribute('data-cat');
        currentPage = 1; // reset page on filter change
        document.querySelectorAll('.chip').forEach(function(c){ c.classList.remove('active'); });
        chip.classList.add('active');
        renderResources();
    });

    document.getElementById('searchInput').addEventListener('input', function(){
        currentPage = 1; // reset page on search
        renderResources();
    });

    document.getElementById('sortSelect').addEventListener('change', function(){
        currentSort = this.value;
        currentPage = 1;
        renderResources();
    });

    // FEATURE 10: live validation — clear error on input
    ['f-name','f-location','f-desc','f-category','f-tags'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function(){ clearFieldError(id); });
        if (el) el.addEventListener('change', function(){ clearFieldError(id); });
    });

    loadResources();

    // FEATURE 6: Load more button
    var loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', function(){
        currentPage++;
        renderResources();
        // Smooth scroll to first new card
        setTimeout(function(){
            var grid = document.getElementById('resourcesGrid');
            if (!grid) return;
            var cards = grid.querySelectorAll('.resource-card');
            var idx = (currentPage - 1) * PAGE_SIZE;
            if (cards[idx]) cards[idx].scrollIntoView({ behavior:'smooth', block:'start' });
        }, 50);
    });
});

function bindNav(id, page) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function(e){ e.preventDefault(); showPage(page); });
}
function bindClick(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
}

/* =============================================
   PAGE NAVIGATION
============================================= */
function showPage(name) {
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.querySelectorAll('.nav-link, .nav-cta').forEach(function(a){ a.classList.remove('active'); });

    var page = document.getElementById('page-' + name);
    if (!page) return;
    page.classList.add('active');

    var navEl = document.getElementById('nav-' + name);
    if (navEl) navEl.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (name === 'resources') renderResources();
    if (name === 'saved')     renderSaved();
    if (name === 'mine')      renderMine();
    if (name === 'about')     animateCount('aboutCount', allResources.length);
    if (name === 'home')      animateCount('heroCount',  allResources.length);

    var url = window.location.pathname + (name !== 'home' ? '?page=' + name : '');
    history.replaceState(null, '', url);
}

/* =============================================
   LOAD FROM API
============================================= */
function loadResources() {
    fetch(API_URL)
        .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
        .then(function(data){
            allResources = data;
            animateCount('heroCount', allResources.length);
            updateBadges();

            var params = new URLSearchParams(window.location.search);
            var rid    = params.get('r');
            var pg     = params.get('page');

            if (rid) {
                var found = allResources.filter(function(x){ return x._id === rid; })[0];
                if (found) { openDetail(rid); return; }
            }
            if (pg) { showPage(pg); return; }
            showPage('home');
        })
        .catch(function(err){
            console.error('Load error:', err);
            showToast('⚠️','Could not load resources — is the server running?','error');
            showPage('home');
        });
}

/* =============================================
   BADGES
============================================= */
function updateBadges() {
    var mineCount = myIds.filter(function(id){
        return allResources.some(function(r){ return r._id === id; });
    }).length;
    var mineBadge = document.getElementById('mineBadge');
    if (mineBadge) mineBadge.textContent = mineCount > 0 ? mineCount : '';

    var savedCount = saved.filter(function(id){
        return allResources.some(function(r){ return r._id === id; });
    }).length;
    var savedBadge = document.getElementById('savedBadge');
    if (savedBadge) savedBadge.textContent = savedCount > 0 ? savedCount : '';
}

/* =============================================
   SORT
============================================= */
function getSorted(list) {
    var copy = list.slice();
    if (currentSort === 'helpful') {
        copy.sort(function(a,b){ return (b.helpful||0)-(a.helpful||0); });
    } else if (currentSort === 'az') {
        copy.sort(function(a,b){ return a.name.localeCompare(b.name); });
    } else {
        copy.sort(function(a,b){ return new Date(b.createdAt||0)-new Date(a.createdAt||0); });
    }
    return copy;
}

/* =============================================
   RENDER — Resources page (with pagination)
============================================= */
function renderResources() {
    var grid      = document.getElementById('resourcesGrid');
    var empty     = document.getElementById('emptyResources');
    var moreWrap  = document.getElementById('loadMoreWrap');
    if (!grid) return;

    var q = (document.getElementById('searchInput').value || '').toLowerCase();
    var filtered = allResources.filter(function(r){
        return (currentFilter === 'all' || r.category === currentFilter) &&
               (!q || r.name.toLowerCase().indexOf(q)>-1 ||
                      r.description.toLowerCase().indexOf(q)>-1 ||
                      r.location.toLowerCase().indexOf(q)>-1);
    });
    var sorted = getSorted(filtered);

    // FEATURE 9: smart empty state
    if (!sorted.length) {
        grid.innerHTML = '';
        if (moreWrap) moreWrap.style.display = 'none';
        var info = CAT_EMPTY[q ? 'all' : currentFilter] || CAT_EMPTY['all'];
        empty.querySelector('.empty-icon').textContent = info.icon;
        empty.querySelector('p').innerHTML = info.msg
            + ' <a href="#" id="empty-share-link">Share one here →</a>';
        bindNav('empty-share-link','share');
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    // FEATURE 6: Pagination — show only currentPage * PAGE_SIZE items
    var visible = sorted.slice(0, currentPage * PAGE_SIZE);
    var hasMore = visible.length < sorted.length;

    grid.innerHTML = visible.map(buildCard).join('');
    attachCardListeners(grid);

    // Load More button
    if (moreWrap) {
        if (hasMore) {
            moreWrap.style.display = 'flex';
            var btn = document.getElementById('loadMoreBtn');
            var remaining = sorted.length - visible.length;
            if (btn) btn.textContent = 'Load ' + Math.min(remaining, PAGE_SIZE) + ' More  ↓';
        } else {
            moreWrap.style.display = 'none';
        }
    }
}

function renderMine() {
    var grid  = document.getElementById('mineGrid');
    var empty = document.getElementById('emptyMine');
    if (!grid) return;
    var mine = getSorted(allResources.filter(function(r){ return myIds.indexOf(r._id)>-1; }));
    if (!mine.length){ grid.innerHTML=''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    grid.innerHTML = mine.map(buildCard).join('');
    attachCardListeners(grid);
}

function renderSaved() {
    var grid  = document.getElementById('savedGrid');
    var empty = document.getElementById('emptySaved');
    if (!grid) return;
    var bookmarked = getSorted(allResources.filter(function(r){ return saved.indexOf(r._id)>-1; }));
    if (!bookmarked.length){ grid.innerHTML=''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    grid.innerHTML = bookmarked.map(buildCard).join('');
    attachCardListeners(grid);
}

/* FEATURE 6: Load more handler — called from HTML via id binding */
function loadMore() {
    currentPage++;
    renderResources();
    // Scroll to where new cards start
    var grid = document.getElementById('resourcesGrid');
    if (grid) {
        var cards = grid.querySelectorAll('.resource-card');
        var startIdx = (currentPage - 1) * PAGE_SIZE;
        if (cards[startIdx]) {
            cards[startIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

/* =============================================
   BUILD CARD — Feature 7 (tags) + 8 (timestamp)
============================================= */
function buildCard(r) {
    var isMine   = myIds.indexOf(r._id) > -1;
    var isSaved  = saved.indexOf(r._id) > -1;
    var hasVoted = voted.indexOf(r._id) > -1;
    var helpful  = r.helpful || 0;
    var timeAgo  = r.createdAt ? getTimeAgo(r.createdAt) : '';

    // FEATURE 7: tags chips
    var tagsHtml = '';
    if (r.tags && r.tags.length) {
        tagsHtml = '<div class="card-tags">'
            + r.tags.map(function(t){ return '<span class="tag-chip">' + esc(t) + '</span>'; }).join('')
            + '</div>';
    }

    return '<div class="resource-card" data-id="' + r._id + '">'
        + (isMine ? '<div class="mine-tag">MINE</div>' : '')
        + '<div class="card-top">'
        +   '<div class="card-title">' + esc(r.name) + '</div>'
        +   '<span class="cat-badge cat-' + r.category + '">' + (CAT_LABEL[r.category]||r.category) + '</span>'
        + '</div>'
        + '<div class="card-location">📍 ' + esc(r.location)
        +   (timeAgo ? ' &nbsp;·&nbsp; <span class="card-time-inline">🕐 ' + timeAgo + '</span>' : '')
        + '</div>'
        + tagsHtml
        + '<div class="card-desc">' + esc(r.description) + '</div>'
        + '<div class="card-footer">'
        +   '<div class="card-contact">' + (r.contact ? '📞 '+esc(r.contact) : '') + '</div>'
        +   '<div class="card-actions">'
        +     '<button class="icon-btn '+(isSaved?'is-saved':'')+'" data-action="save" data-id="'+r._id+'" title="Bookmark">'+(isSaved?'❤️':'🤍')+'</button>'
        +     '<button class="icon-btn '+(hasVoted?'is-helpful':'')+'" data-action="vote" data-id="'+r._id+'" title="Helpful">👍 <small>'+helpful+'</small></button>'
        +     '<button class="icon-btn" data-action="copy" data-id="'+r._id+'" title="Copy link">🔗</button>'
        +     (isMine ? '<button class="icon-btn" data-action="edit"   data-id="'+r._id+'" title="Edit">✏️</button>' : '')
        +     (isMine ? '<button class="icon-btn is-delete" data-action="delete" data-id="'+r._id+'" title="Delete">🗑️</button>' : '')
        +   '</div>'
        + '</div>'
        + '</div>';
}

function attachCardListeners(grid) {
    grid.querySelectorAll('.resource-card').forEach(function(card){
        card.addEventListener('click', function(e){
            if (e.target.closest('.card-actions')) return;
            openDetail(card.getAttribute('data-id'));
        });
    });
    grid.querySelectorAll('[data-action]').forEach(function(btn){
        btn.addEventListener('click', function(e){
            e.stopPropagation();
            var action = btn.getAttribute('data-action');
            var id     = btn.getAttribute('data-id');
            if (action==='save')   toggleSave(id, btn);
            if (action==='vote')   voteHelpful(id, btn);
            if (action==='copy')   copyLink(id);
            if (action==='edit')   openEditModal(id);
            if (action==='delete') openDeleteModal(id);
        });
    });
}

/* =============================================
   DETAIL PAGE
============================================= */
function openDetail(id) {
    var r = allResources.filter(function(x){ return x._id===id; })[0];
    if (!r) return;

    var isMine  = myIds.indexOf(r._id) > -1;
    var isSaved = saved.indexOf(r._id) > -1;
    var helpful = r.helpful || 0;
    var timeAgo = r.createdAt ? getTimeAgo(r.createdAt) : '';

    history.replaceState(null, '', window.location.pathname + '?r=' + r._id);

    var shareUrl  = window.location.origin + window.location.pathname + '?r=' + r._id;
    var shareText = encodeURIComponent('"' + r.name + '" — free community resource in ' + r.location + '! ');
    var waUrl     = 'https://wa.me/?text=' + shareText + encodeURIComponent(shareUrl);
    var twUrl     = 'https://twitter.com/intent/tweet?text=' + shareText + '&url=' + encodeURIComponent(shareUrl);

    // FEATURE 7: tags in detail
    var tagsHtml = '';
    if (r.tags && r.tags.length) {
        tagsHtml = '<div class="card-tags" style="margin-top:.75rem">'
            + r.tags.map(function(t){ return '<span class="tag-chip tag-chip-lg">'+esc(t)+'</span>'; }).join('')
            + '</div>';
    }

    var html =
        '<button class="back-btn" id="detail-back-btn">← Back to Resources</button>'
        + '<div class="detail-hero-card">'
        +   '<span class="cat-badge cat-'+r.category+'">'+(CAT_LABEL[r.category]||r.category)+'</span>'
        +   (isMine ? '<span class="cat-badge" style="background:rgba(0,212,255,0.1);color:var(--cyan);margin-left:.5rem">YOUR SUBMISSION</span>' : '')
        +   '<div class="detail-title">'+esc(r.name)+'</div>'
        +   '<div class="detail-meta">'
        +     '<span>📍 '+esc(r.location)+'</span>'
        +     (r.contact ? '<span>📞 '+esc(r.contact)+'</span>' : '')
        +     '<span>👍 '+helpful+' found helpful</span>'
        +     (timeAgo ? '<span>🕐 '+timeAgo+'</span>' : '')
        +   '</div>'
        +   tagsHtml
        + '</div>'
        + '<div class="detail-body">'
        +   '<div class="detail-desc-card"><h3>About This Resource</h3><p>'+esc(r.description)+'</p></div>'
        +   '<div class="sidebar-col">'
        +     (r.contact ? '<div class="sidebar-box"><div class="sidebar-label">Contact</div>'
              +'<div class="contact-row"><span>📞</span>'+esc(r.contact)+'</div>'
              +'<div class="contact-row"><span>📍</span>'+esc(r.location)+'</div></div>' : '')
        +     '<div class="sidebar-box"><div class="sidebar-label">Actions</div><div class="action-col">'
        +       '<button class="action-btn action-save '+(isSaved?'saved':'')+'" id="detail-save-btn">'+( isSaved?'❤️ Saved':'🤍 Save Resource')+'</button>'
        +       '<button class="action-btn action-helpful" id="detail-vote-btn">👍 Mark as Helpful</button>'
        +       '<button class="action-btn action-share"   id="detail-copy-btn">🔗 Copy Link</button>'
        +       (isMine ? '<button class="action-btn" id="detail-edit-btn" style="background:rgba(167,139,250,0.1);color:var(--purple);border:1px solid rgba(167,139,250,0.25)">✏️ Edit Resource</button>' : '')
        +       (isMine ? '<button class="action-btn action-delete" id="detail-delete-btn">🗑️ Delete Resource</button>' : '')
        +     '</div></div>'
        +     '<div class="sidebar-box"><div class="sidebar-label">Share</div>'
        +       '<div class="share-btns">'
        +         '<a class="share-btn share-wa" href="'+waUrl+'" target="_blank" rel="noopener">💬 WhatsApp</a>'
        +         '<a class="share-btn share-tw" href="'+twUrl+'" target="_blank" rel="noopener">𝕏 Twitter</a>'
        +       '</div>'
        +     '</div>'
        +   '</div>'
        + '</div>';

    document.getElementById('detailContent').innerHTML = html;

    bindClick('detail-back-btn',   function(){ history.replaceState(null,'',window.location.pathname); showPage('resources'); });
    bindClick('detail-save-btn',   function(){ toggleSaveDetail(r._id); });
    bindClick('detail-vote-btn',   function(){ voteHelpfulDetail(r._id); });
    bindClick('detail-copy-btn',   function(){ copyLink(r._id); });
    bindClick('detail-edit-btn',   function(){ openEditModal(r._id); });
    bindClick('detail-delete-btn', function(){ openDeleteModal(r._id); });

    showPage('detail');
}

/* =============================================
   FEATURE 10: FIELD VALIDATION
============================================= */
function setFieldError(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('input-error');
    // show inline error message
    var existing = el.parentNode.querySelector('.field-error-msg');
    if (!existing) {
        var span = document.createElement('span');
        span.className = 'field-error-msg';
        span.textContent = msg;
        el.parentNode.appendChild(span);
    }
    el.focus();
}

function clearFieldError(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('input-error');
    var msg = el.parentNode.querySelector('.field-error-msg');
    if (msg) msg.parentNode.removeChild(msg);
}

function clearAllErrors() {
    ['f-name','f-location','f-desc','f-category'].forEach(clearFieldError);
}

/* =============================================
   SUBMIT — with field validation
============================================= */
function submitResource() {
    clearAllErrors();

    var name     = document.getElementById('f-name').value.trim();
    var category = document.getElementById('f-category').value;
    var location = document.getElementById('f-location').value.trim();
    var contact  = document.getElementById('f-contact').value.trim();
    var desc     = document.getElementById('f-desc').value.trim();

    // FEATURE 7: parse tags from comma-separated input
    var tagsEl   = document.getElementById('f-tags');
    var tags     = tagsEl && tagsEl.value.trim()
        ? tagsEl.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean)
        : [];

    // FEATURE 10: validate each field individually
    var valid = true;
    if (!name)     { setFieldError('f-name',     'Resource name is required'); valid = false; }
    if (!category) { setFieldError('f-category', 'Please select a category');  valid = false; }
    if (!location) { setFieldError('f-location', 'Location is required');       valid = false; }
    if (!desc)     { setFieldError('f-desc',     'Description is required');    valid = false; }
    if (!valid) return;

    var submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sharing...';

    fetch(API_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({name:name, category:category, location:location, contact:contact, description:desc, tags:tags})
    })
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(nr){
        allResources.unshift(nr);
        myIds.push(nr._id);
        localStorage.setItem('ch_mine', JSON.stringify(myIds));
        ['f-name','f-category','f-location','f-contact','f-desc'].forEach(function(id){
            document.getElementById(id).value = '';
        });
        if (tagsEl) tagsEl.value = '';
        animateCount('heroCount', allResources.length);
        updateBadges();
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Share Resource';
        showToast('🎉','Resource shared! Thank you for helping the community.','success');
        setTimeout(function(){ showPage('resources'); }, 1000);
    })
    .catch(function(){
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Share Resource';
        showToast('❌','Failed to share. Please try again.','error');
    });
}

/* =============================================
   DELETE
============================================= */
function openDeleteModal(id) {
    pendingDeleteId = id;
    document.getElementById('deleteModal').style.display = 'flex';
}
function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    pendingDeleteId = null;
}
function confirmDelete() {
    if (!pendingDeleteId) return;
    var id = pendingDeleteId;
    closeDeleteModal();
    fetch(API_URL+'/'+id, {method:'DELETE'})
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(){
        allResources = allResources.filter(function(r){ return r._id!==id; });
        myIds = myIds.filter(function(x){ return x!==id; });
        saved = saved.filter(function(x){ return x!==id; });
        localStorage.setItem('ch_mine',  JSON.stringify(myIds));
        localStorage.setItem('ch_saved', JSON.stringify(saved));
        updateBadges();
        animateCount('heroCount', allResources.length);
        showToast('🗑️','Resource deleted','error');
        history.replaceState(null,'',window.location.pathname);
        var isDetail = document.getElementById('page-detail').classList.contains('active');
        if (isDetail) showPage('resources');
        else { renderResources(); renderMine(); renderSaved(); }
    })
    .catch(function(){ showToast('❌','Delete failed. Try again.','error'); });
}

/* =============================================
   EDIT
============================================= */
function openEditModal(id) {
    var r = allResources.filter(function(x){ return x._id===id; })[0];
    if (!r) return;
    pendingEditId = id;
    document.getElementById('edit-name').value        = r.name;
    document.getElementById('edit-category').value    = r.category;
    document.getElementById('edit-location').value    = r.location;
    document.getElementById('edit-contact').value     = r.contact || '';
    document.getElementById('edit-description').value = r.description;
    var editTags = document.getElementById('edit-tags');
    if (editTags) editTags.value = (r.tags || []).join(', ');
    document.getElementById('editModal').style.display = 'flex';
}
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    pendingEditId = null;
}
function confirmEdit() {
    if (!pendingEditId) return;
    var name     = document.getElementById('edit-name').value.trim();
    var category = document.getElementById('edit-category').value;
    var location = document.getElementById('edit-location').value.trim();
    var contact  = document.getElementById('edit-contact').value.trim();
    var desc     = document.getElementById('edit-description').value.trim();
    var editTags = document.getElementById('edit-tags');
    var tags     = editTags && editTags.value.trim()
        ? editTags.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean)
        : [];

    if (!name||!category||!location||!desc){ showToast('⚠️','Fill all required fields','error'); return; }

    fetch(API_URL+'/'+pendingEditId, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({name:name, category:category, location:location, contact:contact, description:desc, tags:tags})
    })
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(updated){
        for(var i=0;i<allResources.length;i++){
            if(allResources[i]._id===pendingEditId){ allResources[i]=updated; break; }
        }
        closeEditModal();
        showToast('✅','Resource updated!','success');
        renderResources(); renderMine(); renderSaved();
    })
    .catch(function(){ showToast('❌','Update failed. Try again.','error'); });
}

/* =============================================
   BOOKMARK
============================================= */
function toggleSave(id, btn) {
    var idx = saved.indexOf(id);
    if (idx===-1){ saved.push(id); btn.innerHTML='❤️'; btn.classList.add('is-saved'); showToast('❤️','Bookmarked!','success'); }
    else { saved.splice(idx,1); btn.innerHTML='🤍'; btn.classList.remove('is-saved'); showToast('ℹ️','Bookmark removed','info'); }
    localStorage.setItem('ch_saved', JSON.stringify(saved));
    updateBadges();
}
function toggleSaveDetail(id) {
    var btn = document.getElementById('detail-save-btn');
    var idx = saved.indexOf(id);
    if (idx===-1){ saved.push(id); if(btn){btn.classList.add('saved');btn.innerHTML='❤️ Saved';} showToast('❤️','Bookmarked!','success'); }
    else { saved.splice(idx,1); if(btn){btn.classList.remove('saved');btn.innerHTML='🤍 Save Resource';} showToast('ℹ️','Bookmark removed','info'); }
    localStorage.setItem('ch_saved', JSON.stringify(saved));
    updateBadges();
}

/* =============================================
   VOTE
============================================= */
function voteHelpful(id, btn) {
    if (voted.indexOf(id)>-1){ showToast('ℹ️','Already voted!','info'); return; }
    fetch(API_URL+'/'+id+'/helpful', {method:'POST'})
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(data){
        voted.push(id); localStorage.setItem('ch_voted', JSON.stringify(voted));
        for(var i=0;i<allResources.length;i++){ if(allResources[i]._id===id){allResources[i].helpful=data.helpful;break;} }
        var sm=btn.querySelector('small'); if(sm) sm.textContent=data.helpful;
        btn.classList.add('is-helpful');
        showToast('👍','Marked as helpful!','success');
    })
    .catch(function(){ showToast('❌','Vote failed.','error'); });
}
function voteHelpfulDetail(id) {
    if (voted.indexOf(id)>-1){ showToast('ℹ️','Already voted!','info'); return; }
    fetch(API_URL+'/'+id+'/helpful', {method:'POST'})
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(data){
        voted.push(id); localStorage.setItem('ch_voted', JSON.stringify(voted));
        for(var i=0;i<allResources.length;i++){ if(allResources[i]._id===id){allResources[i].helpful=data.helpful;break;} }
        showToast('👍','Marked as helpful!','success');
    })
    .catch(function(){ showToast('❌','Vote failed.','error'); });
}

/* =============================================
   COPY LINK
============================================= */
function copyLink(id) {
    var url = window.location.origin + window.location.pathname + '?r=' + id;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function(){});
    showToast('🔗','Link copied!','success');
}

/* =============================================
   TOAST
============================================= */
function showToast(icon, msg, type) {
    var c = document.getElementById('toastContainer');
    if (!c) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type||'info');
    el.innerHTML = '<span>'+icon+'</span><span>'+msg+'</span>';
    c.appendChild(el);
    setTimeout(function(){
        el.style.cssText += 'opacity:0;transform:translateX(110%);transition:all .3s';
        setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 2800);
}

/* =============================================
   COUNTER ANIMATION
============================================= */
function animateCount(elId, target) {
    var el = document.getElementById(elId);
    if (!el) return;
    var v=0, step=Math.max(1,Math.ceil(target/40));
    var t = setInterval(function(){
        v=Math.min(v+step,target); el.textContent=v;
        if(v>=target) clearInterval(t);
    }, 20);
}

/* =============================================
   TIME AGO
============================================= */
function getTimeAgo(dateStr) {
    var now  = new Date();
    var then = new Date(dateStr);
    var secs = Math.floor((now - then) / 1000);
    if (secs < 60)   return 'just now';
    var mins = Math.floor(secs/60);
    if (mins < 60)   return mins + 'm ago';
    var hrs  = Math.floor(mins/60);
    if (hrs  < 24)   return hrs  + 'h ago';
    var days = Math.floor(hrs/24);
    if (days < 30)   return days + 'd ago';
    var mos  = Math.floor(days/30);
    if (mos  < 12)   return mos  + 'mo ago';
    return Math.floor(mos/12) + 'y ago';
}

/* =============================================
   THEME
============================================= */
function toggleTheme() {
    document.body.classList.toggle('light');
    var dark = !document.body.classList.contains('light');
    document.getElementById('themeBtn').textContent = dark ? '🌙' : '☀️';
    localStorage.setItem('ch_theme', dark ? 'dark' : 'light');
}

/* =============================================
   ESCAPE
============================================= */
function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}