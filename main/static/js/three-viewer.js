
class ThreeViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.modelManager = null;
        this.modelEditor = null;
        this.initialCameraPositionSet = false;
    this.firstRenderDone = false;
        this.elementCreator = null;
        this.multiSelectMode = false;
        this.loadedFromServer = false;
        this.dbName = 'ThreeViewerDB';
        this.dbVersion = 1;
        this.storeName = 'models';
        this.db = null;
        this.isIndexedDBSupported = 'indexedDB' in window;
        this.stats = {
            buildings: 0,
            triangles: 0,
            vertices: 0,
            fps: 60
        };
        this.raycaster = new THREE.Raycaster();
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.externalModels = new THREE.Group();
        this.historyManager = new HistoryManager(this, 100);
        this.modelLoaders = {};
        
        this.cameraMoveSpeed = 300;
        this.fastMoveSpeed = 700;
        this.isMoving = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            up: false,
            down: false,
            rotateLeft: false,
            rotateRight: false
        };
        this.keys = {};
        
        this.init();
        this.initModelLoaders();
        this.scene.add(this.externalModels);
        this.setupUndoRedoListeners();
    }

 async init() {
    this.loadedFromServer = false;
    
    const urlFileId = this.getFileIdFromURL();
    const storedFileId = this.loadCurrentFileId();
    
    if (urlFileId) {
        this.setCurrentFileId(urlFileId);
    } else if (storedFileId) {
        this.setCurrentFileId(storedFileId);
    }
    
    const canvas = document.getElementById('three-canvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }

    this.renderer = new THREE.WebGLRenderer({ 
        canvas, 
        antialias: true,
        powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    
   this.camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100000);
    this.camera.position.set(0, 2000, 2000); 
    
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    
    this.clock = new THREE.Clock();

    
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.directionalLight.position.set(1000, 2000, 4000);
    this.directionalLight.castShadow = false;
    this.scene.add(this.directionalLight);
    this.scene.add(new THREE.AmbientLight(0x404040, 2.0));

    
    this.gridHelper = new THREE.GridHelper(50000, 50, 0x334155, 0x1e293b);
    this.scene.add(this.gridHelper);

    
    this.externalModels = new THREE.Group();
    this.scene.add(this.externalModels);

    this.modelManager = new ModelManager(this.scene, this);
    
    if(this.modelManager.buildings) {
        this.modelManager.buildings.visible = false;
        this.modelManager.buildings.clear();
    }

    
    this.modelEditor = new ModelEditor(this.scene, this.modelManager, this, this.renderer, this.camera);
    
    this.elementCreator = new ElementCreator(this.scene, this.modelManager, this.renderer, this.camera);
    this.elementCreator.viewer = this;

    this.setupEventListeners();
    
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    this.setupKeyboardControls();

    
    await this.initIndexedDB();
    
    
    this.setupAutoSave();
    
    
    this.animate();
    
    
    const cacheLoaded = await this.loadFromLocalCache();
    
    
    if (!cacheLoaded) {
        
        try {
            await this.loadBuildingData();
            this.loadedFromServer = true;
            
        } catch (e) {
            console.error('Error loading loadBuildingData:', e);
            this.loadedFromServer = false;
            
            
            this.modelManager.createDemoBuildings();
        }
    } else {
        
    }
    
    if (this.modelManager && typeof this.modelManager.removeDuplicates === 'function') {
        this.scene.updateMatrixWorld(true);
        this.modelManager.removeDuplicates();
    } else {
        console.warn('The removeDuplicates function was not found in ModelManager');
    }

    if (this.modelManager.buildings) {
        this.modelManager.buildings.visible = true;
        
            this.centerCameraOnBuildings();
            
                this.hideLoading();

    }

    setTimeout(() => {
        this.repairAllMorphTargets();
    }, 10000);
}
    
initModelLoaders() {
    if (typeof THREE.GLTFLoader !== 'undefined') {
        try {
            this.modelLoaders.gltf = new THREE.GLTFLoader();
            this.modelLoaders.glb = new THREE.GLTFLoader();
            
            this.modelLoaders.gbl = new THREE.GLTFLoader();
            
        } catch (error) {
            console.error('Error initializing GLTFLoader:', error);
        }
    } else {
        console.warn(' GLTFLoader is not available');
    }
    
    
    if (typeof THREE.OBJLoader !== 'undefined') {
        try {
            this.modelLoaders.obj = new THREE.OBJLoader();
            
        } catch (error) {
            console.error(' Error initializing OBJLoader:', error);
        }
    } else {
        console.warn('OBJLoader is not available');
    }
    
    if (typeof THREE.FBXLoader !== 'undefined') {
        try {
            this.modelLoaders.fbx = new THREE.FBXLoader();
            
        } catch (error) {
            console.error('Error initializing FBXLoader:', error);
        }
    } else {
        console.warn('FBXLoader is not available');
    }
    
    if (typeof THREE.ThreeMFLoader !== 'undefined') {
        try {
            this.modelLoaders['3mf'] = new THREE.ThreeMFLoader();
            
        } catch (error) {
            console.error('Error initializing ThreeMFLoader:', error);
        }
    } else {
        console.warn(' ThreeMFLoader is not available');
    }
    
    
    if (typeof THREE.STLLoader !== 'undefined') {
        try {
            this.modelLoaders.stl = new THREE.STLLoader();
            
        } catch (error) {
            console.error('Error initializing STLLoader:', error);
        }
    } else {
        console.warn('STLLoader is not available');
    }
    
    
    
    this.checkAvailableLoaders();
}

getAlternativeFormatSuggestions(originalExtension) {
    const suggestions = {
        'obj': ['GLB', 'GLTF', 'GBL', 'FBX', 'STL'],
        'fbx': ['GLB', 'GLTF', 'GBL', 'OBJ'],
        'stl': ['GLB', 'GLTF', 'GBL', 'OBJ'],
        '3mf': ['GLB', 'GLTF', 'GBL'],
        'dae': ['GLB', 'GLTF', 'GBL', 'OBJ'],
        'ply': ['GLB', 'GLTF', 'GBL', 'OBJ'],
        'gbl': ['GLB', 'GLTF'] 
    };
    
    return suggestions[originalExtension] || ['GLB', 'GLTF', 'GBL'];
}
    
    setupKeyboardControls() {
        
        document.addEventListener('keydown', (event) => {
            
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }
            
            switch(event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.isMoving.forward = true;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.isMoving.backward = true;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.isMoving.left = true;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.isMoving.right = true;
                    break;
                case 'KeyQ':
                case 'PageUp':
                    this.isMoving.up = true;
                    break;
                case 'KeyE':
                case 'PageDown':
                    this.isMoving.down = true;
                    break;
                
                case 'KeyZ':
                    this.isMoving.rotateLeft = true;
                    break;
                case 'KeyC':
                    this.isMoving.rotateRight = true;
                    break;
                case 'KeyR':
                    
                    this.resetCameraPosition();
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    
                    this.cameraMoveSpeed = this.fastMoveSpeed;
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch(event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.isMoving.forward = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.isMoving.backward = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.isMoving.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.isMoving.right = false;
                    break;
                case 'KeyQ':
                case 'PageUp':
                    this.isMoving.up = false;
                    break;
                case 'KeyE':
                case 'PageDown':
                    this.isMoving.down = false;
                    break;
                
                case 'KeyZ':
                    this.isMoving.rotateLeft = false;
                    break;
                case 'KeyC':
                    this.isMoving.rotateRight = false;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.cameraMoveSpeed = 300;
                    break;
            }
        });

        
        const canvas = document.getElementById('three-canvas');
        if (canvas) {
            canvas.setAttribute('tabindex', '0');
            canvas.style.outline = 'none';
            canvas.addEventListener('click', () => {
                canvas.focus();
                
            });
            
            
            setTimeout(() => {
                canvas.focus();
            }, 1000);
        }

        
    }

    
    updateCameraMovement(deltaTime) {
        if (!this.camera || !this.controls) return;

        const moveDistance = this.cameraMoveSpeed * deltaTime;
        const rotateSpeed = 1.5 * deltaTime; 
        
        
        const originalPosition = this.camera.position.clone();
        const originalRotation = this.camera.rotation.clone();

        
        if (this.isMoving.forward) {
            this.camera.translateZ(-moveDistance);
        }
        if (this.isMoving.backward) {
            this.camera.translateZ(moveDistance);
        }

        
        if (this.isMoving.left) {
            this.camera.translateX(-moveDistance);
        }
        if (this.isMoving.right) {
            this.camera.translateX(moveDistance);
        }

        
        if (this.isMoving.up) {
            this.camera.position.y += moveDistance;
        }
        if (this.isMoving.down) {
            this.camera.position.y -= moveDistance;
        }

        
        if (this.isMoving.rotateLeft || this.isMoving.rotateRight) {
            
            this.controls.enabled = false;
            
            
            const rotationAngle = (this.isMoving.rotateLeft ? rotateSpeed : -rotateSpeed);
            this.camera.rotation.y += rotationAngle;
            
            
            setTimeout(() => {
                this.controls.enabled = true;
            }, 50);
        }

        
        const positionChanged = !this.camera.position.equals(originalPosition);
        if (positionChanged) {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            this.controls.target.copy(this.camera.position).add(direction.multiplyScalar(50));
        }
    }

    
    resetCameraPosition() {
        if (this.modelManager.buildings.children.length > 0) {
            this.centerCameraOnBuildings();
        } else {
            
            this.camera.position.set(0, -2000, 2000);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
        this.showNotification(' The camera position has been reset');
        
    }

setupEventListeners() {
    let exportInProgress = false;

    
    const handleExport = async () => {
        if (exportInProgress) {
            
            this.showNotification(' Export already in progress...', false);
            return;
        }
        
        exportInProgress = true;
        try {
            
            this.exportGLBOptimized();
        } catch (error) {
            console.error(' Error during export:', error);
            this.showNotification(' Error during export!', true);
        } finally {
            exportInProgress = false;
        }
    };

    const resetViewBtn = document.getElementById('resetView');
    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', () => {
            this.resetCameraPosition();
        });
    }

    const toggleGridBtn = document.getElementById('toggleGrid');
    if (toggleGridBtn) {
        toggleGridBtn.addEventListener('click', () => {
            this.gridHelper.visible = !this.gridHelper.visible;
            this.showNotification(`Grid ${this.gridHelper.visible ? 'activate' : 'disabled'}`);
        });
    }

    
    const exportGLBBtn = document.getElementById('exportGLB');
    if (exportGLBBtn) {
        exportGLBBtn.addEventListener('click', () => {
            handleExport();
        });
    }

    const headerExportBtn = document.getElementById('exportBtn');
    if (headerExportBtn) {
        headerExportBtn.addEventListener('click', () => {
            handleExport();
        });
    }

    const screenshotBtn = document.getElementById('screenshot');
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', () => {
            this.takeScreenshot();
        });
    }

    
    const import3DModelBtn = document.getElementById('import3DModel');
    if (import3DModelBtn) {
        import3DModelBtn.addEventListener('click', () => {
            this.openModelImportDialog();
        });
    }
    

    
    const headerImportBtn = document.getElementById('importBtn');
    if (headerImportBtn) {
        headerImportBtn.addEventListener('click', () => {
            this.openModelImportDialog();
        });
    }
    
    
    const saveProjectBtn = document.getElementById('saveProject');
    if (saveProjectBtn) {
        saveProjectBtn.addEventListener('click', () => {
            this.saveProject();
        });
    }
    
    
    const importModelBtn = document.getElementById('import3DModelBtn');
    if (importModelBtn) {
        importModelBtn.addEventListener('click', () => {
            this.openModelImportDialog();
        });
    }
    
    this.setupKeyboardShortcuts();


    
    this.modelEditor.setupEventListeners();

    
    window.addEventListener('beforeunload', (e) => {
        if (!this.isSaving) {
            this.isSaving = true;
            const token = localStorage.getItem('auth_token');
            if (!token) {
                
                this.saveToLocalCache().catch(() => {});
            }
        }
    });
}

setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        const key = event.key.toLowerCase();
        const isCtrl = event.ctrlKey || event.metaKey;
        const isShift = event.shiftKey;
        const isAlt = event.altKey;
        
        
        if (key === 'm' && !isCtrl && !isShift && !isAlt) {
            event.preventDefault();
            this.toggleMultiSelectMode();
        }
        
        
        if (isCtrl) {
            switch(key) {
                case 'c':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.copySelectedElements();
                    }
                    break;
                    
                case 'v':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.pasteElements();
                    }
                    break;
                    
                case 'd':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.duplicateSelectedElements();
                    }
                    break;
                    
                case 'u': 
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.mergeSelectedElements === 'function') {
                        this.modelManager.mergeSelectedElements();
                    } else {
                        console.warn('mergeSelectedElements is not an available function');
                        this.showNotification('The merge function is not available', true);
                    }
                    break;
                    
                case 's':
                    event.preventDefault();
                    if (this.saveProject) {
                        this.saveProject();
                    }
                    break;
                    
                case 'z':
                    event.preventDefault();
                    if (isShift) {
                        
                        if (this.historyManager) {
                            this.historyManager.redo();
                        }
                    } else {
                        
                        if (this.historyManager) {
                            this.historyManager.undo();
                        }
                    }
                    break;
                    
                case 'y':
                    event.preventDefault();
                    if (this.historyManager) {
                        this.historyManager.redo();
                    }
                    break;
                    
                case 'a':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.selectAllElements();
                    }
                    break;
                    
                case 'e':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.deselectAllElements();
                        if (this.modelEditor) {
                            this.modelEditor.hideElementInfo();
                            this.modelEditor.deactivateTransformControls();
                        }
                    }
                    break;
                    
                case 'i':
                    event.preventDefault();
                    this.openModelImportDialog();
                    break;
                    
                case 'g':
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.exportGLBOptimized === 'function') {
                        this.modelManager.exportGLBOptimized();
                    }
                    break;
                    
                case 'h':
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.repairAllMorphTargets === 'function') {
                        this.modelManager.repairAllMorphTargets();
                    }
                    break;
                    
                case 'o':
                    event.preventDefault();
                    this.resetCameraPosition();
                    break;
                    
                case 'p':
                    event.preventDefault();
                    this.takeScreenshot();
                    break;
                    
                case 't':
                    event.preventDefault();
                    if (this.modelEditor) {
                        const transformMode = this.modelEditor.transformMode;
                        const modes = ['translate', 'rotate', 'scale'];
                        const currentIndex = modes.indexOf(transformMode);
                        const nextIndex = (currentIndex + 1) % modes.length;
                        this.modelEditor.setTransformMode(modes[nextIndex]);
                    }
                    break;
                    
                case 'r':
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.resetSelectedElements === 'function') {
                        this.modelManager.resetSelectedElements();
                    }
                    break;
                    
                case 'f':
                    event.preventDefault();
                    if (this.modelManager && this.modelManager.buildings.children.length > 0) {
                        this.centerCameraOnBuildings();
                    }
                    break;
                    
                case '1':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.selectElementsByType('building');
                    }
                    break;
                    
                case '2':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.selectElementsByType('highway');
                    }
                    break;
                    
                case '3':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.selectElementsByType('water');
                    }
                    break;
                    
                case '4':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.selectElementsByType('natural');
                    }
                    break;
                    
                case '5':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.selectElementsByType('landuse');
                    }
                    break;
                    
                case '6':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.selectElementsByType('other');
                    }
                    break;
                    
                
                case 'k': 
                    event.preventDefault();
                    this.applySelectedColor();
                    break;
                    
                case 'x': 
                    event.preventDefault();
                    this.applySelectedTexture();
                    break;
                    
                case 'w': 
                    if (isCtrl) {
                        event.preventDefault();
                        this.changeSelectedWidth();
                    }
                    break;
                    
                case 'h': 
                    if (isCtrl && !isShift) {
                        event.preventDefault();
                        this.changeSelectedHeight();
                    }
                    break;
                    
                case 'b': 
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.resetSelectedElements === 'function') {
                        this.modelManager.resetSelectedElements();
                    }
                    break;
            }
        }
        
        
        if (isCtrl && isShift) {
            switch(key) {
                case 'u':
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.separateSelectedMergedElements === 'function') {
                        this.modelManager.separateSelectedMergedElements();
                    } else {
                        this.showNotification('Funcția de separare nu este disponibilă', true);
                    }
                    break;
                    
                case 's':
                    event.preventDefault();
                    if (this.exportAndSaveToServer) {
                        this.exportAndSaveToServer();
                    }
                    break;
                    
                case 'c':
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.clearAll === 'function') {
                        if (confirm('Sigur vrei să ștergi toate elementele?')) {
                            this.modelManager.clearAll();
                            this.showNotification('Toate elementele au fost șterse');
                        }
                    }
                    break;
                    
                case 'z':
                    event.preventDefault();
                    if (this.historyManager) {
                        this.historyManager.clearHistory();
                        this.showNotification('Istoricul a fost curățat');
                    }
                    break;
                    
                case 'k': 
                    event.preventDefault();
                    this.openColorPicker();
                    break;
                    
                case 'x': 
                    event.preventDefault();
                    this.openTexturePanel();
                    break;
                    
                case 'w': 
                    event.preventDefault();
                    this.openWidthDialog();
                    break;
                    
                case 'h': 
                    event.preventDefault();
                    this.openHeightDialog();
                    break;
            }
        }
        
        
        if (isAlt && !isCtrl) {
            switch(key) {
                case 'c':
                    event.preventDefault();
                    this.applySelectedColor();
                    break;
                    
                case 't':
                    event.preventDefault();
                    this.applySelectedTexture();
                    break;
                    
                case 'w':
                    event.preventDefault();
                    this.changeSelectedWidth();
                    break;
                    
                case 'h':
                    event.preventDefault();
                    this.changeSelectedHeight();
                    break;
                    
                case 'r':
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.resetSelectedElements === 'function') {
                        this.modelManager.resetSelectedElements();
                    }
                    break;
            }
        }
        
        
        if (!isCtrl && !isAlt) {
            switch(key) {
                case 'delete':
                case 'backspace':
                    event.preventDefault();
                    if (this.modelManager) {
                        this.modelManager.deleteSelectedElements();
                    }
                    break;
                    
                case 'escape':
                    if (this.modelManager) {
                        this.modelManager.deselectAllElements();
                        if (this.modelEditor) {
                            this.modelEditor.hideElementInfo();
                            this.modelEditor.deactivateTransformControls();
                        }
                    }
                    break;
                    
                case 'tab':
                    event.preventDefault();
                    if (this.modelEditor && this.modelEditor.transformControls) {
                        const isVisible = this.modelEditor.transformControls.visible;
                        if (isVisible) {
                            this.modelEditor.deactivateTransformControls();
                        } else {
                            const selectedElements = this.modelManager.getSelectedElements();
                            if (selectedElements.length === 1) {
                                this.modelEditor.activateTransformControls(selectedElements[0]);
                            }
                        }
                    }
                    break;
                    
                case ' ':
                    event.preventDefault();
                    if (this.gridHelper) {
                        this.gridHelper.visible = !this.gridHelper.visible;
                        this.showNotification(`Grid ${this.gridHelper.visible ? 'activat' : 'dezactivat'}`);
                    }
                    break;
                    
                    
                case 'f2':
                    event.preventDefault();
                    if (this.modelManager && typeof this.modelManager.reloadTextures === 'function') {
                        this.modelManager.reloadTextures();
                    }
                    break;
                    
                case 'f5':
                    event.preventDefault();
                    if (this.modelManager && this.modelManager.buildings) {
                        const count = this.modelManager.removeDuplicates();
                        this.showNotification(`Duplicates have been removed: ${count} unique elements remaining`);
                    }
                    break;
                    
                
                case '[':
                    event.preventDefault();
                    this.decreaseWidth();
                    break;
                    
                case ']':
                    event.preventDefault();
                    this.increaseWidth();
                    break;
                    
                case '-':
                    event.preventDefault();
                    this.decreaseHeight();
                    break;
                    
                case '=':
                case '+':
                    event.preventDefault();
                    this.increaseHeight();
                    break;
            }
        }
        
        
        if (!isCtrl && !isShift && !isAlt && key >= '1' && key <= '6') {
            event.preventDefault();
            const typeMap = {
                '1': 'building',
                '2': 'highway',
                '3': 'water',
                '4': 'natural',
                '5': 'landuse',
                '6': 'other'
            };
            
            if (this.modelManager) {
                this.modelManager.selectElementsByType(typeMap[key]);
            }
        }
        
        
        if (!isCtrl && !isAlt) {
            switch(key) {
                case 'w':
                    if (!isCtrl) { 
                        this.isMoving.forward = true;
                    }
                    break;
                case 's':
                    this.isMoving.backward = true;
                    break;
                case 'a':
                    this.isMoving.left = true;
                    break;
                case 'd':
                    this.isMoving.right = true;
                    break;
                case 'q':
                case 'pageup':
                    this.isMoving.up = true;
                    break;
                case 'e':
                case 'pagedown':
                    this.isMoving.down = true;
                    break;
                case 'r':
                    if (!isShift) {
                        this.resetCameraPosition();
                    }
                    break;
                case 'shift':
                    this.cameraMoveSpeed = this.fastMoveSpeed;
                    break;
            }
        }
    });

    
    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        const isCtrl = event.ctrlKey || event.metaKey;
        const isShift = event.shiftKey;
        
        if (!isCtrl && !event.altKey) {
            switch(key) {
                case 'w':
                case 'arrowup':
                    this.isMoving.forward = false;
                    break;
                case 's':
                case 'arrowdown':
                    this.isMoving.backward = false;
                    break;
                case 'a':
                case 'arrowleft':
                    this.isMoving.left = false;
                    break;
                case 'd':
                case 'arrowright':
                    this.isMoving.right = false;
                    break;
                case 'q':
                case 'pageup':
                    this.isMoving.up = false;
                    break;
                case 'e':
                case 'pagedown':
                    this.isMoving.down = false;
                    break;
                case 'shift':
                    this.cameraMoveSpeed = 300;
                    break;
            }
        }
    });
}


applySelectedColor() {
    const colorInput = document.getElementById('elementColor');
    if (!colorInput) {
        this.showNotification('No color field available', true);
        return;
    }
    
    const newColor = colorInput.value;
    if (this.modelManager && typeof this.modelManager.changeSelectedElementsColor === 'function') {
        const count = this.modelManager.changeSelectedElementsColor(newColor);
        this.showNotification(`Color applied to ${count} selected elements`);
    }
}

applySelectedTexture() {
    if (this.modelEditor && this.modelEditor.selectedTexture) {
        const faceTypeSelect = document.getElementById('textureFace');
        const faceType = faceTypeSelect ? faceTypeSelect.value : 'all';
        
        this.modelManager.applyTextureToSelected(this.modelEditor.selectedTexture.url, faceType)
            .then(count => {
                if (count > 0) {
                    this.showNotification(`Texture applied to ${count} elements`);
                }
            })
            .catch(error => {
                console.error('Texture application error:', error);
                this.showNotification('Error applying texture', true);
            });
    } else {
        this.showNotification('No texture selected', true);
    }
}

changeSelectedWidth() {
    const widthInput = document.getElementById('elementWidth');
    if (!widthInput) {
        this.openWidthDialog();
        return;
    }
    
    const newWidth = parseFloat(widthInput.value);
    if (isNaN(newWidth) || newWidth <= 0) {
        this.showNotification('Width must be a number greater than 0', true);
        return;
    }
    
    if (this.modelManager && typeof this.modelManager.changeSelectedElementsWidth === 'function') {
        const count = this.modelManager.changeSelectedElementsWidth(newWidth);
        if (count > 0) {
            this.showNotification(`Width changed for ${count} elements`);
        }
    }
}

changeSelectedHeight() {
    const heightInput = document.getElementById('elementHeight');
    if (!heightInput) {
        this.openHeightDialog();
        return;
    }
    
    const newHeight = parseFloat(heightInput.value);
    if (isNaN(newHeight)) {
        this.showNotification('Height must be a valid number', true);
        return;
    }
    
    if (this.modelManager && typeof this.modelManager.changeSelectedElementsHeight === 'function') {
        const count = this.modelManager.changeSelectedElementsHeight(newHeight);
        if (count > 0) {
            this.showNotification(`Height adjusted for ${count} elements`);
        }
    }
}

openColorPicker() {
    const colorInput = document.getElementById('elementColor');
    if (colorInput) {
        colorInput.click();
    } else {
        this.showNotification('The color picker is not available', true);
    }
}

openTexturePanel() {
    const texturePanel = document.getElementById('texturePanel');
    if (texturePanel) {
        texturePanel.style.display = 'block';
        this.showNotification('Texture panel opened');
    }
}

openWidthDialog() {
    const selectedElements = this.modelManager.getSelectedElements();
    if (selectedElements.length === 0) {
        this.showNotification('Select items first', true);
        return;
    }
    
    const currentWidth = selectedElements[0].userData.originalWidth || 10;
    const newWidth = prompt(`Enter the new width`, currentWidth);
    
    if (newWidth !== null) {
        const widthValue = parseFloat(newWidth);
        if (!isNaN(widthValue) && widthValue > 0) {
            document.getElementById('elementWidth').value = widthValue;
            this.changeSelectedWidth();
        } else {
            this.showNotification('Invalid width', true);
        }
    }
}

openHeightDialog() {
    const selectedElements = this.modelManager.getSelectedElements();
    if (selectedElements.length === 0) {
        this.showNotification('Select items first', true);
        return;
    }
    
    const currentHeight = selectedElements[0].userData.originalHeight || 10;
    const newHeight = prompt(`Enter the new height`, currentHeight);
    
    if (newHeight !== null) {
        const heightValue = parseFloat(newHeight);
        if (!isNaN(heightValue)) {
            document.getElementById('elementHeight').value = heightValue;
            this.changeSelectedHeight();
        } else {
            this.showNotification('Invalid height', true);
        }
    }
}

decreaseWidth() {
    const widthInput = document.getElementById('elementWidth');
    if (widthInput) {
        const currentWidth = parseFloat(widthInput.value) || 10;
        const newWidth = Math.max(0.1, currentWidth - 1);
        widthInput.value = newWidth;
        this.changeSelectedWidth();
    }
}

increaseWidth() {
    const widthInput = document.getElementById('elementWidth');
    if (widthInput) {
        const currentWidth = parseFloat(widthInput.value) || 10;
        const newWidth = currentWidth + 1;
        widthInput.value = newWidth;
        this.changeSelectedWidth();
    }
}

decreaseHeight() {
    const heightInput = document.getElementById('elementHeight');
    if (heightInput) {
        const currentHeight = parseFloat(heightInput.value) || 10;
        const newHeight = currentHeight - 1;
        heightInput.value = newHeight;
        this.changeSelectedHeight();
    }
}

increaseHeight() {
    const heightInput = document.getElementById('elementHeight');
    if (heightInput) {
        const currentHeight = parseFloat(heightInput.value) || 10;
        const newHeight = currentHeight + 1;
        heightInput.value = newHeight;
        this.changeSelectedHeight();
    }
}

 
    hideElements(elements) {
        if (this.historyManager) {
            this.historyManager.hideElements(elements);
        }
    }

    
    showElements(elementIds) {
        if (this.historyManager) {
            return this.historyManager.showElements(elementIds);
        }
        return 0;
    }


async loadBuildingData() {
    try {
        const pathParts = window.location.pathname.split('/');
        const fileId = pathParts[pathParts.length - 2];
        
        if (!fileId || fileId === 'view-3d') {
            this.loadedFromServer = false;
            throw new Error('File ID was not found in the URL');
        }
        
        this.loadedFromServer = true;
        
        await this.fetchBuildingData(fileId);
        
        
        setTimeout(async () => {
            try {
                await this.saveToLocalCache();
                
            } catch (cacheError) {
                console.warn('Could not save cache after loading from the server:', cacheError);
            }
        }, 2000); 
        
    } catch (error) {
        console.error('Error retrieving file_id:', error);
        this.loadedFromServer = false;
        throw error;
    }
}


   
async fetchBuildingData(fileId) {
    try {
        this.setCurrentFileId(fileId);
        
        const infoResponse = await fetch(`/api/data/${fileId}/`);
        if (!infoResponse.ok) {
            throw new Error(`HTTP error while fetching info: ${infoResponse.status}`);
        }
        
        const infoResult = await infoResponse.json();
        
        if (infoResult.success) {
            if (infoResult.file_type === 'glb') {
                const downloadUrl = infoResult.download_url || `/api/glb-file/${fileId}/`;
                await this.loadGLBFromURL(downloadUrl, fileId);
                
            } else {
                
                const dataResponse = await fetch(infoResult.download_url || `/api/download/${fileId}.json`);
                    
                if (!dataResponse.ok) {
                    throw new Error(`HTTP error while fetching data: ${dataResponse.status}`);
                }
                
                const buildingData = await dataResponse.json();
                
                const elementCount = await this.modelManager.addBuildingsFromGeoJSON(
                    buildingData.geojson, 
                    buildingData.origin,
                    buildingData.dataType || 'building'
                );
                
                this.updateBuildingInfo(buildingData);
                this.hideLoading();
            }
        } else {
            throw new Error(infoResult.message || 'Error loading data');
        }
    } catch (error) {
        console.error('Error loading data from backend:', error);
        this.showNotification('The data could not be loaded: ' + error.message);
        this.hideLoading();
    }
}
    updateBuildingInfo(buildingData) {
        if (buildingData.building_count && document.getElementById('buildingCount')) {
            document.getElementById('buildingCount').textContent = buildingData.building_count.toLocaleString();
        }
    }

centerCameraOnBuildings() {
    
    const allObjects = [];
    
    
    if (this.modelManager && this.modelManager.buildings) {
        this.modelManager.buildings.traverse((child) => {
            if ((child.isMesh || child.isGroup) && child.visible) {
                allObjects.push(child);
            }
        });
    }
    
    if (this.externalModels) {
        this.externalModels.traverse((child) => {
            if ((child.isMesh || child.isGroup) && child.visible) {
                allObjects.push(child);
            }
        });
    }
    
    if (allObjects.length === 0) {
        
        this.setStandardCameraPosition();
        return;
    }
    
    
    const box = new THREE.Box3();
    
    
    box.setFromObject(allObjects[0]);
    
    
    for (let i = 1; i < allObjects.length; i++) {
        box.expandByObject(allObjects[i]);
    }
    
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    
    if (size.x === 0 && size.y === 0 && size.z === 0) {
        this.setStandardCameraPosition();
        return;
    }
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2));
    
    
    cameraDistance *= 1.5;
    
    
    const standardYOffset = 0.7; 
    const standardZOffset = 1.0; 
    
    
    
    this.camera.position.set(
        center.x,                    
        center.y + (cameraDistance * standardYOffset), 
        center.z + cameraDistance    
    );
    
    
    this.controls.target.set(0, 0, 0);
    
    
    
    if (!center.equals(new THREE.Vector3(0, 0, 0))) {
        
        const lookAtCenter = new THREE.Vector3(0, 0, 0);
        const directionToCenter = new THREE.Vector3().subVectors(lookAtCenter, this.camera.position).normalize();
        
        
        const adjustedDistance = cameraDistance * 1.2;
        this.camera.position.set(
            lookAtCenter.x - directionToCenter.x * adjustedDistance,
            lookAtCenter.y + (cameraDistance * standardYOffset),
            lookAtCenter.z - directionToCenter.z * adjustedDistance
        );
    }
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    
    
    
    
    
}
setStandardCameraPosition() {
    
    
    
    
    this.camera.position.set(0, 2000, 2000);
    
    
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    
    
}
    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
            
        }
    }

    showNotification(message, isError = false) {
        const oldNotifications = document.querySelectorAll('.three-viewer-notification');
        oldNotifications.forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = 'three-viewer-notification' + (isError ? ' error' : '');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${isError ? '#ef4444' : '#10b981'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.375rem;
            z-index: 10000;
            font-size: 0.875rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
            max-width: 300px;
            word-wrap: break-word;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }

handleResize() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width || canvas.height !== height) {
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        
        this.renderer.render(this.scene, this.camera);
    }
}

    updateFPS() {
        const now = performance.now();
        const delta = now - this.lastTime;
        
        if (delta >= 1000) {
            this.stats.fps = Math.round((this.frameCount * 1000) / delta);
            this.frameCount = 0;
            this.lastTime = now;
            
            if (document.getElementById('fps')) {
                document.getElementById('fps').textContent = this.stats.fps;
            }
        }
        
        this.frameCount++;
    }

animate() {
    requestAnimationFrame(() => this.animate());
    
    
    const canvas = this.renderer.domElement;
    if (!canvas || canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
        return;
    }
    
    
    if (!this.initialCameraPositionSet && this.camera) {
        this.initialCameraPositionSet = true;
        
        this.camera.position.set(0, 3000, 3000);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        
    }
    
    const deltaTime = Math.min(0.1, this.clock.getDelta());
    this.updateCameraMovement(deltaTime);
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    
    if (!this.firstRenderDone) {
        this.firstRenderDone = true;
        
    }
    
    this.updateFPS();
}





