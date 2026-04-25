class HistoryManager {
    constructor(viewer, maxStates = 50) {
        this.viewer = viewer;
        this.maxStates = maxStates;
        this.undoStack = [];
        this.redoStack = [];
        this.isRecording = true;
        this.initialState = null;
        this.hasInitialState = false;
        this.hiddenElements = new Map();
    }
    
    saveInitialState() {
        this.initialState = this.captureCompleteState();
        this.hasInitialState = true;
        
    }
    
saveState(description = 'Edit', modifiedElements = null, deletedElements = null, addedElements = null) {
    if (!this.isRecording) return;

    try {
        
        const beforeState = {
            modified: modifiedElements ? this.captureElementsStateComplete(modifiedElements) : null,
            timestamp: Date.now()
        };

        const state = {
            type: 'complete',
            description: description,
            timestamp: Date.now(),
            sceneState: this.captureCompleteSceneState(),
            specificChanges: {
                modified: beforeState.modified,
                deleted: deletedElements ? this.captureElementsStateComplete(deletedElements) : null,
                added: addedElements ? this.captureElementsStateComplete(addedElements) : null
            },
            
            changeType: description.toLowerCase().includes('color') ? 'color' : 
                       description.toLowerCase().includes('textur') ? 'texture' : 'general'
        };

        this.undoStack.push(state);

        if (this.undoStack.length > this.maxStates) {
            this.undoStack.shift();
        }

        this.redoStack = [];

    } catch (error) {
        console.error('Error saving state:', error);
    }
}

 
captureCompleteSceneState() {
    const state = {
        buildings: this.captureGroupStateComplete(this.viewer.modelManager.buildings),
        externalModels: this.captureGroupStateComplete(this.viewer.externalModels),
        timestamp: Date.now()
    };
    return state;
}
     
captureGroupStateComplete(group) {
    const elements = [];
    
    if (group && group.isGroup) {
        group.traverse((child) => {
            if (child.isMesh || child.isGroup) {
                try {
                    const elementState = this.captureElementStateComplete(child);
                    if (elementState) {
                        elements.push(elementState);
                    }
                } catch (error) {
                    console.warn('Error capturing the element:', error);
                }
            }
        });
    }
    
    return elements;
}

   captureElementStateComplete(element) {
    if (!element || !element.isObject3D) return null;
    
    try {
     
        if (element.isGroup) {
            const children = [];
            element.traverse((child) => {
                if (child.isMesh) {
                    const childState = this.captureSingleMeshState(child);
                    if (childState) {
                        children.push(childState);
                    }
                }
            });
            
            return {
                id: element.userData?.elementId || element.id || `element_${Math.random().toString(36).substr(2, 9)}`,
                type: 'Group',
                uuid: element.uuid,
                position: element.position.clone().toArray(),
                rotation: element.rotation.clone().toArray(),
                scale: element.scale.clone().toArray(),
                visible: element.visible,
                userData: this.cloneUserDataComplete(element.userData || {}),
                children: children,
                isGroup: true,
                isExternalModel: element.userData?.isExternalModel || false
            };
        } 
        else if (element.isMesh) {
            return this.captureSingleMeshState(element);
        }
        
        return null;
    } catch (error) {
        console.error('Error fully capturing the element:', error);
        return null;
    }
}

captureSingleMeshState(mesh) {
    try {
        const currentMaterialState = this.captureMaterialStateComplete(mesh.material);
        const currentTextureState = this.captureTextureState(mesh);
        
        return {
            id: mesh.userData?.elementId || mesh.id || `element_${Math.random().toString(36).substr(2, 9)}`,
            type: mesh.type,
            uuid: mesh.uuid,
            position: mesh.position.clone().toArray(),
            rotation: mesh.rotation.clone().toArray(),
            scale: mesh.scale.clone().toArray(),
            visible: mesh.visible,
            userData: this.cloneUserDataComplete(mesh.userData || {}),
            
            currentMaterialState: currentMaterialState,
            currentTextureState: currentTextureState,
            appliedColor: mesh.userData?.modifications?.color || null,
            appliedTextures: mesh.userData?.modifications?.textures || {},
            
            hasOriginalMaterials: !!mesh.userData?.originalMaterials,
            
            currentColorHex: this.getCurrentColorHex(mesh),
            
         
            geometry: this.captureGeometryState(mesh.geometry),
            material: currentMaterialState,
            
            isExternalModel: mesh.userData?.isExternalModel || false
        };
    } catch (error) {
        console.error('Error capturing mesh state:', error);
        return null;
    }
}
captureTextureState(element) {
    if (!element || !element.material) return null;
    
    try {
        const textureState = {
            hasTexture: false,
            mapUrl: null,
            appliedFaces: {}
        };
        if (element.userData?.modifications?.textures) {
            textureState.appliedTextures = { ...element.userData.modifications.textures };
            textureState.hasTexture = Object.keys(element.userData.modifications.textures).length > 0;
        }
        if (Array.isArray(element.material)) {
            element.material.forEach((material, index) => {
                if (material.map) {
                    const url = this.getTextureUrl(material.map);
                    if (url) {
                        textureState.appliedFaces[index] = url;
                        textureState.hasTexture = true;
                    }
                }
            });
        } else if (element.material.map) {
            const url = this.getTextureUrl(element.material.map);
            if (url) {
                textureState.mapUrl = url;
                textureState.hasTexture = true;
            }
        }
        return textureState.hasTexture ? textureState : null;
    } catch (error) {
        console.error('Error capturing the texture state:', error);
        return null;
    }
}

getTextureUrl(texture) {
    if (!texture) return null;
    if (texture.image && texture.image.src) {
        return texture.image.src;
    }
    if (texture.source && texture.source.data && texture.source.data.src) {
        return texture.source.data.src;
    }
    if (texture.userData && texture.userData.sourceUrl) {
        return texture.userData.sourceUrl;
    }
    return null;
}
 
    cloneUserDataComplete(userData) {
        if (!userData) return {};
        const cloned = {};
        for (const key in userData) {
            try {
                const value = userData[key];
                if (value instanceof THREE.Vector3) {
                    cloned[key] = value.clone().toArray();
                } else if (value instanceof THREE.Euler) {
                    cloned[key] = value.clone().toArray();
                } else if (value instanceof THREE.Quaternion) {
                    cloned[key] = value.clone().toArray();
                } else if (value instanceof THREE.Color) {
                    cloned[key] = value.getHex();
                } else if (value instanceof THREE.Matrix4) {
                    cloned[key] = value.clone().toArray();
                } else if (typeof value === 'object' && value !== null) {
                    
                    try {
                        cloned[key] = JSON.parse(JSON.stringify(value));
                    } catch (e) {
                        cloned[key] = value;
                    }
                } else {
                    cloned[key] = value;
                }
            } catch (error) {
                console.warn(`Error cloning ${key}:`, error);
                cloned[key] = null;
            }
        }
        return cloned;
    }

    captureHiddenState(hiddenElements, description) {
        const elementIds = hiddenElements.map(element => 
            element.userData?.elementId || element.id
        ).filter(id => id);
        const state = {
            hiddenElementIds: elementIds,
            description: description,
            timestamp: Date.now(),
            isPartial: true,
            isDeletion: true 
        };
        return state;
    }

    
    hideElements(elements) {
        if (!elements || elements.length === 0) return;
        elements.forEach(element => {
            const elementId = element.userData?.elementId || element.id;
            if (!elementId) return;
            this.hiddenElements.set(elementId, {
                element: element,
                originalParent: element.parent,
                originalVisible: element.visible,
                originalPosition: element.position.clone(),
                originalUserData: JSON.parse(JSON.stringify(element.userData || {}))
            });
            element.visible = false;
        });
    }

    showElements(elementIds) {
        let shownCount = 0;
        elementIds.forEach(elementId => {
            const hiddenState = this.hiddenElements.get(elementId);
            if (hiddenState && hiddenState.element) {
                const element = hiddenState.element;
                element.visible = hiddenState.originalVisible;
                if (!element.parent && hiddenState.originalParent) {
                    hiddenState.originalParent.add(element);
                }
                shownCount++;
                this.hiddenElements.delete(elementId);
            } else {
                console.warn(`Element ${elementId} was not deleted`);
            }
        });
        return shownCount;
    }

captureDeletedState(deletedElements, description) {
    const state = {
        deletedElements: this.captureElementsStateComplete(deletedElements),
        description: description,
        timestamp: Date.now(),
        isPartial: true,
        isDeletion: true,
        
        isMergedElements: deletedElements.some(el => el.userData?.isMerged)
    };

    
    return state;
}

captureElementsStateComplete(elements) {
    return elements.map(element => {
        try {
            const elementState = {
                id: element.userData?.elementId || element.id,
                type: element.type,
                position: element.position.clone(),
                rotation: element.rotation.clone(),
                scale: element.scale.clone(),
                quaternion: element.quaternion.clone(),
                visible: element.visible,
                userData: this.cloneUserDataComplete(element.userData),
                geometry: this.captureGeometryStateComplete(element.geometry),
                material: this.captureMaterialStateComplete(element.material),
                
                geometryType: element.geometry?.type,
                geometryParameters: this.captureGeometryParameters(element.geometry),
                geometryAttributes: this.captureGeometryAttributes(element.geometry),
                
                materialProperties: this.captureMaterialProperties(element.material)
            };
            
            
            return elementState;
        } catch (error) {
            console.warn('Error fully capturing the element:', element.userData?.elementId, error);
            return null;
        }
    }).filter(element => element !== null);
}

    captureCompleteState() {
        return {
            buildings: this.captureGroupState(this.viewer.modelManager.buildings),
            externalModels: this.captureGroupState(this.viewer.externalModels),
            camera: {
                position: this.viewer.camera.position.clone(),
                rotation: this.viewer.camera.rotation.clone(),
                quaternion: this.viewer.camera.quaternion.clone()
            },
            controls: {
                target: this.viewer.controls.target.clone()
            },
            timestamp: Date.now()
        };
    }
    
    captureState() {
        const state = {
            buildings: this.captureGroupState(this.viewer.modelManager.buildings),
            externalModels: this.captureGroupState(this.viewer.externalModels),
            camera: {
                position: this.viewer.camera.position.clone(),
                rotation: this.viewer.camera.rotation.clone(),
                quaternion: this.viewer.camera.quaternion.clone()
            },
            controls: {
                target: this.viewer.controls.target.clone()
            },
            timestamp: Date.now()
        };

        return state;
    }

    captureGroupState(group) {
        const elements = [];
        
        group.traverse((child) => {
            if (child.isMesh || child.isGroup) {
                try {
                    const elementState = {
                        id: child.userData?.elementId || child.id,
                        type: child.type,
                        position: child.position.clone(),
                        rotation: child.rotation.clone(),
                        scale: child.scale.clone(),
                        quaternion: child.quaternion.clone(),
                        visible: child.visible,
                        userData: this.cloneUserData(child.userData),
                        geometry: child.geometry ? this.captureGeometryState(child.geometry) : null,
                        material: child.material ? this.captureMaterialState(child.material) : null
                    };
                    
                    elements.push(elementState);
                } catch (error) {
                    console.warn('Error capturing the element state:', child.userData?.elementId, error);
                }
            }
        });

        return elements;
    }
    cloneUserData(userData) {
        if (!userData) return {};
        
        const cloned = {};
        for (const key in userData) {
            try {
                
                if (key === 'originalMaterials' || key === 'geometry' || key === 'material') {
                    continue;
                }
                
                const value = userData[key];
                
                if (value instanceof THREE.Vector3) {
                    cloned[key] = value.clone();
                } else if (value instanceof THREE.Euler) {
                    cloned[key] = new THREE.Euler(value.x, value.y, value.z, value.order);
                } else if (value instanceof THREE.Color) {
                    cloned[key] = value.clone();
                } else if (typeof value === 'object' && value !== null) {
                    
                    cloned[key] = {...value};
                } else {
                    cloned[key] = value;
                }
            } catch (error) {
                console.warn(`Error cloning ${key}:`, error);
                cloned[key] = null;
            }
        }
        
        return cloned;
    }

    
    
    captureGeometryState(geometry) {
        if (!geometry) return null;
        
        return {
            type: geometry.type,
            parameters: geometry.parameters || {},
            vertexCount: geometry.attributes?.position?.count || 0
        };
    }

    captureMaterialState(material) {
        if (!material) return null;
        
        if (Array.isArray(material)) {
            return material.map(mat => this.captureSingleMaterialState(mat));
        } else {
            return this.captureSingleMaterialState(material);
        }
    }

captureSingleMaterialState(material) {
        if (!material) return null;
        
        const state = {
            type: material.type,
            color: material.color ? material.color.getHex() : 0x888888,
            emissive: material.emissive ? material.emissive.getHex() : 0x000000,
            opacity: material.opacity || 1.0,
            transparent: material.transparent || false
        };
        
        
        if (material.map) {
            if (material.map.image && material.map.image.src) {
                state.mapUrl = material.map.image.src;
            } else if (material.map.source && material.map.source.data && material.map.source.data.src) {
                state.mapUrl = material.map.source.data.src;
            }
        }
        
        return state;
    }

   
restoreState(state) {
    if (!state) return false;

    try {
        this.isRecording = false;

        const originalCameraPosition = this.viewer.camera.position.clone();
        const originalCameraTarget = this.viewer.controls.target.clone();

      
        if (state.specificChanges) {
            if (state.specificChanges.modified) {
                this.restoreModifiedElements(state.specificChanges.modified);
            }
            if (state.specificChanges.deleted) {
                this.restoreDeletedElements(state.specificChanges.deleted);
            }
            if (state.specificChanges.added) {
                this.restoreAddedElements(state.specificChanges.added);
            }
        } else if (state.sceneState) {
           
            this.restoreSceneProperties(state.sceneState);
        }

        this.forceMaterialUpdate();

        this.viewer.camera.position.copy(originalCameraPosition);
        this.viewer.controls.target.copy(originalCameraTarget);
        this.viewer.controls.update();

        this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);

        if (this.viewer.modelManager) {
            this.viewer.modelManager.deselectAllElements();
        }
        
        if (this.viewer.modelEditor) {
            this.viewer.modelEditor.hideElementInfo();
            this.viewer.modelEditor.deactivateTransformControls();
        }

        this.isRecording = true;
        return true;

    } catch (error) {
        console.error('Error restoring state:', error);
        this.isRecording = true;
        return false;
    }
}
restoreSceneProperties(sceneState) {
    if (!sceneState) return;

    try {
        if (sceneState.buildings && Array.isArray(sceneState.buildings)) {
            sceneState.buildings.forEach(elementState => {
                const existingElement = this.findElementById(elementState.id);
                if (existingElement) {
                    this.updateElementProperties(existingElement, elementState);
                }
            });
        }

        if (sceneState.externalModels && Array.isArray(sceneState.externalModels)) {
            sceneState.externalModels.forEach(elementState => {
                const existingElement = this.findElementById(elementState.id);
                if (existingElement) {
                    this.updateElementProperties(existingElement, elementState);
                }
            });
        }
    } catch (error) {
        console.error('Error restoring scene properties:', error);
    }
}
updateElementProperties(element, elementState) {
    if (!element || !elementState) return;

    try {
        if (elementState.position) {
            element.position.fromArray(elementState.position);
        }
        if (elementState.rotation) {
            element.rotation.fromArray(elementState.rotation);
        }
        if (elementState.scale) {
            element.scale.fromArray(elementState.scale);
        }
        element.visible = elementState.visible !== false;

        if (elementState.userData) {
            Object.assign(element.userData, elementState.userData);
        }

        if (element.isMesh) {
            if (elementState.appliedColor !== null && elementState.appliedColor !== undefined) {
                try {
                    const color = new THREE.Color(elementState.appliedColor);
                    if (Array.isArray(element.material)) {
                        element.material.forEach(material => {
                            if (material && material.color) {
                                material.color.copy(color);
                                material.needsUpdate = true;
                            }
                        });
                    } else if (element.material && element.material.color) {
                        element.material.color.copy(color);
                        element.material.needsUpdate = true;
                    }
                    if (!element.userData.modifications) element.userData.modifications = {};
                    element.userData.modifications.color = elementState.appliedColor;
                } catch (e) {
                    console.error('Error restoring color:', e);
                }
            } else {
                if (element.userData.modifications) delete element.userData.modifications.color;
            }

            if (elementState.appliedTextures && Object.keys(elementState.appliedTextures).length > 0) {
                if (!element.userData.modifications) element.userData.modifications = {};
                element.userData.modifications.textures = { ...elementState.appliedTextures };
            } else {
                if (element.userData.modifications) delete element.userData.modifications.textures;
            }
        }
    } catch (error) {
        console.error('Error updating element properties:', error);
    }
}

    restoreCompleteSceneState(sceneState) {
    if (!sceneState) return;

    try {
      
        if (sceneState.buildings && Array.isArray(sceneState.buildings)) {
            sceneState.buildings.forEach(elementState => {
                const existingElement = this.findElementById(elementState.id);
                if (existingElement) {
                    this.restoreElementFromStateComplete(existingElement, elementState);
                }
            });
        }

        if (sceneState.externalModels && Array.isArray(sceneState.externalModels)) {
            sceneState.externalModels.forEach(elementState => {
                const existingElement = this.findElementById(elementState.id);
                if (existingElement) {
                    this.restoreElementFromStateComplete(existingElement, elementState);
                }
            });
        }
    } catch (error) {
        console.error('Error restoring the scene:', error);
    }
}
  
    clearGroup(group) {
        if (!group || !group.isGroup) return;
        
        const children = [...group.children];
        children.forEach(child => {
            group.remove(child);
            this.disposeElement(child);
        });
    }
     
    restoreModifiedState(state) {
        if (!state.modifiedElements) return;

        state.modifiedElements.forEach(groupState => {
            const group = this.getGroupByName(groupState.groupName);
            if (group) {
                this.restoreElementsState(group, groupState.elements);
            }
        });
    }
