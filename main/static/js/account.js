let currentUser = null;

async function checkAuth() {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
        window.location.href = '/auth/';
        return;
    }

    try {
        const response = await fetch('/api/users/me/', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            loadUserData();
            
            
            window.modelsLoaded = false;
            window.favoritesLoaded = false;
            
            
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) {
                if (activeTab.id === 'modelsTab') {
                    loadUserModels();
                    loadUserStats();
                } else if (activeTab.id === 'favoritesTab') {
                    loadFavoriteModels();
                }
            }
            
            setTimeout(updateMobileMenu, 100);
        } else {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            window.location.href = '/auth/';
        }
    } catch (error) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/auth/';
    }
}

function loadUserData() {
    document.getElementById('profileName').textContent = currentUser.username;
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('mobileProfileName').textContent = currentUser.username;
    document.getElementById('mobileProfileEmail').textContent = currentUser.email;
    document.getElementById('username').value = currentUser.username;
    document.getElementById('email').value = currentUser.email;
    
    if (currentUser.profile_picture) {
        document.getElementById('profilePicture').src = currentUser.profile_picture;
        document.getElementById('mobileProfilePicture').src = currentUser.profile_picture;
    }
}

function initializePage() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            const mobileSidebar = document.getElementById('mobileSidebar');
            
            if (mobileSidebar.classList.contains('active')) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });
    }
    
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', function() {
            closeMobileMenu();
        });
    });
    
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            closeMobileMenu();
        }
    });
    
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeMobileMenu();
        }
    });
    
    document.addEventListener('DOMContentLoaded', function() {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'favoritesTab') {
            loadFavoriteModels();
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initializePage();
    initTooltips();
});

function updateMobileMenu() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    
    const tabId = activeTab.id;
    let tabName = '';
    
    if (tabId.includes('modelsTab')) tabName = 'models';
    else if (tabId.includes('settingsTab')) tabName = 'settings';
    else if (tabId.includes('deleteTab')) tabName = 'delete';
    
    if (!tabName) return;
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.textContent.includes(getTabName(tabName))) {
            link.classList.add('active');
        }
    });
    
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.textContent.includes(getTabName(tabName))) {
            link.classList.add('active');
        }
    });
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.textContent.includes(getTabName(tabName))) {
            link.classList.add('active');
        }
    });
    
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    mobileNavLinks.forEach(link => {
        if (link.textContent.includes(getTabName(tabName))) {
            link.classList.add('active');
        }
    });

    
    switch(tabName) {
        case 'models':
            if (!window.modelsLoaded) {
                loadUserModels();
                loadUserStats();
            }
            break;
        case 'favorites':
            if (!window.favoritesLoaded) {
                loadFavoriteModels();
            }
            break;
        
    }
}


document.getElementById('profileForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('username', document.getElementById('username').value);
    formData.append('email', document.getElementById('email').value);

    await updateProfile(formData);
});

document.getElementById('passwordForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }

    await changePassword(currentPassword, newPassword);
});

async function uploadProfilePicture(file) {
    if (!file) return;

    const formData = new FormData();
    formData.append('profile_picture', file);

    await updateProfile(formData);
}

