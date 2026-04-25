class ModelEditor {
    constructor(scene, modelManager, viewer, renderer, camera) {
        this.scene = scene;
        this.modelManager = modelManager;
        this.viewer = viewer;
        this.renderer = renderer; 
        this.camera = camera;     
        
        this.selectedElement = null;
        this.originalMaterials = new Map();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        
        this.transformControls = null;
        this.transformMode = 'translate';
        this.lastActiveTransformMode = 'translate';
        
        
        this.mainTypes = ['building', 'highway', 'water', 'natural', 'landuse'];
        
        this.init();
    }

    init() {
        this.setupSelectionHelpers();
        this.setupTexturePanel();
        this.setupTransformControls(); 
    }


setupTransformControls() {
    if (!this.renderer || !this.camera) {
        console.error(' ModelEditor: renderer or camera undefined!');
        return;
    }
    
    this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setSize(0.8);
    this.transformControls.visible = false;
    
    
    this.transformControls.setMode(this.lastTransformMode);
    
    this.transformControls.addEventListener('change', () => {
        this.handleTransformChange();
    });
    
    this.transformControls.addEventListener('dragging-changed', (event) => {
        if (this.viewer.controls) {
            this.viewer.controls.enabled = !event.value;
        }
    });
    
    this.scene.add(this.transformControls);
}

handleTransformChange() {
    
    if (!this.transformChangeSaved) {
        
        this.viewer.saveState('Transform modification');
        this.transformChangeSaved = true;
        
    }
    const selectedElements = this.modelManager.getSelectedElements();
    if (selectedElements.length === 1) {
        this.showElementInfo(selectedElements[0]);
        
        
        this.renderer.render(this.scene, this.camera);
    }
}

activateTransformControls(element) {
    if (!element || !element.isObject3D) {
        console.error(' Cannot activate transform controls - invalid element:', element?.userData?.elementId);
        this.viewer.showNotification(' Invalid element - cannot activate controls', true);
        return;
    }
    if (this.transformControls && element) {
        this.deactivateTransformControls();
        
        if (!element.parent) {
            console.error(' Element is not in the scene:', element.userData?.elementId);
            return;
        }
        this.transformChangeSaved = false;
        try {
            this.transformControls.attach(element);
            this.transformControls.visible = true;
            
            
            this.transformControls.setMode(this.lastActiveTransformMode);
            this.transformMode = this.lastActiveTransformMode;
            this.updateTransformControlsUI();
            
        } catch (error) {
            console.error(' Error attaching transform controls:', error);
            this.viewer.showNotification(' Error activating controls', true);
        }
    }
}



setTransformMode(mode) {
    this.lastActiveTransformMode = mode; 
    this.transformMode = mode;
    this.updateTransformControlsUI();
    if (this.transformControls && this.transformControls.visible) {
        this.transformControls.setMode(mode);
    }
    
    const modeNames = {
'translate': 'TRANSLATE - Drag colored axes to move',
'rotate': 'ROTATE - Drag colored circles to rotate',
'scale': 'SCALE - Drag colored cubes to scale'
    };
    this.viewer.showNotification(modeNames[mode] || `Mode ${mode} activate`);
}


applyTransformModeOnSelection() {
    if (this.transformControls && this.transformControls.visible) {
        this.transformControls.setMode(this.lastActiveTransformMode);
        this.transformMode = this.lastActiveTransformMode;
        this.updateTransformControlsUI();
    }
}

updateTransformControlsUI() {
    const buttons = ['transformTranslate', 'transformRotate', 'transformScale'];
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('active');
        }
    });
    const activeButton = document.getElementById(`transform${this.transformMode.charAt(0).toUpperCase() + this.transformMode.slice(1)}`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    const modeDisplay = document.getElementById('transformModeDisplay');
    if (modeDisplay) {
        modeDisplay.textContent = `Mode: ${this.transformMode.toUpperCase()}`;
    }
}


resetElementTransform(element) {
    if (element) {
        if (element.userData.originalPosition) {
            element.position.copy(element.userData.originalPosition);
        } else {
            element.position.set(0, 0, 0);
        }
        element.rotation.set(0, 0, 0);
        element.quaternion.identity();
        element.scale.set(1, 1, 1);
        return true;
    }
    return false;
}





deactivateTransformControls() {
    if (this.transformControls) {
        this.transformControls.detach();
        this.transformControls.visible = false;
        this.transformChangeSaved = false;
        
    }
}


resetElementPosition(element) {
    if (element && element.userData.originalPosition) {
        element.position.copy(element.userData.originalPosition);
        element.rotation.set(0, 0, 0);
        element.scale.set(1, 1, 1);
        return true;
    }
    return false;
}

selectElementsByType(elementType) {
    let count = 0;
    this.buildings.traverse((child) => {
        if (child.isMesh && child.userData.type === elementType) {
            this.selectElement(child, true); 
            count++;
        }
    });
    return count;
}

findById(elementId) {
    let foundElement = null;
    this.buildings.traverse((child) => {
        if (child.userData && child.userData.elementId === elementId) {
            foundElement = child;
        }
    });
    return foundElement;
}