restoreHiddenState(state) {
        if (!state.hiddenElementIds || !Array.isArray(state.hiddenElementIds)) {
            
            return;
        }

        

        const shownCount = this.showElements(state.hiddenElementIds);
        
        
    }
    getHiddenElements() {
        return Array.from(this.hiddenElements.values()).map(state => state.element);
    }

    
    purgeHiddenElements() {
        const count = this.hiddenElements.size;
        this.hiddenElements.clear();
        
    }

restoreMergedElements(state) {
    state.deletedElements.forEach(elementState => {
        try {
            if (elementState.userData?.isMerged && elementState.userData.originalElements) {
                
                
                
                elementState.userData.originalElements.forEach(originalElementState => {
                    const originalElement = this.createElementFromStateComplete(originalElementState);
                    if (originalElement) {
                        
                        let targetGroup = this.viewer.modelManager.buildings;
                        if (originalElementState.userData?.isExternalModel && this.viewer.externalModels) {
                            targetGroup = this.viewer.externalModels;
                        }
                        
                        targetGroup.add(originalElement);
                        
                    }
                });
            }
        } catch (error) {
            console.error('Error restoring merged elements:', error);
        }
    });
}

restoreDeletedState(state) {
    if (!state.deletedElements || !Array.isArray(state.deletedElements)) {
        
        return;
    }

    

      if (state.isMergedElements) {
        
        this.restoreMergedElements(state);
        return;
    }
    
    const buildingsGroup = this.viewer.modelManager?.buildings;
    const externalModelsGroup = this.viewer.externalModels;

    if (!buildingsGroup && !externalModelsGroup) {
        console.error('No group available for restoration');
        return;
    }

    let restoredCount = 0;
    let skippedCount = 0;

    state.deletedElements.forEach(elementState => {
        try {
            const elementId = elementState.userData?.elementId || elementState.id;
            if (!elementId) {
                console.warn('Element without ID, skipping');
                skippedCount++;
                return;
            }

            
            const existingElement = this.findElementById(elementId);
            if (existingElement) {
                
                skippedCount++;
                return;
            }

            
            const element = this.createElementFromStateComplete(elementState);
            if (!element) {
                
                skippedCount++;
                return;
            }

            
            let targetGroup;
            if (elementState.userData?.isExternalModel && externalModelsGroup) {
                targetGroup = externalModelsGroup;
                
            } else if (buildingsGroup) {
                targetGroup = buildingsGroup;
                
            } else {
                console.warn(`No group available for the element ${elementId}`);
                skippedCount++;
                return;
            }

            
            if (targetGroup) {
                targetGroup.add(element);
                restoredCount++;
            }

        } catch (error) {
            console.error(`Error recreating the deleted element ${elementState.userData?.elementId}:`, error);
            skippedCount++;
        }
    });

    
    
    
    if (restoredCount > 0) {
        this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);
        
    }
}

    
    restoreElementsState(group, elementsState) {
        if (!elementsState || !group) return;

        const existingElements = new Map();
        group.traverse((child) => {
            if ((child.isMesh || child.isGroup) && child.userData?.elementId) {
                existingElements.set(child.userData.elementId, child);
            }
        });

        elementsState.forEach(elementState => {
            const elementId = elementState.userData?.elementId || elementState.id;
            if (!elementId) return;

            const element = existingElements.get(elementId);
            if (element) {
                
                element.position.copy(elementState.position);
                element.rotation.copy(elementState.rotation);
                element.scale.copy(elementState.scale);
                element.quaternion.copy(elementState.quaternion);
                element.visible = elementState.visible !== undefined ? elementState.visible : true;
                Object.assign(element.userData, elementState.userData);
                
                
            }
        });
    }
