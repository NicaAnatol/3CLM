
let currentUser = null;
let currentPage = 1;
let totalPages = 1;
const itemsPerPage = 12;
let currentSearch = '';
let currentFilters = {
    sort: 'newest',
    elementType: 'all',
    dateRange: 'all'
};

async function checkAuth() {
    const token = localStorage.getItem('auth_token');
    
    if (token) {
        try {
            const response = await fetch('/auth/profile/', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('cached_user_data');
                localStorage.removeItem('user_cache_timestamp');
            } else if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    currentUser = data.user;
                    localStorage.setItem('cached_user_data', JSON.stringify(data.user));
                    localStorage.setItem('user_cache_timestamp', Date.now().toString());
                }
            }
        } catch (error) {
            console.warn('Network error checking auth, keeping token:', error.message);
        }
    }
}

async function loadPublicModels(page = 1) {
    currentPage = page;
    
    currentFilters.sort = document.getElementById('sortSelect').value;
    currentFilters.elementType = document.getElementById('elementTypeSelect').value;
    currentFilters.dateRange = document.getElementById('dateSelect').value;
    currentSearch = document.getElementById('searchInput').value.trim();
    
    showLoading(true);
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('pagination').style.display = 'none';
    
    try {
        const params = new URLSearchParams({
            page: page,
            per_page: itemsPerPage,
            sort: currentFilters.sort,
            search: currentSearch,
            element_type: currentFilters.elementType,
            date_range: currentFilters.dateRange
        });
        
        const headers = {
            'Content-Type': 'application/json'
        };
        const token = localStorage.getItem('auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`/api/public-models/?${params}`, {
            headers: headers
        });
        const data = await response.json();
        
        if (data.success) {
            displayModels(data.models);
            
            if (data.models.length === 0) {
                document.getElementById('emptyState').style.display = 'block';
                document.getElementById('pagination').style.display = 'none';
            } else if (data.pagination) {
                setupPagination(data.pagination);
            }
        } else {
            showMessage(data.error || 'Error loading models', 'error');
            document.getElementById('emptyState').style.display = 'block';
            document.getElementById('pagination').style.display = 'none';
        }
    } catch (error) {
        console.error(` Error in loadPublicModels: ${error.message}`);
        showMessage('Server connection error: ' + error.message, 'error');
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('pagination').style.display = 'none';
    } finally {
        showLoading(false);
    }
}