async function updateProfile(formData) {
    showLoading(true);
    
    try {
        const response = await fetch('/api/users/me/profile/', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            loadUserData();
            showMessage('Profile updated successfully', 'success');
        } else {
            showMessage(data.error, 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    } finally {
        showLoading(false);
    }
}

async function changePassword(currentPassword, newPassword) {
    showLoading(true);
    
    try {
        const response = await fetch('/api/users/me/password/', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage(data.message, 'success');
            document.getElementById('passwordForm').reset();
            
            setTimeout(() => {
                logout();
            }, 2000);
        } else {
            showMessage(data.error, 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    } finally {
        showLoading(false);
    }
}

function openAccountTab(event, tabName) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    if (typeof showTab === 'function') {
        showTab(tabName);
        
        const url = new URL(window.location);
        url.searchParams.set('tab', tabName);
        window.history.pushState({}, '', url);
    }
    
    const mobileSidebar = document.getElementById('mobileSidebar');
    if (mobileSidebar && mobileSidebar.classList.contains('active')) {
        closeMobileMenu();
    }
}
let allModels = [];
let filteredModels = [];
let currentSearchTerm = '';
let currentSort = 'date_desc';

let currentPage = 1;
const MODELS_PER_PAGE = 10;
let isLoadingMore = false;

async function loadUserModels() {
    
    if (!window.modelsLoaded) {
        showLoading(true);
    }
    
    try {
        const response = await fetch('/api/users/me/models/detailed/', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            allModels = data.models || [];
            
            currentPage = 1;
            isLoadingMore = false;
            
            currentSearchTerm = '';
            currentSort = 'date_desc';
            
            document.getElementById('modelSearch').value = '';
            document.getElementById('modelSort').value = 'date_desc';
            document.getElementById('searchStats').style.display = 'none';
            document.getElementById('searchEmpty').style.display = 'none';
            
            filteredModels = [...allModels];
            applySorting();
            
            renderModels();
            updateSearchStats();
            
            setupInfiniteScroll();
            
            
            window.modelsLoaded = true;
        } else {
            showMessage(data.error, 'error');
        }
    } catch (error) {
        showMessage('Error loading models', 'error');
    } finally {
        if (!window.modelsLoaded) {
            showLoading(false);
        }
    }
}

function filterModels() {
    const searchTerm = document.getElementById('modelSearch').value.toLowerCase().trim();
    currentSearchTerm = searchTerm;
    
    currentPage = 1;
    
    if (searchTerm === '') {
        filteredModels = [...allModels];
    } else {
        filteredModels = allModels.filter(model => {
            const titleMatch = model.title.toLowerCase().includes(searchTerm);
            const descMatch = model.description ? 
                model.description.toLowerCase().includes(searchTerm) : false;
            const idMatch = model.file_id.toLowerCase().includes(searchTerm);
            const visibilityMatch = model.is_public ? 
                'public'.includes(searchTerm) : 'private'.includes(searchTerm);
            
            return titleMatch || descMatch || idMatch || visibilityMatch;
        });
    }
    
    applySorting();
    renderModels();
    updateSearchStats();
    highlightSearchResults(searchTerm);
}

function sortModels() {
    currentSort = document.getElementById('modelSort').value;
    
    currentPage = 1;
    
    applySorting();
    renderModels();
}

const style = document.createElement('style');
style.textContent = `
.loading-more-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 30px;
    color: #94a3b8;
    font-size: 14px;
    grid-column: 1 / -1;
    margin-top: 20px;
}

.loading-more-indicator .spinner.small {
    width: 30px;
    height: 30px;
    border: 3px solid rgba(102, 126, 234, 0.1);
    border-top: 3px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
`;
document.head.appendChild(style);

function applySorting() {
    if (!filteredModels || filteredModels.length === 0) return;
    
    filteredModels.sort((a, b) => {
        switch(currentSort) {
            case 'date_desc':
                return new Date(b.created_at) - new Date(a.created_at);
            
            case 'date_asc':
                return new Date(a.created_at) - new Date(b.created_at);
            
            case 'name_asc':
                return a.title.localeCompare(b.title);
            
            case 'name_desc':
                return b.title.localeCompare(a.title);
            
            case 'size_desc':
                return (b.stats?.file_size_mb || 0) - (a.stats?.file_size_mb || 0);
            
            case 'size_asc':
                return (a.stats?.file_size_mb || 0) - (b.stats?.file_size_mb || 0);
            
            case 'elements_desc':
                return (b.stats?.total_elements || 0) - (a.stats?.total_elements || 0);
            
            case 'elements_asc':
                return (a.stats?.total_elements || 0) - (b.stats?.total_elements || 0);
            
            case 'visibility':
                if (a.is_public === b.is_public) return 0;
                return a.is_public ? -1 : 1;
            
            default:
                return 0;
        }
    });
}

function setupInfiniteScroll() {
    window.removeEventListener('scroll', handleScroll);
    
    window.addEventListener('scroll', handleScroll);
}

function handleScroll() {
    if (isLoadingMore) return;
    
    const loadingIndicator = document.getElementById('loadingMoreIndicator');
    if (!loadingIndicator) return;
    
    const scrollPosition = window.innerHeight + window.scrollY;
    const pageHeight = document.documentElement.scrollHeight;
    const threshold = 100;
    
    if (scrollPosition >= pageHeight - threshold) {
        loadMoreModels();
    }
}

async function loadMoreModels() {
    if (isLoadingMore) return;
    
    const endIndex = currentPage * MODELS_PER_PAGE;
    if (endIndex >= filteredModels.length) return;
    
    isLoadingMore = true;
    
    const loadingIndicator = document.getElementById('loadingMoreIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex';
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    currentPage++;
    
    renderModels();
    
    isLoadingMore = false;
}

function renderModels() {
    const modelsGrid = document.getElementById('modelsGrid');
    const placeholder = document.getElementById('modelsPlaceholder');
    const searchEmpty = document.getElementById('searchEmpty');
    
    const startIndex = 0;
    const endIndex = currentPage * MODELS_PER_PAGE;
    const modelsToShow = filteredModels.slice(0, endIndex);
    
    if (filteredModels.length > 0) {
        placeholder.style.display = 'none';
        searchEmpty.style.display = 'none';
        modelsGrid.style.display = 'grid';
        
        modelsGrid.innerHTML = modelsToShow.map(model => {
            const thumbnailUrl = model.thumbnail 
                ? model.thumbnail 
                : `/api/models/${model.file_id}/thumbnail/image/`;
            
            const maxDescLength = 150;
            let description = model.description || 'No description added';
            description = description.replace(/\n/g, '<br>');
            let isDescriptionLong = description.length > 150 || description.includes('<br>');
            let shortDescription = description;
            
            return `
            <div class="model-card" data-file-id="${model.file_id}" id="model-card-${model.file_id}">
                <div class="model-preview-container" onclick="loadModelPreview('${model.file_id}')">
                    <div class="model-thumbnail">
                        <img src="${thumbnailUrl}" 
                             alt="${model.title}" 
                             onerror="this.onerror=null; this.src='/static/default-model-thumbnail.png';"
                             class="thumbnail-image"
                             loading="lazy">
                        <div class="thumbnail-overlay">
                            <div class="loading-spinner">
                                <div class="spinner"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="model-info">
                    <div class="model-header">
                        <div class="model-title" id="title-display-${model.file_id}">${model.title}</div>
                        <div class="model-title-edit" id="title-edit-${model.file_id}">
                            <input type="text" class="edit-title-input" value="${model.title}" maxlength="100">
                        </div>
                        <div class="model-date">${new Date(model.created_at).toLocaleDateString('ro-RO')}</div>
                    </div>
                    
                    <div class="description-wrapper">
                        <div class="model-description multiline-text" id="desc-display-${model.file_id}">
                            ${shortDescription}
                        </div>
                        ${isDescriptionLong ? `
                        <div class="button-expand-container">
                            <button class="expand-btn" onclick="toggleDescription('${model.file_id}')" id="desc-toggle-${model.file_id}">
                                <i class="fas fa-chevron-down"></i>
                            </button>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="model-description-edit" id="desc-edit-${model.file_id}">
                        <textarea class="edit-desc-input" maxlength="1000">${model.description || ''}</textarea>
                    </div>
                    
                    <div class="model-stats">
                        <span class="model-stat">${model.stats.total_elements || 0} elem</span>
                        <span class="model-stat">${model.stats.file_size_mb || 0} MB</span>
                        <span class="model-stat ${model.is_public ? 'public' : 'private'}">
                            ${model.is_public ? 'Public' : 'Private'}
                        </span>
                        ${model.is_public ? `
                            <span class="model-stat views">
                                <i class="fas fa-eye" style="margin-right: 4px; font-size: 10px;"></i>
                                ${model.views || 0} 
                            </span>
                        ` : ''}
                    </div>
                    
                    <div class="model-actions">
                        <button class="btn btn-primary btn-small"style="width:100%;" onclick="event.stopPropagation(); viewModel('${model.file_id}')" title="View model">
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;justify-content: center;">
                                <i class="fas fa-eye" ></i>
                            </div>
                        </button>
                        
                        <button class="btn btn-warning btn-small"style="width:100%;" onclick="event.stopPropagation(); startEditModel('${model.file_id}')" id="edit-btn-${model.file_id}" title="Edit model">
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                                <i class="fas fa-edit" style="font-size: 14px;"></i>
                            </div>
                        </button>
                        
                        <button class="btn btn-success btn-small" onclick="event.stopPropagation(); saveEditModel('${model.file_id}')" id="save-btn-${model.file_id}" style="display:none" title="Save changes">
                            <div>
                                <i class="fas fa-save" style="font-size: 14px;"></i>
                            </div>
                        </button>
                        
                        <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); cancelEditModel('${model.file_id}')" id="cancel-btn-${model.file_id}" style="display:none" title="Cancel editing">
                            <div>
                                <i class="fas fa-times" style="font-size: 14px;"></i>
                            </div>
                        </button>
                        
                        <div class="visibility-toggle-container">
                            <label class="switch">
                                <input type="checkbox" 
                                       id="visibility-switch-${model.file_id}" 
                                       ${model.is_public ? 'checked' : ''}
                                       onchange="toggleModelVisibility('${model.file_id}')">
                                <span class="slider round"></span>
                            </label>
                            <div class="visibility-status ${model.is_public ? 'public' : 'private'}" 
                                 id="visibility-status-${model.file_id}">
                                ${model.is_public ? 'Public' : 'Private'}
                            </div>
                        </div>
                        
                        <button class="btn btn-info btn-small"style="width:100%;" onclick="event.stopPropagation(); downloadModelArchive('${model.file_id}')" title="Download complete archive">
                            <div>
                                <i class="fas fa-download" style="font-size: 14px;"></i>
                            </div>
                        </button>
                        
                        <button class="btn btn-danger btn-small"style="width:100%;" onclick="event.stopPropagation(); deleteModel('${model.file_id}')" title="Delete model">
                            <div>
                                <i class="fas fa-trash" style="font-size: 14px;"></i>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');
        
        const hasMoreModels = endIndex < filteredModels.length;
        const loadingIndicator = document.getElementById('loadingMoreIndicator');
        
        if (hasMoreModels) {
            if (!loadingIndicator) {
                const indicator = document.createElement('div');
                indicator.id = 'loadingMoreIndicator';
                indicator.className = 'loading-more-indicator';
                indicator.innerHTML = `
                    <div class="spinner small"></div>
                    <span>Loading more models...</span>
                `;
                indicator.style.display = 'none';
                modelsGrid.parentNode.insertBefore(indicator, modelsGrid.nextSibling);
            }
        } else if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
    } else {
        modelsGrid.style.display = 'none';
        
        if (currentSearchTerm) {
            placeholder.style.display = 'none';
            searchEmpty.style.display = 'block';
        } else {
            placeholder.style.display = 'block';
            searchEmpty.style.display = 'none';
        }
    }
    
    setTimeout(initTooltips, 100);
}

function updateSearchStats() {
    const searchStats = document.getElementById('searchStats');
    const resultsCount = document.getElementById('resultsCount');
    
    if (currentSearchTerm) {
        searchStats.style.display = 'flex';
        resultsCount.textContent = filteredModels.length;
    } else {
        searchStats.style.display = 'none';
    }
}

function highlightSearchResults(searchTerm) {
    if (!searchTerm) {
        document.querySelectorAll('.model-card.search-highlight').forEach(card => {
            card.classList.remove('search-highlight');
        });
        return;
    }
    
    filteredModels.forEach(model => {
        const card = document.getElementById(`model-card-${model.file_id}`);
        if (card) {
            if (model.title.toLowerCase().includes(searchTerm) ||
                (model.description && model.description.toLowerCase().includes(searchTerm))) {
                card.classList.add('search-highlight');
            } else {
                card.classList.remove('search-highlight');
            }
        }
    });
}

function clearSearch() {
    document.getElementById('modelSearch').value = '';
    document.getElementById('modelSort').value = 'date_desc';
    currentSearchTerm = '';
    currentSort = 'date_desc';
    
    currentPage = 1;
    
    filteredModels = [...allModels];
    applySorting();
    renderModels();
    updateSearchStats();
    
    document.getElementById('searchStats').style.display = 'none';
    document.getElementById('searchEmpty').style.display = 'none';
    document.getElementById('modelSearch').focus();
}

let searchTimeout;
function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterModels, 300);
}

function toggleDescription(fileId) {
    const descElement = document.getElementById(`desc-display-${fileId}`);
    const toggleBtn = document.getElementById(`desc-toggle-${fileId}`);
    
    if (!descElement || !toggleBtn) return;
    
    const currentText = descElement.innerHTML;
    const isExpanded = descElement.classList.contains('expanded');
    
    if (isExpanded) {
        descElement.classList.remove('expanded');
        toggleBtn.classList.remove('expanded');
        
        const fullText = descElement.getAttribute('data-full') || currentText;
        const shortText = fullText.length > 150 ? fullText.substring(0, 150) + '...' : fullText;
        const shortTextWithBreaks = shortText.replace(/\n/g, '<br>');
        
        descElement.innerHTML = shortTextWithBreaks;
        toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    } else {
        descElement.classList.add('expanded');
        toggleBtn.classList.add('expanded');
        
        const fullText = descElement.getAttribute('data-full') || currentText;
        descElement.setAttribute('data-full', fullText);
        
        const fullTextWithBreaks = fullText.replace(/\n/g, '<br>');
        descElement.innerHTML = fullTextWithBreaks;
        toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    }
}

document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('statsDropdown');
    const btn = document.getElementById('statsDropdownBtn');
    
    if (dropdown && btn && !dropdown.contains(event.target) && !btn.contains(event.target)) {
        dropdown.classList.remove('show');
        btn.classList.remove('expanded');
    }
});

function editModelInline(fileId) {
    event.stopPropagation();
    
    document.querySelectorAll('.edit-form').forEach(form => {
        form.style.display = 'none';
    });
    
    const editForm = document.getElementById(`edit-form-${fileId}`);
    if (editForm) {
        editForm.style.display = 'block';
        
        const titleInput = document.getElementById(`edit-title-${fileId}`);
        if (titleInput) {
            titleInput.focus();
        }
    }
}

function cancelModelEdit(fileId) {
    event.stopPropagation();
    
    const editForm = document.getElementById(`edit-form-${fileId}`);
    if (editForm) {
        editForm.style.display = 'none';
    }
}

async function loadUserStats() {
    try {
        const response = await fetch('/api/users/me/stats/', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            const stats = data.stats;
            
            document.getElementById('totalModels').textContent = stats.total_models || 0;
            document.getElementById('publicModels').textContent = stats.public_models || 0;
            document.getElementById('privateModels').textContent = stats.private_models || 0;
            document.getElementById('storageUsed').textContent = parseFloat(stats.storage_used).toFixed(0) + " MB" || "0 MB";
            document.getElementById('modelsThisMonth').textContent = stats.models_this_month || 0;
            
            document.getElementById('totalElements').textContent = stats.total_elements || 0;
            document.getElementById('totalBuildings').textContent = stats.total_buildings || 0;
            document.getElementById('totalHighways').textContent = stats.total_highways || 0;
            document.getElementById('totalWater').textContent = stats.total_water || 0;
            document.getElementById('totalNatural').textContent = stats.total_natural || 0;
            document.getElementById('totalLanduse').textContent = stats.total_landuse || 0;
            document.getElementById('totalOther').textContent = stats.total_other || 0;
            
        } else {
            console.error('Error loading statistics:', data.error);
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}
async function loadModelPreview(fileId) {
    const container = event.currentTarget;
    const spinner = container.querySelector('.loading-spinner');
    
    spinner.style.display = 'block';
    
    try {
        const response = await fetch(`/api/models/${fileId}//camera/`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        
        const data = await response.json();
        
        let targetUrl;
        if (data.success) {
            targetUrl = `/view-3d/${fileId}/?camera=${encodeURIComponent(JSON.stringify(data.camera_position))}`;
        } else {
            targetUrl = `/view-3d/${fileId}/`;
        }
        window.location.href = targetUrl;
        
    } catch (error) {
        console.error('Error loading camera position:', error);
        window.location.href = `/view-3d/${fileId}/`;
    } finally {
        spinner.style.display = 'none';
    }
}

function preloadThumbnails() {
    const thumbnailImages = document.querySelectorAll('.thumbnail-image');
    thumbnailImages.forEach(img => {
        const originalSrc = img.src;
        const tempImage = new Image();
        tempImage.onload = function() {
            img.src = originalSrc;
        };
        tempImage.src = originalSrc;
    });
}

setTimeout(preloadThumbnails, 100);

async function deleteAccount() {
    const password = document.getElementById('confirmDelete').value;
    
    if (!password) {
        showMessage('Enter password to confirm account deletion', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete your account? This action is permanent and irreversible!')) {
        return;
    }

    showLoading(true);
    
    try {
        showMessage('Account deletion functionality will be available in the next version', 'error');
    } catch (error) {
        showMessage('Connection error', 'error');
    } finally {
        showLoading(false);
    }
}

function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    window.location.href = '/auth/';
}

function showMessage(message, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = show ? 'block' : 'none';
    }
}

checkAuth();

function downloadGLBModel(fileId) {
    window.open(`/api/models/export/${fileId}/glb/`, '_blank');
}

function downloadModel(fileId) {
    window.open(`/api/models/${fileId}/`, '_blank');
}

function downloadModelArchive(fileId) {
    if (window.event) window.event.stopPropagation();
    
    const token = localStorage.getItem('auth_token');
    
    fetch(`/api/models/${fileId}/archive/`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errorData => {
                throw new Error(errorData.error || 'Download error');
            });
        }
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${fileId}_model.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Download error: ' + error.message);
    });
}