async exportGLBOptimized() {
    try {
        
        const { data: glbData, count } = await this.generateGLBData();
        
        if (!glbData || glbData.byteLength === 0) {
            this.showNotification('Could not generate the GLB file', true);
            return;
        }
        
        
        const glbBlob = new Blob([glbData], { type: 'model/gltf-binary' });
        
        let cleanName = this.currentFileName || `project_${Date.now()}`;
        cleanName = cleanName.replace('.glb', '').replace('.json', '');
        const glbFilename = `${cleanName}.glb`;
        this.currentFileName = cleanName;

        
        const zip = new JSZip();
        
        
        zip.file(glbFilename, glbBlob);
        
        
        const readmeContent = `3D model exported from ELMC 3D Viewer
Data export: ${new Date().toLocaleDateString()}
Total elements: ${count}
GLB size: ${(glbBlob.size / 1024 / 1024).toFixed(2)} MB

This model was created with ELMC 3D Viewer.`;
      
        zip.file("README.txt", readmeContent);
        
        
        const projectStats = this.getDetailedProjectStats();
        zip.file("metadata.json", JSON.stringify(projectStats, null, 2));
        
        
        const zipBlob = await zip.generateAsync({type: "blob"});
        
        
        if (typeof this.saveExportToServer === 'function') {
            await this.saveExportToServer(zipBlob, count);
        }

        
        const zipUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = `${cleanName}.zip`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(zipUrl);
        }, 1000);

        this.showNotification(`Export ZIP: ${count} objects | ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`);
        
    } catch (error) {
        console.error('Error during export:', error);
        this.showNotification('Error during export!', true);
    }
}

async saveExportToServer(zipBlob, elementCount) {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            return;
        }

        let currentFileId = window.currentFileId;
        let isNewProject = false;

        if (!currentFileId || currentFileId.startsWith('temp_') || currentFileId.startsWith('export_')) {
            currentFileId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            window.currentFileId = currentFileId;
            isNewProject = true;
        }

        
        const thumbnailData = await this.captureInitialCameraThumbnail();
        
        if (!thumbnailData) {
            console.warn('The thumbnail could not be captured from the initial position');
        }

        const formData = new FormData();
        
        
        const fileName = `${currentFileId}.zip`;
        formData.append('zip_file', zipBlob, fileName);
        formData.append('file_id', currentFileId);
        formData.append('export_time', new Date().toISOString());
        formData.append('file_name', fileName);
        formData.append('element_count', elementCount);

        
        if (thumbnailData) {
            formData.append('thumbnail_data', thumbnailData.thumbnail_data);
            formData.append('camera_position', JSON.stringify(thumbnailData.camera_position));
            formData.append('thumbnail_dimensions', JSON.stringify(thumbnailData.dimensions));
        }

        
        const projectStats = this.getDetailedProjectStats();
        
        formData.append('building_count', projectStats.counts.buildings);
        formData.append('highway_count', projectStats.counts.highways);
        formData.append('water_count', projectStats.counts.water);
        formData.append('natural_count', projectStats.counts.natural);
        formData.append('landuse_count', projectStats.counts.landuse);
        formData.append('other_count', projectStats.counts.other);
        
        formData.append('project_stats', JSON.stringify(projectStats));
        
        formData.append('file_size_bytes', zipBlob.size);
        formData.append('file_size_mb', (zipBlob.size / (1024 * 1024)).toFixed(2));

        const projectName = document.getElementById('project-name')?.value || `Model ${currentFileId}`;
        formData.append('project_name', projectName);

        const response = await fetch('/api/save-export/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-CSRFToken': this.getCSRFToken()
            },
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            let message = `Project ${isNewProject ? 'saved' : 'updated'}!`;
            message += ` ${projectStats.counts.buildings} Buildings | ${projectStats.counts.highways} Roads`;
            
            if (thumbnailData) {
                message += ' | Preview saved';
            }
            
            this.showNotification(message);
            
            if (result.user_models_count !== undefined) {
                this.updateUserModelsCount(result.user_models_count);
            }
            
            if (result.file_id) {
                window.currentFileId = result.file_id;
            }
            
        } else {
            console.warn('The export could not be saved:', result.message);
            this.showNotification(`${result.message}`, true);
        }

    } catch (error) {
        console.error('Error while saving the export:', error);
        this.showNotification('Error while saving the project to the account', true);
    }
}



async saveExportToServer(blob, elementCount) {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            return;
        }

        let currentFileId = window.currentFileId;
        let isNewProject = false;

        if (!currentFileId || currentFileId.startsWith('temp_') || currentFileId.startsWith('export_')) {
            currentFileId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            window.currentFileId = currentFileId;
            isNewProject = true;
        }

        const thumbnailData = await this.captureInitialCameraThumbnail();
        
        const formData = new FormData();
        
        const fileName = `${currentFileId}.glb`;
        formData.append('glb_file', blob, fileName);
        formData.append('file_id', currentFileId);
        formData.append('export_time', new Date().toISOString());
        formData.append('file_name', fileName);
        formData.append('element_count', elementCount);

        if (thumbnailData) {
            formData.append('thumbnail_data', thumbnailData.thumbnail_data);
            formData.append('camera_position', JSON.stringify(thumbnailData.camera_position));
            formData.append('thumbnail_dimensions', JSON.stringify(thumbnailData.dimensions));
        }

        const projectStats = this.getDetailedProjectStats();
        
        formData.append('building_count', projectStats.counts.buildings);
        formData.append('highway_count', projectStats.counts.highways);
        formData.append('water_count', projectStats.counts.water);
        formData.append('natural_count', projectStats.counts.natural);
        formData.append('landuse_count', projectStats.counts.landuse);
        formData.append('other_count', projectStats.counts.other);
        
        formData.append('project_stats', JSON.stringify(projectStats));
        
        formData.append('file_size_bytes', blob.size);
        formData.append('file_size_mb', (blob.size / (1024 * 1024)).toFixed(2));

        const projectName = document.getElementById('project-name')?.value || `Model ${currentFileId}`;
        formData.append('project_name', projectName);

        const response = await fetch('/api/save-export/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-CSRFToken': this.getCSRFToken()
            },
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            let message = `Project ${isNewProject ? 'saved' : 'updated'}!`;
            message += ` ${projectStats.counts.buildings} Buildings | ${projectStats.counts.highways} Roads`;
            
            if (thumbnailData) {
                message += ' | Preview saved';
            }
            
            this.showNotification(message);
            
            if (result.user_models_count !== undefined) {
                this.updateUserModelsCount(result.user_models_count);
            }
            
            if (result.file_id) {
                window.currentFileId = result.file_id;
            }
            
        } else {
            console.warn('Export could not be saved:', result.message);
            this.showNotification(`${result.message}`, true);
        }

    } catch (error) {
        console.error('Error saving export:', error);
        this.showNotification('Error saving project to account', true);
    }
}


getCurrentCameraPosition() {
    return {
        position: this.camera.position.toArray(),
        target: this.controls.target.toArray(),
        fov: this.camera.fov,
        aspect: this.camera.aspect,
        timestamp: new Date().toISOString()
    };
}
async captureFixedThumbnail(fileId) {
    try {
        
        
        
        const thumbnailData = await this.captureInitialCameraThumbnail();
        
        if (thumbnailData) {
            
            return thumbnailData;
        } else {
            console.warn('The thumbnail could not be captured from the fixed position');
            return null;
        }
        
    } catch (error) {
        console.error('Error in captureFixedThumbnail:', error);
        return null;
    }
}

async transmitThumbnailToServer(fileId, thumbnailData) {
    try {
        if (!thumbnailData) {
            console.warn('There is no thumbnail data to send');
            return false;
        }
        
        const token = localStorage.getItem('auth_token');
        if (!token) {
            
            return false;
        }
        
        
        
        const response = await fetch(`/api/project/${fileId}/thumbnail/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-CSRFToken': this.getCSRFToken()
            },
            body: JSON.stringify(thumbnailData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            
            return true;
        } else {
            console.warn('The thumbnail could not be saved:', result.message);
            return false;
        }
        
    } catch (error) {
        console.error('Error while sending the thumbnail:', error);
        return false;
    }
}

async autoSaveThumbnail(fileId) {
    try {
        
        
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        
        const thumbnailData = await this.captureFixedThumbnail(fileId);
        
        if (thumbnailData) {
            
            const success = await this.transmitThumbnailToServer(fileId, thumbnailData);
            
            if (success) {
                
                this.showNotification(' Preview saved automatic');
                return true;
            }
        }
        
        console.warn('The thumbnail could not be saved automatically');
        return false;
        
    } catch (error) {
        console.error('Error while automatically saving the thumbnail:', error);
        return false;
    }
}




async saveThumbnailToServer(fileId) {
    try {
        const thumbnailData = this.captureProjectThumbnail();
        if (!thumbnailData) {
            console.warn('The thumbnail could not be captured');
            return false;
        }
        
        const token = localStorage.getItem('auth_token');
        if (!token) {
            
            return false;
        }
        
        const response = await fetch(`/api/project/${fileId}/thumbnail/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-CSRFToken': this.getCSRFToken()
            },
            body: JSON.stringify(thumbnailData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            
            return true;
        } else {
            console.warn('The thumbnail could not be saved:', result.message);
            return false;
        }
        
    } catch (error) {
        console.error('Error while saving the thumbnail:', error);
        return false;
    }
}



getDetailedProjectStats() {
        let totalVertices = 0;
        let totalTriangles = 0;
        let totalElements = 0;
        
        
        let counts = {
            buildings: 0,
            highways: 0,
            water: 0,
            natural: 0,
            landuse: 0,
            other: 0
        };

        
        const processMesh = (child) => {
            if (child.isMesh && child.visible) {
                totalElements++;
                
                
                if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                    totalVertices += child.geometry.attributes.position.count;
                }
                
                
                if (child.geometry && child.geometry.index) {
                    totalTriangles += child.geometry.index.count / 3;
                } else if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                    totalTriangles += child.geometry.attributes.position.count / 3;
                }
                
                
                const type = (child.userData.type || child.userData.originalType || 'unknown').toLowerCase();
                
                if (type.includes('building') || type === 'building') {
                    counts.buildings++;
                } else if (type.includes('highway') || type.includes('road') || type.includes('way')) {
                    counts.highways++;
                } else if (type.includes('water') || type.includes('river') || type.includes('lake')) {
                    counts.water++;
                } else if (type.includes('natural') || type.includes('tree') || type.includes('forest')) {
                    counts.natural++;
                } else if (type.includes('landuse') || type.includes('grass')) {
                    counts.landuse++;
                } else {
                    counts.other++;
                }
            }
        };
        
        
        if (this.modelManager && this.modelManager.buildings) {
            this.modelManager.buildings.traverse(processMesh);
        }
        
        
        if (this.externalModels) {
            this.externalModels.traverse(processMesh);
        }
        
        
        const stats = {
            total_elements: totalElements,
            total_vertices: totalVertices,
            total_triangles: Math.round(totalTriangles),
            counts: counts, 
            bounds: this.calculateSceneBounds(),
            export_timestamp: new Date().toISOString(),
            scene_complexity: this.calculateSceneComplexity(totalVertices, totalTriangles)
        };
        return stats;
    }


calculateSceneComplexity(vertices, triangles) {
    const totalSize = vertices + triangles;
    
    if (totalSize < 10000) return 'low';
    if (totalSize < 100000) return 'medium';
    if (totalSize < 1000000) return 'high';
    return 'very_high';
}





setCurrentFileId(fileId) {
    window.currentFileId = fileId;
    
    
    
    if (fileId) {
        localStorage.setItem('current_project_id', fileId);
    }
}



downloadGLBModel(fileId) {
    window.open(`/api/glb-file/${fileId}/`, '_blank');
}





getSceneStatistics() {
    let totalVertices = 0;
    let totalTriangles = 0;
    let elementTypes = {};
    
    if (this.modelManager?.buildings) {
        this.modelManager.buildings.traverse((child) => {
            if (child.isMesh && child.visible) {
                
                if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                    totalVertices += child.geometry.attributes.position.count;
                }
                
                
                if (child.geometry && child.geometry.index) {
                    totalTriangles += child.geometry.index.count / 3;
                } else if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                    totalTriangles += child.geometry.attributes.position.count / 3;
                }
                
                
                const elementType = child.userData?.type || 'unknown';
                elementTypes[elementType] = (elementTypes[elementType] || 0) + 1;
            }
        });
    }
    
    return {
        total_elements: this.countExportableMeshes(this.scene),
        total_vertices: totalVertices,
        total_triangles: totalTriangles,
        element_types: elementTypes,
        export_timestamp: new Date().toISOString(),
        bounds: this.calculateSceneBounds()
    };
}


updateUserModelsCount(count) {
    
    const modelsCountElement = document.getElementById('user-models-count');
    if (modelsCountElement) {
        modelsCountElement.textContent = count;
    }
    
    
    const accountModelsElement = document.getElementById('account-models-count');
    if (accountModelsElement) {
        accountModelsElement.textContent = count;
    }
}


getCSRFToken() {
    const name = 'csrftoken';
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}


countExportableMeshes(scene) {
    let count = 0;
    scene.traverse((child) => {
        if (child.isMesh && child.visible) {
            count++;
        }
    });
    return count;
}