deleteElement(element) {
    if (element && element.parent) {
        element.parent.remove(element);
        return true;
    }
    return false;
}

    
setupEventListeners() {
    const toggleAxesBtn = document.getElementById('toggleAxes');
    if (toggleAxesBtn) {
        toggleAxesBtn.addEventListener('click', () => {
            this.toggleAxesHelper();
        });
    }
    const deleteElementsBtn = document.getElementById('deleteElements');
if (deleteElementsBtn) {
    deleteElementsBtn.addEventListener('click', () => this.deleteSelectedElements());
}
    const showBuildingsCheckbox = document.getElementById('showBuildings');
    if (showBuildingsCheckbox) {
        showBuildingsCheckbox.addEventListener('change', (e) => {
            this.toggleElementVisibility('building', e.target.checked);
        });
    }
    const showRoadsCheckbox = document.getElementById('showRoads');
    if (showRoadsCheckbox) {
        showRoadsCheckbox.addEventListener('change', (e) => {
            this.toggleElementVisibility('highway', e.target.checked);
        });
    }
    const showWaterCheckbox = document.getElementById('showWater');
    if (showWaterCheckbox) {
        showWaterCheckbox.addEventListener('change', (e) => {
            this.toggleElementVisibility('water', e.target.checked);
        });
    }
    const showNaturalCheckbox = document.getElementById('showNatural');
    if (showNaturalCheckbox) {
        showNaturalCheckbox.addEventListener('change', (e) => {
            this.toggleElementVisibility('natural', e.target.checked);
        });
    }
    const showLanduseCheckbox = document.getElementById('showLanduse');
    if (showLanduseCheckbox) {
        showLanduseCheckbox.addEventListener('change', (e) => {
            this.toggleElementVisibility('landuse', e.target.checked);
        });
    }
    const showOtherCheckbox = document.getElementById('showOther');
    if (showOtherCheckbox) {
        showOtherCheckbox.addEventListener('change', (e) => {
            this.toggleOtherElementsVisibility(e.target.checked);
        });
    }
    const lightIntensitySlider = document.getElementById('lightIntensity');
    const lightValueDisplay = document.getElementById('lightValue');
    if (lightIntensitySlider && lightValueDisplay) {
        lightIntensitySlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            lightValueDisplay.textContent = value.toFixed(1);
            this.updateLightIntensity(value);
        });
    }
    const canvas = document.getElementById('three-canvas');
    if (canvas) {
        canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault(); 
            return false;
        });
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }
    const selectAllTypeBtn = document.getElementById('selectAllType');
    if (selectAllTypeBtn) {
        selectAllTypeBtn.addEventListener('click', () => this.handleSelectAllType());
    }
    const deselectAllBtn = document.getElementById('deselectAll');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => this.handleDeselectAll());
    }
    const changeHeightBtn = document.getElementById('changeHeight');
    if (changeHeightBtn) {
        changeHeightBtn.addEventListener('click', () => this.handleChangeHeight());
    }
    const changeColorBtn = document.getElementById('changeColor');
    if (changeColorBtn) {
        changeColorBtn.addEventListener('click', () => this.handleChangeColor());
    }
    const applyTextureBtn = document.getElementById('applyTexture');
    if (applyTextureBtn) {
        applyTextureBtn.addEventListener('click', () => this.handleApplyTexture());
    }
    const resetChangesBtn = document.getElementById('resetChanges');
    if (resetChangesBtn) {
        resetChangesBtn.addEventListener('click', () => this.handleResetChanges());
    }
    const changePositionBtn = document.getElementById('changePosition');
    if (changePositionBtn) {
        changePositionBtn.addEventListener('click', () => this.handleChangePosition());
    }
    const resetPositionBtn = document.getElementById('resetPosition');
    if (resetPositionBtn) {
        resetPositionBtn.addEventListener('click', () => this.handleResetPosition());
    }
const transformTranslateBtn = document.getElementById('transformTranslate');
if (transformTranslateBtn) {
    transformTranslateBtn.addEventListener('click', () => {
        this.setTransformMode('translate');
        this.viewer.showNotification('Translate mode activated');
    });
}
const transformRotateBtn = document.getElementById('transformRotate');
if (transformRotateBtn) {
    transformRotateBtn.addEventListener('click', () => {
        this.setTransformMode('rotate');
        this.viewer.showNotification('Rotate mode activated');
    });
}
const transformScaleBtn = document.getElementById('transformScale');
if (transformScaleBtn) {
    transformScaleBtn.addEventListener('click', () => {
        this.setTransformMode('scale');
        this.viewer.showNotification('Scale mode activated');
    });
}
const resetTransformBtn = document.getElementById('resetTransform');
if (resetTransformBtn) {
    resetTransformBtn.addEventListener('click', () => {
        const selectedElements = this.modelManager.getSelectedElements();
        if (selectedElements.length === 1) {
            const element = selectedElements[0];
            if (this.resetElementPosition(element)) {
                this.viewer.showNotification('Position reset');
                this.showElementInfo(element);
            }
        } else {
            this.viewer.showNotification('Select a single element for reset', true);
        }
    });
}
const detachTransformBtn = document.getElementById('detachTransform');
if (detachTransformBtn) {
    detachTransformBtn.addEventListener('click', () => {
        this.deactivateTransformControls();
        this.viewer.showNotification('Transform controls deactivated');
    });
}
const setPositionBtn = document.getElementById('setPosition');
if (setPositionBtn) {
    setPositionBtn.addEventListener('click', () => {
        const x = parseFloat(document.getElementById('positionX').value) || 0;
        const y = parseFloat(document.getElementById('positionY').value) || 0;
        const z = parseFloat(document.getElementById('positionZ').value) || 0;
        
        const selectedElements = this.modelManager.getSelectedElements();
        if (selectedElements.length > 0) {
            selectedElements.forEach(element => {
                element.position.set(x, y, z);
            });
            this.viewer.showNotification(`Position set for ${selectedElements.length} elements`);
            this.showElementInfo();
        } else {
            this.viewer.showNotification('Select elements first', true);
        }
    });
}
    const reloadTexturesBtn = document.getElementById('reloadTextures');
    if (reloadTexturesBtn) {
        reloadTexturesBtn.addEventListener('click', () => this.handleReloadTextures());
    }

        const changeWidthBtn = document.getElementById('changeWidth');
    if (changeWidthBtn) {
        changeWidthBtn.addEventListener('click', () => this.handleChangeWidth());
    }
    
}

    
    setupTexturePanel() {
        const texturePanel = document.getElementById('texturePanel');
        if (texturePanel) {
            this.loadAvailableTextures();
        }
    }



    
async loadAvailableTextures() {
    try {
        const textureList = document.getElementById('textureList');
        if (!textureList) return;

        textureList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #94a3b8;">Loading textures..</div>';

        const response = await fetch('/api/available-textures/');
        const data = await response.json();
        
        if (data.success && data.textures) {
            textureList.innerHTML = '';
            
            
            const groupedTextures = {};
            data.textures.forEach(texture => {
                
                const category = texture.name.split('_')[0] || texture.name.split(' ')[0] || 'Others';
                if (!groupedTextures[category]) {
                    groupedTextures[category] = [];
                }
                groupedTextures[category].push(texture);
            });

            
            Object.keys(groupedTextures).forEach(categoryName => {
                const categoryTextures = groupedTextures[categoryName];
                
                
                const pngTexture = categoryTextures.find(texture => 
                    texture.filename.toLowerCase().endsWith('.png')
                );

                if (pngTexture) {
                    
                    const categoryDropdown = this.createCategoryDropdown(categoryName, categoryTextures, pngTexture);
                    textureList.appendChild(categoryDropdown);
                } else {
                    
                    const categoryDropdown = this.createCategoryDropdown(categoryName, categoryTextures, categoryTextures[0]);
                    textureList.appendChild(categoryDropdown);
                }
            });
            
            
            if (Object.keys(groupedTextures).length === 0) {
                textureList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #94a3b8;">No textures found</div>';
            }
            
        } else {
            textureList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #94a3b8;">No textures found</div>';
        }
    } catch (error) {
        console.error(' Error loadinga texturilor:', error);
        const textureList = document.getElementById('textureList');
        if (textureList) {
            textureList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #ef4444;">Loading error</div>';
        }
    }
}