findElementById(elementId) {
    let foundElement = null;

    if (this.viewer.modelManager && this.viewer.modelManager.buildings) {
        this.viewer.modelManager.buildings.traverse((child) => {
            if ((child.isMesh || child.isGroup) && child.userData?.elementId === elementId) {
                foundElement = child;
            }
        });
    }
    
    if (!foundElement && this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse((child) => {
            if ((child.isMesh || child.isGroup) && child.userData?.elementId === elementId) {
                foundElement = child;
            }
        });
    }
    
    return foundElement;
}

restoreModifiedElements(elementsState) {
    if (!elementsState || !Array.isArray(elementsState)) return;
    
    elementsState.forEach(elementState => {
        const element = this.findElementById(elementState.id);
        if (element) {
            this.updateElementProperties(element, elementState);
        }
    });
}
restoreElementFromStateComplete(element, elementState) {
    if (!element || !elementState) return;
    
    try {

        if (elementState.position) {
            element.position.fromArray(elementState.position);
        }
        if (elementState.rotation) {
            element.rotation.fromArray(elementState.rotation);
        }
        if (elementState.scale) {
            element.scale.fromArray(elementState.scale);
        }
        element.visible = elementState.visible !== false;

        if (elementState.userData) {
            element.userData = this.restoreUserDataFromState(elementState.userData);
        }
        
      
        if (element.isMesh) {
            this.restoreMeshProperties(element, elementState);
        }
        
       
        if (element.isGroup && elementState.children && Array.isArray(elementState.children)) {
            elementState.children.forEach((childState, index) => {
                if (index < element.children.length) {
                    const child = element.children[index];
                    this.restoreElementFromStateComplete(child, childState);
                }
            });
        }
        
    } catch (error) {
        console.error('Error restoring the element:', error);
    }
}
getCurrentColorHex(element) {
    if (!element || !element.isMesh || !element.material) return null;
    
    try {
        if (Array.isArray(element.material)) {
            return element.material[0]?.color?.getHex() || null;
        } else {
            return element.material.color?.getHex() || null;
        }
    } catch (error) {
        console.error('Error retrieving the current color:', error);
        return null;
    }
}
restoreMeshProperties(mesh, meshState) {
    if (meshState.appliedColor !== null && meshState.appliedColor !== undefined) {
        try {
            const color = new THREE.Color(meshState.appliedColor);
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(material => {
                    if (material && material.color) {
                        material.color.copy(color);
                        material.needsUpdate = true;
                    }
                });
            } else if (mesh.material && mesh.material.color) {
                mesh.material.color.copy(color);
                mesh.material.needsUpdate = true;
            }
            if (!mesh.userData.modifications) mesh.userData.modifications = {};
            mesh.userData.modifications.color = meshState.appliedColor;
        } catch (e) {
            console.error('Error restoring the color:', e);
        }
    } else {
        if (mesh.userData.modifications) delete mesh.userData.modifications.color;
    }

    if (meshState.appliedTextures && Object.keys(meshState.appliedTextures).length > 0) {
        if (!mesh.userData.modifications) mesh.userData.modifications = {};
        mesh.userData.modifications.textures = { ...meshState.appliedTextures };
        
        setTimeout(() => {
            if (this.viewer.modelManager) {
                Object.keys(meshState.appliedTextures).forEach(faceType => {
                    const url = meshState.appliedTextures[faceType];
                    if (url) {
                        this.viewer.modelManager.applyTextureToElement(mesh, url, faceType).catch(console.warn);
                    }
                });
            }
        }, 50);
    } else {
        if (mesh.userData.modifications) delete mesh.userData.modifications.textures;
    }
}
getCurrentTextureUrl(element) {
    if (!element || !element.isMesh || !element.material) return null;
    
    try {
        if (Array.isArray(element.material)) {
            return element.material[0]?.map?.image?.src || null;
        } else {
            return element.material.map?.image?.src || null;
        }
    } catch (error) {
        console.error('Error retrieving the current texture:', error);
        return null;
    }
}

