let currentUsersPage = 1;
let currentModelsPage = 1;
let currentUserSearch = '';
let currentModelSearch = '';
let editingUserId = null;

// Viewer variables
let viewerScene, viewerCamera, viewerRenderer, viewerControls;
let currentGLBModel = null;
let autoRotateEnabled = true;
let wireframeEnabled = false;
let currentViewFileId = null;

const token = localStorage.getItem('auth_token');
if (!token) {
    window.location.href = '/auth/';
}

function apiCall(method, url, body = null) {
    const headers = { 'Authorization': `Bearer ${token}` };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(url, { method, headers, body: body ? JSON.stringify(body) : null })
        .then(res => res.json());
}

// ==================== VIEWER FUNCTIONS ====================

function initAdminViewer() {
    const container = document.getElementById('modelCanvas');
    if (!container) return;

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
        if (viewerRenderer && viewerScene && viewerCamera) {
            viewerRenderer.render(viewerScene, viewerCamera);
        }
    }
    animate();

    // Responsive resize handler
    window.addEventListener('resize', onAdminViewerResize);
}

function onAdminViewerResize() {
    const container = document.getElementById('modelCanvas');
    if (!container || !viewerCamera || !viewerRenderer) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    viewerCamera.aspect = width / height;
    viewerCamera.updateProjectionMatrix();
    viewerRenderer.setSize(width, height);
}

async function viewModelAdmin(fileId, modelData = null) {
    if (modelData && modelData.has_glb_export === false) {
        alert('This model does not have a GLB export available. Please generate the GLB export first.');
        return;
    }

    currentViewFileId = fileId;

    document.getElementById('viewerModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    document.getElementById('viewerTitle').textContent = modelData?.title || `Model ${fileId}`;

    if (modelData) {
        document.getElementById('infoName').textContent = modelData.title || 'Not specified';
        document.getElementById('infoElements').textContent = modelData.total_elements || 0;
        document.getElementById('infoBuildings').textContent = modelData.building_count || 0;
        document.getElementById('infoSize').textContent = `${modelData.file_size_mb || 0} MB`;
        document.getElementById('infoAuthor').textContent = modelData.user?.username || 'Unknown';

        const descElement = document.getElementById('infoDescription');
        if (descElement) {
            descElement.innerHTML = modelData.description || 'No description added';
        }
        document.getElementById('modelInfoPanel').style.display = 'block';
    }

    if (!viewerRenderer) {
        initAdminViewer();
    } else {
        // Ensure renderer size is updated when modal opens
        setTimeout(() => {
            const container = document.getElementById('modelCanvas');
            if (container && viewerRenderer) {
                const w = container.clientWidth;
                const h = container.clientHeight;
                viewerRenderer.setSize(w, h);
                viewerCamera.aspect = w / h;
                viewerCamera.updateProjectionMatrix();
            }
        }, 100);
    }

    await loadGLBModelAdmin(fileId);
}

async function loadGLBModelAdmin(fileId) {
    try {
        showViewerLoading(true);

        if (currentGLBModel) {
            viewerScene.remove(currentGLBModel);
            currentGLBModel = null;
        }

        let glbUrl = `/api/admin/glb/${fileId}/`;

        const glbResponse = await fetch(glbUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'model/gltf-binary, application/json, */*'
            }
        });

        if (!glbResponse.ok) {
            let errorMsg = `HTTP ${glbResponse.status}`;
            try {
                const errorData = await glbResponse.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { }
            throw new Error(errorMsg);
        }

        const contentType = glbResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const json = await glbResponse.json();
            throw new Error(json.error || 'Server returned JSON instead of GLB');
        }

        const glbBlob = await glbResponse.blob();

        if (glbBlob.size >= 2) {
            const header = await glbBlob.slice(0, 2).text();
            if (header === 'PK') {
                throw new Error('No GLB export available for this model. Please generate it first.');
            }
        }

        if (glbBlob.size < 100) {
            throw new Error('GLB file is empty or invalid');
        }

        const glbArrayBuffer = await glbBlob.arrayBuffer();
        const loader = new THREE.GLTFLoader();

        loader.parse(glbArrayBuffer, '', (gltf) => {
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
                applyWireframeToModelAdmin(currentGLBModel);
            }
            showViewerLoading(false);
        }, (error) => {
            console.error('Error parsing GLB:', error);
            showViewerLoading(false);
            alert('Error parsing model file. The file might be corrupted.');
        });

    } catch (error) {
        console.error('Error in loadGLBModelAdmin:', error);
        showViewerLoading(false);
        alert(`Could not load model: ${error.message}`);
    }
}