createCategoryDropdown(categoryName, textures, headerTexture) {
    const dropdownContainer = document.createElement('div');
    dropdownContainer.style.marginBottom = '0.5rem';
    
    const dropdownHeader = document.createElement('div');
    dropdownHeader.style.cssText = `
        display: flex;
        align-items: center;
        padding: 0.75rem;
        background: rgba(37, 99, 235, 0.1);
        border: 1px solid rgba(37, 99, 235, 0.3);
        border-radius: 0.375rem;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
        color: var(--primary-color);
    `;
    dropdownHeader.onmouseenter = () => {
        dropdownHeader.style.background = 'rgba(37, 99, 235, 0.2)';
        dropdownHeader.style.borderColor = 'rgba(37, 99, 235, 0.5)';
    };
    dropdownHeader.onmouseleave = () => {
        dropdownHeader.style.background = 'rgba(37, 99, 235, 0.1)';
        dropdownHeader.style.borderColor = 'rgba(37, 99, 235, 0.3)';
    };
    dropdownHeader.onclick = () => {
        dropdownContent.style.display = dropdownContent.style.display === 'none' ? 'block' : 'none';
    };
    
    const dropdownArrow = document.createElement('span');
    dropdownArrow.style.marginRight = '0.5rem';
    dropdownArrow.style.transition = 'transform 0.2s';
    
    dropdownHeader.innerHTML = `
        <img src="${headerTexture.thumbnail}" alt="${categoryName}" 
             style="width: 40px; height: 40px; object-fit: cover; border-radius: 0.25rem; margin-right: 0.5rem;">
        <div style="flex: 1;">
            <div style="font-size: 0.875rem; font-weight: 500;">${categoryName}</div>
            <div style="font-size: 0.75rem; color: #94a3b8;">${textures.length-1} textures available</div>
        </div>
    `;
    dropdownHeader.prepend(dropdownArrow);
    
    const dropdownContent = document.createElement('div');
    dropdownContent.style.cssText = `
        display: none;
        padding: 0.5rem;
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(37, 99, 235, 0.2);
        border-top: none;
        border-radius: 0 0 0.375rem 0.375rem;
        margin-top: -0.25rem;
    `;
    
    
    textures.forEach(texture => {
        
        if (texture.filename.toLowerCase().endsWith('.png')) {
            return;
        }
        const textureItem = this.createTextureItem(texture, false);
        dropdownContent.appendChild(textureItem);
    });
    
    dropdownContainer.appendChild(dropdownHeader);
    dropdownContainer.appendChild(dropdownContent);
    
    return dropdownContainer;
}



createTextureItem(texture, isMain = false) {
    const textureItem = document.createElement('div');
    textureItem.className = 'texture-item';
    textureItem.style.cssText = `
        display: flex;
        align-items: center;
        padding: 0.5rem;
        margin-bottom: 0.5rem;
        background: rgba(255,255,255,0.05);
        border-radius: 0.375rem;
        cursor: pointer;
        transition: background 0.2s;
        border: 1px solid rgba(255,255,255,0.1);
    `;
    textureItem.onmouseenter = () => textureItem.style.background = 'rgba(255,255,255,0.1)';
    textureItem.onmouseleave = () => textureItem.style.background = 'rgba(255,255,255,0.05)';
    textureItem.onclick = () => this.selectTexture(texture);

    
    const formatIcon = texture.filename.toLowerCase().endsWith('.png') ? '' : 
                      texture.filename.toLowerCase().endsWith('.jpg') ? '' : 
                      texture.filename.toLowerCase().endsWith('.jpeg') ? '' : '';

    textureItem.innerHTML = `
        <img src="${texture.thumbnail}" alt="${texture.name}" 
             style="width: 40px; height: 40px; object-fit: cover; border-radius: 0.25rem; margin-right: 0.5rem;">
        <div style="flex: 1;">
            <div style="font-size: 0.875rem; font-weight: 500;">
                ${formatIcon} ${texture.name}
            </div>
            <div style="font-size: 0.75rem; color: #94a3b8;">
                ${texture.category}  ${texture.filename.split('.').pop().toUpperCase()}
            </div>
        </div>
    `;

    return textureItem;
}

    
    selectTexture(texture) {
        this.selectedTexture = texture;
        
        
        const textureItems = document.querySelectorAll('.texture-item');
        textureItems.forEach(item => {
            item.style.border = '1px solid transparent';
        });
        
        event.currentTarget.style.border = '1px solid #2563eb';
        
        
        this.viewer.showNotification(`Selected texture: ${texture.name}`);
    }

 


handleCanvasClick(event) {
    if (event.button === 2) {
        this.modelManager.deselectAllElements();
        this.hideElementInfo();
        this.deactivateTransformControls();
        
        if (this.viewer && this.viewer.controls) {
            this.viewer.controls.target.set(0, 0, 0);
        }
        
        const elementTypeSelect = document.getElementById('elementTypeSelect');
        if (elementTypeSelect) {
            elementTypeSelect.value = 'none';
        }
        
        event.preventDefault();
        return;
    }
    
    if (!this.renderer || !this.camera) {
        console.error('Renderer or camera are not available');
        return;
    }
    
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    
    this.mouse.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;
    
    this.renderer.render(this.scene, this.camera);
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const intersectableObjects = this.getAllIntersectableObjects();
    
    const intersects = this.raycaster.intersectObjects(intersectableObjects, true);
    
    if (intersects.length > 0) {
        let selectedObject = intersects[0].object;
        let isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;

        if (!isMultiSelect && this.viewer && this.viewer.multiSelectMode) {
            isMultiSelect = true;
        }
        
        if (selectedObject.userData && selectedObject.userData.isMergedPart) {
            let parent = selectedObject.parent;
            while (parent && !(parent.isGroup && parent.userData && parent.userData.isMerged)) {
                parent = parent.parent;
            }
            if (parent) {
                selectedObject = parent;
            }
        }
        
        let elementToSelect = this.findSelectableElement(selectedObject);
        
        if (!elementToSelect) {
            console.error('Could not find selectable element for:', selectedObject);
            return;
        }
        if (elementToSelect.userData && elementToSelect.userData.isSelectable === false) {
            
            return;
        }
        if (!this.checkAndRepairElementGeometry(elementToSelect)) {
            console.error('Invalid object - selection cancelled');
            
            if (this.viewer) {
                this.viewer.showNotification('Invalid element - cannot select', true);
            }
            return;
        }
        this.modelManager.selectElement(elementToSelect, isMultiSelect);
        
        this.showElementInfo(elementToSelect);
        
        const selectedElements = this.modelManager.getSelectedElements();
        if (selectedElements.length === 1 && !isMultiSelect) {
            this.activateTransformControls(selectedElements[0]);
            this.updatePositionInputs(selectedElements[0]);
            
            
            setTimeout(() => {
                this.applyTransformModeOnSelection();
            }, 50);
        } else {
            this.deactivateTransformControls();
        }
        
    } else {
        if (!(event.ctrlKey || event.metaKey || event.shiftKey)) {
            this.modelManager.deselectAllElements();
            this.hideElementInfo();
            this.deactivateTransformControls();
        }
    }
}