async loadJSZip() {
    return new Promise((resolve, reject) => {
        if (typeof JSZip !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => {
            this.jsZipLoaded = true;
            resolve();
        };
        script.onerror = () => {
            reject(new Error('JSZip could not be loaded'));
        };
        document.head.appendChild(script);
    });
}

async saveProjectToBackend(gltfData) {
    try {
        const projectData = {
            file_id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            project_name: `CADMAPPER_Project_${new Date().toLocaleDateString()}`,
            description: 'Project exported from the 3D viewer',
            elements_count: this.modelManager ? this.modelManager.getTotalElementCount() : 0,
            scene_data: {
                camera_position: this.camera ? this.camera.position.toArray() : [0, 0, 0],
                bounds: this.calculateSceneBounds(),
                element_types: this.getSceneElementTypes()
            },
            metadata: {
                export_time: new Date().toISOString(),
                version: '1.0.0',
                triangles: this.stats.triangles || 0,
                vertices: this.stats.vertices || 0
            }
        };
        
        const response = await fetch('/api/export-project/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(projectData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            
            return result;
        } else {
            console.warn('The project could not be saved in the backend:', result.message);
            return null;
        }
        
    } catch (error) {
        console.error('Error while saving the project:', error);
        return null;
    }
}


calculateSceneBounds() {
    const box = new THREE.Box3().setFromObject(this.scene);
    return {
        min: box.min.toArray(),
        max: box.max.toArray(),
        size: box.getSize(new THREE.Vector3()).toArray()
    };
}


getSceneElementTypes() {
    const types = {};
    
    if (this.modelManager && this.modelManager.buildings) {
        this.modelManager.buildings.traverse((child) => {
            if (child.userData && child.userData.type) {
                const type = child.userData.type;
                types[type] = (types[type] || 0) + 1;
            }
        });
    }
    
    return types;
}



async exportProjectOnly() {
    try {
        this.showNotification('Save project...');
        
        const projectData = {
            file_id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            project_name: prompt('Project name:', `CADMAPPER_${new Date().toLocaleDateString()}`) || 'Unnamed Project',
            description: prompt('Project description:', '') || '',
            elements_count: this.modelManager ? this.modelManager.getTotalElementCount() : 0,
            scene_data: {
                camera_position: this.camera ? this.camera.position.toArray() : [0, 0, 0],
                bounds: this.calculateSceneBounds(),
                element_types: this.getSceneElementTypes(),
                selected_elements: this.modelManager ? this.modelManager.getSelectedElements().map(el => el.userData.elementId) : []
            },
            metadata: {
                export_time: new Date().toISOString(),
                version: '1.0.0',
                triangles: this.stats.triangles || 0,
                vertices: this.stats.vertices || 0,
                fps: this.stats.fps || 0
            }
        };
        
        const response = await fetch('/api/export-project/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(projectData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            this.showNotification(`Project saved: ${result.project_name}`);
            
            
            
            const downloadLink = document.createElement('a');
            downloadLink.href = result.download_url;
            downloadLink.download = `${result.file_id}.json`;
            downloadLink.click();
            
        } else {
            this.showNotification(`Error: ${result.message}`, true);
        }
        
    } catch (error) {
        console.error('Error during project export:', error);
        this.showNotification('Error while saving the project.', true);
    }
}
    takeScreenshot() {
        this.renderer.render(this.scene, this.camera);
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        
        const link = document.createElement('a');
        link.download = `screenshot_${new Date().getTime()}.png`;
        link.href = dataURL;
        link.click();
        
        this.showNotification('Screenshot saved');
    }

    deleteSelectedElements() {
        const selectedElements = this.modelManager.getSelectedElements();
        
        if (selectedElements.length === 0) {
            this.showNotification('Select items to delete first', true);
            return;
        }
        
        if (confirm(`Are you sure you want to delete ${selectedElements.length} elements?`)) {
            let deletedCount = 0;
            
            selectedElements.forEach(element => {
                if (element.parent) {
                    element.parent.remove(element);
                    deletedCount++;
                }
            });
            
            this.modelManager.deselectAllElements();
            this.modelEditor.hideElementInfo();
            this.modelEditor.deactivateTransformControls();
            this.saveState('Delete selected items');
            this.showNotification(` ${deletedCount} elements deleted`);
        }
    }


    initElementCreator() {
    
    this.elementCreator = new ElementCreator(
        this.scene, 
        this.modelManager, 
        this.renderer, 
        this.camera
    );
    
}

repairAllMorphTargets() {
    
    if (!this.modelManager || typeof this.modelManager.repairElementMorphTargets !== 'function') {
        console.warn('The repairElementMorphTargets method does not exist in ModelManager');
        return { repaired: 0, errors: 0 };
    }
    
    let repairedCount = 0;
    let errorCount = 0;
    
    if (this.modelManager.buildings) {
        this.modelManager.buildings.traverse((child) => {
            if (child.isMesh) {
                if (this.modelManager.repairElementMorphTargets(child)) {
                    repairedCount++;
                } else {
                    errorCount++;
                }
            }
        });
    }
    
    this.showNotification(` ${repairedCount} elements repaired for morph targets`);
    
    return { repaired: repairedCount, errors: errorCount };
}


validateAndRepairAllElements() {
    
    
    let repairedCount = 0;
    let errorCount = 0;
    
    this.modelManager.buildings.traverse((child) => {
        if (child.isMesh) {
            
            if (child.userData?.isUserCreated) {
                if (this.modelManager.repairUserCreatedElement(child)) {
                    repairedCount++;
                } else {
                    errorCount++;
                }
            }
            
            
            if (!child.geometry || !child.geometry.attributes || !child.geometry.attributes.position) {
                console.error('Element with invalid geometry:', child.userData?.elementId);
                errorCount++;
            }
        }
    });
    
    
    this.showNotification(` ${repairedCount} repaired elements, ${errorCount} errors`);
    
    return { repaired: repairedCount, errors: errorCount };
}


checkAvailableLoaders() {
    const requiredLoaders = ['gltf', 'glb', 'obj', 'fbx', 'stl'];
    const availableLoaders = Object.keys(this.modelLoaders);
    
    
    
    
    if (typeof THREE.GLTFLoader === 'undefined') {
        
        this.loadGLTFLoaderFromCDN().catch(e => console.error(e));
    }

    
    if (typeof THREE.OBJLoader === 'undefined') {
        
        this.loadOBJLoaderFromCDN().catch(e => console.error(e));
    }
}



async loadOBJLoaderFromCDN() {
    return new Promise((resolve, reject) => {
        if (typeof THREE.OBJLoader !== 'undefined') {
            this.modelLoaders.obj = new THREE.OBJLoader();
            resolve();
            return;
        }

        const cdnUrls = [
            'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/js/loaders/OBJLoader.js',
            'https://unpkg.com/three@0.132.2/examples/js/loaders/OBJLoader.js',
            'https://cdnjs.cloudflare.com/ajax/libs/three.js/r132/examples/js/loaders/OBJLoader.js'
        ];

        let currentAttempt = 0;

        const tryLoadFromCDN = () => {
            if (currentAttempt >= cdnUrls.length) {
                console.error('All CDNs have failed');
                this.injectOBJLoaderDirectly().then(resolve).catch(reject);
                return;
            }

            const cdnUrl = cdnUrls[currentAttempt];
            const script = document.createElement('script');
            script.src = cdnUrl;

            script.onload = () => {
                setTimeout(() => {
                    if (typeof THREE.OBJLoader !== 'undefined') {
                        try {
                            this.modelLoaders.obj = new THREE.OBJLoader();
                            
                            resolve();
                        } catch (initError) {
                            console.error('Error initializing OBJLoader:', initError);
                            currentAttempt++;
                            tryLoadFromCDN();
                        }
                    } else {
                        currentAttempt++;
                        tryLoadFromCDN();
                    }
                }, 500);
            };

            script.onerror = () => {
                console.error(`Error loading from ${cdnUrl}`);
                currentAttempt++;
                tryLoadFromCDN();
            };

            document.head.appendChild(script);
        };

        tryLoadFromCDN();
    });
}



injectOBJLoaderDirectly() {
    return new Promise((resolve, reject) => {
        

        try {
            
            if (this.createMinimalOBJLoader()) {
                
                resolve();
                return;
            }

            
            this.loadOBJLoaderPolyfill().then(resolve).catch(reject);
            
        } catch (error) {
            console.error('Error during direct injection:', error);
            reject(error);
        }
    });
}

createMinimalOBJLoader() {
    try {
        

        
        const MinimalOBJLoader = function () {
            THREE.Loader.call(this);
        };

        MinimalOBJLoader.prototype = Object.assign(Object.create(THREE.Loader.prototype), {
            constructor: MinimalOBJLoader,

            load: function (url, onLoad, onProgress, onError) {
                const scope = this;
                const loader = new THREE.FileLoader(this.manager);
                loader.setPath(this.path);
                loader.setResponseType('text');
                loader.setRequestHeader(this.requestHeader);
                loader.setWithCredentials(this.withCredentials);

                loader.load(url, function (text) {
                    try {
                        onLoad(scope.parse(text));
                    } catch (e) {
                        if (onError) {
                            onError(e);
                        } else {
                            console.error(e);
                        }
                        scope.manager.itemError(url);
                    }
                }, onProgress, onError);
            },

            parse: function (text) {
                

                const group = new THREE.Group();
                const lines = text.split('\n');
                let vertices = [];
                let normals = [];
                let uvs = [];
                let objects = [];
                let currentObject = null;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.length === 0 || line.charAt(0) === '#') continue;

                    const parts = line.split(/\s+/);
                    const keyword = parts[0];

                    switch (keyword) {
                        case 'v':
                            vertices.push(
                                parseFloat(parts[1]),
                                parseFloat(parts[2]),
                                parseFloat(parts[3])
                            );
                            break;

                        case 'vn':
                            normals.push(
                                parseFloat(parts[1]),
                                parseFloat(parts[2]),
                                parseFloat(parts[3])
                            );
                            break;

                        case 'vt':
                            uvs.push(
                                parseFloat(parts[1]),
                                parseFloat(parts[2])
                            );
                            break;

                        case 'o':
                        case 'g':
                            if (currentObject) {
                                objects.push(currentObject);
                            }
                            currentObject = {
                                name: parts[1] || 'object',
                                vertices: [],
                                normals: [],
                                uvs: []
                            };
                            break;

                        case 'f':
                            if (!currentObject) {
                                currentObject = { name: 'default', vertices: [], normals: [], uvs: [] };
                            }
                            this.parseFace(parts, vertices, normals, uvs, currentObject);
                            break;
                    }
                }

                if (currentObject) {
                    objects.push(currentObject);
                }

                
                objects.forEach(obj => {
                    if (obj.vertices.length > 0) {
                        const geometry = new THREE.BufferGeometry();
                        geometry.setAttribute('position', new THREE.Float32BufferAttribute(obj.vertices, 3));
                        
                        if (obj.normals.length > 0) {
                            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(obj.normals, 3));
                        } else {
                            geometry.computeVertexNormals();
                        }
                        
                        if (obj.uvs.length > 0) {
                            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(obj.uvs, 2));
                        }

                        const material = new THREE.MeshLambertMaterial({ color: 0x888888 });
                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.name = obj.name;
                        group.add(mesh);
                    }
                });

                return group;
            },

            parseFace: function (parts, vertices, normals, uvs, currentObject) {
                for (let i = 1; i < parts.length; i++) {
                    const indices = parts[i].split('/');
                    
                    
                    const vi = parseInt(indices[0]) - 1;
                    if (vi >= 0 && vi * 3 + 2 < vertices.length) {
                        currentObject.vertices.push(
                            vertices[vi * 3],
                            vertices[vi * 3 + 1],
                            vertices[vi * 3 + 2]
                        );
                    }

                    
                    if (indices[1] && uvs.length > 0) {
                        const uvi = parseInt(indices[1]) - 1;
                        if (uvi >= 0 && uvi * 2 + 1 < uvs.length) {
                            currentObject.uvs.push(
                                uvs[uvi * 2],
                                uvs[uvi * 2 + 1]
                            );
                        }
                    }

                    
                    if (indices[2] && normals.length > 0) {
                        const ni = parseInt(indices[2]) - 1;
                        if (ni >= 0 && ni * 3 + 2 < normals.length) {
                            currentObject.normals.push(
                                normals[ni * 3],
                                normals[ni * 3 + 1],
                                normals[ni * 3 + 2]
                            );
                        }
                    }
                }
            }
        });

        
        this.modelLoaders.obj = new MinimalOBJLoader();
        return true;

    } catch (error) {
        console.error('Error creating the minimal loader:', error);
        return false;
    }
}


loadOBJLoaderPolyfill() {
    return new Promise((resolve, reject) => {
        

        
        const polyfillUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/r132/examples/js/loaders/OBJLoader.js';
        
        fetch(polyfillUrl)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.text();
            })
            .then(scriptText => {
                
                try {
                    
                    if (typeof THREE === 'undefined') {
                        throw new Error('THREE is not defined');
                    }
                    
                    
                    
                    (function() {
                        eval(scriptText);
                    }).call(window);

                    if (typeof THREE.OBJLoader !== 'undefined') {
                        this.modelLoaders.obj = new THREE.OBJLoader();
                        
                        resolve();
                    } else {
                        throw new Error('OBJLoader not defined after polyfill');
                    }
                } catch (e) {
                    console.error(' Error evaluating the polyfill:', e);
                    reject(e);
                }
            })
            .catch(error => {
                console.error('Error loading the polyfill:', error);
                this.createFallbackSolution().then(resolve).catch(reject);
            });
    });
}


createFallbackSolution() {
    return new Promise((resolve) => {
        

        
        this.modelLoaders.obj = {
            load: function (url, onLoad, onProgress, onError) {
                console.warn('Using fallback loader for OBJ');
                
                
                if (typeof window.threeViewer !== 'undefined') {
                    window.threeViewer.showNotification('The OBJ format is not fully supported.', true);
                }

                
                const geometry = new THREE.BoxGeometry(10, 10, 10);
                const material = new THREE.MeshLambertMaterial({ color: 0x888888 });
                const fallbackMesh = new THREE.Mesh(geometry, material);
                const group = new THREE.Group();
                group.add(fallbackMesh);

                
                setTimeout(() => {
                    if (onLoad) onLoad(group);
                }, 100);
            }
        };

        
        resolve();
    });
}





openModelImportDialog() {
    
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'model3DFileInput';
    fileInput.style.display = 'none';
    
    fileInput.accept = '.gltf,.glb,.gbl,.obj,.fbx,.3mf,.stl,.dae,.ply';
    fileInput.multiple = false;
    
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const extension = file.name.split('.').pop().toLowerCase();
            
            if (extension === 'obj') {
                this.showNotification(
                    'OBJ files may have compatibility issues. '
                );
            }
            
            this.loadExternalModel(file);
        }
        fileInput.value = '';
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    
    setTimeout(() => {
        if (document.body.contains(fileInput)) {
            document.body.removeChild(fileInput);
        }
    }, 1000);
    
    this.showNotification('Select a file 3D');
}

async loadExternalModel(file) {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (fileExtension === 'obj') {
        if (!this.modelLoaders.obj) {
            this.showNotification('Loading system for OBJ files...');
            try {
                await this.loadOBJLoaderFromCDN();
            } catch (error) {
                console.error('Error loading OBJLoader:', error);
                const userChoice = confirm(
'The system for OBJ files could not be loaded.\n' +
'Options:\n' +
'OK: Load a simplified version (with limitations)\n' +
'Cancel: Use another format (GLB/GLTF recommended)\n' +
'Do you want to continue with the simplified version?'
                );
                if (!userChoice) {
                    this.showNotification('Loading canceled. Use GLB/GLTF for optimal results.', true);
                    return;
                }
            }
        }
    }
    if (!this.modelLoaders[fileExtension]) {
        console.error('Unsupported format or loader unavailable:', fileExtension);
        this.showNotification(`Format ${fileExtension.toUpperCase()} unsupported`, true);
        const suggestions = this.getAlternativeFormatSuggestions(fileExtension);
        this.showNotification(`Accepted formats: ${suggestions.join(', ')}`);
        return;
    }
    this.showNotification(`Loading ${file.name}...`);
    try {
        const fileURL = URL.createObjectURL(file);
        let loadedModel = null;

        await new Promise((resolve, reject) => {
            const onProgress = (progress) => {
                if (progress.lengthComputable) {
                    const percent = (progress.loaded / progress.total) * 100;
                    if (percent % 25 === 0) {
                        this.showNotification(`Loading ${file.name}: ${percent.toFixed(1)}%`);
                    }
                }
            };
            const onError = (error) => {
                console.error('Loading error:', error);
                this.showNotification(`Loading error ${file.name}`, true);
                reject(error);
            };
            const onLoad = (result) => {
                
                if (['gltf', 'glb', 'gbl'].includes(fileExtension)) {
                    if (result && result.scene) {
                        loadedModel = result.scene;
                    } else {
                        reject(new Error('The GLB file does not contain a valid scene'));
                        return;
                    }
                } else {
                    
                    loadedModel = result;
                }
                resolve();
            };

            if (fileExtension === 'obj' && this.modelLoaders.obj) {
                this.modelLoaders.obj.load(fileURL, onLoad, onProgress, onError);
            } 
            else if (['gltf', 'glb', 'gbl'].includes(fileExtension)) {
                this.modelLoaders[fileExtension].load(fileURL, onLoad, onProgress, onError);
            } else if (fileExtension === 'fbx' && this.modelLoaders.fbx) {
                this.modelLoaders.fbx.load(fileURL, onLoad, onProgress, onError);
            } else if (fileExtension === 'stl' && this.modelLoaders.stl) {
                this.modelLoaders.stl.load(fileURL, onLoad, onProgress, onError);
            } else {
                reject(new Error(`Loader for ${fileExtension} is not available`));
            }
        });

        URL.revokeObjectURL(fileURL);

        
        if (loadedModel) {
            const processedModel = this.handleLoadedModel(loadedModel, file.name, fileExtension);
            return processedModel;
        } else {
            throw new Error('The model could not be loaded');
        }
    } catch (error) {
        console.error('Error processing the model:', error);
        this.showNotification(`Error loading ${file.name}: ${error.message}`, true);
        return null;
    }
}
validateModelCompatibility(model) {
    if (!model) {
        return { isValid: false, reason: 'The model is null or undefined' };
    }
    
    
    if (model.isObject3D) {
        return { isValid: true, type: 'THREE.Object3D' };
    }
    
    
    if (model.isGeometry || model.isBufferGeometry) {
        return { isValid: true, type: 'THREE.Geometry' };
    }
    
    
    if (model.isMesh) {
        return { isValid: true, type: 'THREE.Mesh' };
    }
    
    
    if (typeof model.traverse === 'function') {
        return { isValid: true, type: 'Traverse-compatible' };
    }
    
    return { isValid: false, reason: 'Unknown or incompatible model type' };
}

analyzeModelStructure(model) {
    
    if (!model || typeof model.traverse !== 'function') {
        console.error('The model does not have the traverse function. Model:', model);
        return;
    }
    
    let meshCount = 0;
    let groupCount = 0;
    let totalVertices = 0;
    
    try {
        model.traverse((child) => {
            if (child.isMesh) {
                meshCount++;
                if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                    totalVertices += child.geometry.attributes.position.count;
                }
            } else if (child.isGroup) {
                groupCount++;
            }
        });
        
        
    } catch (error) {
        console.error('Error parsing the model structure:', error);
    }
}