forceMaterialUpdate() {
    if (this.viewer.modelManager && this.viewer.modelManager.buildings) {
        this.viewer.modelManager.buildings.traverse((child) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        if (mat) mat.needsUpdate = true;
                    });
                } else {
                    child.material.needsUpdate = true;
                }
            }
        });
    }
}
    
    restoreDeletedElements(elementsState) {
        if (!elementsState || !Array.isArray(elementsState)) return;
        
        elementsState.forEach(elementState => {
            const element = this.createElementFromState(elementState);
            if (element) {
                
                if (element.userData.isExternalModel) {
                    this.viewer.externalModels.add(element);
                } else {
                    this.viewer.modelManager.buildings.add(element);
                }
            }
        });
    }

    
    restoreAddedElements(elementsState) {
        if (!elementsState || !Array.isArray(elementsState)) return;
        
        elementsState.forEach(elementState => {
            const element = this.findElementById(elementState.id);
            if (element && element.parent) {
                element.parent.remove(element);
                this.disposeElement(element);
            }
        });
    }

    restoreElementFromState(element, elementState) {
    if (!element || !elementState) return;
    
    try {
        
        if (elementState.position) {
            element.position.fromArray(elementState.position);
        }
        
        if (elementState.rotation) {
            element.rotation.fromArray(elementState.rotation);
        }
        
        if (elementState.scale) {
            element.scale.fromArray(elementState.scale);
        }
        
        element.visible = elementState.visible !== false;
        
        
        element.userData = this.restoreUserDataFromState(elementState.userData);
        
        
        if (element.isMesh) {
            
            if (elementState.originalMaterials) {
                this.restoreOriginalMaterials(element, elementState.originalMaterials);
            }
            
            
            if (elementState.appliedColor && elementState.appliedColor !== null) {
                try {
                    const color = new THREE.Color(elementState.appliedColor);
                    
                    if (Array.isArray(element.material)) {
                        element.material.forEach(material => {
                            if (material && material.color) {
                                material.color.copy(color);
                                material.needsUpdate = true;
                            }
                        });
                    } else if (element.material && element.material.color) {
                        element.material.color.copy(color);
                        element.material.needsUpdate = true;
                    }
                    
                    
                    if (!element.userData.modifications) {
                        element.userData.modifications = {};
                    }
                    element.userData.modifications.color = elementState.appliedColor;
                    
                } catch (colorError) {
                    console.error('Error restoring the color:', colorError);
                }
            } else if (element.userData.modifications) {
                
                delete element.userData.modifications.color;
            }
            
            
            if (elementState.appliedTextures && Object.keys(elementState.appliedTextures).length > 0) {
                
                if (!element.userData.modifications) {
                    element.userData.modifications = {};
                }
                element.userData.modifications.textures = { ...elementState.appliedTextures };
                
                
                setTimeout(() => {
                    try {
                        if (this.viewer.modelManager) {
                            Object.keys(elementState.appliedTextures).forEach(faceType => {
                                const textureUrl = elementState.appliedTextures[faceType];
                                if (textureUrl) {
                                    this.viewer.modelManager.applyTextureToElement(
                                        element, 
                                        textureUrl, 
                                        faceType
                                    ).catch(err => {
                                        console.warn(`Error applying the texture ${faceType}:`, err);
                                    });
                                }
                            });
                        }
                    } catch (textureError) {
                        console.error('Error restoring the textures:', textureError);
                    }
                }, 100);
            } else if (element.userData.modifications) {
                
                delete element.userData.modifications.textures;
            }
            
            
            if ((!elementState.appliedColor || elementState.appliedColor === null) && 
                (!elementState.appliedTextures || Object.keys(elementState.appliedTextures).length === 0)) {
                
                
                if (element.userData.originalMaterials) {
                    if (Array.isArray(element.material) && Array.isArray(element.userData.originalMaterials)) {
                        element.userData.originalMaterials.forEach((originalMat, index) => {
                            if (originalMat && element.material[index]) {
                                element.material[index].copy(originalMat);
                                element.material[index].needsUpdate = true;
                            }
                        });
                    } else if (element.material && element.userData.originalMaterials[0]) {
                        element.material.copy(element.userData.originalMaterials[0]);
                        element.material.needsUpdate = true;
                    }
                }
            }
        }
        
        
        if (element.isGroup && elementState.children && Array.isArray(elementState.children)) {
            elementState.children.forEach((childState, index) => {
                if (index < element.children.length) {
                    const child = element.children[index];
                    this.restoreElementFromState(child, childState);
                }
            });
        }
        
    } catch (error) {
        console.error('Error restoring the element:', error);
    }
}
restoreOriginalMaterials(element, originalMaterialsData) {
    try {
        if (!element || !originalMaterialsData) return;
        
        
        const restoredMaterials = [];
        
        if (Array.isArray(originalMaterialsData)) {
            originalMaterialsData.forEach(matData => {
                if (matData && matData.type) {
                    const material = new THREE.MeshLambertMaterial({
                        color: new THREE.Color(matData.color || 0x888888),
                        emissive: new THREE.Color(matData.emissive || 0x000000),
                        opacity: matData.opacity || 1.0,
                        transparent: matData.transparent || false
                    });
                    
                    
                    if (matData.mapUrl) {
                        this.viewer.modelManager.textureLoader.load(matData.mapUrl, (texture) => {
                            texture.wrapS = THREE.RepeatWrapping;
                            texture.wrapT = THREE.RepeatWrapping;
                            texture.repeat.set(1, 1);
                            material.map = texture;
                            material.needsUpdate = true;
                        });
                    }
                    
                    restoredMaterials.push(material);
                }
            });
        }
        
        
        if (restoredMaterials.length > 0) {
            element.userData.originalMaterials = restoredMaterials;
        }
        
    } catch (error) {
        console.error('Error restoring the original materials:', error);
    }
}
cloneMaterialsForHistory(materials) {
    if (!materials) return null;
    
    try {
        if (Array.isArray(materials)) {
            return materials.map(mat => {
                if (!mat) return null;
                
                return {
                    type: mat.type,
                    color: mat.color ? mat.color.getHex() : 0x888888,
                    emissive: mat.emissive ? mat.emissive.getHex() : 0x000000,
                    opacity: mat.opacity || 1.0,
                    transparent: mat.transparent || false,
                    mapUrl: mat.map ? this.getTextureUrl(mat.map) : null
                };
            });
        } else if (materials) {
            return [{
                type: materials.type,
                color: materials.color ? materials.color.getHex() : 0x888888,
                emissive: materials.emissive ? materials.emissive.getHex() : 0x000000,
                opacity: materials.opacity || 1.0,
                transparent: materials.transparent || false,
                mapUrl: materials.map ? this.getTextureUrl(materials.map) : null
            }];
        }
        
        return null;
    } catch (error) {
        console.error('Error cloning materials for history:', error);
        return null;
    }
}
    getGroupByName(groupName) {
        switch (groupName) {
            case 'buildings': return this.viewer.modelManager.buildings;
            case 'externalModels': return this.viewer.externalModels;
            default: return null;
        }
    }
    