setupTransformControls() {

    if (!this.renderer || !this.camera) {
        console.error(' ModelEditor: renderer or camera undefined!');
        return;
    }
    this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setSize(0.8);
    this.transformControls.visible = false;
    this.transformControls.setMode('translate');
    this.transformMode = 'translate';
    this.lastActiveTransformMode = 'translate';
    this.transformControls.addEventListener('change', () => {
        this.handleTransformChange();
    });
    this.transformControls.addEventListener('dragging-changed', (event) => {
        if (this.viewer.controls) {
            this.viewer.controls.enabled = !event.value;
        }
    });
    this.scene.add(this.transformControls);
}
    safeViewerAccess() {
        return this.viewer && typeof this.viewer.showNotification === 'function';
    }



 getAllIntersectableObjects() {
    const intersectableObjects = [];
    
    
    if (this.modelManager && this.modelManager.buildings) {
        this.modelManager.buildings.traverse((child) => {
            
            if (child.userData && child.userData.isMergedPart) {
                return; 
            }
            
            
            if (child.isGroup && child.userData && child.userData.isMerged) {
                if (child.userData.isSelectable !== false) {
                    intersectableObjects.push(child);
                }
                return;
            }
            
            
            if (child.userData && child.userData.isSelectable === false) {
                return;
            }
            
            if (this.isValidMeshForRaycasting(child)) {
                intersectableObjects.push(child);
            }
        });
    }
    
    
    if (this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse((child) => {
            
            if (child.userData && child.userData.isMergedPart) {
                return;
            }
            
            
            if (child.userData && child.userData.isSelectable === false) {
                return;
            }
            
            if (this.isValidMeshForRaycasting(child)) {
                intersectableObjects.push(child);
            }
        });
    }
    
    return intersectableObjects;
}


isValidMeshForRaycasting(mesh) {
    if (!mesh.isMesh || !mesh.visible) return false;
    
    
    if (!mesh.geometry || !mesh.geometry.attributes || !mesh.geometry.attributes.position) {
        console.warn(' Mesh filtered - invalid geometry:', mesh.name, mesh.userData);
        return false;
    }
    
    
    if (!mesh.material) {
        console.warn(' Mesh filtered - no material:', mesh.name);
        return false;
    }
    return true;
}


findSelectableElement(selectedObject) {
    
    if (selectedObject.userData && selectedObject.userData.elementId) {
        return selectedObject;
    }
    
    
    let current = selectedObject;
    while (current && current.parent) {
        if (current.userData && current.userData.isExternalModel) {
            
            return current;
        }
        if (current.userData && current.userData.elementId) {
            return current;
        }
        current = current.parent;
    }
    
    
    if (selectedObject.parent && selectedObject.parent.userData && selectedObject.parent.userData.isExternalModel) {
        
        return selectedObject.parent;
    }
    
    console.warn(' No selectable element found for:', selectedObject);
    return null;
}

updatePositionInputs(element) {
    if (element) {
        document.getElementById('positionX').value = element.position.x.toFixed(2);
        document.getElementById('positionY').value = element.position.y.toFixed(2);
        document.getElementById('positionZ').value = element.position.z.toFixed(2);
    }
}


updateSelectionModeUI() {
    if (!this.viewer) return;
    
    const multiSelectToggleBtn = document.getElementById('multiSelectToggle');
    const multiSelectStatus = document.getElementById('multiSelectStatus');
    
    if (multiSelectToggleBtn) {
        
        if (this.viewer.multiSelectMode) {
            multiSelectToggleBtn.innerHTML = '<i class="fas fa-object-group"></i> Multi Select';
            multiSelectToggleBtn.classList.add('active');
            multiSelectToggleBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            multiSelectToggleBtn.style.color = 'white';
            multiSelectToggleBtn.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.3)';
        } else {
            multiSelectToggleBtn.innerHTML = '<i class="fas fa-mouse-pointer"></i> Single Select';
            multiSelectToggleBtn.classList.remove('active');
            multiSelectToggleBtn.style.background = '';
            multiSelectToggleBtn.style.color = '';
            multiSelectToggleBtn.style.boxShadow = '';
        }
    }
    
    if (multiSelectStatus) {
        const selectedCount = this.modelManager.getSelectedElements().length;
        
        if (this.viewer.multiSelectMode) {
            multiSelectStatus.innerHTML = `<i class="fas fa-object-group"></i> Multi-select active: ${selectedCount} element${selectedCount !== 1 ? 'e' : ''} selected`;
        } else {
            multiSelectStatus.innerHTML = selectedCount > 0 
                ? `<i class="fas fa-mouse-pointer"></i> Single select: ${selectedCount} element${selectedCount !== 1 ? 'e' : ''} selected` 
                : '<i class="fas fa-mouse-pointer"></i> Click selects single element';
        }
        
        
        if (selectedCount > 0) {
            if (this.viewer.multiSelectMode) {
                multiSelectStatus.innerHTML += ' | <span style="color: #10b981;">Click to add/remove</span>';
            } else {
                multiSelectStatus.innerHTML += ' | <span style="color: #667eea;">Ctrl+Click for Multi-select</span>';
            }
        }
    }
    
    
    const selectedCountElement = document.getElementById('selectedCount');
    if (selectedCountElement) {
        const selectedElements = this.modelManager.getSelectedElements();
        selectedCountElement.textContent = selectedElements.length;
    }
}
    
    handleMouseMove(event) {
        const canvas = document.getElementById('three-canvas');
        const rect = canvas.getBoundingClientRect();
        
        this.mouse.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;
    }