async checkAndRepairAllLoaders() {
    
    
    const loadersToCheck = [
        { key: 'obj', name: 'OBJLoader', check: () => typeof THREE.OBJLoader !== 'undefined' },
        { key: 'gltf', name: 'GLTFLoader', check: () => typeof THREE.GLTFLoader !== 'undefined' },
        { key: 'glb', name: 'GLTFLoader', check: () => typeof THREE.GLTFLoader !== 'undefined' },
        
        { key: 'gbl', name: 'GLTFLoader', check: () => typeof THREE.GLTFLoader !== 'undefined' },
        { key: 'fbx', name: 'FBXLoader', check: () => typeof THREE.FBXLoader !== 'undefined' },
        { key: 'stl', name: 'STLLoader', check: () => typeof THREE.STLLoader !== 'undefined' }
    ];
    
    for (const loader of loadersToCheck) {
        if (!this.modelLoaders[loader.key] && loader.check()) {
            
            try {
                switch(loader.key) {
                    case 'obj':
                        this.modelLoaders.obj = new THREE.OBJLoader();
                        break;
                    case 'gltf':
                    case 'glb':
                    case 'gbl': 
                        this.modelLoaders[loader.key] = new THREE.GLTFLoader();
                        break;
                    case 'fbx':
                        this.modelLoaders.fbx = new THREE.FBXLoader();
                        break;
                    case 'stl':
                        this.modelLoaders.stl = new THREE.STLLoader();
                        break;
                }
                
            } catch (error) {
                console.error(`Error initializing ${loader.name}:`, error);
            }
        }
    }
}
handleLoadedModel(model, fileName, fileExtension) {
    
    
    
    

    
    let rootObject = model;
    if (model && model.scene && model.scene.isObject3D) {
        rootObject = model.scene;
    }

    
    if (!rootObject || !rootObject.isObject3D) {
        console.error('The received model is not a valid THREE.Object3D:', model);
        this.showNotification('The loaded model is not valid', true);
        return null;
    }

    
    this.analyzeModelStructure(rootObject);

    
    
    
    
    rootObject.traverse((child) => {
        if (child.isMesh) {
            if (!child.material || !child.material.isMaterial) {
                child.material = new THREE.MeshLambertMaterial({ color: 0x888888 });
            }
            if (child.geometry && !child.geometry.attributes.uv) {
                const geometry = child.geometry;
                const count = geometry.attributes.position.count;
                const uvs = new Float32Array(count * 2);
                for (let i = 0; i < count; i++) {
                    uvs[i * 2] = i / count;
                    uvs[i * 2 + 1] = i / count;
                }
                geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            }
            if (!child.userData.originalMaterials) {
                if (Array.isArray(child.material)) {
                    child.userData.originalMaterials = child.material.map(mat => {
                        if (mat && mat.clone) return mat.clone();
                        return new THREE.MeshLambertMaterial({ color: 0x888888 });
                    });
                } else {
                    child.userData.originalMaterials = [
                        (child.material && child.material.clone) ? child.material.clone() : new THREE.MeshLambertMaterial({ color: 0x888888 })
                    ];
                }
            }
            child.userData.canReceiveTextures = true;
            child.userData.materialType = child.material.type.toLowerCase();
            if (!child.userData) child.userData = {};
            
            const userData = {
                ...child.userData,
                fileName: fileName,
                fileExtension: fileExtension,
                loadTime: new Date().toISOString(),
                autoCompleted: true,
                isExternalModel: true,
                isUserCreated: false,
                elementId: `element_${child.id || Math.random().toString(36).substr(2, 9)}`,
                type: 'other',
                
                currentScale: child.scale.clone(),
                originalScale: child.scale.clone(),
                hasBeenScaled: false 
            };
            
            child.userData = userData;
            child.elementId = child.userData.elementId;
            child.isExternalModel = true;
        }
    });

    if (!rootObject.userData.hasBeenScaled) {
        this.scaleModelToReasonableSize(rootObject);
        rootObject.userData.hasBeenScaled = true;
    }

    const modelContainer = new THREE.Group();
    modelContainer.add(rootObject);

    modelContainer.userData = {
        type: 'external',
        fileName: fileName,
        fileExtension: fileExtension,
        elementId: `element_${Math.random().toString(36).substr(2, 9)}`,
        isSelected: false,
        isExternalModel: true,
        isUserCreated: false,
        loadTime: new Date().toISOString(),
        canReceiveTextures: true,
        originalCenter: rootObject.position ? rootObject.position.clone() : null,
        currentPosition: rootObject.position ? rootObject.position.clone() : null,
        hasBeenScaled: rootObject.userData.hasBeenScaled || false,
        
        appliedScale: rootObject.scale.clone()
    };

    modelContainer.elementId = modelContainer.userData.elementId;
    modelContainer.isExternalModel = true;

    this.modelManager.buildings.add(modelContainer);

    this.enhancedAutoSelectExternalModel(modelContainer);
    this.showNotification(` ${fileName} loaded successfully`);
    this.saveState(`Import model: ${fileName}`);
    return modelContainer;
}



enhancedAutoCompleteModel(model, fileName, fileExtension) {
    
    
    let completedCount = 0;
    let meshCount = 0;
    
    model.traverse((child) => {
        if (child.isMesh || child.isGroup || child.isObject3D) {
            
            if (child.id === undefined || child.id === null) {
                child.id = `element_${Math.random().toString(36).substr(2, 9)}`;
            }
            
            if (child.type === undefined || child.type === '') {
                if (child.isMesh) {
                    child.type = 'Mesh';
                } else if (child.isGroup) {
                    child.type = 'Group';
                } else {
                    child.type = 'Object3D';
                }
            }
            
            if (child.name === '' || child.name === undefined || child.name === null) {
                child.name = `ModelPart_${meshCount}`;
                meshCount++;
            }

            if (child.parent === undefined || child.parent === null) {
                
            }
            if (!child.userData) {
                child.userData = {};
            }
            child.userData = {
                ...child.userData,
                
                fileName: fileName,
                fileExtension: fileExtension,
                loadTime: new Date().toISOString(),
                autoCompleted: true,
                
                
                isExternalModel: true,
                isUserCreated: true,
                elementId: `mesh_${child.id}`,
                
                
                originalPosition: child.position ? child.position.clone() : new THREE.Vector3(),
                originalRotation: child.rotation ? child.rotation.clone() : new THREE.Euler(),
                originalScale: child.scale ? child.scale.clone() : new THREE.Vector3(1, 1, 1),
                
                
                hasGeometry: !!child.geometry,
                hasMaterial: !!child.material,
                vertexCount: child.geometry?.attributes?.position?.count || 0
            };
            
            
            child.elementId = child.userData.elementId;
            child.isUserCreated = true;
            child.isExternalModel = true;
            
            completedCount++;
            
        }
    });
    
    
}


enhancedAutoSelectExternalModel(modelContainer) {
    if (!modelContainer) {
        console.warn('modelContainer is undefined in enhancedAutoSelectExternalModel');
        return;
    }
    
    setTimeout(() => {
        
        if (!this.modelManager) {
            console.warn('modelManager is not available');
            return;
        }
        
        
        this.modelManager.deselectAllElements();
        
        
        if (modelContainer && modelContainer.isObject3D) {
            try {
                
                this.safeSelectElement(modelContainer, false);
                
                
                if (this.modelManager.modelEditor) {
                    this.modelManager.modelEditor.activateTransformControls(modelContainer);
                }
                
                
                if (this.modelManager.modelEditor) {
                    this.modelManager.modelEditor.showElementInfo(modelContainer);
                }
            } catch (error) {
                console.error('Error selecting the external model:', error);
            }
        } else {
            console.warn('modelContainer is not a valid 3D object:', modelContainer);
        }
    }, 100);
}


safeSelectElement(element, multiple = false) {
    if (!this.modelManager) {
        console.warn('modelManager is not available');
        return;
    }
    
    if (!element) {
        console.warn('Attempt to select an undefined element');
        return;
    }
    
    try {
        
        if (!element.material) {
            console.warn('The element has no materials, creating a default material');
            element.material = new THREE.MeshLambertMaterial({ color: 0x888888 });
        }
        
        return this.modelManager.selectElement(element, multiple);
    } catch (error) {
        console.error('Error selecting the element:', error);
        return false;
    }
}



centerModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    
    model.position.x = -center.x;
    model.position.y = -box.min.y; 
    model.position.z = -center.z;
}

scaleModelToReasonableSize(model) {
    
    if (model.userData && model.userData.hasBeenScaled) {
        
        return;
    }

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);

    

    
    const TARGET_SIZE = 50; 
    let scaleFactor = 1;

    if (maxDimension <= 0.001) {
        
        scaleFactor = TARGET_SIZE / 0.001;
        
    } else if (maxDimension < 0.1) {
        
        scaleFactor = TARGET_SIZE / maxDimension;
        
    } else if (maxDimension < 1) {
        
        scaleFactor = TARGET_SIZE / maxDimension;
        
    } else if (maxDimension > 1000) {
        
        scaleFactor = 1000 / maxDimension;
        
    } else {
        
        
        model.userData.hasBeenScaled = true;
        return;
    }

    if (scaleFactor !== 1) {
        
        if (!model.userData.originalScale) {
            model.userData.originalScale = model.scale.clone();
        }

        model.scale.multiplyScalar(scaleFactor);
        model.userData.hasBeenScaled = true;
        
    } else {
        
        model.userData.hasBeenScaled = true;
    }
}


centerCameraOnExternalModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.sin(fov / 2));
    
    cameraZ *= 1.5;
    
    this.camera.position.set(
        center.x, 
        center.y - cameraZ, 
        center.z + cameraZ * 0.5
    );
    this.controls.target.set(center.x, center.y, center.z);
    this.controls.update();
    
    
}


getExternalModels() {
    const models = [];
    this.externalModels.traverse((child) => {
        if (child.isGroup && child.userData && child.userData.isExternalModel) {
            models.push(child);
        }
    });
    return models;
}


deleteSelectedExternalModels() {
    const selectedModels = this.getExternalModels().filter(model => 
        model.userData.isSelected
    );
    
    if (selectedModels.length === 0) {
        this.showNotification('No external models are selected', true);
        return;
    }
    
    selectedModels.forEach(model => {
        this.externalModels.remove(model);
        
        
        model.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    });
    
    this.showNotification(` ${selectedModels.length} external models deleted`);
    return selectedModels.length;
}


exportExternalModels() {
    const models = this.getExternalModels();
    
    if (models.length === 0) {
        this.showNotification('There are no external models to export', true);
        return;
    }
    
    
    
    try {
        const exporter = new THREE.GLTFExporter();
        
        
        const exportGroup = new THREE.Group();
        models.forEach(model => exportGroup.add(model.clone()));
        
        exporter.parse(exportGroup, (gltf) => {
            try {
                const blob = new Blob(
                    [gltf instanceof ArrayBuffer ? gltf : new TextEncoder().encode(JSON.stringify(gltf))],
                    { type: 'model/gltf-binary' }
                );
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `external_models_${Date.now()}.glb`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.showNotification(` ${models.length} external models exported`);
                
            } catch (error) {
                console.error('Error creating the blob.:', error);
                this.showNotification(' Error during export', true);
            }
        }, { 
            binary: true,
            trs: false,
            onlyVisible: true,
            truncateDrawRange: true
        });
        
    } catch (error) {
        console.error('Error during external model export:', error);
        this.showNotification(' Error during export', true);
    }
}


loadMissingModelLoaders() {
    
    
    const loadersToLoad = [];
    
    if (typeof THREE.GLTFLoader === 'undefined') {
        loadersToLoad.push({
            name: 'GLTFLoader',
            url: 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/jsm/loaders/GLTFLoader.js'
        });
    }
    
    if (typeof THREE.OBJLoader === 'undefined') {
        loadersToLoad.push({
            name: 'OBJLoader',
            url: 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/jsm/loaders/OBJLoader.js'
        });
    }
    
    if (loadersToLoad.length > 0) {
        
        this.loadScriptsSequentially(loadersToLoad);
    } else {
        
    }
}



loadScriptsSequentially(loaders) {
    if (loaders.length === 0) {
        this.initModelLoaders();
        return;
    }
    
    const loader = loaders[0];
    
    
    const script = document.createElement('script');
    script.src = loader.url;
    script.onload = () => {
        
        this.loadScriptsSequentially(loaders.slice(1));
    };
    script.onerror = () => {
        console.error(`Error loading the ${loader.name}`);
        this.loadScriptsSequentially(loaders.slice(1));
    };
    
    document.head.appendChild(script);
}

async loadExternalModelSecure(file) {
    return new Promise(async (resolve, reject) => {
        try {
            
            
            const extension = file.name.split('.').pop().toLowerCase();
            
            
            if (file.size > 50 * 1024 * 1024) {
                throw new Error('The file is too large');
            }
            
            
            
            const allowedExtensions = ['gltf', 'glb', 'gbl', 'obj', 'fbx', 'stl', '3mf'];
            if (!allowedExtensions.includes(extension)) {
                throw new Error(`Format ${extension} not accepted. Allowed formats: ${allowedExtensions.join(', ')}`);
            }
            
            await this.loadExternalModel(file);
            resolve();
            
        } catch (error) {
            console.error('Secure loading error:', error);
            this.showNotification(` ${error.message}`, true);
            reject(error);
        }
    });
}

setupUndoRedoListeners() {
    document.addEventListener('keydown', (event) => {
        
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        const isCtrl = event.ctrlKey || event.metaKey;
        
        if (isCtrl) {
            switch(event.key.toLowerCase()) {
                case 'z':
                    event.preventDefault();
                    if (event.shiftKey) {
                        
                        
                        this.historyManager.redo();
                    } else {
                        
                        
                        this.historyManager.undo();
                    }
                    break;
                    
                case 'y':
                    event.preventDefault();
                    
                    
                    this.historyManager.redo();
                    break;
            }
        }
    });    
}
    saveState(description = 'Modify', modifiedElements = null, deletedElements = null) {
        if (this.historyManager) {
            this.historyManager.saveState(description, modifiedElements, deletedElements);
        }
    }



backupAllExternalModels() {
    let backupCount = 0;
    
    this.externalModels.traverse((child) => {
        if (child.isMesh && child.userData && !child.userData.geometryBackup) {
            const backup = this.backupExternalModelGeometry(child);
            if (backup) {
                child.userData.geometryBackup = backup;
                backupCount++;
            }
        }
    });
    
    if (backupCount > 0) {
        
    }
}

backupExternalModelGeometry(model) {
    if (!model || !model.isMesh) return null;
    
    try {
        const backup = {
            geometry: this.captureGeometryState(model.geometry),
            material: this.captureMaterialState(model.material),
            position: model.position.toArray(),
            rotation: model.rotation.toArray(),
            scale: model.scale.toArray(),
            userData: JSON.parse(JSON.stringify(model.userData))
        };
        
        
        return backup;
    } catch (error) {
        console.error('Geometry backup error:', error);
        return null;
    }
}

setupAutoSaveTriggers() {
    
    this.modelManager.onElementModified = (elementId, property, oldValue, newValue) => {
        this.historyManager.saveState(`Modify ${property} for element ${elementId}`);
    };
    
    
    this.modelManager.onElementAdded = (elementId) => {
        this.historyManager.saveState(`New element added: ${elementId}`);
    };
    
    
    this.modelManager.onElementRemoved = (elementId) => {
        this.historyManager.saveState(`Element deleted: ${elementId}`);
    };
}


repairExternalModelStructure(model) {
    let repairedCount = 0;
    
    model.traverse((child) => {
        if (child.isMesh) {
            if (!child.userData) {
                child.userData = {};
            }
            
            
            if (model.userData && model.userData.originalCenter && !child.userData.originalCenter) {
                child.userData.originalCenter = model.userData.originalCenter.clone();
            }
            
            
            if (model.userData && !child.userData.elementId) {
                child.userData = {
                    ...child.userData,
                    ...model.userData,
                    
                    isMesh: true,
                    geometry: child.geometry,
                    material: child.material,
                    
                    elementId: `${model.userData.elementId}_mesh_${child.id}`
                };
            }
            
            child.elementId = child.userData.elementId;
            child.isUserCreated = true;
            child.isExternalModel = true;
            
            repairedCount++;
        }
    });
    
    return repairedCount;
}
async transmitGLBToServer() {
    try {
        const { data: glbData, count } = await this.generateGLBData();
        const blob = new Blob([glbData], { type: 'model/gltf-binary' });
        
        if (blob.size < 100) {
            throw new Error(`Generated GLB is too small (${blob.size} bytes)`);
        }
        
        await this.saveExportToServer(blob, count);
        
        return true;
        
    } catch (error) {
        console.error('GLB transfer error:', error);
        throw error;
    }
}


captureQuickThumbnail() {
    try {
        
        const originalPixelRatio = this.renderer.getPixelRatio();
        this.renderer.setPixelRatio(1);
        
        const width = 400;
        const height = 300;
        
        
        this.renderer.render(this.scene, this.camera);
        const dataURL = this.renderer.domElement.toDataURL('image/jpeg', 0.7);
        
        
        this.renderer.setPixelRatio(originalPixelRatio);
        
        return {
            thumbnail_data: dataURL,
            camera_position: {
                position: [0, -1500, 1000], 
                target: [0, 0, 0],
                fov: 45
            }
        };
        
    } catch (error) {
        console.error('Thumbnail quick-capture error:', error);
        return null;
    }
}

captureCurrentViewThumbnail() {
    try {
        
        
        
        return this.captureThumbnailWithCamera(this.camera);
        
    } catch (error) {
        console.error('Error capturing the thumbnail:', error);
        return null;
    }
}

