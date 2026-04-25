class ElementCreator {
    constructor(scene, modelManager, renderer, camera) {
        this.scene = scene;
        this.modelManager = modelManager;
        this.renderer = renderer;
        this.camera = camera;
        
        this.creationMode = false;
        this.previewElement = null;
        this.creationPlane = null;
        this.creationEventListeners = null;
        this.raycaster = new THREE.Raycaster();
        
        this.rotationAngle = 0;
        this.selectedColor = "#ff0000";
        
        this.init();
    }

    init() {
        this.setupCreationControls();
    }

 setupCreationControls() {
        
        this.creationPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
        this.visualPlane = null; 
    }

    setupCreationUI() {
        this.viewer = window.threeViewer;
    }
    
    confirmColorSelection() {
        const colorInput = document.getElementById('newElementColor');
        if (!colorInput) {
            console.error('The color input was not found!');
            return;
        }
        
        const newColor = colorInput.value;
        this.selectedColor = newColor;
        
        const currentColorHex = document.getElementById('currentColorHex');
        const colorPreview = document.getElementById('colorPreview');
        
        if (currentColorHex) {
            currentColorHex.textContent = this.selectedColor;
        }
        if (colorPreview) {
            colorPreview.style.background = this.selectedColor;
        }
        
        if (this.creationMode) {
            if (this.previewElement) {
                this.updatePreviewColor();
            } else {
                this.createPreviewElement();
            }
        }
        
        this.showNotification(`Color applied: ${this.selectedColor}`);
    }

    rotatePreview(degrees) {
        
        this.rotationAngle += THREE.MathUtils.degToRad(degrees);
        this.rotationAngle = this.rotationAngle % (2 * Math.PI);
        
        const degreesValue = THREE.MathUtils.radToDeg(this.rotationAngle);
        const elementRotation = document.getElementById('elementRotation');
        if (elementRotation) {
            elementRotation.value = Math.round(degreesValue);
        }
        
        this.updatePreviewRotation();
    }

    resetRotation() {
        this.rotationAngle = 0;
        const elementRotation = document.getElementById('elementRotation');
        if (elementRotation) {
            elementRotation.value = 0;
        }
        this.updatePreviewRotation();
    }

    updatePreviewRotation() {
        if (this.previewElement) {
            
            this.previewElement.rotation.y = this.rotationAngle;
        }
    }

    toggleCreationMode() {
        this.creationMode = !this.creationMode;
        const creationPanel = document.getElementById('creationPanel');
        const createElementBtn = document.getElementById('createElementBtn');
        
        if (this.creationMode) {
            creationPanel.style.display = 'block';
            createElementBtn.style.background = '#ef4444';
            createElementBtn.innerHTML = ' Creation stopped';
            this.showNotification('Advanced creation mode activated');
        } else {
            creationPanel.style.display = 'none';
            createElementBtn.style.background = '#10b981';
            createElementBtn.innerHTML = 'New element';
            this.cancelElementCreation();
            this.showNotification('Creation mode deactivated');
        }
    }
    
    updatePreviewColor() {
        if (!this.previewElement) return;
        
        try {
            const threeColor = new THREE.Color(this.selectedColor);
            this.previewElement.material.color = threeColor;
            this.previewElement.material.needsUpdate = true;
            
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error('Error while updating the preview color:', error);
        }
    }
    
    startElementCreation() {
        this.creationMode = true;
        this.cleanupPreview();
        this.createPreviewElement();
        this.setupCreationEventListeners();
        this.updateCreationStatus('Active');
        this.showNotification('Placement mode active');
    }

    setupCreationEventListeners() {
        this.removeCreationEventListeners();
        
        this.creationEventListeners = {
            mousemove: this.handleCreationMouseMove.bind(this),
            keydown: this.handleCreationKeyDown.bind(this),
            contextmenu: this.handleContextMenu.bind(this)
        };
        
        document.addEventListener('mousemove', this.creationEventListeners.mousemove, { passive: true });
        document.addEventListener('keydown', this.creationEventListeners.keydown);
        document.addEventListener('contextmenu', this.creationEventListeners.contextmenu);
    }

    removeCreationEventListeners() {
        if (this.creationEventListeners) {
            document.removeEventListener('mousemove', this.creationEventListeners.mousemove);
            document.removeEventListener('keydown', this.creationEventListeners.keydown);
            document.removeEventListener('contextmenu', this.creationEventListeners.contextmenu);
            this.creationEventListeners = null;
        }
    }

    createPreviewElement() {
        const elementType = document.getElementById('newElementType').value;
        const shape = document.getElementById('elementShape').value;
        const height = parseFloat(document.getElementById('newElementHeight').value) || 10;
        const width = parseFloat(document.getElementById('newElementWidth').value) || 5;
        const depth = parseFloat(document.getElementById('newElementDepth').value) || 5;
        
        this.cleanupPreview();
        
        let geometry, material;
        
        if (shape === 'cube') {
            
            geometry = new THREE.BoxGeometry(width, height, depth); 
            material = new THREE.MeshLambertMaterial({
                color: new THREE.Color(this.selectedColor),
                transparent: true,
                opacity: 0.6
            });
        } else {
            geometry = this.createGeometry(shape, width, height, depth);
            material = new THREE.MeshLambertMaterial({
                color: new THREE.Color(this.selectedColor),
                transparent: true,
                opacity: 0.6
            });
        }
        
        this.previewElement = new THREE.Mesh(geometry, material);
        this.previewElement.visible = false;
        this.previewElement.name = 'preview_element';
        
        this.updatePreviewRotation();
        this.scene.add(this.previewElement);
        
        
    }

    createGeometry(shape, width, height, depth) {
        switch(shape) {
            case 'sphere':
                return new THREE.SphereGeometry(width, 32, 32);
            case 'cylinder':
                
                return new THREE.CylinderGeometry(width/2, width/2, height, 32); 
            case 'cone':
                
                return new THREE.ConeGeometry(width, height, 32); 
            case 'pyramid':
                
                return new THREE.ConeGeometry(width, height, 4); 
            case 'torus':
                return new THREE.TorusGeometry(width, depth/4, 16, 32);
            case 'plane':
                const planeGeometry = new THREE.PlaneGeometry(width, depth);
                
                
                return planeGeometry;
            case 'cube':
            default:
                
                return new THREE.BoxGeometry(width, height, depth); 
        }
    }

    updatePreviewElement() {
        if (!this.previewElement) return;
        
        const shape = document.getElementById('elementShape').value;
        const height = parseFloat(document.getElementById('newElementHeight').value) || 10;
        const width = parseFloat(document.getElementById('newElementWidth').value) || 5;
        const depth = parseFloat(document.getElementById('newElementDepth').value) || 5;

        const currentPosition = this.previewElement.position.clone();
        const currentRotation = this.previewElement.rotation.clone();

        const newGeometry = this.createGeometry(shape, width, height, depth);
        
        if (this.previewElement.geometry) this.previewElement.geometry.dispose();
        
        this.previewElement.geometry = newGeometry;
        this.previewElement.material.color.set(new THREE.Color(this.selectedColor));
        
        this.previewElement.position.copy(currentPosition);
        this.previewElement.rotation.copy(currentRotation);
        
        
        if (shape === 'plane') {
            this.previewElement.position.y = 0.1; 
        } else if (shape === 'torus') {
            this.previewElement.position.y = 0; 
        } else {
            
            this.previewElement.position.y = height / 2;
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    cleanupPreview() {
        if (this.previewElement) {
            this.scene.remove(this.previewElement);
            if (this.previewElement.geometry) this.previewElement.geometry.dispose();
            if (this.previewElement.material) {
                if (Array.isArray(this.previewElement.material)) {
                    this.previewElement.material.forEach(mat => mat.dispose());
                } else {
                    this.previewElement.material.dispose();
                }
            }
            this.previewElement = null;
        }
    }

resetCreationState() {
        this.removeCreationEventListeners();
        this.cleanupPreview();
        this.rotationAngle = 0;
        this.updateCreationStatus('Inactiv', false);
    }

     handleCreationMouseMove(event) {
        if (!this.creationMode || !this.previewElement) return;
        
        const mouse = new THREE.Vector2();
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(mouse, this.camera);
        
        const intersectPoint = new THREE.Vector3();
        const intersects = this.raycaster.ray.intersectPlane(this.creationPlane, intersectPoint);
        
        if (intersects !== null) {
            
            const shape = document.getElementById('elementShape').value;
            const height = parseFloat(document.getElementById('newElementHeight').value) || 10;
            
            
            this.previewElement.position.x = intersectPoint.x;
            this.previewElement.position.z = intersectPoint.z;
            
            
            if (shape === 'plane') {
                
                this.previewElement.position.y = 0.1;
            } else if (shape === 'torus') {
                
                this.previewElement.position.y = 0;
            } else {
                
                this.previewElement.position.y = height / 2;
            }
            
            this.previewElement.visible = true;
            
            
            this.updateCreationStatus(`Active - Position: X:${this.previewElement.position.x.toFixed(1)}, Y:${this.previewElement.position.y.toFixed(1)}, Z:${this.previewElement.position.z.toFixed(1)}`);
        } else {
            this.previewElement.visible = false;
            this.updateCreationStatus('Active');
        }
    }

    handleCreationKeyDown(event) {
        if (!this.creationMode) return;
        
        const key = event.key.toLowerCase();
        
        if (key === 'r') {
            event.preventDefault();
            this.isRotating = !this.isRotating;
            
            this.showNotification(this.isRotating ? 
                'Rotation mode ACTIVE' : 
                'Rotation mode INACTIVE');
        }
        
        if (key === 'p') {
            event.preventDefault();
            
            if (!this.previewElement || !this.previewElement.visible) {
                
                this.showNotification('Move mouse over the scene', true);
                return;
            }
            
            this.createFinalElement();
        }
        
        if (key === 'escape') {
            event.preventDefault();
            this.cancelElementCreation();
        }
        
        const blockedKeys = ['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift'];
        if (blockedKeys.includes(key) && this.creationMode) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    handleContextMenu(event) {
        if (this.creationMode) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }
    createFinalElement() {
    try {
        const elementType = document.getElementById('newElementType').value;
        const shape = document.getElementById('elementShape').value;
        const height = parseFloat(document.getElementById('newElementHeight').value) || 10;
        const width = parseFloat(document.getElementById('newElementWidth').value) || 5;
        const depth = parseFloat(document.getElementById('newElementDepth').value) || 5;
        
        const geometry = this.createSimpleGeometry(shape, width, height, depth);
        
        
        const material = new THREE.MeshLambertMaterial({ 
            color: new THREE.Color(this.selectedColor)
        });
        
        const finalElement = new THREE.Mesh(geometry, material);
        
        if (this.previewElement && this.previewElement.visible) {
            finalElement.position.copy(this.previewElement.position);
            finalElement.rotation.copy(this.previewElement.rotation);
        } else {
            if (shape === 'plane') {
                finalElement.position.set(0, 0.1, 0);
            } else if (shape === 'torus') {
                finalElement.position.set(0, 0, 0);
            } else {
                finalElement.position.set(0, height / 2, 0);
            }
        }
        
        finalElement.userData = {
            type: elementType,
            shape: shape,
            properties: { 
                createdBy: 'user',
                creationTime: new Date().toISOString(),
                color: this.selectedColor
            },
            originalHeight: height,
            originalWidth: width,
            originalDepth: depth,
            elementId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            isSelected: false,
            isUserCreated: true,
            faceTextures: [],
            
            originalMaterials: [material.clone()],
            originalPosition: finalElement.position.clone(),
            originalRotation: finalElement.rotation.clone(),
            originalScale: finalElement.scale.clone(),
            
            canReceiveTextures: true,
            materialType: 'lambert' 
        };

        this.modelManager.buildings.add(finalElement);
        
        this.renderer.render(this.scene, this.camera);
        this.cleanupPreview();
        this.createPreviewElement();
        
        this.showNotification(`${this.getElementDisplayName(elementType)} creat!`);
        
    } catch (error) {
        console.error('Error while creating the element:', error);
        this.showNotification('Error creating element', true);
    }
}

    createSimpleGeometry(shape, width, height, depth) {
    let geometry;
    
    switch(shape) {
        case 'sphere':
            geometry = new THREE.SphereGeometry(width, 16, 16);
            break;
        case 'cylinder':
            geometry = new THREE.CylinderGeometry(width/2, width/2, height, 16);
            break;
        case 'cone':
            geometry = new THREE.ConeGeometry(width, height, 16);
            break;
        case 'pyramid':
            geometry = new THREE.ConeGeometry(width, height, 4);
            break;
        case 'torus':
            geometry = new THREE.TorusGeometry(width, depth/4, 8, 16);
            break;
        case 'plane':
            geometry = new THREE.PlaneGeometry(width, depth);
            break;
        case 'cube':
        default:
            geometry = new THREE.BoxGeometry(width, height, depth);
            break;
    }
    
    
    if (geometry.attributes.position) {
        const uvs = [];
        const positions = geometry.attributes.position.array;
        
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            
            
            uvs.push(
                (x + width) / (2 * width),
                (y + height) / (2 * height)
            );
        }
        
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    
    return geometry;
}

    getCompatibleMaterials(elementType) {
        try {
            if (this.modelManager && this.modelManager.createFaceMaterials) {
                return this.modelManager.createFaceMaterials(elementType);
            }
        } catch (error) {
            console.warn('Complex materials cannot be created');
        }
        
        return new THREE.MeshLambertMaterial({ 
            color: new THREE.Color(this.selectedColor)
        });
    }

    applyCompatibleUVCoordinates(geometry, elementType, width, depth, height) {
        try {
            if (this.modelManager && this.modelManager.applyBoxUVCoordinatesAllFaces) {
                
                this.modelManager.applyBoxUVCoordinatesAllFaces(geometry, width, depth, height);
                return true;
            }
        } catch (error) {
            console.warn('Complex UV coordinates cannot be applied');
        }
        return false;
    }

    resetColorToDefault() {
        this.selectedColor = "#ff0000";
        document.getElementById('elementColor').value = this.selectedColor;
        document.getElementById('currentColorHex').textContent = this.selectedColor;
        document.getElementById('colorPreview').style.background = this.selectedColor;
        
        if (this.creationMode && this.previewElement) {
            this.updatePreviewColor();
        }
    }

    getElementDisplayName(elementType) {
        const names = {
            building: 'building',
            highway: 'highway', 
            water: 'water',
            natural: 'natural',
            landuse: 'landuse',
            other: 'other'
        };
        return names[elementType] || 'other';
    }

    cancelElementCreation() {
        this.resetCreationState();
        this.creationMode = false;
        this.showNotification('Element creation canceled');
    }

    updateCreationStatus(message, showPanel = true) {
        const statusPanel = document.getElementById('creationStatus');
        const statusText = document.getElementById('statusText');
        
        if (statusPanel && statusText) {
            statusText.textContent = message;
            statusPanel.style.display = showPanel ? 'block' : 'none';
        }
    }

    showNotification(message, isError = false) {
        const oldNotifications = document.querySelectorAll('.element-creator-notification');
        oldNotifications.forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = 'element-creator-notification' + (isError ? ' error' : '');
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
    
    openExternalModelImport() {
        if (!this.viewer) {
            this.showNotification('The import system is not available at the moment', true);
            return;
        }
        
        try {
            this.viewer.openModelImportDialog();
        } catch (error) {
            console.error('Error opening the import dialog:', error);
            this.showNotification('Error opening the import dialog', true);
        }
    }

    createModelImportFallback() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'externalModelFileInput';
        fileInput.style.display = 'none';
        fileInput.accept = '.gltf,.glb,.obj,.fbx,.3mf,.stl,.dae,.ply';
        fileInput.multiple = false;
        
        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                try {
                    await this.handleExternalModelFile(file);
                } catch (error) {
                    console.error('Error processing the file:', error);
                    this.showNotification(`Error loading ${file.name}`, true);
                }
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
        
        this.showNotification('Select a 3D file(.gltf, .glb, .obj, .fbx, etc.)');
    }

    handleExternalModelFile(file) {
        if (!this.viewer) {
            console.error('Viewer is not available');
            this.showNotification('The import system is not available', true);
            return;
        }
        
        const extension = file.name.split('.').pop().toLowerCase();
        
        if (extension === 'obj') {
            this.showNotification(
                'OBJ files may have limitations'
            );
        }
        
        this.showNotification(`Loading ${file.name}...`);
        
        this.viewer.loadExternalModel(file)
            .then(() => {
                this.showNotification(` ${file.name} Successfully loaded!`);
                this.addToImportedModelsList(file.name);
            })
            .catch(error => {
                console.error('Error loading:', error);
                this.showNotification(`Error loading: ${file.name}`, true);
            });
    }

    addToImportedModelsList(fileName) {
        const modelsList = document.getElementById('importedModelsList');
        if (!modelsList) return;
        
        const modelItem = document.createElement('div');
        modelItem.style.cssText = `
            padding: 0.25rem 0.5rem;
            background: rgba(139, 92, 246, 0.1);
            border-radius: 0.25rem;
            margin-bottom: 0.25rem;
            font-size: 0.7rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-left: 2px solid #8b5cf6;
        `;
        
        modelItem.innerHTML = `
            <span style="color: var(--text-primary);"> ${fileName}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.7rem; padding: 2px 6px; border-radius: 3px;">X</button>
        `;
        
        modelsList.appendChild(modelItem);
        
        while (modelsList.children.length > 5) {
            modelsList.removeChild(modelsList.firstChild);
        }
    }

    getImportedExternalModels() {
        if (!this.viewer) return [];
        return this.viewer.getExternalModels();
    }

    deleteSelectedExternalModels() {
        if (!this.viewer) return 0;
        this.viewer.saveState('Delete external models');
        return this.viewer.deleteSelectedExternalModels();
    }
}