restoreGroupState(group, elementsState) {
    
    if (!group || !group.isGroup || typeof group.traverse !== 'function') {
        console.error(' Group invalid for restoreGroupState:', group);
        return;
    }
    
    if (!elementsState || !Array.isArray(elementsState)) {
        console.warn('elementsState invalid for restoreGroupState:', elementsState);
        return;
    }

    

    try {
        
        const existingElements = new Map();
        group.traverse((child) => {
            if ((child.isMesh || child.isGroup) && child.userData?.elementId) {
                existingElements.set(child.userData.elementId, child);
            }
        });

        let updatedCount = 0;
        let skippedCount = 0;

        
        elementsState.forEach(elementState => {
            try {
                const elementId = elementState.userData?.elementId || elementState.id;
                
                if (!elementId) {
                    console.warn('Element without ID, skipped');
                    skippedCount++;
                    return;
                }

                const element = existingElements.get(elementId);
                
                if (element) {
                    
                    if (elementState.position && element.position) {
                        element.position.copy(elementState.position);
                    }
                    if (elementState.rotation && element.rotation) {
                        element.rotation.copy(elementState.rotation);
                    }
                    if (elementState.scale && element.scale) {
                        element.scale.copy(elementState.scale);
                    }
                    if (elementState.quaternion && element.quaternion) {
                        element.quaternion.copy(elementState.quaternion);
                    }
                    element.visible = elementState.visible !== undefined ? elementState.visible : true;

                    
                    if (elementState.userData) {
                        
                        const criticalProps = {
                            originalMaterials: element.userData.originalMaterials,
                            geometry: element.userData.geometry,
                            material: element.userData.material,
                            isSelected: element.userData.isSelected,
                            isUserCreated: element.userData.isUserCreated,
                            isMerged: element.userData.isMerged
                        };
                        
                        
                        Object.assign(element.userData, elementState.userData);
                        
                        
                        Object.assign(element.userData, criticalProps);
                    }
                    
                    updatedCount++;
                    
                    
                } else {
                    
                    
                    skippedCount++;
                }

            } catch (error) {
                console.error('Error restoring element:', error);
                skippedCount++;
            }
        });

        

    } catch (error) {
        console.error('Critical error in restoreGroupState:', error);
    }
}
createElementFromState(elementState) {
    try {
        let element;

        
        const geometry = this.createGeometryFromState(elementState.geometry);
        const material = this.createMaterialFromState(elementState.material);

        
        if (elementState.type === 'Group') {
            element = new THREE.Group();
        } else {
            element = new THREE.Mesh(geometry, material);
        }

        
        element.position.copy(elementState.position);
        element.rotation.copy(elementState.rotation);
        element.scale.copy(elementState.scale);
        element.quaternion.copy(elementState.quaternion);
        element.visible = elementState.visible !== undefined ? elementState.visible : true;

        
        element.userData = this.cloneUserData(elementState.userData);

        
        if (!element.userData.elementId && elementState.id) {
            element.userData.elementId = elementState.id;
        }

        
        return element;

    } catch (error) {
        console.error('Error creating element from state:', error);
        return null;
    }
}
    
     
    createGeometryFromState(geometryState) {
        if (!geometryState) return new THREE.BoxGeometry(10, 10, 10);
        
        try {
            switch (geometryState.type) {
                case 'BoxGeometry':
                    return new THREE.BoxGeometry(
                        geometryState.parameters.width || 10,
                        geometryState.parameters.height || 10,
                        geometryState.parameters.depth || 10
                    );
                default:
                    return new THREE.BoxGeometry(10, 10, 10);
            }
        } catch (error) {
            console.error('Error creating geometry:', error);
            return new THREE.BoxGeometry(10, 10, 10);
        }
    }

    
    createMaterialFromState(materialState) {
        if (!materialState) return new THREE.MeshLambertMaterial({ color: 0x888888 });
        
        try {
            if (Array.isArray(materialState)) {
                const materials = materialState.map(mat => this.createSingleMaterialFromState(mat));
                return materials.length === 1 ? materials[0] : materials;
            } else {
                return this.createSingleMaterialFromState(materialState);
            }
        } catch (error) {
            console.error('Error creating material:', error);
            return new THREE.MeshLambertMaterial({ color: 0x888888 });
        }
    }

    
    createMaterialFromState(materialState) {
        if (!materialState) return new THREE.MeshLambertMaterial({ color: 0x888888 });

        try {
            if (Array.isArray(materialState)) {
                return materialState.map(matState => this.createSingleMaterialFromState(matState));
            } else {
                return this.createSingleMaterialFromState(materialState);
            }
        } catch (error) {
            console.error(' Error creating material:', error);
            return new THREE.MeshLambertMaterial({ color: 0x888888 });
        }
    }

createSingleMaterialFromState(materialState) {
        const params = {
            color: new THREE.Color(materialState.color || 0x888888),
            emissive: new THREE.Color(materialState.emissive || 0x000000),
            opacity: materialState.opacity || 1.0,
            transparent: materialState.transparent || false
        };
        
        const material = new THREE.MeshLambertMaterial(params);
        
        
        if (materialState.mapUrl && this.viewer.modelManager) {
            this.viewer.modelManager.textureLoader.load(materialState.mapUrl, (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 1);
                material.map = texture;
                material.needsUpdate = true;
            });
        }
        
        return material;
    }

    

    disposeElement(element) {
        if (!element) return;
        
        if (element.geometry) {
            element.geometry.dispose();
        }
        
        if (element.material) {
            if (Array.isArray(element.material)) {
                element.material.forEach(mat => mat.dispose());
            } else {
                element.material.dispose();
            }
        }
        
        
        if (element.children && element.children.length > 0) {
            element.children.forEach(child => this.disposeElement(child));
        }
    }


    
undo() {
    if (this.undoStack.length === 0) {
        this.viewer.showNotification('There are no previous actions', true);
        return false;
    }

    const state = this.undoStack.pop();
    let success = false;
    
    if (state.type === 'color_change') {
        success = this.restoreColorChange(state);
    } else if (state.type === 'texture_change') {
        success = this.restoreTextureChange(state);
    } else if (state.type === 'complete') {
      
        const currentState = {
            type: 'complete',
            sceneState: this.captureCurrentSceneState(),
            timestamp: Date.now(),
            description: `Redo: ${state.description}`
        };
        
        this.redoStack.push(currentState);
        
      
        success = this.restoreCompleteState(state);
    } else {
        const currentState = {
            type: 'general',
            description: 'Current state',
            timestamp: Date.now(),
            sceneState: this.captureCurrentSceneState()
        };
        
        this.redoStack.push(currentState);
        
        if (state.elementsState) {
            success = this.restoreModifiedElements(state.elementsState);
        } else {
            success = this.restoreState(state);
        }
    }
    
    if (success) {
        this.viewer.showNotification(`Undo: ${state.description}`);
    }
    
    return success;
}
captureCurrentSceneState() {
 
    const state = {
        buildings: this.captureGroupStateCurrent(this.viewer.modelManager.buildings),
        externalModels: this.captureGroupStateCurrent(this.viewer.externalModels),
        timestamp: Date.now()
    };
    return state;
}
    captureGroupStateCurrent(group) {
    const elements = [];
    
    if (group && group.isGroup) {
        group.children.forEach((child) => {
            try {
                const elementState = this.captureElementStateCurrent(child);
                if (elementState) {
                    elements.push(elementState);
                }
            } catch (error) {
                console.warn('Error capturing element state:', error);
            }
        });
    }
    
    return elements;
}