async autoTransmitGLBAfterLoad() {
    
    
    try {
        
        setTimeout(async () => {
            try {
                
                await this.transmitGLBToServer();
                this.showNotification('GLB model automatically saved to your account');
            } catch (error) {
                
                
            }
        }, 3000);
    } catch (error) {
        
    }
}



loadGLBFromURL(url, fileId) {
    return new Promise(async (resolve, reject) => {
        
        this.showNotification('Downloading 3D model...');
        
        
        if (!this.modelLoaders.glb || typeof THREE.GLTFLoader === 'undefined') {
             console.warn(' GLTFLoader missing. Trying to load from CDN...');
             try {
                 await this.loadGLTFLoaderFromCDN();
             } catch (error) {
                 console.error('Fatal: Could not load GLTFLoader:', error);
                 this.showNotification('Error: GLTFLoader component missing', true);
                 reject(error);
                 return;
             }
        }

        
        if (!this.modelLoaders.glb) {
            this.modelLoaders.glb = new THREE.GLTFLoader();
        }

        
        this.modelLoaders.glb.load(
            url,
            (gltf) => {
                
                const model = gltf.scene;

                
                if (this.modelManager && this.modelManager.buildings) {
                    
                    
                    while(this.modelManager.buildings.children.length > 0){ 
                        const child = this.modelManager.buildings.children[0];
                        this.modelManager.buildings.remove(child);
                        
                        if(child.geometry) child.geometry.dispose();
                        if(child.material) {
                            if(Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                            else child.material.dispose();
                        }
                    }
                }

                
                if (this.externalModels) {
                    
                    while(this.externalModels.children.length > 0){
                        const child = this.externalModels.children[0];
                        this.externalModels.remove(child);
                        if(child.geometry) child.geometry.dispose();
                    }
                }

                
                
                this.processGLBModel(model, true); 
                
                this.showNotification(' Model loaded successfully');
                
                
                setTimeout(() => {
                    this.centerCameraOnBuildings();
                    this.renderer.render(this.scene, this.camera);
                }, 500);
                
                resolve(model);
            },
            (progress) => {
                if (progress.lengthComputable) {
                    const percent = (progress.loaded / progress.total) * 100;
                    if (percent % 20 === 0) {
                        
                    }
                }
            },
            (error) => {
                console.error(' Error loading GLB:', error);
                this.showNotification(' Error loading GLB file', true);
                reject(error);
            }
        );
    });
}



processGLBModel(model, skipCentering = false) {
    
    
    
    if (!model.userData?.hasBeenScaled) {
        this.scaleModelToReasonableSize(model);
    }
    
    model.traverse((child) => {
        if (child.isMesh) {
            
            let type = 'other';
            if (child.userData && child.userData.type) {
                type = child.userData.type;
            } else if (child.type === 'Mesh' && child.parent && child.parent.userData && child.parent.userData.type) {
                type = child.parent.userData.type;
            } else {
                
                if (child.userData && child.userData.extras && child.userData.extras.type) {
                    type = child.userData.extras.type;
                }
                
                if (type === 'other' && child.name && ['building', 'highway', 'water', 'natural', 'landuse', 'other', 'external'].includes(child.name)) {
                    type = child.name;
                }
            }

            
            const userData = {
                type: type,
                loadedFromServer: true,
                loadTime: new Date().toISOString(),
                preservePosition: skipCentering,
                elementId: child.userData?.elementId || `element_${Math.floor(Math.random() * 10000000000).toString().padStart(10, '0')}`,
                
                appliedScale: model.scale.clone(),
                hasBeenScaled: model.userData?.hasBeenScaled || false
            };

            
            if (child.userData) {
                Object.assign(userData, child.userData);
            }
            
            child.userData = userData;

            
            if (skipCentering && child.position) {
                child.userData.currentPosition = child.position.clone();
                child.userData.currentRotation = child.rotation.clone();
                child.userData.currentScale = child.scale.clone();
                
                child.userData.originalScale = child.scale.clone();
            }

            child.elementId = child.userData.elementId;
        }
    });
    this.modelManager.buildings.add(model);
    
}
loadGLTFLoaderFromCDN() {
    return new Promise((resolve, reject) => {
        

        
        if (typeof THREE.GLTFLoader !== 'undefined') {
            
            this.modelLoaders.glb = new THREE.GLTFLoader();
            this.modelLoaders.gltf = new THREE.GLTFLoader();
            this.modelLoaders.gbl = new THREE.GLTFLoader();
            resolve();
            return;
        }

        
        const cdnUrls = [
            'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/js/loaders/GLTFLoader.js',
            'https://unpkg.com/three@0.132.2/examples/js/loaders/GLTFLoader.js'
        ];

        let currentAttempt = 0;

        const tryLoadFromCDN = () => {
            if (currentAttempt >= cdnUrls.length) {
                reject(new Error('All CDNs for GLTFLoader have failed'));
                return;
            }

            const cdnUrl = cdnUrls[currentAttempt];
            

            const script = document.createElement('script');
            script.src = cdnUrl;

            script.onload = () => {
                
                setTimeout(() => {
                    if (typeof THREE.GLTFLoader !== 'undefined') {
                        
                        this.modelLoaders.glb = new THREE.GLTFLoader();
                        this.modelLoaders.gltf = new THREE.GLTFLoader();
                        this.modelLoaders.gbl = new THREE.GLTFLoader();
                        resolve();
                    } else {
                        currentAttempt++;
                        tryLoadFromCDN();
                    }
                }, 100);
            };

            script.onerror = () => {
                console.error(`Error loading the ${cdnUrl}`);
                currentAttempt++;
                tryLoadFromCDN();
            };

            document.head.appendChild(script);
        };

        tryLoadFromCDN();
    });
}

clearScene() {
    
    
    
    if (this.modelManager) {
        this.modelManager.clearAll();
    }

    
    if (this.externalModels) {
        for (let i = this.externalModels.children.length - 1; i >= 0; i--) {
            const child = this.externalModels.children[i];
            this.externalModels.remove(child);
            
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => m.dispose());
            }
        }
        this.externalModels.clear();
    }

    
    
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
        const obj = this.scene.children[i];
        
        
        const protectedNames = ['Grid', 'Environment', 'OSM_Buildings', 'External_Models'];
        
        if (!obj.isLight && !obj.isCamera && !protectedNames.includes(obj.name) && obj !== this.externalModels && obj !== this.modelManager.buildings) {
             
             this.scene.remove(obj);
             if (obj.geometry) obj.geometry.dispose();
        }
    }

    
}




loadProjectGLB(file) {
    if (this.isLoadingGLB) return;
    this.isLoadingGLB = true;

    
    this.showNotification('Loading and filtering...');

    const loader = new THREE.GLTFLoader();
    const url = URL.createObjectURL(file);

    loader.load(url, (gltf) => {
        try {
            
            this.clearScene(); 

            const loadedScene = gltf.scene;
            const uniqueObjects = new Map(); 
            
            const _pos = new THREE.Vector3();
            const _quat = new THREE.Quaternion();
            const _scale = new THREE.Vector3();
            const _box = new THREE.Box3();
            const _center = new THREE.Vector3();

            let duplicatesSkipped = 0;

            
            loadedScene.traverse((child) => {
                if (child.isMesh && child.visible) {
                    
                    child.updateWorldMatrix(true, false);
                    _box.setFromObject(child);
                    _box.getCenter(_center);

                    
                    const size = new THREE.Vector3();
                    _box.getSize(size);
                    const volume = (size.x * size.y * size.z).toFixed(1);
                    
                    const key = `${_center.x.toFixed(1)}_${_center.y.toFixed(1)}_${_center.z.toFixed(1)}_${volume}`;

                    
                    if (!uniqueObjects.has(key)) {
                        uniqueObjects.set(key, child);
                    } else {
                        duplicatesSkipped++;
                    }
                }
            });

            

            
            uniqueObjects.forEach((mesh) => {
                const cleanMesh = new THREE.Mesh(mesh.geometry.clone(), mesh.material);
                
                
                mesh.getWorldPosition(_pos);
                mesh.getWorldQuaternion(_quat);
                mesh.getWorldScale(_scale);

                cleanMesh.position.copy(_pos);
                cleanMesh.quaternion.copy(_quat);
                cleanMesh.scale.copy(_scale);

                cleanMesh.name = mesh.name;
                cleanMesh.castShadow = true;
                cleanMesh.receiveShadow = true;
                
                
                cleanMesh.userData = {};
                if (mesh.userData?.type) cleanMesh.userData.type = mesh.userData.type;
                else cleanMesh.userData.type = 'imported_model';

                
                if (cleanMesh.userData.type === 'building' || cleanMesh.userData.isOSM) {
                    this.modelManager.buildings.add(cleanMesh);
                } else {
                    this.externalModels.add(cleanMesh);
                }
            });

            this.showNotification(`Imported: ${uniqueObjects.size} unique elements`);

        } catch (error) {
            console.error("Import error.:", error);
            this.showNotification("File processing error", true);
        } finally {
            this.isLoadingGLB = false;
            URL.revokeObjectURL(url);
        }
    }, undefined, (err) => {
        console.error(err);
        this.isLoadingGLB = false;
        this.showNotification("Invalid file", true);
    });
}


setCurrentFileId(fileId) {
    window.currentFileId = fileId;
    
    
    
    if (fileId) {
        localStorage.setItem('current_project_id', fileId);
    }
}

getFileIdFromURL() {
    const pathParts = window.location.pathname.split('/');
    const fileId = pathParts[pathParts.length - 2];
    return fileId && fileId !== 'view-3d' ? fileId : null;
}


saveCurrentFileId() {
    if (window.currentFileId) {
        localStorage.setItem('current_project_id', window.currentFileId);
    }
}


loadCurrentFileId() {
    return localStorage.getItem('current_project_id');
}


captureProjectThumbnail() {
    try {
        
        
        
        const originalClearColor = new THREE.Color();
        this.renderer.getClearColor(originalClearColor);
        const originalClearAlpha = this.renderer.getClearAlpha();
        
        
        this.renderer.setClearColor(0x0f172a, 1); 
        this.renderer.setPixelRatio(1); 
        
        
        const width = 800;
        const height = 600;
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });
        
        
        const captureCamera = this.camera.clone();
        
        
        if (this.modelManager.buildings.children.length > 0) {
            const box = new THREE.Box3().setFromObject(this.modelManager.buildings);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = captureCamera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / Math.sin(fov / 2));
            cameraZ *= 1.5; 
            captureCamera.position.set(
                center.x, 
                center.y - cameraZ, 
                center.z + cameraZ * 0.3
            );
            captureCamera.lookAt(center);
        }
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.render(this.scene, captureCamera);
        this.renderer.setRenderTarget(null);
        const buffer = new Uint8Array(width * height * 4);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d'); 
        const imageData = context.createImageData(width, height);
        imageData.data.set(buffer);
        context.putImageData(imageData, 0, 0);   
        context.filter = 'blur(2px)';
        context.drawImage(canvas, 0, 0);
        context.filter = 'none'; 
        const thumbnailDataURL = canvas.toDataURL('image/jpeg', 0.85); 
        this.renderer.setClearColor(originalClearColor, originalClearAlpha);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderTarget.dispose();

        return {
            thumbnail_data: thumbnailDataURL,
            camera_position: {
                position: captureCamera.position.toArray(),
                target: this.controls.target.toArray(),
                fov: captureCamera.fov
            }
        };
        
    } catch (error) {
        console.error('Error capturing the thumbnail:', error);
        return null;
    }
}


 captureInitialCameraThumbnail() {
    try {
        const tempCamera = this.camera.clone();
        tempCamera.position.set(0, -6000, 2000);
        tempCamera.fov = 45;
        tempCamera.aspect = this.camera.aspect;
        tempCamera.updateProjectionMatrix();
        const tempControls = new THREE.OrbitControls(tempCamera, this.renderer.domElement);
        tempControls.target.set(0, 0, 0);
        tempControls.update();
        const thumbnailData = this.captureThumbnailWithCamera(tempCamera);
        tempControls.dispose();
        if (thumbnailData) {
            
            return thumbnailData;
        } else {
            console.warn('The thumbnail could not be captured');
            return null;
        }
        
    } catch (error) {
        console.error('Error in captureInitialCameraThumbnail:', error);
        return null;
    }
}

captureThumbnailWithCamera(cameraToUse) {
    try {
        const originalPixelRatio = this.renderer.getPixelRatio();
        const originalClearColor = new THREE.Color();
        this.renderer.getClearColor(originalClearColor);
        const originalClearAlpha = this.renderer.getClearAlpha();  
        this.renderer.setClearColor(0x0f172a, 1); 
        this.renderer.setPixelRatio(1);  
        const width = 2560;
        const height = 1440;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            encoding: THREE.sRGBEncoding
        });
        
        
        cameraToUse.aspect = width / height;
        cameraToUse.updateProjectionMatrix();
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.render(this.scene, cameraToUse);
        this.renderer.setRenderTarget(null);
        const buffer = new Uint8Array(width * height * 4);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);
        const imageData = context.createImageData(width, height);
        imageData.data.set(buffer);
        context.putImageData(imageData, 0, 0);
        context.filter = 'blur(2px) brightness(1.05)';
        context.drawImage(canvas, 0, 0);
        context.filter = 'none';
        const thumbnailDataURL = canvas.toDataURL('image/png');
        this.renderer.setClearColor(originalClearColor, originalClearAlpha);
        this.renderer.setPixelRatio(originalPixelRatio);
        renderTarget.dispose();

        return {
            thumbnail_data: thumbnailDataURL,
            camera_position: {
                position: cameraToUse.position.toArray(),
                target: [0, 0, 0], 
                fov: cameraToUse.fov,
                aspect: cameraToUse.aspect
            },
            timestamp: new Date().toISOString(),
            dimensions: { width, height }
        };
        
    } catch (error) {
        console.error('Error capturing the thumbnail with the specified camera:', error);
        return null;
    }
}

async saveProject() {
    try {
        const token = localStorage.getItem('auth_token');
        this.isSaving = true;
        
        
        this.showNotification('Saving to local cache...');
        const cacheResult = await this.saveToLocalCache();
        
        
        if (token) {
            this.showNotification('Saving to server...');
            await this.exportAndSaveToServer();
            this.showNotification('Project saved on the server and in the cache');
        } else {
            this.showNotification('Project saved in cache');
        }
        
        
        try {
            const metadata = {
                fileId: window.currentFileId,
                timestamp: new Date().toISOString(),
                elementCount: this.modelManager?.buildings?.children.length || 0,
                savedToServer: !!token
            };
            localStorage.setItem('three_viewer_last_save', JSON.stringify(metadata));
        } catch (e) {
            
        }
        
        
        if (this.historyManager) {
            this.historyManager.clearHistory();
        }
        
        this.isSaving = false;
        return true;
    } catch (error) {
        console.error('Error saving the project:', error);
        this.showNotification('Save error', true);
        this.isSaving = false;
        return false;
    }
}
    
    
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

 async saveToLocalCache() {
    try {
        
        const glbData = await this.generateGLBData();
        
        if (!glbData || glbData.byteLength === 0) {
            throw new Error('The GLB file could not be generated');
        }
        
        
        if (!window.currentFileId) {
            const urlFileId = this.getFileIdFromURL();
            if (urlFileId) {
                window.currentFileId = urlFileId;
            } else {
                window.currentFileId = `element_${Date.now()}`;
            }
        }
        
        
        const result = await this.saveToIndexedDB(glbData, {
            fileId: window.currentFileId,
            modelName: this.currentFileName || 'Unnamed Model',
            elementCount: this.modelManager?.buildings?.children.length || 0
        });
        if (window.currentFileId) {
            localStorage.setItem('current_project_id', window.currentFileId);
        }
        localStorage.setItem('three_viewer_last_save', JSON.stringify({
            timestamp: Date.now(),
            fileId: window.currentFileId
        }));
        if (this.historyManager) {
            this.historyManager.clearHistory();
        }  
        return result;
    } catch (error) {
        console.error('Cache save error:', error);
        throw error;
    }
}
    
   
toggleMultiSelectMode() {
        this.multiSelectMode = !this.multiSelectMode;
        
        const multiSelectToggleBtn = document.getElementById('multiSelectToggle');
        const multiSelectStatus = document.getElementById('multiSelectStatus');
        
        if (multiSelectToggleBtn) {
            if (this.multiSelectMode) {
                multiSelectToggleBtn.innerHTML = '<i class="fas fa-mouse-pointer"></i> Multi Select';
                multiSelectToggleBtn.classList.add('active');
                multiSelectToggleBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                
                if (multiSelectStatus) {
                    multiSelectStatus.textContent = 'Click adds to selection (Ctrl not needed)';
                }
            } else {
                multiSelectToggleBtn.innerHTML = '<i class="fas fa-mouse-pointer"></i> Single Select';
                multiSelectToggleBtn.classList.remove('active');
                multiSelectToggleBtn.style.background = '';
                
                if (multiSelectStatus) {
                    multiSelectStatus.textContent = 'Click selects single element';
                }
            }
        }
        
        this.showNotification(`Multi-select mode ${this.multiSelectMode ? 'ON' : 'OFF'}`);
    }