function closeAdminViewer() {
    document.getElementById('viewerModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    showViewerLoading(false);
    if (currentGLBModel) {
        viewerScene.remove(currentGLBModel);
        currentGLBModel = null;
    }
}

function resetAdminCamera() {
    if (currentGLBModel) {
        const box = new THREE.Box3().setFromObject(currentGLBModel);
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

function toggleAdminAutoRotate() {
    autoRotateEnabled = !autoRotateEnabled;
    const btn = document.getElementById('autoRotateBtnAdmin');
    if (btn) btn.innerHTML = `<i class="fas fa-rotate"></i> Auto: ${autoRotateEnabled ? 'ON' : 'OFF'}`;
}

function toggleAdminWireframe() {
    wireframeEnabled = !wireframeEnabled;
    if (currentGLBModel) {
        applyWireframeToModelAdmin(currentGLBModel, wireframeEnabled);
    }
    const btn = document.getElementById('wireframeToggleBtnAdmin');
    if (btn) btn.innerHTML = `<i class="fas fa-code"></i> Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`;
}

function applyWireframeToModelAdmin(model, enabled = true) {
    model.traverse((child) => {
        if (child.isMesh) {
            child.material.wireframe = enabled;
            if (enabled) child.material.wireframeLinewidth = 1;
        }
    });
}

function showViewerLoading(show) {
    const loadingEl = document.getElementById('viewerLoading');
    if (loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
}

function toggleAdminInfoPanel() {
    const infoPanel = document.getElementById('modelInfoPanel');
    const showInfoBtn = document.getElementById('showInfoBtn');
    if (infoPanel.style.display === 'none') {
        infoPanel.style.display = 'block';
        if (showInfoBtn) showInfoBtn.style.display = 'none';
    } else {
        infoPanel.style.display = 'none';
        if (showInfoBtn) showInfoBtn.style.display = 'flex';
    }
}

function showAdminInfoPanel() {
    document.getElementById('modelInfoPanel').style.display = 'block';
    document.getElementById('showInfoBtn').style.display = 'none';
}

// ==================== USER FUNCTIONS ====================

async function loadUsers(page = 1) {
    currentUsersPage = page;
    const url = `/api/admin/users/?page=${page}&per_page=10&search=${encodeURIComponent(currentUserSearch)}`;
    try {
        const data = await apiCall('GET', url);
        if (data.success) {
            renderUsersTable(data.users, data.total, data.page, data.per_page);
        } else {
            document.getElementById('usersTable').innerHTML = '<p style="color:#ef4444; text-align:center; padding:40px;">Error loading users: ' + (data.error || 'Unknown error') + '</p>';
        }
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersTable').innerHTML = '<p style="color:#ef4444; text-align:center; padding:40px;">Network error loading users</p>';
    }
}

function renderUsersTable(users, total, page, per_page) {
    const container = document.getElementById('usersTable');
    if (!users || users.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:#94a3b8;">No users found.</p>';
        return;
    }
    
    let html = `<table><thead>
        <tr>
            <th>ID</th>
            <th>Username</th>
            <th>Email</th>
            <th>Admin</th>
            <th>Models</th>
            <th>Actions</th>
        </tr>
    </thead>
    <tbody>`;
    
    for (const u of users) {
        html += `<tr>
            <td>${u.id.substring(0,8)}...</td>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>${u.is_admin ? '<span class="badge-success">Yes</span>' : '<span class="badge-secondary">No</span>'}</td>
            <td>${u.models_count}</td>
            <td>
                <button class="btn btn-sm" onclick="editUser('${u.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')"><i class="fas fa-trash"></i></button>
                <button class="btn btn-sm" onclick="viewUserModels('${escapeHtml(u.username)}')"><i class="fas fa-cube"></i></button>
            </td>
        </tr>`;
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    const totalPages = Math.ceil(total / per_page);
    let paginationHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        paginationHtml += `<button class="btn btn-sm ${i === page ? 'btn-primary' : ''}" onclick="loadUsers(${i})">${i}</button>`;
    }
    document.getElementById('usersPagination').innerHTML = paginationHtml;
}

async function editUser(userId) {
    editingUserId = userId;
    const data = await apiCall('GET', `/api/admin/users/${userId}/`);
    if (data.success) {
        document.getElementById('modalTitle').innerText = 'Edit User';
        document.getElementById('modalUsername').value = data.user.username;
        document.getElementById('modalEmail').value = data.user.email;
        document.getElementById('modalIsAdmin').checked = data.user.is_admin;
        document.getElementById('modalPassword').value = '';
        document.getElementById('userModal').style.display = 'flex';
    }
}

async function deleteUser(userId) {
    if (confirm('Delete this user? All their models will also be deleted.')) {
        const res = await apiCall('DELETE', `/api/admin/users/${userId}/`);
        if (res.success) {
            loadUsers(currentUsersPage);
        } else alert(res.error);
    }
}

async function saveUser() {
    const username = document.getElementById('modalUsername').value.trim();
    const email = document.getElementById('modalEmail').value.trim();
    const password = document.getElementById('modalPassword').value;
    const isAdmin = document.getElementById('modalIsAdmin').checked;
    const body = { username, email, is_admin: isAdmin };
    if (password) body.password = password;
    let url = '/api/admin/users/';
    let method = 'POST';
    if (editingUserId) {
        url = `/api/admin/users/${editingUserId}/`;
        method = 'PATCH';
    }
    const res = await apiCall(method, url, body);
    if (res.success) {
        document.getElementById('userModal').style.display = 'none';
        loadUsers(currentUsersPage);
        editingUserId = null;
    } else alert(res.error);
}

function viewUserModels(username) {
    document.querySelector('[data-tab="models"]').click();
    currentModelSearch = username;
    document.getElementById('modelSearch').value = currentModelSearch;
    // Automatically load models without needing to press search button
    loadModels(1);
}

// ==================== MODELS FUNCTIONS ====================

async function loadModels(page = 1) {
    currentModelsPage = page;
    let url = `/api/admin/models/?page=${page}&per_page=10`;
    if (currentModelSearch) {
        if (currentModelSearch.startsWith('user:')) {
            url += `&user_id=${currentModelSearch.split(':')[1]}`;
        } else {
            url += `&search=${encodeURIComponent(currentModelSearch)}`;
        }
    }
    try {
        const data = await apiCall('GET', url);
        if (data && data.success) {
            renderModelsTable(data.models, data.total, data.page, data.per_page);
        } else {
            document.getElementById('modelsTable').innerHTML = '<p style="color:#ef4444; text-align:center; padding:40px;">Error loading models: ' + (data?.error || 'Unknown error') + '</p>';
        }
    } catch (error) {
        console.error('Error loading models:', error);
        document.getElementById('modelsTable').innerHTML = '<p style="color:#ef4444; text-align:center; padding:40px;">Network error loading models</p>';
    }
}

async function toggleModelVisibility(modelId, checkbox, row) {
    try {
        const res = await apiCall('PATCH', `/api/admin/models/${modelId}/visibility/`);
        if (res.success) {
            checkbox.checked = res.is_public;
            const badgeCell = row.querySelector('.public-badge');
            if (badgeCell) {
                badgeCell.innerHTML = res.is_public ? '<span class="badge-success">Public</span>' : '<span class="badge-secondary">Private</span>';
            }
        } else {
            alert(res.error);
            checkbox.checked = !checkbox.checked;
        }
    } catch (error) {
        alert('Error toggling visibility');
        checkbox.checked = !checkbox.checked;
    }
}

function renderModelsTable(models, total, page, per_page) {
    const container = document.getElementById('modelsTable');
    if (!models || models.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:#94a3b8;">No models found.</p>';
        return;
    }
    
    let html = `<table class="data-table">
        <thead>
            <tr>
                <th>ID</th>
                <th>Title</th>
                <th>User</th>
                <th>Public</th>
                <th>Elements</th>
                <th>Size (MB)</th>
                <th>Views</th>
                <th>Downloads</th>
                <th>Created</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>`;
    
    for (const m of models) {
        const createdDate = new Date(m.created_at).toLocaleDateString('ro-RO');
        const hasGlb = m.has_glb_export === true;
        
        html += `<tr>
            <td>${m.file_id.substring(0,8)}...</td>
            <td>${escapeHtml(m.title || 'Untitled')}</td>
            <td>${escapeHtml(m.user?.username || 'Deleted')}</td>
            <td class="public-badge">${m.is_public ? '<span class="badge-success">Public</span>' : '<span class="badge-secondary">Private</span>'}</td>
            <td class="model-stats-cell">${m.total_elements || 0}</td>
            <td class="model-stats-cell">${(m.file_size_mb || 0).toFixed(2)}</td>
            <td class="model-stats-cell">${m.public_view_count || 0}</td>
            <td class="model-stats-cell">${m.download_count || 0}</td>
            <td class="model-stats-cell">${createdDate}</td>
            <td class="actions-cell">
                ${hasGlb ? `<button class="btn btn-sm btn-primary" onclick="viewModelAdmin('${m.file_id}', {
                    title: '${escapeHtml(m.title)}',
                    total_elements: ${m.total_elements || 0},
                    building_count: ${m.building_count || 0},
                    file_size_mb: ${m.file_size_mb || 0},
                    description: '${escapeHtml(m.description || '')}',
                    user: { username: '${escapeHtml(m.user?.username || 'Deleted')}' },
                    has_glb_export: true
                })" title="View Model"><i class="fas fa-eye"></i></button>` : `<button class="btn btn-sm btn-secondary" disabled style="opacity:0.5;" title="No GLB export available"><i class="fas fa-eye-slash"></i></button>`}
                <label class="switch">
                    <input type="checkbox" class="visibility-switch" ${m.is_public ? 'checked' : ''} onchange="toggleModelVisibility('${m.id}', this, this.closest('tr'))">
                    <span class="slider round"></span>
                </label>
                <button class="btn btn-danger btn-sm" onclick="deleteModel('${m.id}')" title="Delete Model">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    const totalPages = Math.ceil(total / per_page);
    let paginationHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        paginationHtml += `<button class="btn btn-sm ${i === page ? 'btn-primary' : ''}" onclick="loadModels(${i})">${i}</button>`;
    }
    document.getElementById('modelsPagination').innerHTML = paginationHtml;
}

async function deleteModel(modelId) {
    if (confirm('Delete this model permanently?')) {
        try {
            const res = await apiCall('DELETE', `/api/admin/models/${modelId}/`);
            if (res.success) {
                loadModels(currentModelsPage);
            } else {
                alert(res.error);
            }
        } catch (error) {
            alert('Error deleting model');
        }
    }
}

// ==================== STATISTICS FUNCTIONS ====================

function updateCircularProgress(percent, elementId) {
    const circle = document.getElementById(elementId);
    if (circle) {
        const circumference = 345;
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }
}

async function loadStats() {
    try {
        const response = await fetch('/graphql/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: '{ stats }' })
        });
        const result = await response.json();
        if (result.data && result.data.stats) {
            const s = result.data.stats;
            const container = document.getElementById('statsGrid');
            const publicPercent = s.total_models > 0 ? Math.round((s.public_models / s.total_models) * 100) : 0;
            const privatePercent = s.total_models > 0 ? Math.round((s.private_models / s.total_models) * 100) : 0;
            const glbPercent = s.total_models > 0 ? Math.round((s.models_with_glb / s.total_models) * 100) : 0;
            const storagePercent = Math.min(Math.round((s.total_storage_mb / 5000) * 100), 100);

            container.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-number">${s.total_users.toLocaleString()}</div><div class="stat-label">Total Users</div></div>
                    <div class="stat-card"><div class="stat-number">${s.total_models.toLocaleString()}</div><div class="stat-label">Total Models</div></div>
                    <div class="stat-card"><div class="stat-number">${s.public_models.toLocaleString()}</div><div class="stat-label">Public Models</div></div>
                    <div class="stat-card"><div class="stat-number">${s.private_models.toLocaleString()}</div><div class="stat-label">Private Models</div></div>
                </div>
                <div class="stats-circular">
                    <div class="circular-card"><div class="progress-circle"><svg><circle class="bg-circle" cx="60" cy="60" r="55"></circle><circle id="publicProgress" class="progress-fill" cx="60" cy="60" r="55" stroke-dasharray="345" stroke-dashoffset="345"></circle></svg><div class="progress-percent">${publicPercent}%</div></div><div class="circular-label">Public Models</div></div>
                    <div class="circular-card"><div class="progress-circle"><svg><circle class="bg-circle" cx="60" cy="60" r="55"></circle><circle id="privateProgress" class="progress-fill" cx="60" cy="60" r="55" stroke-dasharray="345" stroke-dashoffset="345"></circle></svg><div class="progress-percent">${privatePercent}%</div></div><div class="circular-label">Private Models</div></div>
                    <div class="circular-card"><div class="progress-circle"><svg><circle class="bg-circle" cx="60" cy="60" r="55"></circle><circle id="glbProgress" class="progress-fill" cx="60" cy="60" r="55" stroke-dasharray="345" stroke-dashoffset="345"></circle></svg><div class="progress-percent">${glbPercent}%</div></div><div class="circular-label">Models with GLB</div></div>
                    <div class="circular-card"><div class="progress-circle"><svg><circle class="bg-circle" cx="60" cy="60" r="55"></circle><circle id="storageProgress" class="progress-fill" cx="60" cy="60" r="55" stroke-dasharray="345" stroke-dashoffset="345"></circle></svg><div class="progress-percent">${storagePercent}%</div></div><div class="circular-label">Storage Used (of 5GB)</div></div>
                </div>
                <div class="stats-row">
                    <div class="stats-icon-card"><div class="stats-icon"><i class="fas fa-database"></i></div><div class="stats-icon-info"><div class="stats-icon-number">${s.total_storage_mb} MB</div><div class="stats-icon-label">Total Storage Used</div></div></div>
                    <div class="stats-icon-card"><div class="stats-icon"><i class="fas fa-file-export"></i></div><div class="stats-icon-info"><div class="stats-icon-number">${s.models_with_glb}</div><div class="stats-icon-label">Models with GLB Export</div></div></div>
                    <div class="stats-icon-card"><div class="stats-icon"><i class="fas fa-user-plus"></i></div><div class="stats-icon-info"><div class="stats-icon-number">${s.users_joined_today}</div><div class="stats-icon-label">New Users Today</div></div></div>
                    <div class="stats-icon-card"><div class="stats-icon"><i class="fas fa-cube"></i></div><div class="stats-icon-info"><div class="stats-icon-number">${s.models_created_today}</div><div class="stats-icon-label">New Models Today</div></div></div>
                </div>
            `;
            setTimeout(() => {
                updateCircularProgress(publicPercent, 'publicProgress');
                updateCircularProgress(privatePercent, 'privateProgress');
                updateCircularProgress(glbPercent, 'glbProgress');
                updateCircularProgress(storagePercent, 'storageProgress');
            }, 100);
        } else if (result.errors) {
            console.error('GraphQL errors:', result.errors);
            document.getElementById('statsGrid').innerHTML = '<p class="error" style="color:#ef4444; text-align:center; padding:40px;">Error loading statistics: ' + result.errors[0].message + '</p>';
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        document.getElementById('statsGrid').innerHTML = '<p class="error" style="color:#ef4444; text-align:center; padding:40px;">Network error loading statistics</p>';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== EVENT LISTENERS ====================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        if (btn.dataset.tab === 'users') loadUsers();
        if (btn.dataset.tab === 'models') loadModels();
        if (btn.dataset.tab === 'stats') loadStats();
    });
});

document.getElementById('searchUsersBtn').addEventListener('click', () => {
    currentUserSearch = document.getElementById('userSearch').value;
    loadUsers();
});

document.getElementById('searchModelsBtn').addEventListener('click', () => {
    currentModelSearch = document.getElementById('modelSearch').value;
    loadModels();
});

document.getElementById('createUserBtn').addEventListener('click', () => {
    editingUserId = null;
    document.getElementById('modalTitle').innerText = 'Create User';
    document.getElementById('modalUsername').value = '';
    document.getElementById('modalEmail').value = '';
    document.getElementById('modalPassword').value = '';
    document.getElementById('modalIsAdmin').checked = false;
    document.getElementById('userModal').style.display = 'flex';
});

document.getElementById('saveUserBtn').addEventListener('click', saveUser);
document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('userModal').style.display = 'none';
    editingUserId = null;
});

// Load initial data
loadUsers();
loadModels();
loadStats();