captureElementStateCurrent(element) {
    if (!element || !element.isObject3D) return null;
    
    try {
        const elementState = {
            id: element.userData?.elementId || element.id,
            uuid: element.uuid,
            position: element.position.clone().toArray(),
            rotation: element.rotation.clone().toArray(),
            scale: element.scale.clone().toArray(),
            visible: element.visible,
            
         
            appliedColor: element.userData?.modifications?.color || null,
            appliedTextures: element.userData?.modifications?.textures || {},
            
          
            currentColors: this.getCurrentMaterialColors(element)
        };
        
        return elementState;
    } catch (error) {
        console.error('Error capturing element state:', error);
        return null;
    }
}

getCurrentMaterialColors(element) {
    if (!element || !element.isMesh || !element.material) return null;
    
    try {
        if (Array.isArray(element.material)) {
            return element.material.map(mat => 
                mat.color ? mat.color.getHex() : 0x888888
            );
        } else {
            return element.material.color ? 
                [element.material.color.getHex()] : [0x888888];
        }
    } catch (error) {
        console.error('Error getting material colors:', error);
        return null;
    }
}


restoreCompleteState(state) {
    if (!state || !state.sceneState) return false;

    try {
        this.isRecording = false;

      
        if (state.sceneState.buildings && Array.isArray(state.sceneState.buildings)) {
            state.sceneState.buildings.forEach(elementState => {
                const element = this.findElementById(elementState.id);
                if (element) {
                    this.updateElementFromState(element, elementState);
                }
            });
        }

        if (state.sceneState.externalModels && Array.isArray(state.sceneState.externalModels)) {
            state.sceneState.externalModels.forEach(elementState => {
                const element = this.findElementById(elementState.id);
                if (element) {
                    this.updateElementFromState(element, elementState);
                }
            });
        }


        this.forceMaterialUpdate();


        this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);

  
        if (this.viewer.modelManager) {
            this.viewer.modelManager.deselectAllElements();
        }
        
        if (this.viewer.modelEditor) {
            this.viewer.modelEditor.hideElementInfo();
            this.viewer.modelEditor.deactivateTransformControls();
        }

        this.isRecording = true;
        return true;

    } catch (error) {
        console.error('Error restoring complete state:', error);
        this.isRecording = true;
        return false;
    }
}

updateElementFromState(element, elementState) {
    if (!element || !elementState) return;

    try {

        if (elementState.position) {
            element.position.fromArray(elementState.position);
        }
        if (elementState.rotation) {
            element.rotation.fromArray(elementState.rotation);
        }
        if (elementState.scale) {
            element.scale.fromArray(elementState.scale);
        }
        element.visible = elementState.visible !== false;

     
        if (element.isMesh && elementState.currentColors && Array.isArray(elementState.currentColors)) {
            if (Array.isArray(element.material)) {
                element.material.forEach((material, index) => {
                    if (material && material.color && elementState.currentColors[index]) {
                        material.color.setHex(elementState.currentColors[index]);
                        material.needsUpdate = true;
                    }
                });
            } else if (element.material && element.material.color && elementState.currentColors[0]) {
                element.material.color.setHex(elementState.currentColors[0]);
                element.material.needsUpdate = true;
            }
        }

    
        if (elementState.appliedColor !== undefined) {
            if (!element.userData.modifications) element.userData.modifications = {};
            element.userData.modifications.color = elementState.appliedColor;
        }

        if (elementState.appliedTextures) {
            if (!element.userData.modifications) element.userData.modifications = {};
            element.userData.modifications.textures = { ...elementState.appliedTextures };
        }

    } catch (error) {
        console.error('Error updating element from state:', error);
    }
}
saveColorChangeState(colorChangeState) {
    if (!this.isRecording) return;
    
    
    const elementIds = colorChangeState.elementIds;
    const elements = [];
    
    elementIds.forEach(id => {
        const element = this.findElementById(id);
        if (element) {
            elements.push(element);
        }
    });
    
    const state = {
        type: 'color_change',
        description: colorChangeState.description,
        timestamp: colorChangeState.timestamp,
        elementIds: elementIds,
        previousColors: colorChangeState.previousColors,
        newColor: colorChangeState.newColor,
        elementsState: this.captureElementsStateComplete(elements)
    };
    
    this.undoStack.push(state);
    
    if (this.undoStack.length > this.maxStates) {
        this.undoStack.shift();
    }
    
    this.redoStack = [];
}

saveTextureChangeState(textureChangeState) {
    if (!this.isRecording) return;
    
    const elementIds = textureChangeState.elementIds;
    const elements = [];
    
    elementIds.forEach(id => {
        const element = this.findElementById(id);
        if (element) {
            elements.push(element);
        }
    });
    
    const state = {
        type: 'texture_change',
        description: textureChangeState.description,
        timestamp: textureChangeState.timestamp,
        elementIds: elementIds,
        previousTextures: textureChangeState.previousTextures,
        newTextureUrl: textureChangeState.newTextureUrl,
        faceType: textureChangeState.faceType,
        elementsState: this.captureElementsStateComplete(elements)
    };
    
    this.undoStack.push(state);
    
    if (this.undoStack.length > this.maxStates) {
        this.undoStack.shift();
    }
    
    this.redoStack = [];
}

restoreColorChange(state) {
    try {
        this.isRecording = false;
        
        const elementIds = state.elementIds;
        const previousColors = state.previousColors;
        const newColor = state.newColor;
        
        
        elementIds.forEach((elementId, index) => {
            const element = this.findElementById(elementId);
            if (element && element.isMesh) {
                const previousColor = previousColors[index];
                
                if (previousColor !== null) {
                    
                    const color = new THREE.Color(previousColor);
                    
                    if (Array.isArray(element.material)) {
                        element.material.forEach(material => {
                            if (material && material.color) {
                                material.color.copy(color);
                                material.needsUpdate = true;
                            }
                        });
                    } else if (element.material && element.material.color) {
                        element.material.color.copy(color);
                        element.material.needsUpdate = true;
                    }
                    
                    
                    if (element.userData.modifications) {
                        if (previousColor === null) {
                            delete element.userData.modifications.color;
                        } else {
                            element.userData.modifications.color = previousColor;
                        }
                    }
                } else {
                    
                    if (element.userData.modifications) {
                        delete element.userData.modifications.color;
                    }
                }
            }
        });
        
        
        const redoState = {
            type: 'color_change',
            description: `Redo: ${state.description}`,
            timestamp: Date.now(),
            elementIds: elementIds,
            previousColors: elementIds.map(id => {
                const element = this.findElementById(id);
                if (element && element.isMesh && element.material) {
                    if (Array.isArray(element.material)) {
                        return element.material[0]?.color?.getHex() || null;
                    } else {
                        return element.material.color?.getHex() || null;
                    }
                }
                return null;
            }),
            newColor: newColor
        };
        
        this.redoStack.push(redoState);
        
        this.isRecording = true;
        return true;
        
    } catch (error) {
        console.error('Error restoring color modification:', error);
        this.isRecording = true;
        return false;
    }
}
    