async exportAndSaveToServer() {
    try {
        this.showNotification('Processing and removing duplicates...');
        
        const { data: glbData, count } = await this.generateGLBData();
        
        if (!glbData || glbData.byteLength === 0) {
            this.showNotification('Could not generate GLB file', true);
            return;
        }
        
        const blob = new Blob([glbData], { type: 'model/gltf-binary' });
        
        if (count === 0) {
            this.showNotification('No visible objects to export', true);
            return;
        }
        
        this.showNotification(`Saving to server (${count} objects)...`);
        
        await this.saveExportToServer(blob, count);
        
        this.showNotification(`Project saved on server (${count} objects)`);

    } catch (error) {
        console.error('Error during export and save:', error);
        this.showNotification('Error saving to server', true);
    }
}


async loadGLBFromArrayBuffer(arrayBuffer, skipCentering = false) {
    return new Promise((resolve, reject) => {
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            reject(new Error('ArrayBuffer gol'));
            return;
        }
        
        if (!this.modelLoaders.glb) {
            this.modelLoaders.glb = new THREE.GLTFLoader();
        }
        
        const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        
        this.modelLoaders.glb.load(
            url,
            (gltf) => {
                try {
                    const model = gltf.scene;
                    
                    
                    if (this.modelManager && this.modelManager.buildings) {
                        this.modelManager.buildings.clear();
                    }
                    
                    if (this.externalModels) {
                        this.externalModels.clear();
                    }
                    
                    
                    this.processCacheModel(model, skipCentering);
                    
                    URL.revokeObjectURL(url);
                    
                    
                    this.renderer.render(this.scene, this.camera);
                    
                    resolve(model);
                } catch (error) {
                    URL.revokeObjectURL(url);
                    reject(error);
                }
            },
            undefined,
            (error) => {
                URL.revokeObjectURL(url);
                reject(error);
            }
        );
    });
}
addModelFromCache(model) {
    
    
    
    this.analyzeModelStructure(model);
    
    
    model.traverse((child) => {
        if (child.isMesh || child.isGroup || child.isObject3D) {
            
            if (child.id === undefined || child.id === null) {
                child.id = `elemnet_${Math.random().toString(36).substr(2, 8)}`;
            }
            
            
            if (!child.userData) {
                child.userData = {};
            }
            
            
            const userData = {
                ...child.userData,
                loadedFromCache: true,
                cacheLoadTime: new Date().toISOString(),
                hasOriginalPosition: true,
                preservePosition: true,
                
                originalHeight: child.userData?.originalHeight || 10,
                originalWidth: child.userData?.originalWidth || 10,
                originalDepth: child.userData?.originalDepth || 10,
                originalHeightInitial: child.userData?.originalHeightInitial || 10,
                baseHeight: child.userData?.baseHeight || 10,
                appliedScale: child.userData?.appliedScale || child.scale.clone(),
                appliedScaleFactor: child.userData?.appliedScaleFactor || 1,
                modifications: child.userData?.modifications || {},
                
                originalPosition: child.position ? child.position.clone() : new THREE.Vector3(),
                originalRotation: child.rotation ? child.rotation.clone() : new THREE.Euler(),
                originalScale: child.scale ? child.scale.clone() : new THREE.Vector3(1, 1, 1)
            };
            
            child.userData = userData;
            
            
            if (!child.userData.elementId) {
                child.userData.elementId = `element_${child.id}`;
            }
            
            child.elementId = child.userData.elementId;
            
            
            if (child.userData.originalCenter) {
                
                
                
                if (child.userData.currentPosition) {
                    child.position.copy(child.userData.currentPosition);
                }
                
                
                child.userData.hasBeenScaled = true;
                
                
                if (child.userData.originalScale) {
                    child.scale.copy(child.userData.originalScale);
                }
            }
            
            
            if (child.isMesh && !child.userData.originalMaterials) {
                if (Array.isArray(child.material)) {
                    child.userData.originalMaterials = child.material.map(mat => {
                        if (mat && mat.clone) return mat.clone();
                        return new THREE.MeshLambertMaterial({ color: 0x888888 });
                    });
                } else {
                    child.userData.originalMaterials = [
                        (child.material && child.material.clone) ? child.material.clone() : new THREE.MeshLambertMaterial({ color: 0x888888 })
                    ];
                }
            }
        }
    });
    
    
    this.modelManager.buildings.add(model);
    
    
    return model;
}
arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

 formatCacheTimestamp(timestamp) {
    if (!timestamp) return 'unknown date';
    
    try {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'now';
        if (diffMins < 60) return `now ${diffMins} min`;
        if (diffHours < 24) return `now ${diffHours} hours`;
        if (diffDays === 1) return 'yesterday';
        if (diffDays < 7) return `now ${diffDays} days`;
        
        return date.toLocaleDateString('ro-RO', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return timestamp;
    }
}

setupAutoSave() {
    
    this.autoSaveInterval = setInterval(() => {
        const token = localStorage.getItem('auth_token');
        if (!token && this.modelManager && this.modelManager.buildings.children.length > 0) {
            const lastSave = localStorage.getItem('last_element_save');
            const currentTime = Date.now();
            
            
            if (!lastSave || (currentTime - parseInt(lastSave)) > 120000) {
                this.saveToLocalCache().catch(() => {});
                localStorage.setItem('last_element_save', currentTime.toString());
            }
        }
    }, 180000); 
}



async hasCache() {
    try {
        if (this.isIndexedDBSupported && this.db) {
            const stats = await this.getIndexedDBStats();
            return stats && stats.count > 0;
        }
        
        
        const fallbackCache = localStorage.getItem('three_viewer_fallback_cache');
        return !!fallbackCache;
    } catch (error) {
        console.error('Error checking the cache:', error);
        return false;
    }
}
captureCurrentState() {
    try {
        const state = {
            metadata: {
                version: '1.0',
                timestamp: new Date().toISOString(),
                fileId: window.currentFileId || `element_${Date.now()}`
            },
            scene: {
                camera: this.getCurrentCameraPosition(),
                buildings: this.captureBuildingsState(),
                externalModels: this.captureExternalModelsState(),
                lighting: this.captureLightingState()
            },
            history: this.historyManager ? this.historyManager.getHistory() : null,
            stats: this.stats
        };
        
        return state;
    } catch (error) {
        console.error('Error capturing state:', error);
        return null;
    }
}

captureBuildingsState() {
    const buildings = [];
    
    if (this.modelManager && this.modelManager.buildings) {
        this.modelManager.buildings.traverse((child) => {
            if (child.isMesh) {
                buildings.push({
                    id: child.userData?.elementId || child.id,
                    type: child.userData?.type || 'building',
                    position: child.position.toArray(),
                    rotation: child.rotation.toArray(),
                    scale: child.scale.toArray(),
                    geometry: this.captureGeometryData(child.geometry),
                    material: this.captureMaterialData(child.material),
                    visible: child.visible,
                    userData: child.userData || {}
                });
            }
        });
    }
    
    return buildings;
}

captureExternalModelsState() {
    const models = [];
    
    if (this.externalModels) {
        this.externalModels.traverse((child) => {
            if (child.isMesh || child.isGroup) {
                models.push({
                    id: child.userData?.elementId || child.id,
                    name: child.name,
                    type: 'external',
                    position: child.position.toArray(),
                    rotation: child.rotation.toArray(),
                    scale: child.scale.toArray(),
                    visible: child.visible,
                    userData: child.userData || {}
                });
            }
        });
    }
    
    return models;
}

captureLightingState() {
    return {
        directionalLight: {
            position: this.directionalLight ? this.directionalLight.position.toArray() : [0, 0, 0],
            intensity: this.directionalLight ? this.directionalLight.intensity : 1.0
        }
    };
}

captureGeometryData(geometry) {
    if (!geometry) return null;
    
    return {
        type: geometry.type,
        parameters: geometry.parameters || {},
        vertexCount: geometry.attributes?.position?.count || 0
    };
}

captureMaterialData(material) {
    if (!material) return null;
    
    if (Array.isArray(material)) {
        return material.map(mat => this.captureSingleMaterialData(mat));
    }
    
    return this.captureSingleMaterialData(material);
}

captureSingleMaterialData(material) {
    return {
        type: material.type,
        color: material.color ? material.color.getHex() : 0x888888,
        opacity: material.opacity || 1.0
    };
}

restoreFromState(state) {
    if (!state) return;
    
    try {
        
        if (state.scene?.camera) {
            this.camera.position.set(
                state.scene.camera.position[0] || 0,
                state.scene.camera.position[1] || 2000,
                state.scene.camera.position[2] || 2000
            );
            this.controls.target.set(
                state.scene.camera.target[0] || 0,
                state.scene.camera.target[1] || 0,
                state.scene.camera.target[2] || 0
            );
            this.controls.update();
        }
        
        
        if (state.scene?.buildings && this.modelManager) {
            this.restoreBuildingsFromState(state.scene.buildings);
        }
        
        if (state.scene?.externalModels && this.externalModels) {
            this.restoreExternalModelsFromState(state.scene.externalModels);
        }
        
        
        if (state.scene?.lighting && this.directionalLight) {
            const light = state.scene.lighting.directionalLight;
            this.directionalLight.position.set(light.position[0], light.position[1], light.position[2]);
            this.directionalLight.intensity = light.intensity;
        }
        
        
        if (state.stats) {
            this.stats = { ...this.stats, ...state.stats };
        }
        
    } catch (error) {
        console.error('Error restoring state:', error);
    }
}

restoreBuildingsFromState(buildingsState) {
    
    if (this.modelManager.buildings) {
        while(this.modelManager.buildings.children.length > 0) {
            this.modelManager.buildings.remove(this.modelManager.buildings.children[0]);
        }
    }
    
    
    buildingsState.forEach(buildingState => {
        const geometry = this.createGeometryFromState(buildingState.geometry);
        const material = this.createMaterialFromState(buildingState.material);
        
        if (geometry && material) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...buildingState.position);
            mesh.rotation.set(...buildingState.rotation);
            mesh.scale.set(...buildingState.scale);
            mesh.visible = buildingState.visible !== false;
            mesh.userData = buildingState.userData || {};
            
            if (!mesh.userData.elementId && buildingState.id) {
                mesh.userData.elementId = buildingState.id;
            }
            
            this.modelManager.buildings.add(mesh);
        }
    });
}

restoreExternalModelsFromState(modelsState) {
    
    console.warn('Restoring external models from cache is limited');
}

createGeometryFromState(geometryState) {
    if (!geometryState) return new THREE.BoxGeometry(10, 10, 10);
    
    switch (geometryState.type) {
        case 'BoxGeometry':
            return new THREE.BoxGeometry(
                geometryState.parameters.width || 10,
                geometryState.parameters.height || 10,
                geometryState.parameters.depth || 10
            );
        case 'SphereGeometry':
            return new THREE.SphereGeometry(
                geometryState.parameters.radius || 5,
                geometryState.parameters.widthSegments || 8,
                geometryState.parameters.heightSegments || 6
            );
        default:
            return new THREE.BoxGeometry(10, 10, 10);
    }
}

createMaterialFromState(materialState) {
    if (!materialState) return new THREE.MeshLambertMaterial({ color: 0x888888 });
    
    if (Array.isArray(materialState)) {
        return new THREE.MeshLambertMaterial({ 
            color: materialState[0]?.color || 0x888888 
        });
    }
    
    return new THREE.MeshLambertMaterial({ 
        color: materialState.color || 0x888888,
        opacity: materialState.opacity || 1.0,
        transparent: materialState.opacity < 1.0
    });
}