showElementInfo(element) {
    const infoPanel = document.getElementById('elementInfoPanel');
    const infoContent = document.querySelector('.element-info-content');
    
    if (!infoPanel || !infoContent) return;
    
    const selectedElements = this.modelManager.getSelectedElements();
    
    if (selectedElements.length === 0) {
        
        infoContent.innerHTML = `
            <div class="info-navigation">
                <div class="instruction-item">
                    <span class="instruction-icon"></span>
                    <div><strong>Right click:</strong> Deselect all</div>
                </div>
                <div class="instruction-item">
                    <span class="instruction-icon"></span>
                    <div><strong>Ctrl+Click:</strong> Multi-select</div>
                </div>
                <div class="instruction-item">
                    <span class="instruction-icon"></span>
                    <div><strong>Keys:</strong> T=Translate, R=Rotate, S=Scale</div>
                </div>
                <div class="transform-info">
                    <strong>Transform Controls Active:</strong>
                    <div class="transform-details">
                        <div> <strong>Colored axes</strong> - Drag for movement</div>
                        <div> <strong>Circles</strong> - Drag for rotation</div>
                        <div> <strong>Cubes</strong> - Drag for scaling</div>
                    </div>
                </div>
            </div>
        `;
        infoPanel.style.display = 'block';
        
    } else if (selectedElements.length === 1) {
        
        const userData = selectedElements[0].userData;
        const position = selectedElements[0].position;
        const rotation = selectedElements[0].rotation;
        const scale = selectedElements[0].scale;
        const quaternion = selectedElements[0].quaternion;
        
        
        const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
        const rotationXDeg = (euler.x * 180 / Math.PI).toFixed(1);
        const rotationYDeg = (euler.y * 180 / Math.PI).toFixed(1);
        const rotationZDeg = (euler.z * 180 / Math.PI).toFixed(1);
        
        
        const transformActive = this.transformControls && this.transformControls.visible;
        const currentMode = transformActive ? this.transformMode : 'inactiv';
        
        infoContent.innerHTML = `
            <div class="info-single-element">
                <div class="info-basic-grid">
                    <div class="info-item">
                        <div class="info-label">ID</div>
                        <div class="info-value">${userData.elementId || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Type</div>
                        <div class="info-value">${(userData.type || 'other').toUpperCase()}</div>
                    </div>
                </div>
                
                <div class="info-section">
                    <h6> Position</h6>
                    <div class="position-grid">
                        <div class="coord-item">
                            <div class="coord-label">X</div>
                            <div class="coord-value">${position.x.toFixed(2)}</div>
                        </div>
                        <div class="coord-item">
                            <div class="coord-label">Y</div>
                            <div class="coord-value">${position.y.toFixed(2)}</div>
                        </div>
                        <div class="coord-item">
                            <div class="coord-label">Z</div>
                            <div class="coord-value">${position.z.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                
                <div class="info-section">
                    <h6> Rotation</h6>
                    <div class="rotation-grid">
                        <div class="coord-item">
                            <div class="coord-label">X</div>
                            <div class="coord-value">${rotationXDeg}°</div>
                        </div>
                        <div class="coord-item">
                            <div class="coord-label">Y</div>
                            <div class="coord-value">${rotationYDeg}°</div>
                        </div>
                        <div class="coord-item">
                            <div class="coord-label">Z</div>
                            <div class="coord-value">${rotationZDeg}°</div>
                        </div>
                    </div>
                </div>
                
                <div class="info-section">
                    <h6> Scale</h6>
                    <div class="scale-grid">
                        <div class="coord-item">
                            <div class="coord-label">X</div>
                            <div class="coord-value">${scale.x.toFixed(2)}</div>
                        </div>
                        <div class="coord-item">
                            <div class="coord-label">Y</div>
                            <div class="coord-value">${scale.y.toFixed(2)}</div>
                        </div>
                        <div class="coord-item">
                            <div class="coord-label">Z</div>
                            <div class="coord-value">${scale.z.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        infoPanel.style.display = 'block';
        
    } else {
        
        const typeCount = {};
        let totalHeight = 0;
        
        selectedElements.forEach(element => {
            const type = element.userData.type || 'other';
            typeCount[type] = (typeCount[type] || 0) + 1;
            totalHeight += element.userData.modifications?.height || element.userData.originalHeight || 10;
        });
        
        const avgHeight = (totalHeight / selectedElements.length).toFixed(1);
        const typeList = Object.keys(typeCount).map(type => 
            `<div class="type-item">
                <span>${type}:</span>
                <span>${typeCount[type]} elemente</span>
            </div>`
        ).join('');
        
        infoContent.innerHTML = `
            <div class="info-multiple-elements">
                <h5>Multiple Selection (${selectedElements.length} elemente)</h5>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${selectedElements.length}</div>
                        <div class="stat-label">Total Elements</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${avgHeight}</div>
                        <div class="stat-label">Average Height</div>
                    </div>
                </div>
                
                <div class="type-distribution">
                    <h6> Type Distribution</h6>
                    ${typeList}
                </div>
                
                <div class="info-hint">
                    <strong> For individual editing:</strong>
                    <p>Dezactivează Multi-select (click fără Ctrl) pentru a edita fiecare element separat</p>
                </div>
            </div>
        `;
        infoPanel.style.display = 'block';
    }
    
    
    const closeBtn = infoPanel.querySelector('.close-info-btn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            infoPanel.style.display = 'none';
        };
    }
}

hideElementInfo() {
    const infoPanel = document.getElementById('elementInfoPanel');
    if (infoPanel) {
        infoPanel.style.display = 'none';
    }
}

    
handleSelectAllType() {
    const elementTypeSelect = document.getElementById('elementTypeSelect');
    if (elementTypeSelect) {
        const elementType = elementTypeSelect.value;
        
        
        if (elementType === 'none') {
            this.viewer.showNotification('Select a valid element type', true);
            return;
        }
        
        if (elementType === 'all') {
            const count = this.modelManager.selectAllElements();
            this.viewer.showNotification(`Selected ${count} elements of all types`);
        } else {
            const count = this.modelManager.selectElementsByType(elementType);
            this.viewer.showNotification(`Selected ${count} elements of type ${elementType}`);
        }
    }
}


handleDeselectAll() {
    this.modelManager.deselectAllElements();
    this.hideElementInfo();
    this.deactivateTransformControls(); 
    
    
    if (this.viewer.controls) {
        this.viewer.controls.target.set(0, 0, 0);
    }
    
    
    const elementTypeSelect = document.getElementById('elementTypeSelect');
    if (elementTypeSelect) {
        elementTypeSelect.value = 'none';
    }
    
    this.viewer.showNotification('All elements have been deselected');
}




handleChangeHeight() {
    const heightInput = document.getElementById('elementHeight');
    if (heightInput) {
        const newHeight = parseFloat(heightInput.value);
        if (newHeight > 0 || newHeight < 0) { 
            const elementTypeSelect = document.getElementById('elementTypeSelect');
            const elementType = elementTypeSelect ? elementTypeSelect.value : null;
            
            if (elementType === 'none') {
                this.viewer.showNotification('Select a valid element type', true);
                return;
            }
            
            
            this.viewer.saveState('Modificare înălțime');
            
            if (elementType === 'all') {
                let totalCount = 0;
                const allTypes = ['building', 'highway', 'water', 'natural', 'landuse', 'other'];
                allTypes.forEach(type => {
                    totalCount += this.modelManager.changeAllElementsHeight(type, newHeight);
                });
                
                
                let platformInfo = '';
                if (newHeight < 0) {
                    platformInfo = ' (below platform)';
                } else if (newHeight === 0) {
                    platformInfo = ' (at platform level)';
                } else {
                    platformInfo = ' (above platform)';
                }
                
                this.viewer.showNotification(`Height changed for ${totalCount} elements of all types${platformInfo}`);
            } else {
                const count = this.modelManager.changeAllElementsHeight(elementType, newHeight);
                
                
                let platformInfo = '';
                if (newHeight < 0) {
                    platformInfo = ' (below platform)';
                } else if (newHeight === 0) {
                    platformInfo = ' (at platform level)';
                } else {
                    platformInfo = ' (above platform)';
                }
                
                this.viewer.showNotification(`Height changed for ${count} elements of type ${elementType}${platformInfo}`);
            }
        } else {
            this.viewer.showNotification('Height must be different from 0', true);
        }
    }
}


handleChangeColor() {
    const colorInput = document.getElementById('elementColor');
    if (colorInput) {
        const newColor = colorInput.value;
        const elementTypeSelect = document.getElementById('elementTypeSelect');
        const elementType = elementTypeSelect ? elementTypeSelect.value : null;
        
        if (elementType === 'none') {
            this.viewer.showNotification('Select a valid element type', true);
            return;
        }
        
        
        const selectedElements = this.modelManager.getSelectedElements();
        
        if (selectedElements.length > 0) {
            
            const count = this.modelManager.changeSelectedElementsColor(newColor);
            this.viewer.saveState('Modificare culoar');
            this.viewer.showNotification(`Color changed for ${count} selected elements`);
        } else {
            
            if (elementType === 'all') {
                let totalCount = 0;
                const allTypes = ['building', 'highway', 'water', 'natural', 'landuse', 'other'];
                allTypes.forEach(type => {
                    totalCount += this.modelManager.changeAllElementsColor(type, newColor);
                });
                this.viewer.saveState('Modificare culoar');
                this.viewer.showNotification(`Color changed for ${totalCount} elements of all types`);
            } else {
                const count = this.modelManager.changeAllElementsColor(elementType, newColor);
                this.viewer.saveState('Modificare culoar');
                this.viewer.showNotification(`Color changed for ${count} elements of type ${elementType}`);
            }
        }
    }
}


async handleApplyTexture() {
    if (!this.selectedTexture) {
        this.viewer.showNotification('Select a texture first', true);
        return;
    }

    const faceTypeSelect = document.getElementById('textureFace');
    const faceType = faceTypeSelect ? faceTypeSelect.value : 'all';
    const elementTypeSelect = document.getElementById('elementTypeSelect');
    const elementType = elementTypeSelect ? elementTypeSelect.value : null;
    

    try {
        if (elementType === 'all') {
            
            let totalCount = 0;
            const allTypes = ['building', 'highway', 'water', 'natural', 'landuse', 'other'];
            for (const type of allTypes) {
                totalCount += await this.modelManager.applyTextureToAllElements(type, this.selectedTexture.url, faceType);
            }
            this.viewer.showNotification(`Texture applied for ${totalCount} elements of all types`);
        } else {
            
            const count = await this.modelManager.applyTextureToAllElements(elementType, this.selectedTexture.url, faceType);
            this.viewer.showNotification(`Texture applied for ${count} elements of type ${elementType}`);
            this.viewer.saveState('Apply texture');
        }
    } catch (error) {
        this.viewer.showNotification('Error applying texture', true);
    }
}

 
handleResetChanges() {
    const elementTypeSelect = document.getElementById('elementTypeSelect');
    const elementType = elementTypeSelect ? elementTypeSelect.value : null;
    
    
    if (elementType === 'none') {
        this.viewer.showNotification('Select a valid element type', true);
        return;
    }
    
    if (elementType === 'all') {
        
        let totalCount = 0;
        const allTypes = ['building', 'highway', 'water', 'natural', 'landuse', 'other'];
        allTypes.forEach(type => {
            totalCount += this.modelManager.resetAllElements(type);
        });
        if (totalCount > 0) {
            this.viewer.showNotification(`Changes reset for ${totalCount} elements of all types`);
        } else {
            this.viewer.showNotification(`No changes to reset for any type`);
        }
    } else {
        
        const count = this.modelManager.resetAllElements(elementType);
        if (count > 0) {
            this.viewer.showNotification(`Changes reset for ${count} elements of type ${elementType}`);
        } else {
            this.viewer.showNotification(`No changes to reset for ${elementType}`);
        }
    }
}

    
    async handleReloadTextures() {
        try {
            await this.modelManager.loadAvailableTextures();
            await this.loadAvailableTextures();
            this.viewer.showNotification('Textures reloaded successfully');
        } catch (error) {
            this.viewer.showNotification('Error reloading textures', true);
        }
    }

    
    toggleElementVisibility(elementType, visible) {
        const elements = this.modelManager.getElementsByType(elementType);
        
        
        elements.forEach(element => {
            element.visible = visible;
        });
        
        this.viewer.showNotification(`${this.getElementTypeName(elementType)} ${visible ? 'displayed' : 'hidden'}`);
        this.modelManager.updateStats();
    }

    
    toggleOtherElementsVisibility(visible) {
        const otherElements = this.modelManager.getOtherElements();
        
        
        otherElements.forEach(element => {
            element.visible = visible;
        });
        
        this.viewer.showNotification(`Other elements ${visible ? 'displayed' : 'hidden'} (${otherElements.length} elemente)`);
        this.modelManager.updateStats();
    }

    
    getElementTypeName(elementType) {
        const typeNames = {
            'building': 'Buildings',
            'highway': 'Roads',
            'water': 'Waters',
            'natural': 'Natural elements',
            'landuse': 'Land use',
            'other': 'Other elements'
        };
        
        return typeNames[elementType] || elementType;
    }

    
    selectElement(element) {
        
        if (this.selectedElement) {
            this.deselectElement();
        }

        this.selectedElement = element;
        
            setTimeout(() => {
        this.updateSelectionModeUI();
    }, 50);
        if (element.isMesh) {
            
            this.originalMaterials.set(element, element.material);
            
            
            const highlightMaterial = element.material.clone();
            highlightMaterial.emissive = new THREE.Color(0x444444);
            highlightMaterial.needsUpdate = true;
            
            element.material = highlightMaterial;
        }
        
        
    }

    deselectElement() {
        if (this.selectedElement && this.selectedElement.isMesh) {
            
            const originalMaterial = this.originalMaterials.get(this.selectedElement);
            if (originalMaterial) {
                this.selectedElement.material = originalMaterial;
            }
            this.originalMaterials.delete(this.selectedElement);
        }
        
        this.selectedElement = null;
    }

   
changeElementHeight(element, newHeight) {
    if (!element || !element.isMesh) return;
    
    
    const originalHeight = element.userData.originalHeight || 10;
    
    
    const scaleFactor = newHeight / originalHeight;
    
    
    element.scale.y = scaleFactor;
    
    
    if (element.userData.originalPosition) {
        element.position.y = element.userData.originalPosition.y + (newHeight / 2);
    } else {
        element.position.y = newHeight / 2;
    }
    
    
    element.userData.modifications.height = newHeight;
    
    
}


setupElementOriginalData(element) {
    if (!element.userData.originalPosition) {
        element.userData.originalPosition = element.position.clone();
    }
    if (!element.userData.originalHeight) {
        
        if (element.geometry) {
            element.geometry.computeBoundingBox();
            const bbox = element.geometry.boundingBox;
            
            
            element.userData.originalHeight = bbox.max.y - bbox.min.y;
            
            element.userData.originalWidth = bbox.max.x - bbox.min.x;
            
            element.userData.originalDepth = bbox.max.z - bbox.min.z;
        } else {
            element.userData.originalHeight = 10;
            element.userData.originalWidth = 10;
            element.userData.originalDepth = 10;
        }
    }
    if (!element.userData.originalScale) {
        element.userData.originalScale = element.scale.clone();
    }
}



    changeElementColor(element, newColor) {
        if (!element || !element.isMesh) return;
        
        if (element.material instanceof THREE.MeshLambertMaterial) {
            element.material.color.set(newColor);
            element.material.needsUpdate = true;
        }
        
        element.userData.modifications.color = newColor;
        
        
    }

    
    updateLightIntensity(intensity) {
        if (this.viewer.directionalLight) {
            this.viewer.directionalLight.intensity = intensity;
        }
        
        
        this.scene.traverse((child) => {
            if (child instanceof THREE.AmbientLight) {
                child.intensity = intensity * 0.6;
            }
        });
        
        
    }

    
    toggleAxesHelper() {
        let axesHelper = this.scene.getObjectByName('axesHelper');
        
        if (!axesHelper) {
            axesHelper = new THREE.AxesHelper(1000);
            axesHelper.name = 'axesHelper';
            this.scene.add(axesHelper);
            this.viewer.showNotification('Axes activated');
        } else {
            axesHelper.visible = !axesHelper.visible;
            this.viewer.showNotification(`Axes ${axesHelper.visible ? 'activated' : 'dezactivated'}`);
        }
    }



    
    resetElementModifications(element) {
        if (!element) return;
        
        
        if (element.userData.modifications.height) {
            const originalHeight = element.userData.originalHeight;
            this.changeElementHeight(element, originalHeight);
            element.userData.modifications.height = null;
        }
        
        
        if (element.userData.modifications.color) {
            
            const elementType = element.userData.type;
            const material = this.modelManager.createMaterialForType(elementType);
            element.material = material;
            element.userData.modifications.color = null;
        }
        
        
    }

    resetAllModifications() {
        this.modelManager.buildings.traverse((child) => {
            if (child.isMesh) {
                this.resetElementModifications(child);
            }
        });
        
        this.viewer.showNotification('All modifications have been reset');
    }

    
    getSelectedElementInfo() {
        if (!this.selectedElement) return null;
        
        return {
            id: this.selectedElement.userData.elementId,
            type: this.selectedElement.userData.type,
            properties: this.selectedElement.userData.properties,
            height: this.selectedElement.userData.modifications.height || this.selectedElement.userData.originalHeight,
            position: this.selectedElement.position.toArray(),
            modifications: {
                heightModified: !!this.selectedElement.userData.modifications.height,
                colorModified: !!this.selectedElement.userData.modifications.color,
                textureApplied: !!(this.selectedElement.material && this.selectedElement.material.map)
            }
        };
    }

    setupSelectionHelpers() {
        
        this.selectionBox = new THREE.BoxHelper();
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);
    }


handleChangeWidth() {
    const widthInput = document.getElementById('elementWidth');
    if (widthInput) {
        const newWidth = parseFloat(widthInput.value);
        
        if (isNaN(newWidth) || newWidth <= 0) {
            this.viewer.showNotification('Width must be a number greater than 0', true);
            return;
        }

        const selectedElements = this.modelManager.getSelectedElements();
        const elementTypeSelect = document.getElementById('elementTypeSelect');
        const elementType = elementTypeSelect ? elementTypeSelect.value : null;

        let count = 0;
        let message = '';

        
        if (selectedElements.length > 0) {
            
            count = this.modelManager.changeSelectedElementsWidth(newWidth);
            message = `Width changed for ${count} SELECTED elements`;
            
        } else if (elementType && elementType !== 'none') {
            
            
            if (elementType === 'all') {
                
                const allTypes = ['building', 'highway', 'water', 'natural', 'landuse', 'other'];
                allTypes.forEach(type => {
                    count += this.modelManager.changeAllElementsWidth(type, newWidth);
                });
                message = `Width changed for ${count} elements from ALL categories`;
            } else {
                
                count = this.modelManager.changeAllElementsWidth(elementType, newWidth);
                const categoryName = this.getElementTypeDisplayName(elementType);
                message = `Width changed for ${count} elemente din categoria ${categoryName}`;
            }
            
        } else {
            
            this.viewer.showNotification('Select elements (click) or choose a category from dropdown', true);
            return;
        }

        if (count > 0) {
            this.viewer.showNotification(message);
            this.viewer.saveState('Width modification');
            
            this.showElementInfo();
        } else {
            this.viewer.showNotification('No elements found to modify', true);
        }
    }
}

refreshSelectionAndRaycasting() {
    
    
    
    const selectedElements = this.modelManager.getSelectedElements();
    const selectedIds = selectedElements.map(el => el.userData.elementId);
    
    
    this.deactivateTransformControls();
    
    
    this.renderer.render(this.scene, this.camera);
    
    
    setTimeout(() => {
        
        selectedIds.forEach(elementId => {
            const element = this.modelManager.findById(elementId);
            if (element) {
                
                this.modelManager.selectElement(element, true); 
            }
        });
        
        
        if (selectedIds.length === 1) {
            const element = this.modelManager.findById(selectedIds[0]);
            if (element) {
                this.activateTransformControls(element);
            }
        }
        
        
    }, 100);
}



checkAndRepairElementGeometry(element) {
    
    if (element.isGroup) {
        try {
            
            if (!element || !element.isObject3D) {
                console.error('Invalid element for repair');
                return false;
            }
            
            
            if (!element.userData) {
                element.userData = {};
            }
            
            
            if (!element.userData.type) {
                
                if (element.userData.isMerged) {
                    element.userData.type = 'merged';
                } else {
                    element.userData.type = 'group';
                }
            }
            
            if (!element.userData.elementId) {
                element.userData.elementId = `element_${Math.random().toString(36).substr(2, 9)}`;
            }
            
            if (!element.userData.isSelected) {
                element.userData.isSelected = false;
            }
            
            if (!element.userData.modifications) {
                element.userData.modifications = {};
            }
            
            
            if (!element.userData.originalHeight || !element.userData.originalWidth || !element.userData.originalDepth) {
                const box = new THREE.Box3().setFromObject(element);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                element.userData.originalHeight = size.y;
                element.userData.originalWidth = size.x;
                element.userData.originalDepth = size.z;
                element.userData.originalBoundingBox = box;
            }
            
            return true;
            
        } catch (error) {
            console.error('Error while repairing the group:', error);
            return false;
        }
    }
    
    
    try {
        if (!element || !element.isMesh) {
            if (!element) {
                console.error('Invalid element for repair');
                return false;
            }
        }
        
        if (!element.userData) {
            element.userData = {};
        }

        if (!element.userData.type) {
            let parent = element.parent;
            let depth = 0;
            while (parent && depth < 5) {
                if (parent.userData && parent.userData.type) {
                    element.userData.type = parent.userData.type;
                    
                    if (!element.userData.elementId && parent.userData.elementId) {
                        element.userData.elementId = parent.userData.elementId;
                    }
                    
                    if (element.userData.isExternalModel === undefined && parent.userData.isExternalModel !== undefined) {
                        element.userData.isExternalModel = parent.userData.isExternalModel;
                    }
                    
                    break;
                }
                parent = parent.parent;
                depth++;
            }
        }
        
        if (!element.userData.elementId) {
            element.userData.elementId = `elemt_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        if (!element.userData.type) {
            element.userData.type = 'others';
        }
        
        if (!element.userData.originalHeight || !element.userData.originalWidth || !element.userData.originalDepth) {
            if (element.geometry) {
                element.geometry.computeBoundingBox();
                const bbox = element.geometry.boundingBox;
                
                element.userData.originalHeight = bbox.max.y - bbox.min.y;
                element.userData.originalWidth = bbox.max.x - bbox.min.x;
                element.userData.originalDepth = bbox.max.z - bbox.min.z;
            } else {
                element.userData.originalHeight = 10;
                element.userData.originalWidth = 10;
                element.userData.originalDepth = 10;
            }
        }
        
        if (!element.userData.originalMaterials) {
            if (Array.isArray(element.material)) {
                element.userData.originalMaterials = element.material.map(mat => mat.clone());
            } else {
                element.userData.originalMaterials = [element.material.clone()];
            }
        }
        
        if (!element.userData.modifications) {
            element.userData.modifications = {
                height: null,
                width: null,
                depth: null,
                color: null,
                textures: {}
            };
        }
        
        if (element.userData.isExternalModel === undefined) {
            element.userData.isExternalModel = true;
        }
        if (element.userData.isUserCreated === undefined) {
            element.userData.isUserCreated = true; 
        }
        if (element.userData.isSelected === undefined) {
            element.userData.isSelected = false;
        }
        
        if (!element.geometry) {
            console.warn('Element has no geometry - creating default geometry');
            element.geometry = new THREE.BoxGeometry(10, 10, 10);
        }
        
        if (!element.material) {
            console.warn('Element has no material - creating default material');
            element.material = new THREE.MeshLambertMaterial({ color: 0x888888 });
        }
        
        return true;
        
    } catch (error) {
        console.error('Error while repairing the element:', error);
        return false;
    }
}




changeAllElementsHeight(type, newHeight) {
    let count = 0;
    
    this.modelManager.buildings.traverse((child) => {
        if ((child.isMesh || child.isGroup) && child.userData?.type === type) {
            try {
                
                if (!child.userData.originalHeight) {
                    this.setupElementOriginalData(child);
                }
                
                
                const originalHeight = child.userData.originalHeight;
                const scaleFactor = newHeight / originalHeight;
                
                
                child.scale.y = scaleFactor;
                
                
                if (child.userData.originalPosition) {
                    child.position.y = child.userData.originalPosition.y + (newHeight / 2);
                }
                
                child.userData.modifications.height = newHeight;
                count++;
                
            } catch (error) {
                console.error(' Error changing height:', error);
            }
        }
    });
    
    return count;
}






}