restoreTextureChange(state) {
    try {
        this.isRecording = false;
        
        const elementIds = state.elementIds;
        const previousTextures = state.previousTextures;
        const newTextureUrl = state.newTextureUrl;
        const faceType = state.faceType;
        
        
        elementIds.forEach((elementId, index) => {
            const element = this.findElementById(elementId);
            if (element && element.isMesh) {
                const previousTexture = previousTextures[index];
                
                if (Object.keys(previousTexture).length > 0) {
                    
                    
                    Object.keys(previousTexture).forEach(textureKey => {
                        const textureUrl = previousTexture[textureKey];
                        if (textureUrl) {
                            this.viewer.modelManager.applyTextureToElement(
                                element, 
                                textureUrl, 
                                textureKey === 'all' ? 'all' : faceType
                            ).catch(err => {
                                console.warn(`Error restoring texture ${textureKey}:`, err);
                            });
                        }
                    });
                    
                    
                    if (element.userData.modifications) {
                        if (Object.keys(previousTexture).length === 0) {
                            delete element.userData.modifications.textures;
                        } else {
                            element.userData.modifications.textures = { ...previousTexture };
                        }
                    }
                } else {
                    
                    if (element.userData.modifications) {
                        delete element.userData.modifications.textures;
                    }
                    
                    
                    if (element.userData.originalMaterials) {
                        if (Array.isArray(element.material) && Array.isArray(element.userData.originalMaterials)) {
                            element.material.forEach((material, idx) => {
                                if (material && element.userData.originalMaterials[idx]) {
                                    material.copy(element.userData.originalMaterials[idx]);
                                    material.needsUpdate = true;
                                }
                            });
                        } else if (element.material && element.userData.originalMaterials[0]) {
                            element.material.copy(element.userData.originalMaterials[0]);
                            element.material.needsUpdate = true;
                        }
                    }
                }
            }
        });
        
        
        const redoState = {
            type: 'texture_change',
            description: `Redo: ${state.description}`,
            timestamp: Date.now(),
            elementIds: elementIds,
            previousTextures: elementIds.map(id => {
                const element = this.findElementById(id);
                const textures = {};
                if (element && element.isMesh && element.material) {
                    if (Array.isArray(element.material)) {
                        element.material.forEach((mat, index) => {
                            if (mat && mat.map && mat.map.image) {
                                textures[index] = mat.map.image.src;
                            }
                        });
                    } else if (element.material && element.material.map && element.material.map.image) {
                        textures['all'] = element.material.map.image.src;
                    }
                }
                return textures;
            }),
            newTextureUrl: newTextureUrl,
            faceType: faceType
        };
        
        this.redoStack.push(redoState);
        
        this.isRecording = true;
        return true;
        
    } catch (error) {
        console.error('Error restoring texture modification', error);
        this.isRecording = true;
        return false;
    }
}
    redo() {
    if (this.redoStack.length === 0) {
        this.viewer.showNotification('There are no further actions', true);
        return false;
    }

    const state = this.redoStack.pop();
    let success = false;
    
    if (state.type === 'color_change') {
        
        const elementIds = state.elementIds;
        const newColor = state.newColor;
        
        elementIds.forEach(elementId => {
            const element = this.findElementById(elementId);
            if (element) {
                this.viewer.modelManager.changeSelectedElementsColor(newColor);
            }
        });
        
        success = true;
    } else if (state.type === 'texture_change') {
        
        const elementIds = state.elementIds;
        const newTextureUrl = state.newTextureUrl;
        const faceType = state.faceType;
        
        elementIds.forEach(elementId => {
            const element = this.findElementById(elementId);
            if (element) {
                this.viewer.modelManager.applyTextureToSelected(newTextureUrl, faceType);
            }
        });
        
        success = true;
    } else {
        
        this.undoStack.push({
            type: 'complete',
            sceneState: this.captureCompleteSceneState(),
            timestamp: Date.now()
        });

        success = this.restoreState(state);
    }
    
    if (success) {
        this.viewer.showNotification(`Redo: ${state.description || 'action'}`);
    }
    
    return success;
}


    
    
getHistory() {
    return {
        undoCount: this.undoStack.length,
        redoCount: this.redoStack.length,
        undoStack: this.undoStack.map(s => ({
            description: s.description,
            timestamp: s.timestamp,
            isPartial: s.isPartial
        })),
        redoStack: this.redoStack.map(s => ({
            description: s.description,
            timestamp: s.timestamp,
            isPartial: s.isPartial
        })),
        hiddenElementsCount: this.hiddenElements.size
    };
}

    captureModifiedState(modifiedElements, description) {
        const state = {
            modifiedElements: [],
            description: description,
            timestamp: Date.now(),
            isPartial: true
        };

        
        const elementsByGroup = new Map();
        
        modifiedElements.forEach(element => {
            if (!element.parent) return;
            
            const groupName = this.getGroupName(element.parent);
            if (!elementsByGroup.has(groupName)) {
                elementsByGroup.set(groupName, []);
            }
            elementsByGroup.get(groupName).push(element);
        });

        
        elementsByGroup.forEach((elements, groupName) => {
            const groupState = {
                groupName: groupName,
                elements: this.captureElementsState(elements)
            };
            state.modifiedElements.push(groupState);
        });

        
        return state;
    }

        getGroupName(group) {
        if (group === this.viewer.modelManager.buildings) return 'buildings';
        if (group === this.viewer.externalModels) return 'externalModels';
        return 'unknown';
    }

    
    captureElementsState(elements) {
        return elements.map(element => {
            try {
                return {
                    id: element.userData?.elementId || element.id,
                    type: element.type,
                    position: element.position.clone(),
                    rotation: element.rotation.clone(),
                    scale: element.scale.clone(),
                    quaternion: element.quaternion.clone(),
                    visible: element.visible,
                    userData: this.cloneUserData(element.userData),
                    geometry: element.geometry ? this.captureGeometryState(element.geometry) : null,
                    material: element.material ? this.captureMaterialState(element.material) : null
                };
            } catch (error) {
                console.warn('Error capturing element state:', element.userData?.elementId, error);
                return null;
            }
        }).filter(element => element !== null);
    }

 
    createElementFromState(elementState) {
        if (!elementState) return null;
        
        try {
            let element;
            
            if (elementState.type === 'Group' || elementState.children) {
                
                element = new THREE.Group();
                
                
                if (elementState.children && Array.isArray(elementState.children)) {
                    elementState.children.forEach(childState => {
                        const child = this.createElementFromState(childState);
                        if (child) {
                            element.add(child);
                        }
                    });
                }
            } else {
                
                const geometry = this.createGeometryFromState(elementState.geometry);
                const material = this.createMaterialFromState(elementState.material);
                element = new THREE.Mesh(geometry, material);
            }
            
            
            if (elementState.position) {
                element.position.fromArray(elementState.position);
            }
            
            if (elementState.rotation) {
                element.rotation.fromArray(elementState.rotation);
            }
            
            if (elementState.scale) {
                element.scale.fromArray(elementState.scale);
            }
            
            element.visible = elementState.visible !== false;
            
            
            element.userData = this.restoreUserDataFromState(elementState.userData);
            
            if (!element.userData.elementId && elementState.id) {
                element.userData.elementId = elementState.id;
            }
            
            
            if (element.isGroup && elementState.originalElements) {
                element.userData.originalElements = elementState.originalElements;
                element.userData.isMerged = true;
            }
            
            return element;
            
        } catch (error) {
            console.error('Error creating element from state:', error);
            return null;
        }
    }

 
    restoreUserDataFromState(userDataState) {
        if (!userDataState) return {};
        
        const userData = {};
        
        for (const key in userDataState) {
            const value = userDataState[key];
            
            
            if (Array.isArray(value)) {
                if (key === 'position' || key === 'scale') {
                    userData[key] = new THREE.Vector3().fromArray(value);
                } else if (key === 'rotation') {
                    userData[key] = new THREE.Euler().fromArray(value);
                } else if (key === 'quaternion') {
                    userData[key] = new THREE.Quaternion().fromArray(value);
                } else {
                    userData[key] = value;
                }
            } else if (key === 'color' && typeof value === 'number') {
                userData[key] = new THREE.Color(value);
            } else {
                userData[key] = value;
            }
        }
        
        return userData;
    }

cloneUserDataComplete(userData) {
    if (!userData) return {};
    
    const cloned = {};
    
    try {
        for (const key in userData) {
            if (key === 'originalMaterials' || key === 'geometry' || key === 'material') {
                
                continue;
            }
            
            const value = userData[key];
            
            if (value instanceof THREE.Vector3) {
                cloned[key] = value.clone();
            } else if (value instanceof THREE.Euler) {
                cloned[key] = new THREE.Euler(value.x, value.y, value.z, value.order);
            } else if (value instanceof THREE.Color) {
                cloned[key] = value.clone();
            } else if (value instanceof THREE.Quaternion) {
                cloned[key] = value.clone();
            } else if (typeof value === 'object' && value !== null) {
                
                try {
                    cloned[key] = JSON.parse(JSON.stringify(value));
                } catch (e) {
                    cloned[key] = {...value};
                }
            } else {
                cloned[key] = value;
            }
        }
    } catch (error) {
        console.warn('Error cloning userData:', error);
    }
    
    return cloned;
}