formatTimestamp(timestamp) {
    if (!timestamp) return 'n/a';
    
    try {
        const date = new Date(timestamp);
        return date.toLocaleString('ro-RO');
    } catch (e) {
        return timestamp;
    }
}

 async initIndexedDB() {
    if (!this.isIndexedDBSupported) {
        console.warn('IndexedDB is not supported by the browser');
        return false;
    }
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        
        request.onerror = (event) => {
            console.error('Error opening IndexedDB:', event.target.error);
            reject(event.target.error);
        };
        
        request.onsuccess = (event) => {
            this.db = event.target.result;
            
            resolve(true);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            
            if (!db.objectStoreNames.contains(this.storeName)) {
                const store = db.createObjectStore(this.storeName, { 
                    keyPath: 'id',
                    autoIncrement: false 
                });
                
                
                store.createIndex('timestamp', 'timestamp', { unique: false });
                
                
                store.createIndex('fileId', 'fileId', { unique: true });
                
                
            }
        };
    });
}
    
   saveToIndexedDB(glbData, metadata = {}) {
    if (!this.isIndexedDBSupported || !this.db) {
        console.warn('IndexedDB is not available');
        return this.saveToLocalStorageAsFallback(glbData, metadata);
    }

    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        
        let fileId = metadata.fileId || window.currentFileId;
        if (!fileId) {
            fileId = `project_${Date.now()}`;
            window.currentFileId = fileId;
        }

        
        const allElementIds = [];

        if (this.modelManager?.buildings) {
            this.modelManager.buildings.traverse((child) => {
                if (child.isMesh && child.userData?.elementId) {
                    allElementIds.push(child.userData.elementId);
                }
            });
        }

        if (this.externalModels) {
            this.externalModels.traverse((child) => {
                if (child.isMesh && child.userData?.elementId) {
                    allElementIds.push(child.userData.elementId);
                }
            });
        }

        const modelData = {
            id: fileId,
            fileId,
            data: glbData,
            metadata: {
                ...metadata,
                elementIds: allElementIds,
                elementCount: allElementIds.length,
                timestamp: new Date().toISOString(),
                version: '1.0',
                cameraPosition:
                    metadata.cameraPosition || this.camera.position.toArray(),
                cameraTarget:
                    metadata.cameraTarget || this.controls.target.toArray()
            }
        };

        const request = store.put(modelData);

        request.onsuccess = () => {

            resolve({
                id: fileId,
                size: glbData.byteLength,
                timestamp: modelData.metadata.timestamp,
                elementCount: allElementIds.length
            });
        };

        request.onerror = (event) => {
            console.error(
                'Error saving to IndexedDB:',
                event.target.error
            );
            reject(event.target.error);
        };
    });
}

    
    async loadFromIndexedDB(fileId = null) {
        
        if (!this.isIndexedDBSupported || !this.db) {
            console.warn('IndexedDB is not available');
            return this.loadFromLocalStorageAsFallback(fileId);
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            
            const searchKey = fileId || window.currentFileId;
            
            if (!searchKey) {
                
                const index = store.index('timestamp');
                const request = index.openCursor(null, 'prev');
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        
                        resolve(cursor.value);
                    } else {
                        resolve(null);
                    }
                };
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            } else {
                
                const index = store.index('fileId');
                const request = index.get(searchKey);
                
                request.onsuccess = (event) => {
                    const result = event.target.result;
                    if (result) {
                        
                        resolve(result);
                    } else {
                        
                        const idRequest = store.get(searchKey);
                        
                        idRequest.onsuccess = (e) => {
                            if (e.target.result) {
                                
                                resolve(e.target.result);
                            } else {
                                resolve(null);
                            }
                        };
                        
                        idRequest.onerror = (e) => {
                            reject(e.target.error);
                        };
                    }
                };
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            }
        });
    }
    
    async clearIndexedDBCache() {
        if (!this.isIndexedDBSupported || !this.db) {
            return false;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = (event) => {
                
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error('Error clearing IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    async getIndexedDBStats() {
        if (!this.isIndexedDBSupported || !this.db) {
            return null;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const countRequest = store.count();
            const getAllRequest = store.getAll();
            
            let itemCount = 0;
            let totalSize = 0;
            let timestamps = [];
            
            countRequest.onsuccess = (event) => {
                itemCount = event.target.result;
            };
            
            getAllRequest.onsuccess = (event) => {
                const items = event.target.result;
                items.forEach(item => {
                    if (item.data && item.data.byteLength) {
                        totalSize += item.data.byteLength;
                    }
                    if (item.metadata?.timestamp) {
                        timestamps.push(item.metadata.timestamp);
                    }
                });
                
                resolve({
                    count: itemCount,
                    totalSize: totalSize,
                    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                    latest: timestamps.sort().reverse()[0],
                    oldest: timestamps.sort()[0]
                });
            };
            
            getAllRequest.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
    
    
    async saveToLocalStorageAsFallback(glbData, metadata) {
        try {
            
            const base64Data = this.arrayBufferToBase64(glbData);
            
            
            const estimatedSize = base64Data.length * 0.75; 
            const maxSize = 5 * 1024 * 1024; 
            
            if (estimatedSize > maxSize) {
                throw new Error('The model is too large for localStorage');
            }
            
            const cacheData = {
                data: base64Data,
                metadata: {
                    ...metadata,
                    timestamp: new Date().toISOString(),
                    storedIn: 'localStorage'
                }
            };
            
            localStorage.setItem('three_viewer_fallback_cache', JSON.stringify(cacheData));
            
            return { storedIn: 'localStorage', size: estimatedSize };
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            throw error;
        }
    }
    
    async loadFromLocalStorageAsFallback() {
        try {
            const cacheDataStr = localStorage.getItem('three_viewer_fallback_cache');
            
            if (!cacheDataStr) {
                return null;
            }
            
            const cacheData = JSON.parse(cacheDataStr);
            
            if (!cacheData.data || !cacheData.metadata) {
                localStorage.removeItem('three_viewer_fallback_cache');
                return null;
            }
            
            
            const glbData = this.base64ToArrayBuffer(cacheData.data);
            
            return {
                data: glbData,
                metadata: cacheData.metadata
            };
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            localStorage.removeItem('three_viewer_fallback_cache');
            return null;
        }
    }

 
    async clearAllCache() {
        try {
            
            if (this.db) {
                await this.clearIndexedDBCache();
            }
            
            
            localStorage.removeItem('three_viewer_fallback_cache');
            localStorage.removeItem('three_viewer_last_save');
            
            
            if (this.historyManager) {
                this.historyManager.clearHistory();
            }
            
            this.showNotification('The cache has been fully cleared');
            return true;
        } catch (error) {
            console.error('Error clearing the cache:', error);
            this.showNotification('Error clearing the cache', true);
            return false;
        }
    }
    
    
    setupAutoSave() {
        
        this.autoSaveInterval = setInterval(async () => {
            const token = localStorage.getItem('auth_token');
            
            if (!token && this.modelManager && this.modelManager.buildings.children.length > 0) {
                const lastSave = localStorage.getItem('three_viewer_last_save');
                const currentTime = Date.now();
                
                
                if (!lastSave || (currentTime - JSON.parse(lastSave).timestamp) > 120000) {
                    try {
                        await this.saveToLocalCache();
                        const metadata = {
                            timestamp: currentTime,
                            fileId: window.currentFileId
                        };
                        localStorage.setItem('three_viewer_last_save', JSON.stringify(metadata));
                        
                    } catch (error) {
                        console.warn('Auto-save failed:', error);
                    }
                }
            }
        }, 180000); 
    }

async generateGLBData() {
    return new Promise((resolve, reject) => {
        try {
            this.showNotification('Processing...');

            const exportGroup = new THREE.Group();
            const processedSignatures = new Set();
            const processedUUIDs = new Set();
            
            let count = 0;
            
            const _pos = new THREE.Vector3();
            const _quat = new THREE.Quaternion();
            const _scale = new THREE.Vector3();

            const getTypeCode = (child) => {
                if (child.userData && child.userData.type) {
                    const type = child.userData.type;
                    switch(type) {
                        case 'building': return '1';
                        case 'road': return '2';
                        case 'water': return '3';
                        case 'tree': return '4';
                        case 'other': return '5';
                        case 'external': return '6';
                        case 'imported_model': return '7';
                        default: return type;
                    }
                }
                
                if (child.isExternalModel) return '6';
                
                if (child.isUserCreated) return '5';
                
                if (child.name && child.name.toLowerCase().includes('building')) return '1';
                if (child.name && child.name.toLowerCase().includes('road')) return '2';
                if (child.name && child.name.toLowerCase().includes('water')) return '3';
                if (child.name && child.name.toLowerCase().includes('tree')) return '4';
                
                return '0';
            };

            const processNode = (child) => {
                if (!child.isMesh || !child.visible) return;

                if (processedUUIDs.has(child.uuid)) return;
                processedUUIDs.add(child.uuid);

                child.updateWorldMatrix(true, false);
                child.matrixWorld.decompose(_pos, _quat, _scale);
                
                const vCount = child.geometry.attributes.position ? child.geometry.attributes.position.count : 0;
                
                const sig = `P:${_pos.x.toFixed(2)}_${_pos.y.toFixed(2)}_${_pos.z.toFixed(2)}_R:${_quat.x.toFixed(2)}_${_quat.y.toFixed(2)}_V:${vCount}`;

                if (processedSignatures.has(sig)) {
                    return;
                }
                processedSignatures.add(sig);

                const clone = new THREE.Mesh(child.geometry, child.material);
                
                clone.position.copy(_pos);
                clone.quaternion.copy(_quat);
                clone.scale.copy(_scale);

                clone.name = child.name;
                clone.visible = child.visible;
                clone.castShadow = child.castShadow;
                clone.receiveShadow = child.receiveShadow;
                
                const typeCode = getTypeCode(child);
                const originalType = child.userData?.type || 
                                   (child.isExternalModel ? 'external' : 
                                   (child.isUserCreated ? 'user_created' : 'unknown'));
                
                clone.userData = {
                    type: originalType,
                    originalCenter: child.userData?.originalCenter ? child.userData.originalCenter.clone() : null,
                    currentPosition: _pos.toArray(),
                    currentRotation: _quat.toArray(),
                    currentScale: _scale.toArray(),
                };

                exportGroup.add(clone);
                count++;
            };

            if (this.modelManager?.buildings) {
                this.modelManager.buildings.traverse(processNode);
            }
            if (this.externalModels) {
                this.externalModels.traverse(processNode);
            }

            if (count === 0) {
                reject(new Error('There are no visible objects to export'));
                return;
            }

            this.showNotification(`The file is being generated (${count} objects)...`);

            const exporter = new THREE.GLTFExporter();
            
            exporter.parse(
                exportGroup,
                (gltf) => {
                    try {
                        const glbData = gltf instanceof ArrayBuffer 
                            ? gltf 
                            : new TextEncoder().encode(JSON.stringify(gltf));

                        exportGroup.clear();
                        resolve({ data: glbData, count: count });
                    } catch (error) {
                        exportGroup.clear();
                        reject(error);
                    }
                },
                { 
                    binary: true, 
                    onlyVisible: true, 
                    trs: true, 
                    truncateDrawRange: true, 
                    embedImages: true 
                }
            );

        } catch (error) {
            reject(error);
        }
    });
}

async loadGLBFromArrayBuffer(arrayBuffer, skipCentering = false) {
    return new Promise((resolve, reject) => {
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            reject(new Error('ArrayBuffer gol'));
            return;
        }
        
        if (!this.modelLoaders.glb) {
            this.modelLoaders.glb = new THREE.GLTFLoader();
        }
        
        const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        
        this.modelLoaders.glb.load(
            url,
            (gltf) => {
                try {
                    const model = gltf.scene;
                    
                    
                    if (this.modelManager && this.modelManager.buildings) {
                        this.modelManager.buildings.clear();
                    }
                    
                    if (this.externalModels) {
                        this.externalModels.clear();
                    }
                    
                    
                    this.processCacheModel(model, skipCentering);
                    
                    URL.revokeObjectURL(url);
                    this.hideLoading();
                    resolve(model);
                } catch (error) {
                    URL.revokeObjectURL(url);
                    this.hideLoading();
                    reject(error);
                }
            },
            undefined,
            (error) => {
                URL.revokeObjectURL(url);
                this.hideLoading();
                reject(error);
            }
        );
    });
}

processCacheModel(model, skipCentering = false) {
    

    
    this.analyzeModelStructure(model);

    model.traverse((child) => {
        if (child.isMesh || child.isGroup || child.isObject3D) {
            
            const savedUserData = child.userData || {};
            
            
            let currentPosition = savedUserData.currentPosition;
            let currentRotation = savedUserData.currentRotation;
            let currentScale = savedUserData.currentScale;
            
            if (currentPosition && Array.isArray(currentPosition)) {
                currentPosition = new THREE.Vector3().fromArray(currentPosition);
            }
            
            if (currentRotation && Array.isArray(currentRotation)) {
                currentRotation = new THREE.Quaternion().fromArray(currentRotation);
            }
            
            if (currentScale && Array.isArray(currentScale)) {
                currentScale = new THREE.Vector3().fromArray(currentScale);
            }
            
            
            let type = savedUserData.type || 'other';
            if (type === 'other') {
                if (child.type === 'Mesh' && child.parent && child.parent.userData && child.parent.userData.type) {
                    type = child.parent.userData.type;
                } else if (child.name && ['building', 'highway', 'water', 'natural', 'landuse', 'other', 'external'].includes(child.name)) {
                    type = child.name;
                }
            }

            
            const userData = {
                ...savedUserData,
                currentPosition: currentPosition || child.position.clone(),
                currentRotation: currentRotation || child.quaternion.clone(),
                currentScale: currentScale || child.scale.clone(),
                loadedFromCache: true,
                cacheLoadTime: new Date().toISOString(),
                elementId: savedUserData.elementId || `element_${Math.floor(Math.random() * 10000000000).toString().padStart(10, '0')}`,
                type: type
            };

            
            if (currentPosition && skipCentering) {
                child.position.copy(currentPosition); 
            }
            
            if (currentRotation && skipCentering) {
                child.quaternion.copy(currentRotation);
            }
            if (currentScale && skipCentering) {
                child.scale.copy(currentScale); 
            }
            child.userData = userData;
            child.elementId = child.userData.elementId;
            if (!child.userData.originalMaterials) {
                if (Array.isArray(child.material)) {
                    child.userData.originalMaterials = child.material.map(mat => {
                        if (mat && mat.clone) return mat.clone();
                        return new THREE.MeshLambertMaterial({ color: 0x888888 });
                    });
                } else {
                    child.userData.originalMaterials = [
                        (child.material && child.material.clone) ? child.material.clone() : new THREE.MeshLambertMaterial({ color: 0x888888 })
                    ];
                }
            }
        }
    });

    this.modelManager.buildings.add(model);
    
}
convertDataFromCache(userData) {
    
    const result = { ...userData };
    
    if (result.currentPosition && Array.isArray(result.currentPosition)) {
        result.currentPosition = new THREE.Vector3().fromArray(result.currentPosition);
    }
    
    if (result.currentRotation && Array.isArray(result.currentRotation)) {
        result.currentRotation = new THREE.Quaternion().fromArray(result.currentRotation);
    }
    
    if (result.currentScale && Array.isArray(result.currentScale)) {
        result.currentScale = new THREE.Vector3().fromArray(result.currentScale);
    }
    
    return result;
}
async saveToLocalCache() {
    try {
        
        const { data: glbData, count } = await this.generateGLBData();
        
        if (!glbData || glbData.byteLength === 0) {
            throw new Error('The GLB file could not be generated');
        }
        
        if (!window.currentFileId) {
            const urlFileId = this.getFileIdFromURL();
            if (urlFileId) {
                window.currentFileId = urlFileId;
            } else {
                window.currentFileId = `element_${Date.now()}`;
            }
        }
        
        const result = await this.saveToIndexedDB(glbData, {
            fileId: window.currentFileId,
            modelName: this.currentFileName || 'Unnamed Model',
            elementCount: count,
            cameraPosition: this.camera.position.toArray(),
            cameraTarget: this.controls.target.toArray()
        });
        
        if (window.currentFileId) {
            localStorage.setItem('current_project_id', window.currentFileId);
        }
        
        localStorage.setItem('three_viewer_last_save', JSON.stringify({
            timestamp: Date.now(),
            fileId: window.currentFileId
        }));
        
        if (this.historyManager) {
            this.historyManager.clearHistory();
        }
        
        
        return result;
    } catch (error) {
        console.error('Eroare la salvarea în cache:', error);
        throw error;
    }
}

async loadFromLocalCache(fileId = null) {
    try {
        
        
        let cachedData = null;
        
        if (this.isIndexedDBSupported && this.db) {
            
            cachedData = await this.loadFromIndexedDB(fileId);
        }
        
        if (!cachedData) {
            
            cachedData = await this.loadFromLocalStorageAsFallback();
        }
        
        if (!cachedData) {
            
            return false;
        }
        this.showNotification(`Loading from cache...`);
        
        
        this.camera.position.set(0, 2000, 2000);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        
        
        await this.loadGLBFromArrayBuffer(cachedData.data, true);
        
        
        if (cachedData.metadata?.cameraPosition && cachedData.metadata?.cameraTarget) {
            const camPos = cachedData.metadata.cameraPosition;
            const camTarget = cachedData.metadata.cameraTarget;
            
            
            const isValidPosition = camPos.every(val => 
                !isNaN(val) && isFinite(val) && Math.abs(val) < 1000000
            );
            
            const isValidTarget = camTarget.every(val => 
                !isNaN(val) && isFinite(val) && Math.abs(val) < 1000000
            );
            
            if (isValidPosition && isValidTarget) {
                this.camera.position.set(camPos[0], camPos[1], camPos[2]);
                this.controls.target.set(camTarget[0], camTarget[1], camTarget[2]);
                this.controls.update();
                
            } else {
                
                this.centerCameraOnBuildings();
                
            }
        } else {
            
            this.centerCameraOnBuildings();
        }
        
        if (cachedData.metadata?.fileId && cachedData.metadata.fileId !== window.currentFileId) {
            window.currentFileId = cachedData.metadata.fileId;
        }
        
        if (this.historyManager) {
            this.historyManager.clearHistory();
        }
        
        
        this.renderer.render(this.scene, this.camera);
        
        this.showNotification(`Project loaded from cache`);
        return true;
        
    } catch (error) {
        console.error('Error loading from cache:', error);
        try {
            await this.clearAllCache();
        } catch (e) {
            console.error('Could not clear cache:', e);
        }
        
        return false;
    }
}
async saveToIndexedDB(glbData, metadata = {}) {
    if (!this.isIndexedDBSupported || !this.db) {
        return this.saveToLocalStorageAsFallback(glbData, metadata);
    }
    
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        
        
        let fileId = metadata.fileId || window.currentFileId;
        if (!fileId) {
            fileId = `project_${Date.now()}`;
            window.currentFileId = fileId;
        }
        
        
        let cameraPositionToSave;
        let cameraTargetToSave;
        
        if (this.modelManager && this.modelManager.buildings.children.length > 0) {
            
            const box = new THREE.Box3();
            const allObjects = [];
            
            
            this.modelManager.buildings.traverse((child) => {
                if (child.isMesh || child.isGroup) {
                    allObjects.push(child);
                }
            });
            
            
            if (this.externalModels) {
                this.externalModels.traverse((child) => {
                    if (child.isMesh || child.isGroup) {
                        allObjects.push(child);
                    }
                });
            }
            
            
            if (allObjects.length > 0) {
                box.setFromObject(allObjects[0]);
                for (let i = 1; i < allObjects.length; i++) {
                    box.expandByObject(allObjects[i]);
                }
                
                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                box.getCenter(center);
                box.getSize(size);
                
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = this.camera.fov * (Math.PI / 180);
                let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2));
                cameraDistance *= 1.5;
                
                
                cameraPositionToSave = [
                    center.x,
                    center.y + cameraDistance * 0.7, 
                    center.z + cameraDistance
                ];
                
                cameraTargetToSave = [center.x, center.y, center.z];
                
                
                
            }
        }
        
        
        if (!cameraPositionToSave) {
            cameraPositionToSave = this.camera.position.toArray();
            cameraTargetToSave = this.controls.target.toArray();
        }
        
        const modelData = {
            id: fileId,
            fileId,
            data: glbData,
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                version: '1.0',
                cameraPosition: cameraPositionToSave,
                cameraTarget: cameraTargetToSave,
                elementCount: this.modelManager?.buildings?.children.length || 0
            }
        };
        
        const request = store.put(modelData);
        
        request.onsuccess = () => {
            resolve({
                id: fileId,
                size: glbData.byteLength,
                timestamp: modelData.metadata.timestamp
            });
        };
        
        request.onerror = (event) => {
            console.error(
                ' Error saving to IndexedDB:',
                event.target.error
            );
            reject(event.target.error);
        };
    });
}
 setupUndoRedoListeners() {
        document.addEventListener('keydown', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }
            
            const isCtrl = event.ctrlKey || event.metaKey;
            
            if (isCtrl) {
                switch(event.key.toLowerCase()) {
                    case 'z':
                        event.preventDefault();
                        if (event.shiftKey) {
                            this.historyManager.redo();
                        } else {
                            this.historyManager.undo();
                        }
                        break;
                        
                    case 'y':
                        event.preventDefault();
                        this.historyManager.redo();
                        break;
                }
            }
        });
    }


}