async function editModel(fileId) {
    event.stopPropagation();
    
    try {
        const response = await fetch(`/api/models/${fileId}/stats/`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const model = data.stats;
            
            const newTitle = prompt('Edit model name:', model.title);
            if (newTitle !== null && newTitle.trim() !== '') {
                const newDescription = prompt('Edit description (optional):', model.description || '');
                
                await updateModelDetails(fileId, newTitle.trim(), newDescription || '');
            }
        }
    } catch (error) {
        console.error('Edit error:', error);
        showMessage('Error loading model data', 'error');
    }
}

async function updateModelDetails(fileId, title, description) {
    showLoading(true);
    
    try {
        const response = await fetch(`/api/models/${fileId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
                title: title,
                description: description
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Model updated successfully!', 'success');
            loadUserModels();
            loadUserStats();
        } else {
            showMessage(data.error || 'Update error', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    } finally {
        showLoading(false);
    }
}
async function toggleModelPublic(fileId, event) {
    event.preventDefault();
    
    const toggleButton = event.currentTarget;
    const isPublic = toggleButton.classList.contains('public');
    const newState = !isPublic;
    
    const initialState = {
        isPublic: isPublic,
        button: toggleButton.outerHTML
    };
    toggleButton.classList.add('processing');
    toggleButton.disabled = true;
    
    try {
        const response = await fetch(`/api/models/${fileId}/toggle-public/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
                is_public: newState
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (newState) {
                toggleButton.classList.add('public');
                toggleButton.classList.remove('private');
                toggleButton.innerHTML = `
                    <span class="toggle-text">Public</span>
                `;
                toggleButton.setAttribute('title', 'Model public - Click to make private');
            } else {
                toggleButton.classList.add('private');
                toggleButton.classList.remove('public');
                toggleButton.innerHTML = `
                    <span class="toggle-text">Private</span>
                `;
                toggleButton.setAttribute('title', 'Model privat - Click to make public');
            }
            
            toggleButton.classList.add('success');
            setTimeout(() => {
                toggleButton.classList.remove('success');
            }, 1000);
            
        } else {
            throw new Error(data.message || 'Failed to update');
        }
        
    } catch (error) {
        console.error('Error toggling public status:', error);

        if (initialState.isPublic) {
            toggleButton.classList.add('public');
            toggleButton.classList.remove('private');
        } else {
            toggleButton.classList.add('private');
            toggleButton.classList.remove('public');
        }
        toggleButton.classList.add('error');
        setTimeout(() => {
            toggleButton.classList.remove('error');
        }, 1000);
        alert('Failed to update privacy settings. Please try again.');
        
    } finally {
        toggleButton.classList.remove('processing');
        toggleButton.disabled = false;
    }
}
async function togglePublicSwitch(fileId, event) {
    const switchElement = event.currentTarget;
    const isChecked = switchElement.checked;
    const initialState = isChecked;
    
    try {
        const response = await fetch(`/api/models/${fileId}/toggle-public/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
                is_public: isChecked
            })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            switchElement.checked = !isChecked;
            throw new Error(data.message || 'Failed to update');
        }
        switchElement.parentElement.classList.add('success');
        setTimeout(() => {
            switchElement.parentElement.classList.remove('success');
        }, 1000);
        
    } catch (error) {
        console.error('Error toggling public status:', error);
        switchElement.parentElement.classList.add('error');
        setTimeout(() => {
            switchElement.parentElement.classList.remove('error');
        }, 1000);
    }
}
async function toggleModelVisibility(fileId) {
    event.stopPropagation();
    
    const switchElement = document.getElementById(`visibility-switch-${fileId}`);
    const statusElement = document.getElementById(`visibility-status-${fileId}`);
    
    if (!switchElement || !statusElement) {
        console.error('Visibility elements not found for fileId:', fileId);
        return;
    }
    
    animateToggleSwitch(`visibility-switch-${fileId}`);
    
    const willBePublic = switchElement.checked;
    
    if (!confirm(`Are you sure you want to make the model ${willBePublic ? 'public' : 'private'}?`)) {
        switchElement.checked = !willBePublic;
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/models/${fileId}/visibility/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const isPublic = data.is_public;
            
            switchElement.checked = isPublic;
            
            statusElement.style.opacity = '0.5';
            setTimeout(() => {
                statusElement.textContent = isPublic ? 'Public' : 'Private';
                statusElement.className = `visibility-status ${isPublic ? 'public' : 'private'}`;
                statusElement.style.opacity = '1';
            }, 200);
            
            showMessage(`Model is now ${isPublic ? 'public' : 'private'}!`, 'success');
            
            const modelCard = document.querySelector(`#model-card-${fileId}`);
            if (modelCard) {
                const publicBadge = modelCard.querySelector('.model-stat.public, .model-stat.private');
                if (publicBadge) {
                    publicBadge.style.opacity = '0.5';
                    setTimeout(() => {
                        publicBadge.textContent = isPublic ? 'Public' : 'Private';
                        publicBadge.className = `model-stat ${isPublic ? 'public' : 'private'}`;
                        publicBadge.style.opacity = '1';
                    }, 200);
                }
                
                const viewsBadge = modelCard.querySelector('.model-stat.views');
                if (viewsBadge) {
                    if (isPublic) {
                        viewsBadge.style.display = 'inline-block';
                        viewsBadge.textContent = `${data.public_view_count || 0} views`;
                    } else {
                        viewsBadge.style.display = 'none';
                    }
                }
            }
            
            setTimeout(() => loadUserStats(), 300);
        } else {
            showMessage(data.error || 'Error changing visibility', 'error');
            switchElement.checked = !willBePublic;
        }
    } catch (error) {
        console.error('Toggle visibility error:', error);
        showMessage('Connection error', 'error');
        switchElement.checked = !willBePublic;
    } finally {
        showLoading(false);
    }
}