function displayModels(models) {
    const modelsGrid = document.getElementById('modelsGrid');
    
    if (models.length === 0) {
        modelsGrid.innerHTML = '';
        return;
    }
    
    modelsGrid.innerHTML = models.map(model => {
        const thumbnailUrl = model.thumbnail || 
            `/api/project/${model.file_id}/thumbnail/image/` ||
            '/static/default-model-thumbnail.png';
        
        const timeAgo = getTimeAgo(new Date(model.created_at));
        
        const viewCount = model.public_view_count || model.views || 0;
        
        const isOwnedByCurrentUser = model.is_owner || false;
        
        const isFavorited = !isOwnedByCurrentUser && (model.is_favorited || false);
        const heartIconClass = isFavorited ? 'fas' : 'far';
        const heartIconStyle = isFavorited ? 'color: #dc3545;' : '';
        
        const favoriteThumbnailHTML = isOwnedByCurrentUser ? '' : `
            <button class="thumbnail-favorite-btn" onclick="toggleFavorite('${model.file_id}', this, ${JSON.stringify(model).replace(/"/g, '&quot;')})">
                <i class="${heartIconClass} fa-heart" style="${heartIconStyle}"></i>
            </button>
        `;
        
        return `
        <div class="model-card" data-file-id="${model.file_id}">
            <div class="model-thumbnail" onclick="viewModel('${model.file_id}', ${JSON.stringify(model).replace(/"/g, '&quot;')})">
                <img src="${thumbnailUrl}" 
                     alt="${model.title}" 
                     class="thumbnail-image"
                     loading="lazy"
                     onerror="this.onerror=null; this.src='/static/default-model-thumbnail.png'">
                <div class="thumbnail-overlay">
                    <div class="model-badges">
                        <div class="badge elements">
                            <i class="fas fa-cube"></i> ${model.stats.total_elements || 0}
                        </div>
                        <div class="badge views">
                            <i class="fas fa-eye"></i> ${viewCount}
                        </div>
                        ${isOwnedByCurrentUser ? '<div class="badge owner" style="background: rgba(255, 193, 7, 0.2); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3);"><i class="fas fa-user"></i> Owner</div>' : ''}
                    </div>
                    <div class="model-header">
                    <h3 class="model-title" onclick="viewModel('${model.file_id}', ${JSON.stringify(model).replace(/"/g, '&quot;')})">${model.title}</h3>
                    <div class="model-author">
                        <img src="${model.owner.profile_picture || 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'}" 
                             alt="${model.owner.username}" 
                             class="author-avatar"
                             onerror="this.onerror=null; this.src='https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'">
                        <span>${model.owner.username}</span>
                        <span>•</span>
                        <span>${timeAgo}</span>
                    </div>
                </div>
                </div>
                ${favoriteThumbnailHTML}
            </div>
            
            <div class="model-info">
                <div class="model-actions">
                    <button class="action-btn view" onclick="viewModel('${model.file_id}', ${JSON.stringify(model).replace(/"/g, '&quot;')})">
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
}

function setupPagination(pagination) {
    const paginationDiv = document.getElementById('pagination');
    
    if (pagination.total_pages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }
    
    totalPages = pagination.total_pages;
    let paginationHTML = '';
    
    if (pagination.has_previous) {
        paginationHTML += `
            <button class="page-btn" onclick="loadPublicModels(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;
    }
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button class="page-btn ${i === currentPage ? 'active' : ''}" 
                        onclick="loadPublicModels(${i})">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += `<span class="page-btn">...</span>`;
        }
    }
    
    if (pagination.has_next) {
        paginationHTML += `
            <button class="page-btn" onclick="loadPublicModels(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;
    }
    
    paginationDiv.innerHTML = paginationHTML;
    paginationDiv.style.display = 'flex';
}

function searchModels() {
    currentSearch = document.getElementById('searchInput').value.trim();
    loadPublicModels(1);
}

function handleSearchKeypress(event) {
    if (event.key === 'Enter') {
        searchModels();
    }
}

function downloadModelArchive(fileId) {
    event.stopPropagation();
    
    const token = localStorage.getItem('auth_token');
    
    if (token) {
        downloadWithAuth(fileId, token);
    } else {
        downloadWithoutAuth(fileId);
    }
}

async function downloadWithAuth(fileId, token) {
    try {
        const response = await fetch(`/api/download-model-archive/${fileId}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            downloadWithoutAuth(fileId);
            return;
        }
        
        const blob = await response.blob();
        
        if (blob.size === 0) {
            throw new Error('Downloaded file is empty');
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileId}_model.zip`;
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);
        
        showMessage(' Download started successfully!', 'success');
        
    } catch (error) {
        console.error(' Download error with auth:', error);
        showMessage(`Error: ${error.message}. Trying alternative method...`, 'error');
        
        setTimeout(() => {
            downloadWithoutAuth(fileId);
        }, 1000);
    }
}

function downloadWithoutAuth(fileId) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `/api/download-model-archive/${fileId}/`;
    document.body.appendChild(iframe);
    
    setTimeout(() => {
        if (iframe.parentNode) {
            document.body.removeChild(iframe);
        }
    }, 3000);
    
    setTimeout(() => {
        const directLink = document.createElement('a');
        directLink.href = `/api/download-model-archive/${fileId}/`;
        directLink.download = `${fileId}_model.zip`;
        directLink.style.display = 'none';
        document.body.appendChild(directLink);
        directLink.click();
        setTimeout(() => {
            document.body.removeChild(directLink);
        }, 100);
    }, 500);
    
    showMessage(' Download started! If it doesn\'t start automatically:<br>1. Right-click the link above → "Save link as..."<br>2. Or check your downloads folder.', 'info');
}

function toggleFavorite(fileId, button) {
    if (!currentUser) {
        showMessage('To add to favorites, please sign in', 'info');
        window.location.href = '/auth/';
        return;
    }
    
    const icon = button.querySelector('i');
    
    if (icon.classList.contains('far')) {
        icon.classList.remove('far');
        icon.classList.add('fas');
        icon.style.color = '#dc3545';
        showMessage('Model added to favorites', 'success');
    } else {
        icon.classList.remove('fas');
        icon.classList.add('far');
        icon.style.color = '';
        showMessage('Model removed from favorites', 'success');
    }
}

function showModelDetails(model) {
    document.getElementById('modalTitle').textContent = model.title;
    
    const modalContent = `
        <div class="model-details">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                    <h3 style="color: #94a3b8; margin-bottom: 10px;">General Information</h3>
                    <div style="display: grid; gap: 10px;">
                        <div>
                            <strong>Author:</strong> ${model.owner.username}
                        </div>
                        <div>
                            <strong>Creation Date:</strong> ${new Date(model.created_at).toLocaleDateString('en-US')}
                        </div>
                        <div>
                            <strong>Last Update:</strong> ${new Date(model.updated_at).toLocaleDateString('en-US')}
                        </div>
                    </div>
                </div>
                
                <div>
                    <h3 style="color: #94a3b8; margin-bottom: 10px;">Statistics</h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                        <div style="background: #0f172a; padding: 10px; border-radius: 8px;">
                            <div style="font-size: 20px; font-weight: bold; color: #667eea;">${model.stats.total_elements || 0}</div>
                            <div style="font-size: 12px; color: #94a3b8;">Total Elements</div>
                        </div>
                        <div style="background: #0f172a; padding: 10px; border-radius: 8px;">
                            <div style="font-size: 20px; font-weight: bold; color: #28a745;">${model.views || 0}</div>
                            <div style="font-size: 12px; color: #94a3b8;">Views</div>
                        </div>
                        <div style="background: #0f172a; padding: 10px; border-radius: 8px;">
                            <div style="font-size: 20px; font-weight: bold; color: #17a2b8;">${model.downloads || 0}</div>
                            <div style="font-size: 12px; color: #94a3b8;">Downloads</div>
                        </div>
                        <div style="background: #0f172a; padding: 10px; border-radius: 8px;">
                            <div style="font-size: 20px; font-weight: bold; color: #e0a800;">${model.stats.file_size_mb || 0} MB</div>
                            <div style="font-size: 12px; color: #94a3b8;">Size</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h3 style="color: #94a3b8; margin-bottom: 15px;">Description</h3>
                <p style="color: #cbd5e1; line-height: 1.6; white-space: pre-wrap;">${model.description || 'No description added'}</p>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h3 style="color: #94a3b8; margin-bottom: 15px;">Element Types</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                    <span style="background: rgba(40, 167, 69, 0.2); color: #28a745; padding: 8px 15px; border-radius: 20px;">
                        Buildings: ${model.stats.building_count || 0}
                    </span>
                    <span style="background: rgba(23, 162, 184, 0.2); color: #17a2b8; padding: 8px 15px; border-radius: 20px;">
                        Roads: ${model.stats.highway_count || 0}
                    </span>
                    <span style="background: rgba(0, 123, 255, 0.2); color: #007bff; padding: 8px 15px; border-radius: 20px;">
                        Water: ${model.stats.water_count || 0}
                    </span>
                    <span style="background: rgba(111, 66, 193, 0.2); color: #6f42c1; padding: 8px 15px; border-radius: 20px;">
                        Natural: ${model.stats.natural_count || 0}
                    </span>
                    <span style="background: rgba(253, 126, 20, 0.2); color: #fd7e14; padding: 8px 15px; border-radius: 20px;">
                        Land: ${model.stats.landuse_count || 0}
                    </span>
                </div>
            </div>
            
            <div style="display: flex; gap: 15px; justify-content: flex-end; border-top: 1px solid #334155; padding-top: 20px;">
                <button class="action-btn download" onclick="downloadModelArchive('${model.file_id}')">
                    <i class="fas fa-download"></i> Download Archive
                </button>
                <button class="action-btn view" onclick="viewModel('${model.file_id}'); closeModal();">
                    <i class="fas fa-eye"></i> View Model
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('modalContent').innerHTML = modalContent;
    document.getElementById('modelModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('modelModal').style.display = 'none';
    document.body.style.overflow = 'auto';
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

function showMessage(message, type) {
    let messageEl = document.getElementById('workshopMessage');
    
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.id = 'workshopMessage';
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 10px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            max-width: 400px;
            animation: slideIn 0.3s ease;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        `;
        document.body.appendChild(messageEl);
    }
    
    const colors = {
        'success': { background: 'rgba(40, 167, 69, 0.9)', color: 'white' },
        'error': { background: 'rgba(220, 53, 69, 0.9)', color: 'white' },
        'info': { background: 'rgba(23, 162, 184, 0.9)', color: 'white' },
        'warning': { background: 'rgba(255, 193, 7, 0.9)', color: '#212529' }
    };
    
    messageEl.innerHTML = message;
    messageEl.style.background = colors[type]?.background || 'rgba(51, 51, 51, 0.9)';
    messageEl.style.color = colors[type]?.color || 'white';
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

if (!document.querySelector('#workshopMessageStyles')) {
    const style = document.createElement('style');
    style.id = 'workshopMessageStyles';
    style.textContent = `
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateX(100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        #workshopMessage {
            font-family: 'Inter', sans-serif;
            line-height: 1.4;
        }
    `;
    document.head.appendChild(style);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.getElementById('modelsGrid').style.display = show ? 'none' : 'grid';
}

window.onclick = function(event) {
    const modal = document.getElementById('modelModal');
    if (event.target === modal) {
        closeModal();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadPublicModels();
    loadWorkshopStats();
    setInterval(loadWorkshopStats, 60000);
});

let viewerScene, viewerCamera, viewerRenderer, viewerControls;
let currentGLBModel = null;
let autoRotateEnabled = true;
let wireframeEnabled = false;
let currentFileId = null;

function initThreeViewer() {
    const container = document.getElementById('modelCanvas');
    const width = container.clientWidth;
    const height = container.clientHeight;

    viewerScene = new THREE.Scene();
    viewerScene.background = new THREE.Color(0x1a1a2e);
    
    viewerCamera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
    viewerCamera.position.set(0, 1000, 0);
    viewerCamera.lookAt(0, 0, 0);
    
    viewerRenderer = new THREE.WebGLRenderer({ 
        canvas: container,
        antialias: true,
        alpha: true
    });
    viewerRenderer.setSize(width, height);
    viewerRenderer.setPixelRatio(window.devicePixelRatio);
    viewerRenderer.shadowMap.enabled = true;
    viewerRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    viewerControls = new THREE.OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerControls.enableDamping = true;
    viewerControls.dampingFactor = 0.05;
    viewerControls.rotateSpeed = 0.5;
    viewerControls.minDistance = 100;
    viewerControls.maxDistance = 5000;
    viewerControls.maxPolarAngle = Math.PI;
    viewerControls.target.set(0, 0, 0);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    viewerScene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 300, 200);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    viewerScene.add(directionalLight);
    
    function animate() {
        requestAnimationFrame(animate);
        
        if (autoRotateEnabled && viewerControls) {
            viewerControls.autoRotate = true;
            viewerControls.autoRotateSpeed = 1.0;
        } else {
            viewerControls.autoRotate = false;
        }
        
        viewerControls.update();
        viewerRenderer.render(viewerScene, viewerCamera);
    }
    
    animate();
    
    window.addEventListener('resize', onViewerResize);
}

function onViewerResize() {
    const container = document.getElementById('modelCanvas');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    viewerCamera.aspect = width / height;
    viewerCamera.updateProjectionMatrix();
    viewerRenderer.setSize(width, height);
}

async function loadGLBModel(fileId, modelData = null) {
    try {
        showViewerLoading(true);
        
        if (currentGLBModel) {
            viewerScene.remove(currentGLBModel);
            currentGLBModel = null;
        }
        
        document.getElementById('viewerTitle').textContent = modelData?.title || `Model ${fileId}`;
        
        if (modelData) {
            document.getElementById('modelInfoPanel').style.display = 'block';
            document.getElementById('infoName').textContent = modelData.title;
            document.getElementById('infoElements').textContent = modelData.stats.total_elements || 0;
            document.getElementById('infoBuildings').textContent = modelData.stats.building_count || 0;
            document.getElementById('infoSize').textContent = `${modelData.stats.file_size_mb || 0} MB`;
            document.getElementById('infoAuthor').textContent = modelData.owner.username || 'Anonymous';
            
            updateModelInfoPanel(modelData);
        }
        
        let glbUrl = `/api/glb-file/${fileId}/`;
        
        const checkResponse = await fetch(glbUrl, { method: 'HEAD' });
        if (!checkResponse.ok) {
            throw new Error('GLB file is not available');
        }
        
        const loader = new THREE.GLTFLoader();
        
        loader.load(
            glbUrl,
            (gltf) => {
                const box = new THREE.Box3().setFromObject(gltf.scene);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                
                const maxDim = Math.max(size.x, size.z);
                const scale = 500 / maxDim;
                gltf.scene.scale.setScalar(scale);
                
                gltf.scene.position.x = -center.x * scale;
                gltf.scene.position.y = -center.y * scale;
                gltf.scene.position.z = -center.z * scale;
                
                const cameraHeight = Math.max(size.y, maxDim) * 2;
                viewerCamera.position.set(0, cameraHeight, 0);
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
                    showViewerLoading(true);
                }
            },
            (error) => {
                if (currentFileId !== fileId) {
                    return;
                }
                
                console.error('Error loading model:', error);
                showViewerLoading(false);
                alert('Error loading model. Try downloading the archive and viewing it locally.');
            }
        );
        
    } catch (error) {
        console.error('Error in loadGLBModel:', error);
        showViewerLoading(false);
        alert(`Could not load model: ${error.message}`);
    }
}

function openModelViewer(fileId, modelData = null) {
    currentFileId = fileId;
    
    showViewerLoading(true);
    
    if (currentGLBModel) {
        viewerScene.remove(currentGLBModel);
        currentGLBModel = null;
    }
    
    document.getElementById('viewerModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    if (!viewerRenderer) {
        initThreeViewer();
    }
    
    updateModelInfoPanel(modelData);
    
    incrementModelView(fileId, modelData);
    
    loadGLBModel(fileId, modelData);
}

async function incrementModelView(fileId, modelData = null) {
    try {
        if (currentUser && modelData && modelData.owner && modelData.owner.id === currentUser.id) {
            updateViewCountInUI(fileId, modelData, modelData.views || 0);
            return;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const token = localStorage.getItem('auth_token');
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        let response;
        try {
            response = await fetch(`/api/public-model/${fileId}/view/`, {
                method: 'POST',
                headers: headers,
                signal: controller.signal
            });
        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
            } else {
            }
            
            if (!(currentUser && modelData && modelData.owner && modelData.owner.id === currentUser.id)) {
                updateViewCountInUI(fileId, modelData);
            }
            return;
        }
        
        clearTimeout(timeoutId);
        
        if (!response) {
            updateViewCountInUI(fileId, modelData);
            return;
        }
        
        if (response.ok) {
            try {
                const data = await response.json();
                updateViewCountInUI(fileId, modelData, data.views);
            } catch (jsonError) {
                if (!(currentUser && modelData && modelData.owner && modelData.owner.id === currentUser.id)) {
                    updateViewCountInUI(fileId, modelData);
                }
            }
        } else if (response.status === 401 || response.status === 403) {
            if (!(currentUser && modelData && modelData.owner && modelData.owner.id === currentUser.id)) {
                updateViewCountInUI(fileId, modelData);
            }
        } else {
            if (!(currentUser && modelData && modelData.owner && modelData.owner.id === currentUser.id)) {
                updateViewCountInUI(fileId, modelData);
            }
        }
        
    } catch (error) {
        if (!(currentUser && modelData && modelData.owner && modelData.owner.id === currentUser.id)) {
            updateViewCountInUI(fileId, modelData);
        }
    }
}

function updateModelInfoPanel(modelData = null) {
    const infoPanel = document.getElementById('modelInfoPanel');
    
    if (modelData) {
        document.getElementById('infoName').textContent = modelData.title || 'Not specified';
        document.getElementById('infoElements').textContent = modelData.stats.total_elements || 0;
        document.getElementById('infoBuildings').textContent = modelData.stats.building_count || 0;
        document.getElementById('infoSize').textContent = `${modelData.stats.file_size_mb || 0} MB`;
        document.getElementById('infoAuthor').textContent = modelData.owner?.username || 'Anonymous';
        
        const descriptionElement = document.getElementById('infoDescription');
        if (!descriptionElement) {
            const infoDiv = document.querySelector('#modelInfoPanel div');
            const descElement = document.createElement('div');
            descElement.id = 'infoDescription';
            descElement.innerHTML = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #334155;">
                <strong>Description:</strong><br>
                <div style="margin-top: 5px; max-height: 100px; overflow-y: auto; font-size: 13px; line-height: 1.4; color: #cbd5e1;">
                    ${modelData.description || 'No description added'}
                </div>
            </div>`;
            infoDiv.appendChild(descElement);
        } else {
            descriptionElement.innerHTML = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #334155;">
                <strong>Description:</strong><br>
                <div style="margin-top: 5px; max-height: 100px; overflow-y: auto; font-size: 13px; line-height: 1.4; color: #cbd5e1;">
                    ${modelData.description || 'No description added'}
                </div>
            </div>`;
        }
        
        infoPanel.style.display = 'block';
    } else {
        infoPanel.style.display = 'none';
    }
}

function closeViewer() {
    document.getElementById('viewerModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    
    showViewerLoading(false);
}

function resetCamera() {
    if (currentGLBModel) {
        const box = new THREE.Box3().setFromObject(currentGLBModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.z);
        const cameraHeight = Math.max(size.y, maxDim) * 2;
        
        viewerCamera.position.set(0, cameraHeight, 0);
        viewerCamera.lookAt(0, 0, 0);
        viewerControls.target.set(0, 0, 0);
        viewerControls.update();
    } else {
        viewerCamera.position.set(0, 1000, 0);
        viewerCamera.lookAt(0, 0, 0);
        viewerControls.target.set(0, 0, 0);
        viewerControls.update();
    }
}

function toggleAutoRotate() {
    autoRotateEnabled = !autoRotateEnabled;
    const btn = document.getElementById('autoRotateBtn');
    btn.innerHTML = `<i class="fas fa-rotate"></i> Auto Rotate: ${autoRotateEnabled ? 'ON' : 'OFF'}`;
}

function toggleWireframe() {
    wireframeEnabled = !wireframeEnabled;
    
    if (currentGLBModel) {
        applyWireframeToModel(currentGLBModel, wireframeEnabled);
    }
    
    const btn = document.getElementById('wireframeToggleBtn');
    btn.innerHTML = `<i class="fas fa-code"></i> Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`;
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
    document.getElementById('viewerLoading').style.display = show ? 'block' : 'none';
}

function updateViewCountInUI(fileId, modelData = null, newCount = null) {
    const isOwner = currentUser && modelData && modelData.owner && modelData.owner.id === currentUser.id;
    
    let updatedCount;
    if (newCount !== null) {
        updatedCount = newCount;
    } else if (isOwner) {
        updatedCount = modelData ? (modelData.views || 0) : 0;
    } else {
        const currentCount = parseInt(modelData?.views || 0);
        updatedCount = currentCount + 1;
    }
    
    const modelCard = document.querySelector(`.model-card[data-file-id="${fileId}"]`);
    if (modelCard) {
        const badgesContainer = modelCard.querySelector('.model-badges');
        if (badgesContainer) {
            const viewBadge = badgesContainer.children[2];
            if (viewBadge && viewBadge.classList.contains('views')) {
                const icon = viewBadge.querySelector('i');
                const textNode = viewBadge.childNodes[1];
                if (icon && textNode) {
                    textNode.textContent = ` ${updatedCount}`;
                }
            }
        }
    }
    
    if (modelData) {
        modelData.views = updatedCount;
        modelData.public_view_count = updatedCount;
    }
}

function viewModel(fileId, modelData = null) {
    if (!modelData) {
        const modelCard = document.querySelector(`.model-card[data-file-id="${fileId}"]`);
        if (modelCard) {
            const title = modelCard.querySelector('.model-title').textContent;
            const author = modelCard.querySelector('.model-author span').textContent;
            const elements = modelCard.querySelector('.stat-value').textContent;
            
            modelData = {
                title: title,
                owner: { username: author },
                stats: { total_elements: parseInt(elements) }
            };
        }
    }
    
    openModelViewer(fileId, modelData);
}

async function updateModelViewsInBackground(fileId) {
    try {
        const token = localStorage.getItem('auth_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`/api/public-model/${fileId}/view/`, {
            method: 'POST',
            headers: headers
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (!data.is_owner) {
                const modelCard = document.querySelector(`.model-card[data-file-id="${fileId}"]`);
                if (modelCard) {
                    const statsContainer = modelCard.querySelector('.model-stats');
                    if (statsContainer) {
                        const viewStatItem = statsContainer.children[1];
                        if (viewStatItem) {
                            const statValue = viewStatItem.querySelector('.stat-value');
                            if (statValue) {
                                statValue.textContent = data.views || 0;
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.log('Could not update background views:', error);
    }
}

function toggleDescription(fileId, elementId) {
    event.stopPropagation();
    
    const descElement = document.getElementById(`desc-display-${fileId}`);
    const toggleBtn = document.getElementById(`desc-toggle-${fileId}`);
    
    if (!descElement || !toggleBtn) return;
    
    if (descElement.classList.contains('expanded')) {
        descElement.classList.remove('expanded');
        toggleBtn.classList.remove('expanded');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    } else {
        descElement.classList.add('expanded');
        toggleBtn.classList.add('expanded');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    }
}

function toggleInfoPanel() {
    const infoPanel = document.getElementById('modelInfoPanel');
    const toggleBtn = document.getElementById('toggleInfoBtn');
    const showInfoBtn = document.getElementById('showInfoBtn');
    
    if (infoPanel.style.display === 'none' || infoPanel.style.display === '') {
        infoPanel.style.display = 'block';
        if (toggleBtn) {
            toggleBtn.title = 'Hide info';
        }
        if (showInfoBtn) {
            showInfoBtn.style.display = 'none';
        }
    } else {
        infoPanel.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-info-circle"></i>';
            toggleBtn.title = 'Show info';
        }
        if (showInfoBtn) {
            showInfoBtn.style.display = 'block';
            showInfoBtn.innerHTML = 'show info';
        }
    }
}

function toggleFavorite(fileId, button, modelData = null) {
    event.stopPropagation();
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
        showMessage('To add to favorites, please sign in', 'info');
        window.location.href = '/auth/';
        return;
    }
    
    const allFavoriteButtons = document.querySelectorAll(`[data-file-id="${fileId}"] .favorite-btn, .thumbnail-favorite-btn[onclick*="${fileId}"]`);
    
    fetch(`/api/favorite/${fileId}/toggle/`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            allFavoriteButtons.forEach(btn => {
                const icon = btn.querySelector('i');
                if (data.favorited) {
                    icon.classList.remove('far');
                    icon.classList.add('fas');
                    icon.style.color = '#dc3545';
                } else {
                    icon.classList.remove('fas');
                    icon.classList.add('far');
                    icon.style.color = '';
                }
            });
            
            if (data.favorited) {
                showMessage('Model added to favorites', 'success');
            } else {
                showMessage('Model removed from favorites', 'success');
            }
            
            if (modelData) {
                modelData.is_favorited = data.favorited;
                modelData.favorites_count = data.favorites_count;
            }
        } else {
            showMessage(data.error || 'Error handling favorites', 'error');
            
            if (data.error && data.error.includes('your own models')) {
                allFavoriteButtons.forEach(btn => {
                    btn.style.display = 'none';
                });
                
                if (modelData) {
                    modelData.is_owner = true;
                }
            }
        }
    })
    .catch(error => {
        console.error('Error in toggleFavorite:', error);
        showMessage('Server connection error', 'error');
    });
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
        toggleBtn.title = 'Hide info';
    }
}

async function loadWorkshopStats() {
    try {
        const response = await fetch('/api/workshop-stats/');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalModels').textContent = data.stats.total_models || 0;
            document.getElementById('totalCreators').textContent = data.stats.total_creators || 0;
            document.getElementById('totalDownloads').textContent = data.stats.total_downloads || 0;
            document.getElementById('totalViews').textContent = data.stats.total_views || 0;
        }
    } catch (error) {
        document.getElementById('totalModels').textContent = '0';
        document.getElementById('totalCreators').textContent = '0';
        document.getElementById('totalDownloads').textContent = '0';
        document.getElementById('totalViews').textContent = '0';
    }
}

function showUploadInfo() {
    showMessage(
        'To publish your model:<br><br>' +
        '1. Generate the model in the "Generate 3D" section<br>' +
        '2. Go to "My Projects"<br>' +
        '3. Select the model and click "Make Public"<br>' +
        '4. Fill in the details and save', 
        'info'
    );
}

function closeBanner() {
    document.getElementById('featuredBanner').style.display = 'none';
}