createGeometryFromStateComplete(geometryState) {
    if (!geometryState) return new THREE.BoxGeometry(10, 10, 10);

    try {
        

        
        if (geometryState.geometryParameters) {
            const geometry = this.createGeometryFromParameters(
                geometryState.geometryType, 
                geometryState.geometryParameters
            );
            if (geometry) {
                
                return geometry;
            }
        }

        
        
        return this.createGeometryFromState(geometryState);
        
    } catch (error) {
        console.error(' Error creating full geometry:', error);
        return new THREE.BoxGeometry(10, 10, 10);
    }
}

createGeometryFromParameters(geometryType, parameters) {
    if (!geometryType || !parameters) return null;

    try {
        

        switch (geometryType) {
            case 'BoxGeometry':
                return new THREE.BoxGeometry(
                    parameters.width || 10,
                    parameters.height || 10,
                    parameters.depth || 10,
                    parameters.widthSegments,
                    parameters.heightSegments,
                    parameters.depthSegments
                );

            case 'SphereGeometry':
                return new THREE.SphereGeometry(
                    parameters.radius || 5,
                    parameters.widthSegments || 8,
                    parameters.heightSegments || 6,
                    parameters.phiStart,
                    parameters.phiLength,
                    parameters.thetaStart,
                    parameters.thetaLength
                );

            case 'CylinderGeometry':
                return new THREE.CylinderGeometry(
                    parameters.radiusTop || 5,
                    parameters.radiusBottom || 5,
                    parameters.height || 10,
                    parameters.radialSegments || 8,
                    parameters.heightSegments || 1,
                    parameters.openEnded,
                    parameters.thetaStart,
                    parameters.thetaLength
                );

            case 'ConeGeometry':
                return new THREE.ConeGeometry(
                    parameters.radius || 5,
                    parameters.height || 10,
                    parameters.radialSegments || 8,
                    parameters.heightSegments || 1,
                    parameters.openEnded,
                    parameters.thetaStart,
                    parameters.thetaLength
                );

            case 'PlaneGeometry':
                return new THREE.PlaneGeometry(
                    parameters.width || 10,
                    parameters.height || 10,
                    parameters.widthSegments,
                    parameters.heightSegments
                );

            case 'TorusGeometry':
                return new THREE.TorusGeometry(
                    parameters.radius || 5,
                    parameters.tube || 2,
                    parameters.radialSegments || 8,
                    parameters.tubularSegments || 6,
                    parameters.arc
                );

            case 'ExtrudeGeometry':
                
                
                return new THREE.BoxGeometry(10, 10, 10);

            default:
                
                return new THREE.BoxGeometry(10, 10, 10);
        }
    } catch (error) {
        console.error(`Error creating geometry ${geometryType}:`, error);
        return null;
    }
}



createMaterialFromStateComplete(materialState) {
    if (!materialState) {
        return new THREE.MeshLambertMaterial({ color: 0x888888 });
    }

    try {
        if (Array.isArray(materialState)) {
            return materialState.map(matState => this.createSingleMaterialFromStateComplete(matState));
        } else {
            return this.createSingleMaterialFromStateComplete(materialState);
        }
    } catch (error) {
        console.error(' Error creating material:', error);
        return new THREE.MeshLambertMaterial({ color: 0x888888 });
    }
}

createSingleMaterialFromStateComplete(materialState) {
    const params = {
        color: materialState.color || 0x888888,
        transparent: materialState.transparent || false,
        opacity: materialState.opacity || 1.0
    };

    if (materialState.emissive) {
        params.emissive = new THREE.Color(materialState.emissive);
    }

    return new THREE.MeshLambertMaterial(params);
}


captureGeometryParameters(geometry) {
    if (!geometry || !geometry.parameters) return null;
    
    try {
        const params = geometry.parameters;
        const capturedParams = {};
        
        
        for (const key in params) {
            try {
                const value = params[key];
                
                if (value instanceof THREE.Vector2) {
                    capturedParams[key] = { x: value.x, y: value.y, type: 'Vector2' };
                } else if (value instanceof THREE.Vector3) {
                    capturedParams[key] = { x: value.x, y: value.y, z: value.z, type: 'Vector3' };
                } else if (Array.isArray(value)) {
                    
                    capturedParams[key] = value.map(item => {
                        if (item && typeof item === 'object') {
                            return this.serializeShape(item);
                        }
                        return item;
                    });
                } else if (value && typeof value === 'object') {
                    
                    capturedParams[key] = this.serializeShape(value);
                } else {
                    
                    capturedParams[key] = value;
                }
            } catch (error) {
                console.warn(`Error capturing parameter ${key}:`, error);
                capturedParams[key] = null;
            }
        }
        
        return capturedParams;
    } catch (error) {
        console.error('Error capturing geometry parameters:', error);
        return null;
    }
}


serializeShape(shape) {
    if (!shape) return null;
    
    try {
        
        if (shape instanceof THREE.Shape) {
            const serialized = {
                type: 'Shape',
                curves: shape.curves ? shape.curves.map(curve => this.serializeCurve(curve)) : []
            };
            return serialized;
        }
        
        
        const serialized = { type: shape.constructor?.name || 'Unknown' };
        for (const key in shape) {
            if (shape.hasOwnProperty(key) && typeof shape[key] !== 'function') {
                try {
                    serialized[key] = shape[key];
                } catch (e) {
                    serialized[key] = 'Unserializable';
                }
            }
        }
        return serialized;
    } catch (error) {
        console.warn('Error serializing shape:', error);
        return { type: 'Error', error: error.message };
    }
}


serializeCurve(curve) {
    if (!curve) return null;
    
    try {
        return {
            type: curve.constructor?.name || 'Curve',
            arcLengthDivisions: curve.arcLengthDivisions
        };
    } catch (error) {
        console.warn('Error serializing curve:', error);
        return { type: 'Error' };
    }
}

captureGeometryAttributes(geometry) {
    if (!geometry || !geometry.attributes) return null;
    
    try {
        const attributes = {};
        
        for (const name in geometry.attributes) {
            const attribute = geometry.attributes[name];
            if (attribute && attribute.array) {
                attributes[name] = {
                    itemSize: attribute.itemSize,
                    count: attribute.count,
                    normalized: attribute.normalized,
                    
                    arrayType: attribute.array.constructor.name,
                    arrayLength: attribute.array.length
                };
            }
        }
        
        return attributes;
    } catch (error) {
        console.error('Error capturing geometry attributes:', error);
        return null;
    }
}




captureMaterialStateComplete(material) {
    if (!material) return null;
    
    try {
        if (Array.isArray(material)) {
            return material.map(mat => this.captureSingleMaterialStateComplete(mat));
        } else {
            return this.captureSingleMaterialStateComplete(material);
        }
    } catch (error) {
        console.error('Error capturing full material:', error);
        return null;
    }
}
captureSingleMaterialStateComplete(material) {
    try {
        const materialState = {
            type: material.type,
            color: material.color ? material.color.getHex() : 0xffffff,
            transparent: material.transparent,
            opacity: material.opacity,
            emissive: material.emissive ? material.emissive.getHex() : 0x000000,
            
            wireframe: material.wireframe,
            visible: material.visible,
            name: material.name
        };

        
        if (material.map) {
            materialState.map = {
                source: material.map.source,
                image: material.map.image ? { src: material.map.image.src } : null
            };
        }

        return materialState;
    } catch (error) {
        console.error('Error capturing individual material:', error);
        return this.captureSingleMaterialState(material); 
    }
}



captureMaterialProperties(material) {
    if (!material) return null;
    
    try {
        const properties = {};
        const propsToCapture = [
            'color', 'emissive', 'specular', 'shininess', 'transparent', 
            'opacity', 'wireframe', 'visible', 'name', 'type'
        ];
        
        for (const prop of propsToCapture) {
            if (material[prop] !== undefined) {
                if (material[prop] instanceof THREE.Color) {
                    properties[prop] = material[prop].getHex();
                } else {
                    properties[prop] = material[prop];
                }
            }
        }
        
        return properties;
    } catch (error) {
        console.error('Error capturing material properties:', error);
        return null;
    }
}

    
    clearHistory() {
        this.undoStack = [];
        this.redoStack = [];
        this.hiddenElements.clear();
    }
}