function animateToggleSwitch(switchId) {
    const switchElement = document.getElementById(switchId);
    const slider = switchElement.nextElementSibling;
    
    if (switchElement.checked) {
        slider.style.transform = 'scale(1.05)';
        setTimeout(() => {
            slider.style.transform = 'scale(1)';
        }, 200);
    }
}

async function deleteModel(fileId) {
    if (window.event) window.event.stopPropagation();
    
    if (!confirm('WARNING! The model will be permanently deleted.')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/models/${fileId}/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Model deleted successfully!', 'success');
            loadUserModels();
            loadUserStats();
        } else {
            showMessage(data.error || 'Deletion error', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    } finally {
        showLoading(false);
    }
}

async function saveModelEdit(fileId) {
    event.stopPropagation();
    
    const titleInput = document.getElementById(`edit-title-${fileId}`);
    const descInput = document.getElementById(`edit-desc-${fileId}`);
    
    if (!titleInput || !descInput) {
        showMessage('Error finding edit fields', 'error');
        return;
    }
    
    const newTitle = titleInput.value.trim();
    const newDescription = descInput.value.trim();
    
    if (!newTitle) {
        showMessage('Title cannot be empty!', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/models/${fileId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
                title: newTitle,
                description: newDescription
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Model updated successfully!', 'success');
            
            const titleElement = document.getElementById(`title-${fileId}`);
            const descElement = document.getElementById(`desc-${fileId}`);
            
            if (titleElement) {
                titleElement.textContent = newTitle;
            }
            
            if (descElement) {
                descElement.textContent = newDescription || 'No description added';
            }
            
            cancelModelEdit(fileId);
            
            loadUserStats();
        } else {
            showMessage(data.error || 'Update error', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    } finally {
        showLoading(false);
    }
}

function startEditModel(fileId) {
    const expandContainer = document.querySelector(`#model-card-${fileId} .button-expand-container`);
    if (expandContainer) {
        expandContainer.style.display = 'none';
    }
    
    document.getElementById(`title-display-${fileId}`).style.display = 'none';
    document.getElementById(`title-edit-${fileId}`).style.display = 'block';
    document.getElementById(`desc-display-${fileId}`).style.display = 'none';
    document.getElementById(`desc-edit-${fileId}`).style.display = 'block';
    
    document.getElementById(`edit-btn-${fileId}`).style.display = 'none';
    document.getElementById(`save-btn-${fileId}`).style.display = 'inline-block';
    document.getElementById(`cancel-btn-${fileId}`).style.display = 'inline-block';
    
    document.querySelector(`#title-edit-${fileId} .edit-title-input`).focus();
}

function cancelEditModel(fileId) {
    const expandContainer = document.querySelector(`#model-card-${fileId} .button-expand-container`);
    if (expandContainer) {
        expandContainer.style.display = 'flex';
    }
    
    document.getElementById(`title-display-${fileId}`).style.display = 'block';
    document.getElementById(`title-edit-${fileId}`).style.display = 'none';
    document.getElementById(`desc-display-${fileId}`).style.display = 'block';
    document.getElementById(`desc-edit-${fileId}`).style.display = 'none';

    document.getElementById(`edit-btn-${fileId}`).style.display = 'inline-block';
    document.getElementById(`save-btn-${fileId}`).style.display = 'none';
    document.getElementById(`cancel-btn-${fileId}`).style.display = 'none';
}

async function saveEditModel(fileId) {
    if (window.event) window.event.stopPropagation();
    
    const titleInput = document.querySelector(`#title-edit-${fileId} .edit-title-input`);
    const descInput = document.querySelector(`#desc-edit-${fileId} .edit-desc-input`);
    
    const newTitle = titleInput.value.trim();
    let newDescription = descInput.value.trim();
    
    if (!newTitle) {
        showMessage('Title cannot be empty!', 'error');
        titleInput.focus();
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/models/${fileId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
                title: newTitle,
                description: newDescription
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success) {
            showMessage('Model updated successfully! ✓', 'success');
            
            document.getElementById(`title-display-${fileId}`).textContent = newTitle;
            
            const descWrapper = document.querySelector(`#model-card-${fileId} .description-wrapper`);
            const descDisplayElement = document.getElementById(`desc-display-${fileId}`);
            
            const fullDescription = newDescription || 'No description added';
            
            const isDescriptionLong = fullDescription.length > 150 || fullDescription.includes('\n');
            
            descDisplayElement.setAttribute('data-full', fullDescription);
            
            let displayText;
            if (isDescriptionLong && fullDescription.length > 150) {
                displayText = fullDescription.substring(0, 150) + '...';
            } else {
                displayText = fullDescription;
            }
            
            const displayTextWithBreaks = displayText.replace(/\n/g, '<br>');
            descDisplayElement.innerHTML = displayTextWithBreaks;
            
            descDisplayElement.classList.remove('expanded');
            descDisplayElement.classList.add('multiline-text');
            
            let expandContainer = descWrapper.querySelector('.button-expand-container');
            
            if (isDescriptionLong) {
                if (!expandContainer) {
                    expandContainer = document.createElement('div');
                    expandContainer.className = 'button-expand-container';
                    descWrapper.appendChild(expandContainer);
                }
                
                expandContainer.style.display = 'flex';
                let toggleBtn = document.getElementById(`desc-toggle-${fileId}`);
                if (!toggleBtn) {
                    toggleBtn = document.createElement('button');
                    toggleBtn.className = 'expand-btn';
                    toggleBtn.id = `desc-toggle-${fileId}`;
                    toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                    toggleBtn.onclick = function(event) {
                        event.stopPropagation();
                        toggleDescription(fileId);
                    };
                    
                    expandContainer.appendChild(toggleBtn);
                } else {
                    toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                    toggleBtn.classList.remove('expanded');
                    toggleBtn.style.display = 'block';
                }
            } else {
                if (expandContainer) {
                    expandContainer.style.display = 'none';
                }
            }
            
            cancelEditModel(fileId);
            loadUserStats();
        } else {
            showMessage(data.error || 'Update error', 'error');
        }
    } catch (error) {
        console.error('Detailed error:', error);
        showMessage('Save error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function initTooltips() {
    const tooltipElements = document.querySelectorAll('[title]');
    tooltipElements.forEach(el => {
        el.addEventListener('mouseenter', function(e) {
            const title = this.getAttribute('title');
            if (title) {
                const tooltip = document.createElement('div');
                tooltip.className = 'tooltip';
                tooltip.textContent = title;
                tooltip.style.position = 'absolute';
                tooltip.style.background = 'rgba(0,0,0,0.8)';
                tooltip.style.color = 'white';
                tooltip.style.padding = '5px 10px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.fontSize = '12px';
                tooltip.style.zIndex = '1000';
                tooltip.style.pointerEvents = 'none';
                
                document.body.appendChild(tooltip);
                
                const rect = this.getBoundingClientRect();
                tooltip.style.left = (rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2)) + 'px';
                tooltip.style.top = (rect.top - tooltip.offsetHeight - 5) + 'px';
                
                this.setAttribute('data-tooltip', title);
                this.removeAttribute('title');
                this.tooltipElement = tooltip;
            }
        });
        
        el.addEventListener('mouseleave', function(e) {
            if (this.tooltipElement) {
                document.body.removeChild(this.tooltipElement);
                this.setAttribute('title', this.getAttribute('data-tooltip'));
                this.removeAttribute('data-tooltip');
                this.tooltipElement = null;
            }
        });
    });
}

function openMobileMenu() {
    const mobileSidebar = document.getElementById('mobileSidebar');
    mobileSidebar.classList.add('active');

    setTimeout(() => {
        document.addEventListener('click', closeMobileMenuOnClickOutside);
    }, 10);
}

function closeMobileMenu() {
    const mobileSidebar = document.getElementById('mobileSidebar');
    mobileSidebar.classList.remove('active');
    document.removeEventListener('click', closeMobileMenuOnClickOutside);
}

function closeMobileMenuOnClickOutside(event) {
    const mobileSidebar = document.getElementById('mobileSidebar');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (!mobileSidebar.contains(event.target) && !mobileMenuBtn.contains(event.target)) {
        closeMobileMenu();
    }
}

function getTabName(tabKey) {
    const tabNames = {
        'models': 'My Models',
        'favorites': 'Favorites', 
        'settings': 'Account Settings',
        'delete': 'Delete Account'
    };
    return tabNames[tabKey] || tabKey;
}

document.addEventListener('DOMContentLoaded', function() {
    initTooltips();
});

function reloadTooltips() {
    setTimeout(initTooltips, 100);
}

function toggleStatsPanel() {
    const statsPanel = document.getElementById('statsPanel');
    const toggleBtn = document.getElementById('statsToggleBtn');
    
    if (statsPanel.classList.contains('active')) {
        statsPanel.classList.remove('active');
        toggleBtn.innerHTML = '<i class="fas fa-chart-bar"></i>';
        toggleBtn.title = 'Show statistics';
    } else {
        statsPanel.classList.add('active');
        toggleBtn.innerHTML = '<i class="fas fa-times"></i>';
        toggleBtn.title = 'Hide statistics';
    }
}

function setupResponsiveStats() {
    const statsPanel = document.querySelector('.stats-panel');
    const modelsContainer = document.querySelector('.models-container');
    
    if (!statsPanel || !modelsContainer) return;

    statsPanel.id = 'statsPanel';

    let statsToggleBtn = document.getElementById('statsToggleBtn');
    if (!statsToggleBtn) {
        statsToggleBtn = document.createElement('button');
        statsToggleBtn.id = 'statsToggleBtn';
        statsToggleBtn.className = 'btn btn-secondary btn-small stats-toggle-btn';
        statsToggleBtn.innerHTML = '<i class="fas fa-chart-bar"></i>';
        statsToggleBtn.title = 'Show statistics';
        statsToggleBtn.onclick = function(event) {
            event.stopPropagation();
            toggleStatsPanel();
        };

        const modelsControls = document.querySelector('.models-controls');
        if (modelsControls) {
            modelsControls.appendChild(statsToggleBtn);
        }
    }
    
    if (window.innerWidth <= 1026) {
        if (statsPanel.parentNode !== document.body) {
            document.body.appendChild(statsPanel);
        }
        statsPanel.classList.add('mobile-stats-sidebar');
        statsPanel.style.display = 'none';
        statsPanel.style.position = 'fixed';
        statsPanel.style.top = '0';
        statsPanel.style.right = '-400px';
        statsPanel.style.width = '350px';
        statsPanel.style.height = '100vh';
        statsPanel.style.zIndex = '1002';
        statsPanel.style.overflowY = 'auto';
        statsPanel.style.transition = 'right 0.3s ease-in-out';
        statsPanel.style.borderRadius = '0';
        statsPanel.style.margin = '0';
        statsPanel.style.padding = '25px';
        statsToggleBtn.style.display = 'inline-flex';
        
    } else {
        if (statsPanel.parentNode !== modelsContainer) {
            if (modelsContainer.children.length > 1) {
                modelsContainer.insertBefore(statsPanel, modelsContainer.children[1]);
            } else {
                modelsContainer.appendChild(statsPanel);
            }
        }
        statsPanel.classList.remove('mobile-stats-sidebar');
        statsPanel.classList.remove('active');
        statsPanel.style.display = 'block';
        statsPanel.style.position = 'static';
        statsPanel.style.right = 'auto';
        statsPanel.style.top = 'auto';
        statsPanel.style.width = 'auto';
        statsPanel.style.height = 'auto';
        statsPanel.style.zIndex = 'auto';
        statsPanel.style.overflowY = 'visible';
        statsPanel.style.transition = 'none';
        statsPanel.style.borderRadius = '16px';
        statsPanel.style.margin = '0';
        statsPanel.style.padding = '20px';
        statsToggleBtn.style.display = 'none';
        const overlay = document.querySelector('.mobile-stats-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initializePage();
    initTooltips();
    setTimeout(function() {
        setupResponsiveStats();
        window.addEventListener('resize', setupResponsiveStats);
    }, 500);
});



const oldStyle = document.querySelector('style[data-stats-styles]');
if (oldStyle) {
    oldStyle.remove();
}

const styleSheet = document.createElement('style');
styleSheet.setAttribute('data-stats-styles', 'true');
document.head.appendChild(styleSheet);

function toggleStatsPanel() {
    const statsPanel = document.getElementById('statsPanel');
    const toggleBtn = document.getElementById('statsToggleBtn');
    
    if (!statsPanel || window.innerWidth > 1026) return;
    
    let overlay = document.querySelector('.mobile-stats-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'mobile-stats-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0, 0, 0, 0.5)';
        overlay.style.zIndex = '1001';
        overlay.style.display = 'none';
        overlay.style.backdropFilter = 'blur(3px)';
        
        overlay.onclick = function() {
            toggleStatsPanel();
        };
        
        document.body.appendChild(overlay);
    }
    
    if (statsPanel.classList.contains('active')) {
        statsPanel.classList.remove('active');
        statsPanel.style.right = '-400px';
        
        if (overlay) {
            overlay.style.display = 'none';
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-chart-bar"></i>';
            toggleBtn.title = 'Show statistics';
        }
    } else {
        statsPanel.classList.add('active');
        statsPanel.style.display = 'block';
        statsPanel.style.right = '0';
        
        if (overlay) {
            overlay.style.display = 'block';
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-times"></i>';
            toggleBtn.title = 'Hide statistics';
        }
    }
}
function setupInfiniteScroll() {
    window.removeEventListener('scroll', handleScroll);
    window.addEventListener('scroll', handleScroll);
    
    window.addEventListener('scroll', function() {
        const statsPanel = document.getElementById('statsPanel');
        const overlay = document.querySelector('.mobile-stats-panel-overlay');
        
        if (statsPanel && statsPanel.classList.contains('active')) {
            toggleStatsPanel();
        }
    });
}

async function loadUserModels() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/users/me/models/detailed/', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            allModels = data.models || [];
            currentPage = 1;
            isLoadingMore = false;
            currentSearchTerm = '';
            currentSort = 'date_desc';
            
            document.getElementById('modelSearch').value = '';
            document.getElementById('modelSort').value = 'date_desc';
            document.getElementById('searchStats').style.display = 'none';
            document.getElementById('searchEmpty').style.display = 'none';
            
            filteredModels = [...allModels];
            applySorting();
            renderModels();
            updateSearchStats();
            setupInfiniteScroll();
            setTimeout(setupResponsiveStats, 100);
        } else {
            showMessage(data.error, 'error');
        }
    } catch (error) {
        showMessage('Error loading models', 'error');
    } finally {
        showLoading(false);
    }
}

window.addEventListener('resize', setupResponsiveStats);

document.addEventListener('DOMContentLoaded', function() {
    initializePage();
    initTooltips();
    setTimeout(setupResponsiveStats, 500);
});

let allFavoriteModels = [];
let filteredFavoriteModels = [];
let currentFavoriteSearchTerm = '';
let currentFavoriteSort = 'date_desc';
let currentFavoritePage = 1;

async function loadFavoriteModels() {
    
    if (!window.favoritesLoaded) {
        showLoading(true);
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch('/api/users/me/favorites/', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (data.success) {
            allFavoriteModels = data.favorites || [];
            currentFavoritePage = 1;
            currentFavoriteSearchTerm = '';
            currentFavoriteSort = 'date_desc';
            document.getElementById('favoriteSearch').value = '';
            document.getElementById('favoriteSort').value = 'date_desc';
            document.getElementById('favoriteSearchStats').style.display = 'none';
            document.getElementById('favoriteSearchEmpty').style.display = 'none';
            filteredFavoriteModels = [...allFavoriteModels];
            applyFavoriteSorting();
            
            renderFavoriteModels();
            
            
            window.favoritesLoaded = true;
        } else {
            showMessage(data.error, 'error');
        }
    } catch (error) {
        console.error('Error loading favorite models:', error);
        showMessage('Connection error', 'error');
    } finally {
        if (!window.favoritesLoaded) {
            showLoading(false);
        }
    }
}

function refreshTabData(tabName) {
    switch(tabName) {
        case 'models':
            window.modelsLoaded = false;
            loadUserModels();
            break;
        case 'favorites':
            window.favoritesLoaded = false;
            loadFavoriteModels();
            break;
    }
}
function renderFavoriteModels() {
    const favoritesGrid = document.getElementById('favoritesGrid');
    const placeholder = document.getElementById('favoritesPlaceholder');
    const searchEmpty = document.getElementById('favoriteSearchEmpty');
    
    if (filteredFavoriteModels.length > 0) {
        placeholder.style.display = 'none';
        searchEmpty.style.display = 'none';
        favoritesGrid.style.display = 'grid';
        
        favoritesGrid.innerHTML = filteredFavoriteModels.map(model => {
            const thumbnailUrl = model.thumbnail 
                ? model.thumbnail 
                : `/api/models/${model.file_id}/thumbnail/image/`;
            
            const timeAgo = getTimeAgo(new Date(model.created_at));
            
            const viewCount = model.public_view_count || model.views || 0;
            
            const isOwnedByCurrentUser = model.is_owner || false;
            
            const isFavorited = !isOwnedByCurrentUser && (model.is_favorited || false);
            const heartIconClass = isFavorited ? 'fas' : 'far';
            const heartIconStyle = isFavorited ? 'color: #dc3545;' : '';
            
            return `
            <div class="model-card" data-file-id="${model.file_id}">
                <div class="model-thumbnail" onclick="viewFavoriteModel('${model.file_id}', ${JSON.stringify(model).replace(/"/g, '&quot;')})">
                    <img src="${thumbnailUrl}" 
                         alt="${model.title}" 
                         class="thumbnail-image"
                         loading="lazy"
                         onerror="this.onerror=null; this.src='/static/default-model-thumbnail.png'">
                    <div class="thumbnail-overlay">
                        <div class="model-badges">
                            <div class="badge elements">
                                <i class="fas fa-cube"></i> ${model.stats?.total_elements || 0}
                            </div>
                            <div class="badge views">
                                <i class="fas fa-eye"></i> ${viewCount}
                            </div>
                        </div>
                    </div>
                    <button class="thumbnail-favorite-btn" onclick="removeFromFavorites('${model.file_id}', this, event)" title="Remove from favorites">
                        <i class="${heartIconClass} fa-heart" style="${heartIconStyle}"></i>
                    </button>
                </div>
                
                <div class="model-info">
                    <div class="model-header">
                        <h3 class="model-title" onclick="viewFavoriteModel('${model.file_id}', ${JSON.stringify(model).replace(/"/g, '&quot;')})">${model.title}</h3>
                        <div class="model-author">
                            <div class="model-author-left">
                                <img src="${model.owner?.profile_picture || 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'}" 
                                     alt="${model.owner?.username || 'Anonymous'}" 
                                     class="author-avatar"
                                     onerror="this.onerror=null; this.src='https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'">
                                <span>${model.owner?.username || 'Anonymous'}</span>
                            </div>
                            <div class="model-author-right">
                                <span>•</span>
                                <span>${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                    
                    <p class="model-description">${model.description || 'No description added'}</p>
                    
                    <div class="model-actions">
                        <button class="action-btn view" onclick="viewFavoriteModel('${model.file_id}', ${JSON.stringify(model).replace(/"/g, '&quot;')})">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="action-btn download" onclick="downloadModelArchive('${model.file_id}')">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    } else {
        favoritesGrid.style.display = 'none';
        
        if (currentFavoriteSearchTerm) {
            placeholder.style.display = 'none';
            searchEmpty.style.display = 'block';
        } else {
            placeholder.style.display = 'block';
            searchEmpty.style.display = 'none';
        }
    }
}

function viewFavoriteModel(fileId, modelData) {
    if (typeof viewModel === 'function') {
        viewModel(fileId, modelData);
    } else {
        window.open(`/view-3d/${fileId}/`, '_blank');
    }
}

async function removeFromFavorites(fileId, button) {
    if (window.event) window.event.stopPropagation();
    
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    
    try {
        const response = await fetch(`/api/models/${fileId}/favorites/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Model removed from favorites', 'success');
            
            allFavoriteModels = allFavoriteModels.filter(model => model.file_id !== fileId);
            filteredFavoriteModels = filteredFavoriteModels.filter(model => model.file_id !== fileId);
            
            renderFavoriteModels();
            
            if (typeof updateFavoriteCount === 'function') {
                updateFavoriteCount(fileId, data.favorites_count);
            }
        } else {
            showMessage(data.error || 'Error removing from favorites', 'error');
        }
    } catch (error) {
        console.error('Error in removeFromFavorites:', error);
        showMessage('Connection error', 'error');
    }
}

function filterFavoriteModels() {
    const searchTerm = document.getElementById('favoriteSearch').value.toLowerCase().trim();
    currentFavoriteSearchTerm = searchTerm;
    
    if (searchTerm === '') {
        filteredFavoriteModels = [...allFavoriteModels];
    } else {
        filteredFavoriteModels = allFavoriteModels.filter(model => {
            const titleMatch = model.title.toLowerCase().includes(searchTerm);
            const descMatch = model.description ? 
                model.description.toLowerCase().includes(searchTerm) : false;
            const authorMatch = model.owner?.username?.toLowerCase().includes(searchTerm) || false;
            
            return titleMatch || descMatch || authorMatch;
        });
    }
    
    applyFavoriteSorting();
    renderFavoriteModels();
    updateFavoriteSearchStats();
}

function sortFavoriteModels() {
    currentFavoriteSort = document.getElementById('favoriteSort').value;
    applyFavoriteSorting();
    renderFavoriteModels();
}

function applyFavoriteSorting() {
    if (!filteredFavoriteModels || filteredFavoriteModels.length === 0) return;
    
    filteredFavoriteModels.sort((a, b) => {
        switch(currentFavoriteSort) {
            case 'date_desc':
                return new Date(b.favorited_at || b.created_at) - new Date(a.favorited_at || a.created_at);
            
            case 'date_asc':
                return new Date(a.favorited_at || a.created_at) - new Date(b.favorited_at || b.created_at);
            
            case 'name_asc':
                return a.title.localeCompare(b.title);
            
            case 'name_desc':
                return b.title.localeCompare(a.title);
            
            case 'views_desc':
                return (b.public_view_count || b.views || 0) - (a.public_view_count || a.views || 0);
            
            case 'views_asc': 
                return (a.public_view_count || a.views || 0) - (b.public_view_count || b.views || 0);
            
            case 'favorites_desc':
                return (b.favorites_count || 0) - (a.favorites_count || 0);
            
            default:
                return 0;
        }
    });
}

function clearFavoriteSearch() {
    document.getElementById('favoriteSearch').value = '';
    currentFavoriteSearchTerm = '';
    filteredFavoriteModels = [...allFavoriteModels];
    applyFavoriteSorting();
    renderFavoriteModels();
    updateFavoriteSearchStats();
    
    document.getElementById('favoriteSearchStats').style.display = 'none';
    document.getElementById('favoriteSearchEmpty').style.display = 'none';
    document.getElementById('favoriteSearch').focus();
}

function updateFavoriteSearchStats() {
    const searchStats = document.getElementById('favoriteSearchStats');
    const resultsCount = document.getElementById('favoriteResultsCount');
    const searchQueryDisplay = document.getElementById('favoriteQueryDisplay');
    
    if (currentFavoriteSearchTerm) {
        searchStats.style.display = 'flex';
        resultsCount.textContent = filteredFavoriteModels.length;
        searchQueryDisplay.textContent = `Search: "${currentFavoriteSearchTerm}"`;
    } else {
        searchStats.style.display = 'none';
    }
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) {
        return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays < 30) {
        return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
        return date.toLocaleDateString('en-US');
    }
}

function toggleFavoriteDescription(fileId) {
    const descElement = event.target.closest('.model-card').querySelector('.model-description');
    const toggleBtn = event.target.closest('.expand-btn');
    
    if (!descElement || !toggleBtn) return;
    
    if (descElement.classList.contains('expanded')) {
        descElement.classList.remove('expanded');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    } else {
        descElement.classList.add('expanded');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    }
}

async function testFavorites() {
    const token = localStorage.getItem('auth_token');
    const response = await fetch('/api/users/me/favorites/', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    const data = await response.json();
}
testFavorites();

function initThreeViewer() {
    const container = document.getElementById('modelCanvas');
    if (!container) {
        console.error('Canvas element not found!');
        return;
    }

    const width = container.clientWidth || window.innerWidth * 0.9;
    const height = container.clientHeight || window.innerHeight * 0.9;

    viewerScene = new THREE.Scene();
    viewerScene.background = new THREE.Color(0x0f172a);

    viewerCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    viewerCamera.position.set(0, 200, 500);

    viewerRenderer = new THREE.WebGLRenderer({ 
        canvas: container,
        antialias: true,
        alpha: true
    });
    viewerRenderer.setSize(width, height);
    viewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    viewerRenderer.shadowMap.enabled = true;
    viewerRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    viewerControls = new THREE.OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerControls.enableDamping = true;
    viewerControls.dampingFactor = 0.05;
    viewerControls.rotateSpeed = 0.5;
    viewerControls.minDistance = 1;
    viewerControls.maxDistance = 2000;
    viewerControls.maxPolarAngle = Math.PI;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    viewerScene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(200, 300, 400);
    viewerScene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-200, -100, -200);
    viewerScene.add(directionalLight2);

    function animate() {
        requestAnimationFrame(animate);
        
        if (viewerControls) {
            if (autoRotateEnabled) {
                viewerControls.autoRotate = true;
                viewerControls.autoRotateSpeed = 0.5;
            } else {
                viewerControls.autoRotate = false;
            }
            viewerControls.update();
        }
        
        if (viewerRenderer && viewerScene && viewerCamera) {
            viewerRenderer.render(viewerScene, viewerCamera);
        }
    }
    
    animate();
    window.addEventListener('resize', onViewerResize);
}

function onViewerResize() {
    const container = document.getElementById('modelCanvas');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (viewerCamera && viewerRenderer) {
        viewerCamera.aspect = width / height;
        viewerCamera.updateProjectionMatrix();
        viewerRenderer.setSize(width, height);
    }
}

function openViewer(fileId, modelData = null) {
    const viewerModal = document.getElementById('viewerModal');
    viewerModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (modelData) {
        document.getElementById('viewerTitle').textContent = modelData.title || '3D View';
        updateModelInfoPanel(modelData);
    }
    
    setTimeout(() => {
        if (!viewerRenderer) {
            initThreeViewer();
        } else {
            onViewerResize();
        }
        
        loadModelInViewer(fileId, modelData);
    }, 50);
    updateViewerButtons();
}

function closeViewer() {
    const viewerModal = document.getElementById('viewerModal');
    viewerModal.style.display = 'none';
    document.body.style.overflow = '';
    cleanupViewer();
}

function cleanupViewer() {
    if (currentGLBModel) {
        viewerScene.remove(currentGLBModel);
        currentGLBModel.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        currentGLBModel = null;
    }
    
    currentFileId = null;
}

async function loadModelInViewer(fileId, modelData = null) {
    try {
        showViewerLoading(true);
        
        cleanupViewer();
        
        currentFileId = fileId;
        
        if (modelData) {
            updateModelInfoPanel(modelData);
        }
        
        let glbUrl = `/api/models/export/${fileId}/glb/`;
        
        const checkResponse = await fetch(glbUrl, { method: 'HEAD' });
        if (!checkResponse.ok) {
            throw new Error('GLB file not available');
        }
        
        const loader = new THREE.GLTFLoader();
        
        loader.load(
            glbUrl,
            (gltf) => {
                const box = new THREE.Box3().setFromObject(gltf.scene);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                gltf.scene.position.x = -center.x;
                gltf.scene.position.y = -center.y;
                gltf.scene.position.z = -center.z;
                const height = size.y;
                const width = Math.max(size.x, size.z);
                const maxDim = Math.max(height, width);
                const scale = 500 / maxDim;
                gltf.scene.scale.setScalar(scale);
                const cameraDistance = maxDim * 1.5;
                viewerCamera.position.set(0, cameraDistance * 0.5, cameraDistance);
                viewerCamera.lookAt(0, 0, 0);
                viewerControls.target.set(0, 0, 0);
                viewerControls.update();
                
                currentGLBModel = gltf.scene;
                viewerScene.add(currentGLBModel);
                
                if (wireframeEnabled) {
                    applyWireframeToModel(currentGLBModel);
                }
                
                showViewerLoading(false);
            },
            (xhr) => {
                const percentComplete = (xhr.loaded / xhr.total) * 100;
                if (currentFileId !== fileId) {
                    loader.manager.removeHandler('.glb', loader);
                }
            },
            (error) => {
                if (currentFileId !== fileId) {
                    return;
                }
                
                console.error('Error loading model:', error);
                showViewerLoading(false);
            }
        );
        
    } catch (error) {
        console.error('Error in loadModelInViewer:', error);
        showViewerLoading(false);
    }
}


function updateModelInfoPanel(modelData = null) {
    const infoPanel = document.getElementById('modelInfoPanel');
    
    if (modelData) {
        document.getElementById('infoName').textContent = modelData.title || 'Not specified';
        document.getElementById('infoElements').textContent = modelData.stats?.total_elements || 0;
        document.getElementById('infoBuildings').textContent = modelData.stats?.building_count || 0;
        document.getElementById('infoSize').textContent = `${modelData.stats?.file_size_mb || 0} MB`;
        const descriptionElement = document.getElementById('infoDescription');
        if (descriptionElement) {
            descriptionElement.textContent = modelData.description || 'No description added';
        }
        infoPanel.style.display = 'block';
    } else {
        infoPanel.style.display = 'none';
    }
}

function resetCamera() {
    if (currentGLBModel) {
        const box = new THREE.Box3().setFromObject(currentGLBModel);
        const size = box.getSize(new THREE.Vector3());
        const height = size.y;
        const width = Math.max(size.x, size.z);
        const maxDim = Math.max(height, width);
        
        const cameraDistance = maxDim * 1.5;
        
        viewerCamera.position.set(0, cameraDistance * 0.5, cameraDistance);
        viewerCamera.lookAt(0, 0, 0);
        
        viewerControls.target.set(0, 0, 0);
        viewerControls.update();
    }
}

function applyWireframeToModel(model, enabled = true) {
    model.traverse((child) => {
        if (child.isMesh) {
            child.material.wireframe = enabled;
            if (enabled) {
                child.material.wireframeLinewidth = 1;
            }
        }
    });
}

function toggleAutoRotate() {
    autoRotateEnabled = !autoRotateEnabled;
    updateViewerButtons();
}

function toggleWireframe() {
    wireframeEnabled = !wireframeEnabled;
    
    if (currentGLBModel) {
        applyWireframeToModel(currentGLBModel, wireframeEnabled);
    }
    
    updateViewerButtons();
}

function toggleInfoPanel() {
    const infoPanel = document.getElementById('modelInfoPanel');
    const toggleBtn = document.getElementById('toggleInfoBtn');
    const showInfoBtn = document.getElementById('showInfoBtn');
    
    if (infoPanel.style.display === 'none' || infoPanel.style.display === '') {
        infoPanel.style.display = 'block';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-times"></i>';
            toggleBtn.title = 'Hide information';
        }
        if (showInfoBtn) {
            showInfoBtn.style.display = 'none';
        }
    } else {
        infoPanel.style.display = 'none';
        if (showInfoBtn) {
            showInfoBtn.style.display = 'flex';
            showInfoBtn.innerHTML = '<i class="fas fa-info-circle"></i> Show Info';
        }
    }
}

function showInfoPanel() {
    const infoPanel = document.getElementById('modelInfoPanel');
    const showInfoBtn = document.getElementById('showInfoBtn');
    const toggleBtn = document.getElementById('toggleInfoBtn');
    infoPanel.style.display = 'block';
    if (showInfoBtn) {
        showInfoBtn.style.display = 'none';
    }
    if (toggleBtn) {
        toggleBtn.style.display = 'block';
        toggleBtn.innerHTML = '<i class="fas fa-times"></i>';
        toggleBtn.title = 'Hide information';
    }
}

function updateViewerButtons() {
    const autoRotateBtn = document.getElementById('autoRotateBtn');
    const wireframeBtn = document.getElementById('wireframeToggleBtn');
    
    if (autoRotateBtn) {
        autoRotateBtn.innerHTML = `
            <i class="fas fa-rotate"></i>
            <span class="control-label">Auto: ${autoRotateEnabled ? 'ON' : 'OFF'}</span>
        `;
    }
    
    if (wireframeBtn) {
        wireframeBtn.innerHTML = `
            <i class="fas fa-code"></i>
            <span class="control-label">Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}</span>
        `;
    }
}

function applyWireframeToModel(model, enabled = true) {
    model.traverse((child) => {
        if (child.isMesh) {
            child.material.wireframe = enabled;
            if (enabled) {
                child.material.wireframeLinewidth = 1;
            }
        }
    });
}

function showViewerLoading(show) {
    const loadingElement = document.getElementById('viewerLoading');
    if (loadingElement) {
        loadingElement.style.display = show ? 'block' : 'none';
    }
}

function viewModel(fileId) {
    if (window.event) window.event.stopPropagation();
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'modelsTab') {
        window.open(`/view-3d/${fileId}/`, '_blank');
        if (window.innerWidth <= 768) {
            closeMobileMenu();
        }
    } else if (activeTab && activeTab.id === 'favoritesTab') {
        const model = allFavoriteModels.find(m => m.file_id === fileId);
        if (model) {
            openViewer(fileId, model);
        } else {
            openViewer(fileId);
        }
    } else {
        window.open(`/view-3d/${fileId}/`, '_blank');
    }
}

function viewFavoriteModel(fileId) {
    const model = allFavoriteModels.find(m => m.file_id === fileId);
    if (model) {
        openViewer(fileId, model);
    } else {
        openViewer(fileId);
    }
}
async function deleteAccount() {
    const password = document.getElementById('confirmDelete').value;
    
    if (!password) {
        showMessage('Enter password to confirm account deletion', 'error');
        return;
    }

    if (!confirm('WARNING: This will permanently delete your account and ALL your models. This action cannot be undone!')) {
        return;
    }

    showLoading(true);
    
    try {
        const response = await fetch('/api/users/me/', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({ password: password })
        });

        const data = await response.json();

        if (data.success) {
            showMessage(data.message, 'success');
            
            setTimeout(() => {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_data');
                window.location.href = '/';
            }, 2000);
        } else {
            showMessage(data.error, 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    } finally {
        showLoading(false);
    }
}
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const viewerModal = document.getElementById('viewerModal');
        if (viewerModal && viewerModal.style.display !== 'none') {
            closeViewer();
        }
    }
});