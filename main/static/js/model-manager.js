
class ModelManager {
    constructor(scene, viewer) {
        this.scene = scene;
        this.viewer = viewer;
        this.buildings = new THREE.Group();
        this.scene.add(this.buildings);
        
        this.stats = {
            buildings: 0,
            roads: 0,
            water: 0,
            natural: 0,
            landuse: 0,
            other: 0,
            triangles: 0,
            vertices: 0
        };
        this.clipboard = [];
        this.isProcessing = false;
        this.textureLoader = new THREE.TextureLoader();
        
        
        this.textureUrls = {
            'building': {
                'top': '/api/element-texture/?type=building&face=top',
                'aside': '/api/element-texture/?type=building&face=aside', 
                'side': '/api/element-texture/?type=building&face=side',
                'bottom': '/api/element-texture/?type=building&face=bottom'
            },
            'highway': {
                'top': '/api/element-texture/?type=road&face=top',
                'aside': '/api/element-texture/?type=road&face=aside', 
                'side': '/api/element-texture/?type=road&face=side',
                'bottom': '/api/element-texture/?type=road&face=bottom'
            },
            'water': {
                'top': '/api/element-texture/?type=water&face=top',
                'aside': '/api/element-texture/?type=water&face=aside', 
                'side': '/api/element-texture/?type=water&face=side',
                'bottom': '/api/element-texture/?type=water&face=bottom'
            },
            'natural': {
                'top': '/api/element-texture/?type=natural&face=top',
                'aside': '/api/element-texture/?type=natural&face=aside', 
                'side': '/api/element-texture/?type=natural&face=side',
                'bottom': '/api/element-texture/?type=natural&face=bottom'
            },
            'landuse': {
                'top': '/api/element-texture/?type=landuse&face=top',
                'aside': '/api/element-texture/?type=landuse&face=aside', 
                'side': '/api/element-texture/?type=landuse&face=side',
                'bottom': '/api/element-texture/?type=landuse&face=bottom'
            },
            'other': {
                'top': '/api/element-texture/?type=other&face=top',
                'aside': '/api/element-texture/?type=other&face=aside', 
                'side': '/api/element-texture/?type=other&face=side',
                'bottom': '/api/element-texture/?type=other&face=bottom'
            }
        };

        
        this.textures = {};
        this.availableTextures = [];
        this.preloadTextures();
        this.loadAvailableTextures();
    }

    
    async loadAvailableTextures() {
        try {
            const response = await fetch('/api/available-textures/');
            const data = await response.json();
            if (data.success) {
                this.availableTextures = data.textures;
                
            }
        } catch (error) {
            console.error('Error loading texture list:', error);
        }
    }

    
    async preloadTextures() {
        
        
        for (const [elementType, faceUrls] of Object.entries(this.textureUrls)) {
            this.textures[elementType] = {};
            
            for (const [faceType, url] of Object.entries(faceUrls)) {
                try {
                    
                    this.textures[elementType][faceType] = await this.loadTexture(url);
                    
                } catch (error) {
                    console.error(`Error loading texture for ${elementType}.${faceType}:`, error);
                    
                    
                    this.textures[elementType][faceType] = null;
                }
            }
        }
        
        
    }

    
    loadTexture(url) {
        return new Promise((resolve, reject) => {
            
            
            this.textureLoader.load(
                url,
                (texture) => {
                    
                    
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(1, 1);
                    texture.anisotropy = 16;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    resolve(texture);
                },
                
                (progress) => {
                    
                },
                
                (error) => {
                    console.error(` Error loading texture ${url}:`, error);
                    
                    reject(error);
                }
            );
        });
    }


async addBuildingsFromGeoJSON(geojson, origin, dataType = 'building') {
    this.buildings.clear();
    this.isProcessing = true;
    
    const R = 6378137;
    
function lonLatToMeters(lon, lat) {
    const x = R * lon * Math.PI / 180;
    const z = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); 
    return [x, z]; 
}

    let successfulElements = 0;
    let skippedElements = 0;
    const PLATFORM_HEIGHT = 0;
    
    const processBatch = async (startIndex, batchSize = 50) => {
        if (!this.isProcessing) return;
        
        const endIndex = Math.min(startIndex + batchSize, geojson.features.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            if (!this.isProcessing) break;
            
            const f = geojson.features[i];
            const fp = f.geometry.coordinates[0];
            
            if (!fp || fp.length < 3) {
                skippedElements++;
                continue;
            }
            
            const props = f.properties || {};
            const elementType = this.determineElementType(props);
            const height = this.calculateElementHeight(elementType, props);
            
            try {
                
                const shapePts = fp.map(([lon, lat]) => {
                    const [mx, mz] = lonLatToMeters(lon, lat); 
                    return new THREE.Vector2(mx - origin[0], mz - origin[1]);
                });
                
                const shape = new THREE.Shape(shapePts);
                const extrudeHeight = Math.abs(height);
                
                
                const geom = new THREE.ExtrudeGeometry(shape, { 
                    depth: extrudeHeight, 
                    bevelEnabled: false 
                });
                
                
                geom.rotateX(-Math.PI / 2);
                
                
                geom.computeBoundingBox();
                const bbox = geom.boundingBox;
                
                
                const centerX = (bbox.min.x + bbox.max.x) / 2;
                const centerY = (bbox.min.y + bbox.max.y) / 2; 
                const centerZ = (bbox.min.z + bbox.max.z) / 2;
                
                
                geom.translate(-centerX, -centerY, -centerZ);
                
                
                geom.computeBoundingBox();
                const newBbox = geom.boundingBox;
                const width = newBbox.max.x - newBbox.min.x;
                const depth = newBbox.max.z - newBbox.min.z; 
                const actualHeight = newBbox.max.y - newBbox.min.y; 
                
                
                const materials = this.createFaceMaterials(elementType);
                
                
                this.applyUVCoordinatesAllFaces(geom, actualHeight, width, depth);
                
                const mesh = new THREE.Mesh(geom, materials);
                
                
                let yPosition = PLATFORM_HEIGHT;
                if (height < 0) {
                    yPosition = PLATFORM_HEIGHT - (actualHeight / 2);
                } else {
                    yPosition = PLATFORM_HEIGHT + (actualHeight / 2);
                }
                
                mesh.position.set(centerX, yPosition, centerZ);
                
                
                mesh.userData = {
                    type: elementType,
                    properties: props,
                    originalHeight: actualHeight,
                    originalHeightInitial: actualHeight,
                    originalWidth: width,
                    originalDepth: depth,
                    elementId: `element_${i}`,
                    faceTextures: Object.keys(this.textures[elementType] || {}),
                    originalMaterials: materials.map(mat => mat.clone()),
                    isSelected: false,
                    pivot: {
                        type: 'bottom-center',
                        worldPosition: mesh.position.clone(),
                        localOffset: new THREE.Vector3(0, -actualHeight/2, 0) 
                    },
                    platformOffset: PLATFORM_HEIGHT,
                    baseHeight: height,
                    modifications: {
                        height: null,
                        width: null,
                        color: null,
                        textures: {}
                    }
                };
                
                this.buildings.add(mesh);
                successfulElements++;
                
            } catch(e) {
                skippedElements++;
                console.warn('Error creating element:', e);
            }
        }
        
        
        if (endIndex < geojson.features.length && this.isProcessing) {
            setTimeout(() => {
                requestAnimationFrame(() => processBatch(endIndex, batchSize));
            }, 0);
        } else {
            this.isProcessing = false;
            this.logElementDistribution();
            this.updateStats();
            this.centerCameraOnBuildings(this.viewer.camera, this.viewer.controls);
            this.viewer.showNotification(`Full load: ${successfulElements} elements`);
            this.viewer.hideLoading();
        }
    };
    
    await processBatch(0, 100);
    return successfulElements;
}


    createFaceMaterials(elementType) {
    
    
    const elementTextures = this.textures[elementType] || {};
    
    
    const baseColors = {
        'top': 0xdddddd,
        'aside': 0xcccccc, 
        'side': 0xbbbbbb,
        'bottom': 0x999999
    };

    const materials = [];

    
    for (let i = 0; i < 6; i++) {
        let faceType;
        
        switch(i) {
            case 0: faceType = 'aside'; break;
            case 1: faceType = 'top'; break;
            case 2: faceType = 'side'; break;
            case 3: faceType = 'bottom'; break;
            case 4: faceType = 'side'; break;
            case 5: faceType = 'side'; break;
            default: faceType = 'side';
        }

        const texture = elementTextures[faceType];
        const materialOptions = {
            color: baseColors[faceType],
            side: THREE.FrontSide,
            transparent: false,
            opacity: 1.0
        };

        if (texture) {
            materialOptions.map = texture;
            materialOptions.needsUpdate = true;
        }

        const material = new THREE.MeshLambertMaterial(materialOptions);
        materials.push(material);
    }

    return materials;
}

    
   applyUVCoordinatesAllFaces(geometry, height, width, depth) {
    const positions = geometry.attributes.position.array;
    const uvs = new Float32Array(positions.length / 3 * 2);
    
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    
    const topBottomScale = 4;
    const sideScale = 8;
    
    for (let i = 0, uvIndex = 0; i < positions.length; i += 3, uvIndex += 2) {
        const x = positions[i];
        const y = positions[i + 1]; 
        const z = positions[i + 2];
        
        
        const isTop = Math.abs(y - boundingBox.max.y) < 0.001;
        const isBottom = Math.abs(y - boundingBox.min.y) < 0.001;
        const isAside = Math.abs(z - boundingBox.max.z) < 0.001;
        const isBack = Math.abs(z - boundingBox.min.z) < 0.001;
        const isRight = Math.abs(x - boundingBox.max.x) < 0.001;
        const isLeft = Math.abs(x - boundingBox.min.x) < 0.001;
        
        if (isTop) {
            
            uvs[uvIndex] = (x - boundingBox.min.x) / size.x * topBottomScale;
            uvs[uvIndex + 1] = (z - boundingBox.min.z) / size.z * topBottomScale;
        } 
        else if (isBottom) {
            
            uvs[uvIndex] = (x - boundingBox.min.x) / size.x * topBottomScale;
            uvs[uvIndex + 1] = (boundingBox.max.z - z) / size.z * topBottomScale;
        } 
        else if (isAside) {
            
            uvs[uvIndex] = (x - boundingBox.min.x) / size.x * sideScale;
            uvs[uvIndex + 1] = (y - boundingBox.min.y) / size.y * sideScale;
        } 
        else if (isBack) {
            
            uvs[uvIndex] = (boundingBox.max.x - x) / size.x * sideScale;
            uvs[uvIndex + 1] = (y - boundingBox.min.y) / size.y * sideScale;
        } 
        else if (isRight) {
            
            uvs[uvIndex] = (boundingBox.max.z - z) / size.z * sideScale;
            uvs[uvIndex + 1] = (y - boundingBox.min.y) / size.y * sideScale;
        } 
        else if (isLeft) {
            
            uvs[uvIndex] = (z - boundingBox.min.z) / size.z * sideScale;
            uvs[uvIndex + 1] = (y - boundingBox.min.y) / size.y * sideScale;
        }
    }
    
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
}

    
    determineElementType(props) {
    
    const p = props || {};
    
    
    if (p.building) {
        return 'building';
    }
    if (p.highway) {
        return 'highway';
    }
    if (p.waterway || p.water || p.natural === 'water') {
        return 'water';
    }
    if (p.natural) {
        return 'natural';
    }
    if (p.landuse) {
        return 'landuse';
    }
    
    
    return 'other';
}

    
    calculateElementHeight(elementType, props) {
        let height = 1;
        
        switch(elementType) {
            case 'building':
                height = parseFloat(props.height) || (props['building:levels'] ? props['building:levels'] * 3 : 10);
                height = Math.max(height, 1);
                break;
                
            case 'highway':
                if (props.highway === 'motorway' || props.highway === 'trunk') {
                    height = 1.0;
                } else if (props.highway === 'primary' || props.highway === 'secondary') {
                    height = 0.7;
                } else if (props.highway === 'residential' || props.highway === 'service') {
                    height = 0.3;
                } else {
                    height = 0.7;
                }
                break;
                
            case 'water':
                if (props.waterway === 'river') {
                    height = -0.3;
                } else if (props.waterway === 'stream') {
                    height = -0.1;
                } else if (props.natural === 'water') {
                    height = -0.2;
                } else {
                    height = -0.15;
                }
                break;
                
            case 'natural':
                if (props.natural === 'wood' || props.natural === 'forest') {
                    height = 8;
                } else if (props.natural === 'tree') {
                    height = 6;
                } else if (props.natural === 'scrub') {
                    height = 2;
                } else if (props.natural === 'grassland') {
                    height = 0.5;
                } else {
                    height = 1;
                }
                break;
                
            case 'landuse':
                if (props.landuse === 'forest' || props.landuse === 'orchard') {
                    height = 4;
                } else if (props.landuse === 'residential') {
                    height = 0.3;
                } else if (props.landuse === 'industrial' || props.landuse === 'commercial') {
                    height = 0.6;
                } else if (props.landuse === 'farmland' || props.landuse === 'meadow') {
                    height = 0.2;
                } else {
                    height = 0.4;
                }
                break;
                
            default: 
                height = 10;
        }
        
        return Math.max(height, 0.1);
    }

    
    logElementDistribution() {
        const distribution = this.getElementCountByType();
        
        
        
        this.updateElementCounts(distribution);
    }

    
    getElementCountByType() {
        const distribution = {
            'building': 0,
            'highway': 0,
            'water': 0,
            'natural': 0,
            'landuse': 0,
            'other': 0
        };
        
        this.buildings.traverse((child) => {
            if (child.isMesh && child.userData.type) {
                const type = child.userData.type;
                distribution[type] = (distribution[type] || 0) + 1;
            }
        });
        
        return distribution;
    }

    
    updateElementCounts(distribution) {
        const elementIds = {
            'building': 'buildingCount',
            'highway': 'roadCount',
            'water': 'waterCount',
            'natural': 'naturalCount',
            'landuse': 'landuseCount',
            'other': 'otherCount'
        };
        
        Object.keys(elementIds).forEach(type => {
            const element = document.getElementById(elementIds[type]);
            if (element) {
                element.textContent = (distribution[type] || 0).toLocaleString();
            }
        });
    }

createDemoBuildings() {

    this.buildings.clear();
    const PLATFORM_HEIGHT = 0;
    const types = ['building', 'highway', 'water', 'natural', 'landuse', 'other'];
    types.forEach((type, typeIndex) => {
        for (let i = 0; i < 15; i++) {
            const width = 20 + Math.random() * 30;
            const depth = 20 + Math.random() * 30;
            let height;
            switch(type) {
                case 'building':
                    height = 20 + Math.random() * 30;
                    break;
                case 'highway':
                    height = 0.5;
                    break;
                case 'water':
                    height = -2; 
                    break;
                case 'natural':
                    height = 5 + Math.random() * 10;
                    break;
                case 'landuse':
                    height = 0.3;
                    break;
                default:
                    height = 10;
            }
            
            const x = (typeIndex * 80) + (i % 5) * 40 - 200;
            const z = Math.floor(i / 5) * 40 - 100; 
            
            
            let yPosition;
            const extrudeHeight = Math.abs(height);
            
            if (height < 0) {
                
                yPosition = PLATFORM_HEIGHT - (extrudeHeight / 2);
            } else {
                
                yPosition = PLATFORM_HEIGHT + (extrudeHeight / 2);
            }
            
            
            const materials = this.createFaceMaterials(type);
            
            const geometry = new THREE.BoxGeometry(width, extrudeHeight, depth);
            
            
            this.applyBoxUVCoordinatesAllFaces(geometry, width, depth, extrudeHeight);
            
            const mesh = new THREE.Mesh(geometry, materials);
            
            mesh.position.set(x, yPosition, z);
            mesh.userData = {
                type: type,
                properties: {},
                originalHeight: extrudeHeight,
                originalHeightInitial: extrudeHeight,
                originalWidth: width,
                elementId: `demo_${type}_${i}`,
                faceTextures: Object.keys(this.textures[type] || {}),
                originalMaterials: materials.map(mat => mat.clone()),
                isSelected: false,
                platformOffset: PLATFORM_HEIGHT,
                baseHeight: height,
                modifications: {
                    height: null,
                    width: null,
                    color: null,
                    textures: {}
                }
            };
            this.buildings.add(mesh);
            
        }
    });
    
    this.updateStats();
    this.logElementDistribution();
    this.viewer.hideLoading();
    this.centerCameraOnBuildings(this.viewer.camera, this.viewer.controls);
    
}

    
    applyBoxUVCoordinatesAllFaces(geometry, width, depth, height) {
    const positions = geometry.attributes.position.array;
    const uvs = new Float32Array(positions.length / 3 * 2);
    
    
    const topBottomScale = 4;
    const sideScale = 6;
    
    for (let i = 0, uvIndex = 0; i < positions.length; i += 3, uvIndex += 2) {
        const x = positions[i];
        const y = positions[i + 1]; 
        const z = positions[i + 2]; 
        
        
        const isTop = Math.abs(y - height/2) < 0.001;
        const isBottom = Math.abs(y + height/2) < 0.001;
        const isFront = Math.abs(z - depth/2) < 0.001;
        const isBack = Math.abs(z + depth/2) < 0.001;
        const isRight = Math.abs(x - width/2) < 0.001;
        const isLeft = Math.abs(x + width/2) < 0.001;
        
        if (isTop) {
            
            uvs[uvIndex] = (x / width + 0.5) * topBottomScale;
            uvs[uvIndex + 1] = (z / depth + 0.5) * topBottomScale;
        } 
        else if (isBottom) {
            
            uvs[uvIndex] = (x / width + 0.5) * topBottomScale;
            uvs[uvIndex + 1] = (-z / depth + 0.5) * topBottomScale;
        } 
        else if (isFront) {
            
            uvs[uvIndex] = (x / width + 0.5) * sideScale;
            uvs[uvIndex + 1] = (y / height + 0.5) * sideScale;
        } 
        else if (isBack) {
            
            uvs[uvIndex] = (-x / width + 0.5) * sideScale;
            uvs[uvIndex + 1] = (y / height + 0.5) * sideScale;
        } 
        else if (isRight) {
            
            uvs[uvIndex] = (z / depth + 0.5) * sideScale;
            uvs[uvIndex + 1] = (y / height + 0.5) * sideScale;
        } 
        else if (isLeft) {
            
            uvs[uvIndex] = (-z / depth + 0.5) * sideScale;
            uvs[uvIndex + 1] = (y / height + 0.5) * sideScale;
        }
    }
    
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
    

    updateStats() {
    let triangleCount = 0;
    const distribution = this.getElementCountByType();
    const detailedStats = this.getElementTypeStatistics();
    this.buildings.traverse((child) => {
        if (child.isMesh) {
            const geometry = child.geometry;
            if (geometry.index) {
                triangleCount += geometry.index.count / 3;
            } else {
                triangleCount += geometry.attributes.position.count / 3;
            }
        }
    });
    this.stats.triangles = triangleCount;
    this.stats.vertices = triangleCount * 3; 
    
    
}

    updateBuildingInfo(buildingData) {
        if (buildingData.building_count && document.getElementById('buildingCount')) {
            document.getElementById('buildingCount').textContent = buildingData.building_count.toLocaleString();
        }
    }

    
    findElementById(elementId) {
        let foundElement = null;
        this.buildings.traverse((child) => {
            if (child.userData && child.userData.elementId === elementId) {
                foundElement = child;
            }
        });
        return foundElement;
    }

    
    getElementsByType(type) {
        const elements = [];
        this.buildings.traverse((child) => {
            if (child.isMesh && child.userData.type === type) {
                elements.push(child);
            }
        });
        return elements;
    }

    
    getOtherElements() {
        const mainTypes = ['building', 'highway', 'water', 'natural', 'landuse'];
        const otherElements = [];
        
        this.buildings.traverse((child) => {
            if (child.isMesh && child.userData.type && !mainTypes.includes(child.userData.type)) {
                otherElements.push(child);
            }
        });
        
        return otherElements;
    }

    
    async reloadTextures() {
        
        this.textures = {};
        await this.preloadTextures();
        
        
        this.buildings.traverse((child) => {
            if (child.isMesh && child.userData.type && Array.isArray(child.material)) {
                const elementType = child.userData.type;
                const elementTextures = this.textures[elementType] || {};
                
                
                child.material.forEach((material, index) => {
                    let faceType;
                    
                    
                    switch(index) {
                        case 0: faceType = 'top'; break;     
                        case 1: faceType = 'aside'; break;   
                        case 2: faceType = 'side'; break;    
                        case 3: faceType = 'bottom'; break;  
                        case 4: faceType = 'side'; break;    
                        case 5: faceType = 'side'; break;    
                        default: faceType = 'side';
                    }
                    
                    const texture = elementTextures[faceType];
                    if (texture) {
                        material.map = texture;
                        material.needsUpdate = true;
                        
                    } else {
                        
                    }
                });
            }
        });
        
        this.viewer.showNotification('Textures for all faces reloaded via backend API');
    }

    
    getTextureInfo() {
        const info = {};
        Object.keys(this.textures).forEach(elementType => {
            info[elementType] = {
                faces: Object.keys(this.textures[elementType]),
                loaded: Object.values(this.textures[elementType]).filter(t => t !== null).length,
                total: Object.keys(this.textures[elementType]).length
            };
        });
        return info;
    }

    
    debugElementMaterials(elementId) {
        const element = this.findById(elementId);
        if (element && Array.isArray(element.material)) {
            
            element.material.forEach((material, index) => {
                let faceType;
                switch(index) {
                    case 0: faceType = 'top'; break;
                    case 1: faceType = 'aside'; break;
                    case 2: faceType = 'side'; break;
                    case 3: faceType = 'bottom'; break;
                    case 4: faceType = 'side'; break;
                    case 5: faceType = 'side'; break;
                    default: faceType = 'unknown';
                }

            });
        }
    }

selectElement(element, multiSelect = false) {
    
    if (!element || !element.isObject3D) {
        console.warn('Attempt to select invalid element:', element);
        return false;
    }

    
    if (!multiSelect && this.viewer && this.viewer.multiSelectMode) {
        multiSelect = true;
    }
    
    
    if (element.isMesh && element.parent && element.parent.isGroup && 
        element.parent.userData && element.parent.userData.isMerged) {
        
    }
    
    
    if (element.userData && element.userData.isSelectable === false) {
        console.warn('Unselectable element:', element.userData.elementId);
        return false;
    }

    
    if (element.isMesh && !element.material) {
        console.warn('The mesh has no materials:', element);
        element.material = new THREE.MeshLambertMaterial({ color: 0x888888 });
    }

    
    if (!element.userData) {
        element.userData = {
            isSelected: false,
            isUserCreated: true,
            elementId: `element_${Math.random().toString(36).substr(2, 9)}`,
            type: element.isGroup ? 'merged' : 'other',
            modifications: {},
            isSelectable: true 
        };
    }

    
    if (!element.userData.modifications) {
        element.userData.modifications = {};
    }

    
    if (element.userData.modifications.color && element.isMesh) {
        try {
            const threeColor = new THREE.Color(element.userData.modifications.color);
            
            if (Array.isArray(element.material)) {
                element.material.forEach(material => {
                    if (material && material.color) {
                        material.color.copy(threeColor);
                        material.needsUpdate = true;
                    }
                });
            } 
            else if (element.material && element.material.color) {
                element.material.color.copy(threeColor);
                element.material.needsUpdate = true;
            }
        } catch (error) {
            console.error('Error restoring color on selection:', error);
        }
    }
    
    
    if (!multiSelect) {
        this.deselectAllElements();
    }
    
    
    if (multiSelect && element.userData.isSelected) {
        this.deselectElement(element);
        return true;
    }
    
    
    if (element.isMesh && !element.userData.originalMaterials) {
        element.userData.originalMaterials = [];
        
        try {
            if (Array.isArray(element.material)) {
                element.userData.originalMaterials = element.material.map(mat => {
                    if (mat && mat.clone && typeof mat.clone === 'function') {
                        try {
                            return mat.clone();
                        } catch (cloneError) {
                            console.warn('Error cloning material:', cloneError);
                            return new THREE.MeshLambertMaterial({
                                color: mat.color ? mat.color.clone() : 0x888888,
                                map: mat.map,
                                emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000)
                            });
                        }
                    }
                    return new THREE.MeshLambertMaterial({ color: 0x888888 });
                });
            } else {
                if (element.material && element.material.clone && typeof element.material.clone === 'function') {
                    try {
                        element.userData.originalMaterials = [element.material.clone()];
                    } catch (cloneError) {
                        console.warn('Error cloning single material:', cloneError);
                        element.userData.originalMaterials = [
                            new THREE.MeshLambertMaterial({
                                color: element.material.color ? element.material.color.clone() : 0x888888,
                                map: element.material.map,
                                emissive: element.material.emissive ? element.material.emissive.clone() : new THREE.Color(0x000000)
                            })
                        ];
                    }
                } else {
                    element.userData.originalMaterials = [
                        new THREE.MeshLambertMaterial({ color: 0x888888 })
                    ];
                }
            }
        } catch (error) {
            console.error('General error while saving original materials:', error);
            element.userData.originalMaterials = [];
        }
    }
    
    
    element.userData.isSelected = true;
    
    
    if (element.isMesh) {
        this.applyHighlightMaterial(element);
    } else if (element.isGroup) {
        
        if (element.userData && element.userData.isMerged) {
            
            
        } else {
            
            element.traverse((child) => {
                if (child.isMesh && !child.userData.isMergedPart) {
                    this.applyHighlightMaterial(child);
                }
            });
        }
    }
    
    
    this.updateSelectionStats();
    
    
    this.updateSelectedElementInfo(element);
    
    
    if (this.modelEditor && this.modelEditor.updateSelectionModeUI) {
        setTimeout(() => {
            this.modelEditor.updateSelectionModeUI();
        }, 50);
    }
    
    return true;
}

updateSelectedElementInfo(element) {
    const infoPanel = document.getElementById('selectedElementInfo');
    if (!infoPanel) return;
    
    const elementType = element.userData?.type || 'unknown';
    const elementId = element.userData?.elementId || 'N/A';
    const isUserCreated = element.userData?.isUserCreated ? 'Da' : 'Nu';
    const isMerged = element.userData?.isMerged ? 'Da' : 'Nu';
    
    
    let height = 'N/A';
    if (element.userData?.isMerged) {
        height = element.userData.originalHeight ? element.userData.originalHeight.toFixed(2) : 'N/A';
    } else {
        height = element.userData?.originalHeight ? element.userData.originalHeight.toFixed(2) : 'N/A';
    }
    
    
    const position = element.position ? 
        `X:${element.position.x.toFixed(1)}, Y:${element.position.y.toFixed(1)}, Z:${element.position.z.toFixed(1)}` : 
        'N/A';
    
    infoPanel.innerHTML = `
        <div style="padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 0.375rem;">
            <div style="font-size: 0.875rem; font-weight: 600; color: var(--primary-color);">
                 Element Selectat
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                <strong>Tip:</strong> ${elementType}<br>
                <strong>ID:</strong> ${elementId}<br>
                <strong>Creat de utilizator:</strong> ${isUserCreated}<br>
                <strong>Unite:</strong> ${isMerged}<br>
                <strong>Înălțime:</strong> ${height}<br>
                <strong>Poziție:</strong> ${position}
            </div>
        </div>
    `;
    infoPanel.style.display = 'block';
}

repairElementForTextures(element) {
    try {
        if (!element || !element.isMesh) {
            return false;
        }
        
        
        if (!element.material) {
            element.material = new THREE.MeshLambertMaterial({ color: 0x888888 });
        }
        
        
        if (element.geometry && !element.geometry.attributes.uv) {
            const geometry = element.geometry;
            const count = geometry.attributes.position.count;
            const uvs = new Float32Array(count * 2);
            
            for (let i = 0; i < count; i++) {
                uvs[i * 2] = Math.random();
                uvs[i * 2 + 1] = Math.random();
            }
            
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        }
        
        
        if (!element.userData.originalMaterials) {
            if (Array.isArray(element.material)) {
                element.userData.originalMaterials = element.material.map(mat => {
                    if (mat && mat.clone) {
                        return mat.clone();
                    }
                    return new THREE.MeshLambertMaterial({ color: 0x888888 });
                });
            } else {
                element.userData.originalMaterials = [
                    element.material && element.material.clone ? 
                    element.material.clone() : 
                    new THREE.MeshLambertMaterial({ color: 0x888888 })
                ];
            }
        }
        
        
        element.userData.canReceiveTextures = true;
        
        return true;
    } catch (error) {
        console.error('Error repairing element for textures:', error);
        return false;
    }
}
separateSelectedMergedElements() {
    try {
        const selectedElements = this.getSelectedElements();
        
        if (selectedElements.length === 0) {
            this.viewer.showNotification('No elements selected', true);
            return 0;
        }
        
        let totalSeparated = 0;
        const groupsToRemove = [];
        
        selectedElements.forEach(mergedGroup => {
            if (mergedGroup.isGroup && mergedGroup.userData && mergedGroup.userData.isMerged) {
                
                
                if (mergedGroup.userData.isCopiedMergedGroup || 
                    mergedGroup.userData.wasCopied || 
                    mergedGroup.userData.canBeSeparated === false) {
                    
                    console.warn('The group is a copy and cannot be separated:', mergedGroup.userData.elementId);
                    this.viewer.showNotification('This merged group is a copy and cannot be separated', true);
                    return; 
                }
                
                if (this.viewer.modelEditor && this.viewer.modelEditor.transformControls) {
                    if (this.viewer.modelEditor.transformControls.object === mergedGroup) {
                        this.viewer.modelEditor.deactivateTransformControls();
                    }
                }
                
                
                const groupWorldPosition = new THREE.Vector3();
                mergedGroup.getWorldPosition(groupWorldPosition);
                
                const groupWorldQuaternion = new THREE.Quaternion();
                mergedGroup.getWorldQuaternion(groupWorldQuaternion);
                
                const groupWorldScale = new THREE.Vector3();
                mergedGroup.getWorldScale(groupWorldScale);
                
                
                const currentMaterialsMap = new Map();
                mergedGroup.children.forEach((child, index) => {
                    if (child.isMesh) {
                        try {
                            
                            if (Array.isArray(child.material)) {
                                currentMaterialsMap.set(index, child.material.map(mat => {
                                    return {
                                        color: mat.color ? mat.color.clone() : new THREE.Color(0x888888),
                                        emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
                                        opacity: mat.opacity || 1.0,
                                        transparent: mat.transparent || false,
                                        map: mat.map,
                                        type: mat.type
                                    };
                                }));
                            } else {
                                currentMaterialsMap.set(index, [{
                                    color: child.material.color ? child.material.color.clone() : new THREE.Color(0x888888),
                                    emissive: child.material.emissive ? child.material.emissive.clone() : new THREE.Color(0x000000),
                                    opacity: child.material.opacity || 1.0,
                                    transparent: child.material.transparent || false,
                                    map: child.material.map,
                                    type: child.material.type
                                }]);
                            }
                        } catch (error) {
                            console.error('Error capturing current materials:', error);
                        }
                    }
                });
                
                originalElementsData.forEach((data, index) => {
                    try {
                        const child = mergedGroup.children[index];
                        if (!child) return;
                        
                        
                        const childWorldPosition = new THREE.Vector3();
                        child.getWorldPosition(childWorldPosition);
                        
                        const childWorldQuaternion = new THREE.Quaternion();
                        child.getWorldQuaternion(childWorldQuaternion);
                        
                        const childWorldScale = new THREE.Vector3();
                        child.getWorldScale(childWorldScale);
                        
                        const originalElement = this.findOriginalElement(data.userData?.elementId);
                        
                        if (originalElement) {
                            
                            originalElement.visible = true;
                            
                            
                            originalElement.position.copy(childWorldPosition);
                            originalElement.quaternion.copy(childWorldQuaternion);
                            originalElement.scale.copy(childWorldScale);
                            
                            
                            originalElement.updateMatrixWorld(true);
                            
                            
                            const currentMaterials = currentMaterialsMap.get(index);
                            if (currentMaterials && originalElement.isMesh) {
                                if (Array.isArray(originalElement.material)) {
                                    
                                    currentMaterials.forEach((matData, matIndex) => {
                                        if (matIndex < originalElement.material.length) {
                                            const material = originalElement.material[matIndex];
                                            if (material && material.color && matData.color) {
                                                material.color.copy(matData.color);
                                            }
                                            if (material && material.emissive && matData.emissive) {
                                                material.emissive.copy(matData.emissive);
                                            }
                                            if (material) {
                                                material.opacity = matData.opacity || 1.0;
                                                material.transparent = matData.transparent || false;
                                            }
                                            material.needsUpdate = true;
                                        }
                                    });
                                } else if (originalElement.material && currentMaterials[0]) {
                                    
                                    const material = originalElement.material;
                                    const matData = currentMaterials[0];
                                    if (material.color && matData.color) {
                                        material.color.copy(matData.color);
                                    }
                                    if (material.emissive && matData.emissive) {
                                        material.emissive.copy(matData.emissive);
                                    }
                                    material.opacity = matData.opacity || 1.0;
                                    material.transparent = matData.transparent || false;
                                    material.needsUpdate = true;
                                }
                            }
                            
                            
                            if (data.modifications) {
                                originalElement.userData.modifications = { ...data.modifications };
                                
                                
                                if (data.modifications.color) {
                                    try {
                                        const threeColor = new THREE.Color(data.modifications.color);
                                        
                                        if (Array.isArray(originalElement.material)) {
                                            originalElement.material.forEach(material => {
                                                if (material && material.color) {
                                                    material.color.copy(threeColor);
                                                    material.needsUpdate = true;
                                                }
                                            });
                                        } 
                                        else if (originalElement.material && originalElement.material.color) {
                                            originalElement.material.color.copy(threeColor);
                                            originalElement.material.needsUpdate = true;
                                        }
                                    } catch (colorError) {
                                        console.error('Error restoring color:', colorError);
                                    }
                                }
                                
                                
                                if (data.modifications.textures && Object.keys(data.modifications.textures).length > 0) {
                                    Object.keys(data.modifications.textures).forEach(faceType => {
                                        const textureUrl = data.modifications.textures[faceType];
                                        if (textureUrl) {
                                            this.applyTextureToElement(originalElement, textureUrl, faceType)
                                                .then(() => {
                                                    
                                                })
                                                .catch(err => {
                                                    console.error(`Error restoring texture:`, err);
                                                });
                                        }
                                    });
                                }
                            }
                            
                            
                            if (data.modifications && data.modifications.height !== undefined && data.modifications.height !== null) {
                                originalElement.userData.originalHeight = Math.abs(data.modifications.height);
                                originalElement.userData.baseHeight = data.modifications.height;
                                originalElement.userData.modifications.height = data.modifications.height;
                                
                                const originalHeightInitial = data.originalHeightInitial || 
                                                             data.userData?.originalHeightInitial || 
                                                             data.currentHeight || 10;
                                const extrudeHeight = Math.abs(data.modifications.height);
                                const scaleFactorY = extrudeHeight / originalHeightInitial;
                                originalElement.scale.y = scaleFactorY;
                            }
                            
                            if (data.modifications && data.modifications.width !== undefined && data.modifications.width !== null) {
                                const originalWidth = data.originalWidth || data.userData?.originalWidth || 1;
                                const originalDepth = data.originalDepth || data.userData?.originalDepth || 1;
                                
                                const scaleFactorX = data.modifications.width / originalWidth;
                                const scaleFactorZ = data.modifications.width / originalDepth;
                                
                                originalElement.scale.x = scaleFactorX;
                                originalElement.scale.z = scaleFactorZ;
                            }
                            
                            
                            if (data.currentHeight) {
                                originalElement.userData.currentHeight = data.currentHeight;
                            }
                            if (data.currentWidth) {
                                originalElement.userData.currentWidth = data.currentWidth;
                            }
                            if (data.currentDepth) {
                                originalElement.userData.currentDepth = data.currentDepth;
                            }
                            
                            if (data.appliedScale) {
                                originalElement.userData.appliedScale = data.appliedScale.clone();
                                originalElement.userData.originalScale = data.appliedScale.clone();
                            }
                            
                            if (data.appliedScaleFactor) {
                                originalElement.userData.appliedScaleFactor = data.appliedScaleFactor;
                            }
                            
                            delete originalElement.userData.isMergedPart;
                            delete originalElement.userData.mergedInto;
                            originalElement.userData.wasMerged = false;
                            delete originalElement.userData.mergeIndex;
                            delete originalElement.userData.mergeTimestamp;
                            
                            originalElement.userData.isSelectable = true;
                            originalElement.userData.isSelected = false;
                            
                            totalSeparated++;
                        } else {
                            
                            const restoredElement = this.createRestoredElementFromData(
                                data, 
                                index, 
                                childWorldPosition, 
                                childWorldQuaternion, 
                                childWorldScale
                            );
                            if (restoredElement) {
                                
                                const currentMaterials = currentMaterialsMap.get(index);
                                if (currentMaterials && restoredElement.isMesh) {
                                    if (Array.isArray(restoredElement.material)) {
                                        currentMaterials.forEach((matData, matIndex) => {
                                            if (matIndex < restoredElement.material.length) {
                                                const material = restoredElement.material[matIndex];
                                                if (material && material.color && matData.color) {
                                                    material.color.copy(matData.color);
                                                }
                                                if (material && material.emissive && matData.emissive) {
                                                    material.emissive.copy(matData.emissive);
                                                }
                                                if (material) {
                                                    material.opacity = matData.opacity || 1.0;
                                                    material.transparent = matData.transparent || false;
                                                }
                                                material.needsUpdate = true;
                                            }
                                        });
                                    } else if (restoredElement.material && currentMaterials[0]) {
                                        const material = restoredElement.material;
                                        const matData = currentMaterials[0];
                                        if (material.color && matData.color) {
                                            material.color.copy(matData.color);
                                        }
                                        if (material.emissive && matData.emissive) {
                                            material.emissive.copy(matData.emissive);
                                        }
                                        material.opacity = matData.opacity || 1.0;
                                        material.transparent = matData.transparent || false;
                                        material.needsUpdate = true;
                                    }
                                }
                                
                                totalSeparated++;
                            }
                        }
                        
                    } catch (error) {
                        console.error(`Error restoring element ${index}:`, error);
                    }
                });
                
                groupsToRemove.push(mergedGroup);
            }
        });
        
        groupsToRemove.forEach(group => {
            if (group.parent) {
                group.parent.remove(group);
            }
            
            group.traverse(child => {
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
        
        this.deselectAllElements();
        
        if (totalSeparated > 0) {
            this.viewer.showNotification(`Separate ${totalSeparated} elements with current position and colors preserved`);
            this.viewer.saveState('Separate merged elements');
        } else {
            this.viewer.showNotification('There are no merged elements to separate', true);
        }
        
        return totalSeparated;
        
    } catch (error) {
        console.error('Error separating elements:', error);
        this.viewer.showNotification('Error separating elements', true);
        return 0;
    }
}
createRestoredElementFromData(data, index, worldPosition = null, worldQuaternion = null, worldScale = null) {
    try {
        const isFromCache = data.userData?.loadedFromCache || data.loadedFromCache;
        
        let width = data.currentWidth || data.userData?.originalWidth || 10;
        let height = data.currentHeight || data.userData?.originalHeight || 10;
        let depth = data.currentDepth || data.userData?.originalDepth || 10;
        
        if (isFromCache && data.appliedScaleFactor) {
            width *= data.appliedScaleFactor;
            height *= data.appliedScaleFactor;
            depth *= data.appliedScaleFactor;
        }
        
        let geometry, material;
        
        if (data.geometryData && isFromCache) {
            geometry = new THREE.BoxGeometry(width, height, depth);
        } else {
            const elementType = data.type || 'other';
            if (elementType === 'building' || elementType === 'other') {
                geometry = new THREE.BoxGeometry(width, height, depth);
            } else if (elementType === 'highway') {
                geometry = new THREE.BoxGeometry(width, 0.5, depth);
            } else if (elementType === 'water') {
                geometry = new THREE.BoxGeometry(width, 0.2, depth);
            } else {
                geometry = new THREE.BoxGeometry(width, height, depth);
            }
        }
        
        
        if (data.modifications && data.modifications.color) {
            material = new THREE.MeshLambertMaterial({ 
                color: new THREE.Color(data.modifications.color),
                emissive: data.currentMaterials && data.currentMaterials[0] && data.currentMaterials[0].emissive 
                    ? new THREE.Color(data.currentMaterials[0].emissive) 
                    : new THREE.Color(0x000000),
                opacity: data.currentMaterials && data.currentMaterials[0] ? (data.currentMaterials[0].opacity || 1.0) : 1.0,
                transparent: data.currentMaterials && data.currentMaterials[0] ? (data.currentMaterials[0].transparent || false) : false
            });
        } 
        
        else if (data.currentMaterials && data.currentMaterials.length > 0) {
            const matData = data.currentMaterials[0];
            material = new THREE.MeshLambertMaterial({
                color: new THREE.Color(matData.color || 0x888888),
                emissive: new THREE.Color(matData.emissive || 0x000000),
                opacity: matData.opacity || 1.0,
                transparent: matData.transparent || false
            });
            
            
            if (matData.mapUrl) {
                this.textureLoader.load(matData.mapUrl, (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(1, 1);
                    material.map = texture;
                    material.needsUpdate = true;
                });
            }
        } 
        
        else if (data.userData?.originalMaterials && data.userData.originalMaterials.length > 0) {
            try {
                material = data.userData.originalMaterials[0].clone();
            } catch (e) {
                material = new THREE.MeshLambertMaterial({ 
                    color: 0x888888,
                    emissive: 0x000000
                });
            }
        } else {
            material = new THREE.MeshLambertMaterial({ 
                color: 0x888888,
                emissive: 0x000000
            });
        }
        
        const restoredElement = new THREE.Mesh(geometry, material);
        
        
        if (worldPosition && worldQuaternion && worldScale) {
            restoredElement.position.copy(worldPosition);
            restoredElement.quaternion.copy(worldQuaternion);
            restoredElement.scale.copy(worldScale);
        } 
        
        else if (data.worldPosition && data.worldQuaternion && data.worldScale) {
            restoredElement.position.copy(data.worldPosition);
            restoredElement.quaternion.copy(data.worldQuaternion);
            restoredElement.scale.copy(data.worldScale);
        }
        
        else if (data.elementMatrixWorld) {
            const matrix = data.elementMatrixWorld.clone();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            
            matrix.decompose(position, quaternion, scale);
            
            restoredElement.position.copy(position);
            restoredElement.quaternion.copy(quaternion);
            restoredElement.scale.copy(scale);
        }
        
        else if (data.position) {
            restoredElement.position.copy(data.position);
            restoredElement.rotation.copy(data.rotation || new THREE.Euler());
            restoredElement.scale.copy(data.scale || new THREE.Vector3(1, 1, 1));
        }
        
        
        restoredElement.userData = JSON.parse(JSON.stringify(data.userData || {}));
        
        
        if (data.modifications) {
            restoredElement.userData.modifications = { ...data.modifications };
        }
        
        
        restoredElement.userData.originalHeight = height;
        restoredElement.userData.originalWidth = width;
        restoredElement.userData.originalDepth = depth;
        
        
        if (isFromCache) {
            restoredElement.userData.loadedFromCache = true;
            
            if (data.appliedScale) {
                restoredElement.userData.appliedScale = data.appliedScale.clone();
                restoredElement.userData.originalScale = data.appliedScale.clone();
            }
            
            if (data.appliedScaleFactor) {
                restoredElement.userData.appliedScaleFactor = data.appliedScaleFactor;
            }
        }
        
        
        delete restoredElement.userData.isMergedPart;
        delete restoredElement.userData.mergedInto;
        delete restoredElement.userData.wasMerged;
        delete restoredElement.userData.mergeIndex;
        delete restoredElement.userData.mergeTimestamp;
        
        
        restoredElement.userData.isSelectable = true;
        restoredElement.userData.isSelected = false;
        
        
        if (data.userData && data.userData.elementId) {
            restoredElement.userData.elementId = data.userData.elementId;
        } else {
            restoredElement.userData.elementId = `restored_${Date.now()}_${index}`;
        }
        
        restoredElement.elementId = restoredElement.userData.elementId;
        
        
        if (data.modifications && data.modifications.textures) {
            setTimeout(() => {
                Object.keys(data.modifications.textures).forEach(faceType => {
                    const textureUrl = data.modifications.textures[faceType];
                    if (textureUrl) {
                        this.applyTextureToElement(restoredElement, textureUrl, faceType)
                            .then(() => {
                                
                            })
                            .catch(err => {
                                console.error(`Error applying texture:`, err);
                            });
                    }
                });
            }, 100);
        }
        
        
        this.buildings.add(restoredElement);
        
        
        return restoredElement;
        
    } catch (error) {
        console.error('Error creating restored element:', error);
        return null;
    }
}

restoreMaterialsFromData(element, materialsData) {
    try {
        if (!element || !materialsData) return;
        
        
        if (Array.isArray(materialsData) && Array.isArray(element.material)) {
            materialsData.forEach((matData, index) => {
                if (index < element.material.length && element.material[index]) {
                    const material = element.material[index];
                    
                    
                    if (matData.color) {
                        material.color.setHex(matData.color);
                    }
                    
                    
                    if (matData.opacity !== undefined) {
                        material.opacity = matData.opacity;
                        material.transparent = matData.transparent || false;
                    }
                    
                    
                    if (matData.emissive) {
                        material.emissive.setHex(matData.emissive);
                    }
                    
                    
                    if (matData.mapUrl) {
                        this.textureLoader.load(matData.mapUrl, (texture) => {
                            texture.wrapS = THREE.RepeatWrapping;
                            texture.wrapT = THREE.RepeatWrapping;
                            texture.repeat.set(1, 1);
                            material.map = texture;
                            material.needsUpdate = true;
                            
                            
                            if (!element.userData.modifications.textures) {
                                element.userData.modifications.textures = {};
                            }
                            element.userData.modifications.textures[index] = matData.mapUrl;
                        });
                    }
                    
                    material.needsUpdate = true;
                }
            });
        } 
        
        else if (!Array.isArray(materialsData) && materialsData[0] && !Array.isArray(element.material)) {
            const matData = materialsData[0];
            
            
            if (matData.color) {
                element.material.color.setHex(matData.color);
            }
            
            
            if (matData.opacity !== undefined) {
                element.material.opacity = matData.opacity;
                element.material.transparent = matData.transparent || false;
            }
            
            
            if (matData.emissive) {
                element.material.emissive.setHex(matData.emissive);
            }
            
            
            if (matData.mapUrl) {
                this.textureLoader.load(matData.mapUrl, (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(1, 1);
                    element.material.map = texture;
                    element.material.needsUpdate = true;
                    
                    
                    if (!element.userData.modifications.textures) {
                        element.userData.modifications.textures = {};
                    }
                    element.userData.modifications.textures['all'] = matData.mapUrl;
                });
            }
            
            element.material.needsUpdate = true;
        }
    } catch (error) {
        console.error('Error restoring materials:', error);
    }
}
reateRestoredElementFromData(data, index) {
    try {
        
        const isFromCache = data.userData?.loadedFromCache || data.loadedFromCache;
        
        
        let width = data.currentWidth || data.userData?.originalWidth || 10;
        let height = data.currentHeight || data.userData?.originalHeight || 10;
        let depth = data.currentDepth || data.userData?.originalDepth || 10;
        
        
        if (isFromCache && data.appliedScaleFactor) {
            width *= data.appliedScaleFactor;
            height *= data.appliedScaleFactor;
            depth *= data.appliedScaleFactor;
        }
        
        let geometry, material;
        
        
        if (data.geometryData && isFromCache) {
            
            geometry = new THREE.BoxGeometry(width, height, depth);
        } else {
            
            const elementType = data.type || 'other';
            if (elementType === 'building' || elementType === 'other') {
                geometry = new THREE.BoxGeometry(width, height, depth);
            } else if (elementType === 'highway') {
                geometry = new THREE.BoxGeometry(width, 0.5, depth);
            } else if (elementType === 'water') {
                geometry = new THREE.BoxGeometry(width, 0.2, depth);
            } else {
                geometry = new THREE.BoxGeometry(width, height, depth);
            }
        }
        
        
        if (data.modifications && data.modifications.color) {
            material = new THREE.MeshLambertMaterial({ 
                color: new THREE.Color(data.modifications.color)
            });
        } else if (data.currentMaterials && data.currentMaterials.length > 0) {
            
            material = this.createMaterialFromData(data.currentMaterials[0]);
        } else if (data.userData?.originalMaterials && data.userData.originalMaterials.length > 0) {
            
            try {
                material = data.userData.originalMaterials[0].clone();
            } catch (e) {
                material = new THREE.MeshLambertMaterial({ color: 0x888888 });
            }
        } else {
            material = new THREE.MeshLambertMaterial({ color: 0x888888 });
        }
        
        const restoredElement = new THREE.Mesh(geometry, material);
        
        
        if (data.position) {
            restoredElement.position.copy(data.position); 
        } else if (data.userData?.originalPosition) {
            restoredElement.position.copy(data.userData.originalPosition);
        }
        
        
        if (data.rotation) {
            restoredElement.rotation.copy(data.rotation);
        } else if (data.userData?.originalRotation) {
            restoredElement.rotation.copy(data.userData.originalRotation);
        }
        
        
        if (data.currentScale) {
            restoredElement.scale.copy(data.currentScale);
        } else if (data.scale) {
            restoredElement.scale.copy(data.scale);
        } else {
            restoredElement.scale.copy(data.userData?.originalScale || new THREE.Vector3(1, 1, 1));
        }
        
        
        restoredElement.userData = JSON.parse(JSON.stringify(data.userData || {}));
        
        
        if (data.modifications) {
            restoredElement.userData.modifications = { ...data.modifications };
        }
        
        
        restoredElement.userData.originalHeight = height;
        restoredElement.userData.originalWidth = width;
        restoredElement.userData.originalDepth = depth;
        
        
        if (isFromCache) {
            restoredElement.userData.loadedFromCache = true;
            
            if (data.appliedScale) {
                restoredElement.userData.appliedScale = data.appliedScale.clone();
                restoredElement.userData.originalScale = data.appliedScale.clone();
            }
            
            if (data.appliedScaleFactor) {
                restoredElement.userData.appliedScaleFactor = data.appliedScaleFactor;
            }
        }
        
        
        delete restoredElement.userData.isMergedPart;
        delete restoredElement.userData.mergedInto;
        delete restoredElement.userData.wasMerged;
        delete restoredElement.userData.mergeIndex;
        delete restoredElement.userData.mergeTimestamp;
        
        
        restoredElement.userData.isSelectable = true;
        restoredElement.userData.isSelected = false;
        
        
        if (data.userData && data.userData.elementId) {
            restoredElement.userData.elementId = data.userData.elementId;
        } else {
            restoredElement.userData.elementId = `restored_${Date.now()}_${index}`;
        }
        
        restoredElement.elementId = restoredElement.userData.elementId;
        
        
        if (data.modifications && data.modifications.textures) {
            setTimeout(() => {
                Object.keys(data.modifications.textures).forEach(faceType => {
                    const textureUrl = data.modifications.textures[faceType];
                    if (textureUrl) {
                        this.applyTextureToElement(restoredElement, textureUrl, faceType)
                            .then(() => {
                                
                            })
                            .catch(err => {
                                console.error(`Error applying texture:`, err);
                            });
                    }
                });
            }, 100);
        }
        
        
        this.buildings.add(restoredElement);
        
        
        return restoredElement;
        
    } catch (error) {
        console.error('Error creating restored element:', error);
        return null;
    }
}


createMaterialFromData(matData) {
    try {
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(matData.color || 0x888888),
            emissive: new THREE.Color(matData.emissive || 0x000000),
            opacity: matData.opacity || 1.0,
            transparent: matData.transparent || false
        });
        
        
        if (matData.mapUrl) {
            this.textureLoader.load(matData.mapUrl, (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 1);
                material.map = texture;
                material.needsUpdate = true;
            });
        }
        
        return material;
    } catch (error) {
        console.error('Error creating material from data:', error);
        return new THREE.MeshLambertMaterial({ color: 0x888888 });
    }
}
findOriginalElement(elementId) {
    let foundElement = null;
    
    
    if (this.buildings) {
        this.buildings.traverse((child) => {
            if (child.userData && child.userData.elementId === elementId && !child.userData.isMergedPart) {
                foundElement = child;
            }
        });
    }
    
    
    if (this.viewer && this.viewer.externalModels && !foundElement) {
        this.viewer.externalModels.traverse((child) => {
            if (child.userData && child.userData.elementId === elementId && !child.userData.isMergedPart) {
                foundElement = child;
            }
        });
    }
    
    return foundElement;
}

getAllElements() {
    const allElements = [];
    
    
    this.buildings.traverse((child) => {
        if (child.isMesh) {
            allElements.push(child);
        }
    });
    
    
    if (this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse((child) => {
            if (child.isMesh) {
                allElements.push(child);
            }
        });
    }
    
    return allElements;
}


raycastAllElements(mouse, camera) {
    const allElements = this.getAllElements();
    this.raycaster.setFromCamera(mouse, camera);
    
    
    this.raycaster.far = 100000; 
    this.raycaster.near = 0.1;   
    
    const intersects = this.raycaster.intersectObjects(allElements, true);
    
    
    
    return intersects;
}


handleClick(event) {
    if (!this.modelManager) return;
    
    const mouse = new THREE.Vector2();
    const rect = this.renderer.domElement.getBoundingClientRect();
    
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    
    const allSelectableObjects = [];
    
    
    this.modelManager.buildings.traverse((child) => {
        if (child.isMesh) {
            allSelectableObjects.push(child);
        }
    });
    
    
    this.externalModels.traverse((child) => {
        if (child.isMesh) {
            allSelectableObjects.push(child);
        }
    });
    
    this.raycaster.setFromCamera(mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(allSelectableObjects, true);
    
    
    
    if (intersects.length > 0) {
        const intersect = intersects[0];
        const clickedElement = intersect.object;

        const multiSelect = event.ctrlKey || event.metaKey;
        
        
        this.modelManager.selectElement(clickedElement, multiSelect);
        
        event.stopPropagation();
    } else {
        
        this.modelManager.deselectAllElements();
        
        
        const infoPanel = document.getElementById('selectedElementInfo');
        if (infoPanel) {
            infoPanel.style.display = 'none';
        }
    }
}


getAllSelectedElements() {
    const selected = [];
    
    
    if (this.buildings) {
        this.buildings.traverse((child) => {
            if (child.isMesh && child.userData && child.userData.isSelected) {
                selected.push(child);
            }
        });
    }
    
    
    if (this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse((child) => {
            if (child.isMesh && child.userData && child.userData.isSelected) {
                selected.push(child);
            }
        });
    }
    
    return selected;
}

findById(elementId) {
    
    let foundElement = null;
    this.buildings.traverse((child) => {
        if (child.userData && child.userData.elementId === elementId) {
            foundElement = child;
        }
    });
    
    
    if (!foundElement && this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse((child) => {
            if (child.userData && child.userData.elementId === elementId) {
                foundElement = child;
            }
        });
    }
    
    return foundElement;
}


updateSelectionStats() {
    const selectedCount = this.getSelectedElements().length;
    
}


applyHighlightMaterial(element) {
    
    if (!element.material) {
        console.warn('The element has no materials for highlighting:', element);
        return;
    }
    
    
    
    if (Array.isArray(element.material)) {
        element.material.forEach(mat => {
            if (mat) {
                mat.emissive = new THREE.Color(0x333333); 
                mat.needsUpdate = true;
            }
        });
    } else if (element.material) {
        element.material.emissive = new THREE.Color(0x333333); 
        element.material.needsUpdate = true;
    }
}


deselectElement(element) {
    if (element.userData && element.userData.isSelected) {
        element.userData.isSelected = false;
        
        
        const processChild = (child) => {
            if (child.isMesh) {
                
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => {
                        if (material) {
                            material.emissive.set(0x000000);
                            material.needsUpdate = true;
                            
                            
                            if (child.userData.modifications && child.userData.modifications.color) {
                                try {
                                    const appliedColor = new THREE.Color(child.userData.modifications.color);
                                    material.color.copy(appliedColor);
                                } catch (colorError) {
                                    console.warn('Error applying saved color:', colorError);
                                }
                            }
                        }
                    });
                } else if (child.material) {
                    child.material.emissive.set(0x000000);
                    child.material.needsUpdate = true;
                    
                    
                    if (child.userData.modifications && child.userData.modifications.color) {
                        try {
                            const appliedColor = new THREE.Color(child.userData.modifications.color);
                            child.material.color.copy(appliedColor);
                        } catch (colorError) {
                            console.warn('Error applying saved color:', colorError);
                        }
                    }
                }
            }
        };

        if (element.isMesh) {
            processChild(element);
        } else if (element.isGroup) {
            element.traverse(processChild);
        }
    }
}

selectElementsByType(elementType) {
    
    this.deselectAllElements();
    
    let count = 0;
    
    
    this.buildings.traverse((child) => {
        if (child.isMesh && child.userData.type === elementType) {
            this.selectElement(child, true); 
            count++;
        }
    });
    
    return count;
}


selectAllElements() {
    this.deselectAllElements();
    
    let count = 0;
    this.buildings.traverse((child) => {
        if (child.isMesh) {
            this.selectElement(child, true);
            count++;
        }
    });
    
    return count;
}
deselectAllElements() {
    
    this.buildings.traverse((child) => {
        if ((child.isMesh || child.isGroup) && child.userData) {
            if (child.userData.isSelected) {
                child.userData.isSelected = false;
                
                
                if (child.isMesh) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => {
                            if (material) {
                                material.emissive.set(0x000000);
                                material.needsUpdate = true;
                            }
                        });
                    } else if (child.material) {
                        child.material.emissive.set(0x000000);
                        child.material.needsUpdate = true;
                    }
                } else if (child.isGroup) {
                    
                    child.traverse(grandChild => {
                        if (grandChild.isMesh && grandChild.material) {
                            if (Array.isArray(grandChild.material)) {
                                grandChild.material.forEach(material => {
                                    if (material) {
                                        material.emissive.set(0x000000);
                                        material.needsUpdate = true;
                                    }
                                });
                            } else {
                                grandChild.material.emissive.set(0x000000);
                                grandChild.material.needsUpdate = true;
                            }
                        }
                    });
                }
            }
        }
    });
    
    
    if (this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse((child) => {
            if ((child.isMesh || child.isGroup) && child.userData) {
                if (child.userData.isSelected) {
                    child.userData.isSelected = false;
                    
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => {
                                if (material) {
                                    material.emissive.set(0x000000);
                                    material.needsUpdate = true;
                                }
                            });
                        } else {
                            child.material.emissive.set(0x000000);
                            child.material.needsUpdate = true;
                        }
                    }
                }
            }
        });
    }
    
    
    if (this.viewer && this.viewer.modelEditor && this.viewer.modelEditor.transformControls) {
        this.viewer.modelEditor.deactivateTransformControls();
    }
    
    
    if (this.modelEditor && this.modelEditor.updateSelectionModeUI) {
        this.modelEditor.updateSelectionModeUI();
    }
    
    
    this.updateSelectedElementInfo(null);
    
    return true;
}

    
getSelectedElements() {
    const selected = [];
    
    
    this.buildings.traverse((child) => {
        if ((child.isMesh || child.isGroup) && child.userData && child.userData.isSelected) {
            selected.push(child);
        }
    });
    
    
    if (this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse((child) => {
            if ((child.isMesh || child.isGroup) && child.userData && child.userData.isSelected) {
                selected.push(child);
            }
        });
    }
    
    return selected;
}

changeSelectedElementsHeight(newHeight) {
    const selectedElements = this.getSelectedElements();
    if (selectedElements.length > 0) {
            this.viewer.saveState('Height adjustment', selectedElements);
        }
    selectedElements.forEach(element => {
        
        if (element.isGroup && element.userData && element.userData.isMerged) {
            this.applyHeightToGroupRecursive(element, newHeight);
        } 
        
        else if (element.isMesh) {
            
            const isImportedModel = element.userData.isExternalModel || element.userData.fileName;
            
            
            let originalHeightInitial;
            
            if (isImportedModel && element.userData.appliedScaleFactor) {
                
                originalHeightInitial = (element.userData.originalHeightInitial || 
                                        element.userData.originalHeight || 10) * 
                                        element.userData.appliedScaleFactor;
            } else {
                originalHeightInitial = element.userData.originalHeightInitial || 
                                        element.userData.originalHeight || 10;
            }
            
            
            const wasNegative = (element.userData.baseHeight < 0);
            const extrudeHeight = Math.abs(newHeight);
            const finalNewHeight = wasNegative ? -extrudeHeight : extrudeHeight;
            
            const scaleFactorY = extrudeHeight / originalHeightInitial;
            
            
            const oldScaleY = element.scale.y;
            
            
            element.scale.y = scaleFactorY;
            
            
            const oldHeight = originalHeightInitial * oldScaleY;
            const newHeightEffective = originalHeightInitial * scaleFactorY;
            
            
            if (!wasNegative) {
                
                const oldBottomY = element.position.y - (oldHeight / 2);
                element.position.y = oldBottomY + (newHeightEffective / 2);
            } else {
                
                const oldTopY = element.position.y + (oldHeight / 2);
                element.position.y = oldTopY - (newHeightEffective / 2);
            }
            
            
            element.userData.originalHeight = extrudeHeight;
            element.userData.baseHeight = finalNewHeight;
            element.userData.modifications.height = finalNewHeight;
            
            if (!element.userData.originalHeightInitial) {
                element.userData.originalHeightInitial = originalHeightInitial;
            }
            
            
            if (isImportedModel && element.userData.appliedScaleFactor) {
                
                const currentScale = element.scale.clone();
                element.userData.appliedScale = currentScale;
            }
        }
    });
    
    this.viewer.saveState('Height adjustment');
    return selectedElements.length;
}

applyToGroupRecursive(group, modifierFunction) {
    
    const applyToChild = (child) => {
        if (child.isMesh) {
            modifierFunction(child);
        } else if (child.isGroup && child.children.length > 0) {
            child.children.forEach(grandChild => applyToChild(grandChild));
        }
    };
    
    
    group.children.forEach(child => applyToChild(child));
}

applyHeightToGroupRecursive(group, newHeight) {
    
    const applyToChild = (child) => {
        if (child.isMesh) {
            
            const isImportedModel = child.userData.isExternalModel || child.userData.fileName;
            
            
            let originalHeightInitial;
            
            if (isImportedModel && child.userData.appliedScaleFactor) {
                originalHeightInitial = (child.userData.originalHeightInitial || 
                                        child.userData.originalHeight || 10) * 
                                        child.userData.appliedScaleFactor;
            } else {
                originalHeightInitial = child.userData.originalHeightInitial || 
                                        child.userData.originalHeight || 10;
            }
            
            const wasNegative = (child.userData.baseHeight < 0);
            const extrudeHeight = Math.abs(newHeight);
            const finalNewHeight = wasNegative ? -extrudeHeight : extrudeHeight;
            
            const scaleFactorY = extrudeHeight / originalHeightInitial;
            
            const oldScaleY = child.scale.y;
            
            child.scale.y = scaleFactorY;
            
            const oldHeight = originalHeightInitial * oldScaleY;
            const newHeightEffective = originalHeightInitial * scaleFactorY;
            
            
            if (!wasNegative) {
                
                const oldBottomY = child.position.y - (oldHeight / 2);
                child.position.y = oldBottomY + (newHeightEffective / 2);
            } else {
                
                const oldTopY = child.position.y + (oldHeight / 2);
                child.position.y = oldTopY - (newHeightEffective / 2);
            }
            
            child.userData.originalHeight = extrudeHeight;
            child.userData.baseHeight = finalNewHeight;
            child.userData.modifications.height = finalNewHeight;
            
            if (!child.userData.originalHeightInitial) {
                child.userData.originalHeightInitial = originalHeightInitial;
            }
        } else if (child.isGroup && child.children.length > 0) {
            
            child.children.forEach(grandChild => applyToChild(grandChild));
        }
    };
    
    
    group.children.forEach(child => applyToChild(child));
    
    
    group.userData.modifications = group.userData.modifications || {};
    group.userData.modifications.height = newHeight;
}



    
    
changeSelectedElementsColor(newColor) {
    const selectedElements = this.getSelectedElements();
    
    
    if (selectedElements.length > 0) {
        this.viewer.historyManager.saveState(
            'Color adjustment',
            selectedElements, 
            null, 
            null  
        );
    }
    
    selectedElements.forEach(element => {
        
        if (element.isGroup && element.userData && element.userData.isMerged) {
            this.applyToGroupRecursive(element, (child) => {
                if (child.isMesh && child.material) {
                    try {
                        const threeColor = new THREE.Color(newColor);
                        
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => {
                                if (material && material.color) {
                                    material.color.copy(threeColor);
                                    material.needsUpdate = true;
                                }
                            });
                        } 
                        else if (child.material && child.material.color) {
                            child.material.color.copy(threeColor);
                            child.material.needsUpdate = true;
                        }
                        
                        child.userData.modifications = child.userData.modifications || {};
                        child.userData.modifications.color = newColor;
                        
                    } catch (error) {
                        console.error('Error changing color for group element:', error);
                    }
                }
            });
            
            
            element.userData.modifications = element.userData.modifications || {};
            element.userData.modifications.color = newColor;
        }
        
        else if (element.isMesh && element.material) {
            try {
                const threeColor = new THREE.Color(newColor);
                
                if (Array.isArray(element.material)) {
                    element.material.forEach(material => {
                        if (material && material.color) {
                            material.color.copy(threeColor);
                            material.needsUpdate = true;
                        }
                    });
                } 
                else if (element.material && element.material.color) {
                    element.material.color.copy(threeColor);
                    element.material.needsUpdate = true;
                }
                
                element.userData.modifications = element.userData.modifications || {};
                element.userData.modifications.color = newColor;
                
            } catch (error) {
                console.error('Error changing color:', error);
            }
        }
    });
    
    return selectedElements.length;
}


    
async applyTextureToSelected(textureUrl, faceType = 'all') {
    const selectedElements = this.getSelectedElements();
    
    
    if (selectedElements.length > 0) {
        this.viewer.historyManager.saveState(
            'Aplicare textură',
            selectedElements, 
            null, 
            null  
        );
    }
    
    if (selectedElements.length === 0) {
        this.viewer.showNotification('No elements selected for applying the texture', true);
        return 0;
    }
    
    let successCount = 0;
    
    for (const element of selectedElements) {
        try {
            
            if (element.isGroup && element.userData && element.userData.isMerged) {
                
                for (let i = 0; i < element.children.length; i++) {
                    const child = element.children[i];
                    if (child.isMesh) {
                        
                        if (!child.userData.canReceiveTextures) {
                            this.repairElementForTextures(child);
                        }
                        
                        await this.applyTextureToElement(child, textureUrl, faceType);
                        
                        
                        if (element.userData.originalElements && element.userData.originalElements[i]) {
                            if (!element.userData.originalElements[i].modifications) {
                                element.userData.originalElements[i].modifications = {};
                            }
                            if (!element.userData.originalElements[i].modifications.textures) {
                                element.userData.originalElements[i].modifications.textures = {};
                            }
                            element.userData.originalElements[i].modifications.textures[faceType] = textureUrl;
                        }
                        
                        successCount++;
                    }
                }
                
                
                element.userData.modifications = element.userData.modifications || {};
                if (!element.userData.modifications.textures) {
                    element.userData.modifications.textures = {};
                }
                element.userData.modifications.textures[faceType] = textureUrl;
            }
            
            else if (element.isMesh) {
                
                if (!element.userData.canReceiveTextures) {
                    this.repairElementForTextures(element);
                }
                
                await this.applyTextureToElement(element, textureUrl, faceType);
                successCount++;
            }
        } catch (error) {
            console.error(`Error applying texture to element ${element.userData?.elementId}:`, error);
        }
    }
    
    if (successCount > 0) {
        this.viewer.showNotification(`Texture applied to ${successCount} elements`);
    } else {
        this.viewer.showNotification('Could not apply the texture to any element', true);
    }
    
    return successCount;
}


    
    async applyTextureToElement(element, textureUrl, faceType = 'all') {
    return new Promise((resolve, reject) => {
        this.textureLoader.load(
            textureUrl,
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 1);
                texture.encoding = THREE.sRGBEncoding;
                
                
                if (!element.userData.originalMaterials) {
                    if (Array.isArray(element.material)) {
                        element.userData.originalMaterials = element.material.map(mat => {
                            if (mat && mat.clone) {
                                return mat.clone();
                            }
                            return new THREE.MeshLambertMaterial({ color: 0x888888 });
                        });
                    } else {
                        element.userData.originalMaterials = [
                            element.material && element.material.clone ? 
                            element.material.clone() : 
                            new THREE.MeshLambertMaterial({ color: 0x888888 })
                        ];
                    }
                }

                
                if (Array.isArray(element.material)) {
                    element.material.forEach((material, index) => {
                        if (!material) return;
                        
                        let currentFaceType;
                        switch(index) {
                            case 0: currentFaceType = 'aside'; break;
                            case 1: currentFaceType = 'top'; break;
                            case 2: currentFaceType = 'side'; break;
                            case 3: currentFaceType = 'bottom'; break;
                            case 4: currentFaceType = 'side'; break;
                            case 5: currentFaceType = 'side'; break;
                            default: currentFaceType = 'side';
                        }
                        
                        if (faceType === 'all' || currentFaceType === faceType) {
                            
                            if (material.isMaterial) {
                                const newMaterial = new THREE.MeshLambertMaterial({
                                    map: texture,
                                    color: material.color || 0xffffff,
                                    transparent: material.transparent || false,
                                    opacity: material.opacity || 1.0
                                });
                                element.material[index] = newMaterial;
                            }
                        }
                    });
                } else {
                    
                    if (element.material && element.material.isMaterial) {
                        
                        const newMaterial = new THREE.MeshLambertMaterial({
                            map: texture,
                            color: element.material.color || 0xffffff,
                            transparent: element.material.transparent || false,
                            opacity: element.material.opacity || 1.0
                        });
                        
                        element.material = newMaterial;
                        element.material.needsUpdate = true;
                    } else {
                        
                        element.material = new THREE.MeshLambertMaterial({ map: texture });
                    }
                }

                
                if (!element.userData.modifications) {
                    element.userData.modifications = {};
                }
                if (!element.userData.modifications.textures) {
                    element.userData.modifications.textures = {};
                }
                element.userData.modifications.textures[faceType] = textureUrl;
                element.userData.appliedTexture = textureUrl;
                
                
                element.material.needsUpdate = true;
                
                
                if (element.children && element.children.length > 0) {
                    element.traverse((child) => {
                        if (child.isMesh && child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => {
                                    if (mat && mat.isMaterial) {
                                        mat.map = texture;
                                        mat.needsUpdate = true;
                                    }
                                });
                            } else if (child.material && child.material.isMaterial) {
                                child.material.map = texture;
                                child.material.needsUpdate = true;
                            }
                        }
                    });
                }
                
                resolve();
            },
            undefined,
            (error) => {
                console.error(' Error loading texture:', error);
                reject(error);
            }
        );
    });
}

    
resetSelectedElements() {
        const selectedElements = this.getSelectedElements();
        
        
        if (selectedElements.length > 0) {
            this.viewer.saveState('Reset elements', selectedElements);
        }
    
    selectedElements.forEach(element => {
        
        if (element.userData.modifications.height) {
            if (element.userData.originalHeightInitial) {
                const originalHeight = element.userData.originalHeightInitial;
                const currentHeight = element.userData.originalHeight || originalHeight;
                const scaleFactor = originalHeight / currentHeight;
                
                element.scale.y *= scaleFactor;
                element.userData.originalHeight = originalHeight;
            } else {
                element.scale.y = 1;
            }
            element.userData.modifications.height = null;
        }
        
        
        if (element.userData.modifications.width) {
            if (element.userData.originalWidth && element.userData.originalDepth) {
                const originalWidth = element.userData.originalWidth;
                const originalDepth = element.userData.originalDepth;
                const currentWidth = element.scale.x * (element.userData.originalWidth || 1);
                const currentDepth = element.scale.z * (element.userData.originalDepth || 1);
                
                if (currentWidth !== 0) element.scale.x *= (originalWidth / currentWidth);
                if (currentDepth !== 0) element.scale.z *= (originalDepth / currentDepth);
            } else {
                element.scale.x = 1;
                element.scale.z = 1;
            }
            element.userData.modifications.width = null;
        }
        
        
        if (element.userData.modifications.color && element.userData.originalMaterials) {
            try {
                
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
                
                
                element.userData.modifications.color = null;
                
            } catch (error) {
                console.error('Error restoring color:', error);
                
                if (element.userData.originalMaterials) {
                    element.material = element.userData.originalMaterials.map(mat => mat.clone());
                }
            }
        }
        
        
        if (element.userData.modifications.textures && Object.keys(element.userData.modifications.textures).length > 0) {
            if (element.userData.originalMaterials) {
                try {
                    
                    element.material = element.userData.originalMaterials.map(mat => mat.clone());
                } catch (error) {
                    console.error('Error restoring textures:', error);
                }
            }
            element.userData.modifications.textures = {};
        }
        
        
        delete element.userData.appliedTexture;
        
        
        if (element.userData.modifications.position && element.userData.originalPosition) {
            element.position.copy(element.userData.originalPosition);
            element.userData.modifications.position = null;
        }
        
        
        if (element.userData.modifications.rotation && element.userData.originalRotation) {
            element.rotation.copy(element.userData.originalRotation);
            element.userData.modifications.rotation = null;
        }
    });
    
    
    if (this.viewer && this.viewer.modelEditor && this.viewer.modelEditor.transformControls) {
        const transformControls = this.viewer.modelEditor.transformControls;
        if (transformControls.visible) {
            transformControls.update();
        }
    }
    
    
    this.viewer.saveState('Reset elements');
    
    return selectedElements.length;
}


changeAllElementsHeight(elementType, newHeight) {
    const elements = this.getElementsByType(elementType);
    
    elements.forEach(element => {
        
        const originalHeightInitial = element.userData.originalHeightInitial || element.userData.originalHeight || 10;
        
        
        
        const wasNegative = (element.userData.baseHeight < 0);
        const extrudeHeight = Math.abs(newHeight);
        const finalNewHeight = wasNegative ? -extrudeHeight : extrudeHeight;
        
        const scaleFactorY = extrudeHeight / originalHeightInitial;
        
        
        const oldScaleY = element.scale.y;
        
        
        element.scale.y = scaleFactorY;
        
        
        const oldHeight = originalHeightInitial * oldScaleY;
        const newHeightEffective = originalHeightInitial * scaleFactorY;
        
        
        if (!wasNegative) {
            
            element.position.y = element.position.y + (newHeightEffective - oldHeight) / 2;
        } else {
            
            element.position.y = element.position.y + (oldHeight - newHeightEffective) / 2;
        }
        
        
        element.userData.originalHeight = extrudeHeight;
        element.userData.baseHeight = finalNewHeight;
        element.userData.modifications.height = finalNewHeight;
        
        if (!element.userData.originalHeightInitial) {
            element.userData.originalHeightInitial = originalHeightInitial;
        }
    });
    
    return elements.length;
}


resetSelectedElementsHeight() {
    const selectedElements = this.getSelectedElements();
    
    
    selectedElements.forEach(element => {
        const originalHeightInitial = element.userData.originalHeightInitial || 10;
        
        
        element.scale.z = 1;
        
        
        element.userData.originalHeight = originalHeightInitial;
        element.userData.baseHeight = element.userData.baseHeight >= 0 ? originalHeightInitial : -originalHeightInitial;
        element.userData.modifications.height = null;
        
        
    });
    
    return selectedElements.length;
}


changeAllElementsColor(elementType, newColor) {
    const elements = this.getElementsByType(elementType);
    
    elements.forEach(element => {
        if (!element || !element.material) return;
        
        try {
            const threeColor = new THREE.Color(newColor);
            
            if (Array.isArray(element.material)) {
                element.material.forEach(material => {
                    if (material && material.color) {
                        material.color.copy(threeColor);
                        material.needsUpdate = true;
                    }
                });
            } else if (element.material && element.material.color) {
                element.material.color.copy(threeColor);
                element.material.needsUpdate = true;
            }
            
            if (!element.userData.modifications) {
                element.userData.modifications = {};
            }
            element.userData.modifications.color = newColor;
            
        } catch (error) {
            console.error('Error changing color for all elements:', error);
        }
    });
    
    return elements.length;
}




async applyTextureToAllElements(elementType, textureUrl, faceType = 'all') {
    const elements = this.getElementsByType(elementType);
    
    
    for (const element of elements) {
        await this.applyTextureToElement(element, textureUrl, faceType);
    }
    
    return elements.length;
}



resetAllElements(elementType) {
    const elements = this.getElementsByType(elementType);
    
    
    let resetCount = 0;
    
    elements.forEach(element => {
        let hasModifications = false;
        
        
        if (element.userData.modifications.height) {
            
            element.scale.z = 1;
            element.userData.modifications.height = null;
            hasModifications = true;
            
        }
        
        
        if (element.userData.modifications.width) {
            
            element.scale.set(1, 1, 1);
            element.userData.modifications.width = null;
            hasModifications = true;
            
        }
        
        
        if (element.userData.modifications.color) {
            if (element.userData.originalMaterials) {
                element.material = element.userData.originalMaterials.map(mat => mat.clone());
            }
            element.userData.modifications.color = null;
            hasModifications = true;
            
        }
        
        
        if (element.userData.modifications.textures && Object.keys(element.userData.modifications.textures).length > 0) {
            if (element.userData.originalMaterials) {
                element.material = element.userData.originalMaterials.map(mat => mat.clone());
            }
            element.userData.modifications.textures = {};
            hasModifications = true;
            
        }
        
        if (element.userData.appliedTexture) {
            delete element.userData.appliedTexture;
            hasModifications = true;
        }
        
        if (hasModifications) {
            resetCount++;
        }
    });
    
    
    return resetCount;
}



changeSelectedElementsWidth(newWidth) {
    const selectedElements = this.getSelectedElements();
    
    selectedElements.forEach(element => {
        
        if (element.isGroup && element.userData && element.userData.isMerged) {
            this.applyToGroupRecursive(element, (child) => {
                if (child.isMesh && child.userData) {
                    const originalWidth = child.userData.originalWidth || 1;
                    const originalDepth = child.userData.originalDepth || 1;
                    
                    const scaleFactorX = newWidth / originalWidth;
                    const scaleFactorZ = newWidth / originalDepth;
                    
                    
                    const currentScaleY = child.scale.y;
                    
                    child.scale.x = scaleFactorX;
                    child.scale.z = scaleFactorZ;
                    child.scale.y = currentScaleY;
                    
                    child.userData.modifications = child.userData.modifications || {};
                    child.userData.modifications.width = newWidth;
                }
            });
            
            
            element.userData.modifications = element.userData.modifications || {};
            element.userData.modifications.width = newWidth;
        }
        
        else if (element.isMesh) {
            const originalWidth = element.userData.originalWidth || 1;
            const originalDepth = element.userData.originalDepth || 1;
            
            const scaleFactorX = newWidth / originalWidth;
            const scaleFactorZ = newWidth / originalDepth;
            
            
            const currentScaleY = element.scale.y;
            
            element.scale.x = scaleFactorX;
            element.scale.z = scaleFactorZ;
            element.scale.y = currentScaleY;
            
            element.userData.modifications.width = newWidth;
        }
    });
    
    this.viewer.saveState('Width adjustment');
    return selectedElements.length;
}

changeAllElementsWidth(elementType, newWidth) {
    const elements = this.getElementsByType(elementType);
    
    
    elements.forEach(element => {
        const originalWidth = element.userData.originalWidth || 1;
        const originalDepth = element.userData.originalDepth || 1;
        
        
        const scaleFactorX = newWidth / originalWidth;
        const scaleFactorZ = newWidth / originalDepth;
        
        
        const currentScaleY = element.scale.y;
        
        
        element.scale.x = scaleFactorX;
        element.scale.z = scaleFactorZ;
        element.scale.y = currentScaleY;
        
        
        element.userData.modifications.width = newWidth;
        
        
    });
    
    return elements.length;
}


setElementPivotToBottomCenter(element) {
    if (!element.geometry) return;
    
    
    element.geometry.computeBoundingBox();
    const bbox = element.geometry.boundingBox;
    
    
    
    
    
    const centerX = (bbox.min.x + bbox.max.x) / 2;
    const centerZ = (bbox.min.z + bbox.max.z) / 2;
    const minY = bbox.min.y; 
    
    
    element.geometry.translate(-centerX, -minY, -centerZ);
    
    
    element.position.x += centerX;
    element.position.y += minY;
    element.position.z += centerZ;
    
    
    element.userData.pivot = {
        type: 'bottom-center',
        worldPosition: element.position.clone(),
        localOffset: new THREE.Vector3(0, -minY, 0) 
    };
    
    
    element.geometry.computeBoundingBox();
    const newBbox = element.geometry.boundingBox;
    element.userData.originalHeight = newBbox.max.y - newBbox.min.y;
    
    
    element.userData.originalWidth = newBbox.max.x - newBbox.min.x;
    element.userData.originalDepth = newBbox.max.z - newBbox.min.z;
}


changeSelectedElementsWidthWithPivot(newWidth) {
    const selectedElements = this.getSelectedElements();
    
    
    selectedElements.forEach(element => {
        const originalWidth = element.userData.originalWidth || 1;
        const originalDepth = element.userData.originalDepth || 1;
        
        
        this.setElementPivotToBottomCenter(element);
        
        
        const scaleFactorX = newWidth / originalWidth;
        const scaleFactorZ = newWidth / originalDepth;
        
        
        const currentScaleY = element.scale.y;
        
        
        element.scale.x = scaleFactorX;
        element.scale.z = scaleFactorZ;
        element.scale.y = currentScaleY;
        
        
        element.userData.modifications.width = newWidth;
        
        
    });
    
    return selectedElements.length;
}



changeSelectedElementsWidthWithPivot(newWidth) {
    const selectedElements = this.getSelectedElements();
    
    
    selectedElements.forEach(element => {
        const originalWidth = element.userData.originalWidth || 1;
        
        
        this.setElementPivotToBottomCenter(element);
        
        
        const scaleFactorXY = newWidth / originalWidth;
        
        
        element.scale.x = scaleFactorXY;
        element.scale.y = scaleFactorXY;
        
        
        
        element.userData.modifications.width = newWidth;
        
        
    });
    
    return selectedElements.length;
}


changeAllElementsWidthWithPivot(elementType, newWidth) {
    const elements = this.getElementsByType(elementType);
    
    
    elements.forEach(element => {
        const originalWidth = element.userData.originalWidth || 1;
        const originalDepth = element.userData.originalDepth || 1;
        
        
        if (!element.userData.pivot || element.userData.pivot.type !== 'bottom-center') {
            this.setElementPivotToBottomCenter(element);
        }
        
        
        const scaleFactorX = newWidth / originalWidth;
        const scaleFactorZ = newWidth / originalDepth;
        
        
        const currentScaleY = element.scale.y;
        
        
        element.scale.x = scaleFactorX;
        element.scale.z = scaleFactorZ;
        element.scale.y = currentScaleY;
        
        
        element.userData.modifications.width = newWidth;
    });
    
    return elements.length;
}


changeSelectedElementsPosition(deltaX, deltaY, deltaZ) {
    const selectedElements = this.getSelectedElements();
    
    
    selectedElements.forEach(element => {
        
        element.position.x += deltaX;
        element.position.y += deltaY;
        element.position.z += deltaZ;
        
        
        if (!element.userData.modifications.position) {
            element.userData.modifications.position = { x: 0, y: 0, z: 0 };
        }
        element.userData.modifications.position.x += deltaX;
        element.userData.modifications.position.y += deltaY;
        element.userData.modifications.position.z += deltaZ;
        
        
    });
    
    return selectedElements.length;
}


setSelectedElementsPosition(newX, newY, newZ) {
    const selectedElements = this.getSelectedElements();
    
    
    selectedElements.forEach(element => {
        
        if (!element.userData.originalPosition) {
            element.userData.originalPosition = {
                x: element.position.x,
                y: element.position.y,
                z: element.position.z
            };
        }
        
        
        element.position.set(newX, newY, newZ);
        
        
        element.userData.modifications.position = {
            x: newX - element.userData.originalPosition.x,
            y: newY - element.userData.originalPosition.y,
            z: newZ - element.userData.originalPosition.z
        };
        
        
    });
    
    return selectedElements.length;
}


resetSelectedElementsPosition() {
    const selectedElements = this.getSelectedElements();
    
    
    selectedElements.forEach(element => {
        if (element.userData.originalPosition) {
            
            element.position.set(
                element.userData.originalPosition.x,
                element.userData.originalPosition.y,
                element.userData.originalPosition.z
            );
            
            
            element.userData.modifications.position = null;
            
            
        }
    });
    
    return selectedElements.length;
}

copySelectedElements() {
    const selectedElements = this.getSelectedElements();
    
    
    if (selectedElements.length > 0) {
        this.viewer.saveState('Copy elements', selectedElements);
    }

    if (selectedElements.length === 0) {
        this.viewer.showNotification('No elements selected for copying');
        return;
    }

    
    this.clipboard = [];

    selectedElements.forEach(element => {
        try {
            
            if (element.isGroup && element.userData && element.userData.isMerged) {
                const clonedGroup = this.cloneMergedGroup(element);
                this.clipboard.push(clonedGroup);
            } else {
                
                const clonedElement = this.createCompleteElementCopy(element);
                this.clipboard.push(clonedElement);
            }
        } catch (error) {
            console.error('Error cloning element for clipboard:', error);
        }
    });

    this.viewer.showNotification(`${this.clipboard.length} elements copied to clipboard`);
    return this.clipboard.length;
}

createCompleteElementCopy(element) {
    
    const clonedElement = element.clone(true);
    
    
    clonedElement.traverse((child) => {
        if (child.userData) {
            
            const newUserData = { ...child.userData };
            
            
            newUserData.elementId = `element_${Math.random().toString(36).substr(2, 9)}`;
            
            
            newUserData.isSelected = false;
            
            
            delete newUserData.isMergedPart;
            delete newUserData.mergedInto;
            delete newUserData.mergeIndex;
            delete newUserData.mergeTimestamp;
            
            
            if (child.isGroup && newUserData.isMerged) {
                newUserData.isCopiedMergedGroup = true;
                newUserData.canBeSeparated = false;
                newUserData.wasCopied = true;
                
                
                
                if (newUserData.originalElements) {
                    
                    newUserData.originalElements = newUserData.originalElements.map(elementData => ({
                        ...elementData,
                        isCopiedElement: true,
                        cannotBeSeparated: true,
                        userData: {
                            ...elementData.userData,
                            wasCopied: true
                        }
                    }));
                }
            }
            
            child.userData = newUserData;
            
            
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        if (mat && mat.emissive) {
                            mat.emissive.set(0x000000);
                            mat.needsUpdate = true;
                        }
                    });
                } else if (child.material && child.material.emissive) {
                    child.material.emissive.set(0x000000);
                    child.material.needsUpdate = true;
                }
                
                
                if (!child.userData.originalMaterials) {
                    if (Array.isArray(child.material)) {
                        child.userData.originalMaterials = child.material.map(mat => mat.clone());
                    } else {
                        child.userData.originalMaterials = [child.material.clone()];
                    }
                }
            }
        }
        
        
        if (child.userData && child.userData.error) {
            delete child.userData.error;
        }
    });

    return clonedElement;
}
cloneMergedGroup(mergedGroup) {
    
    const clonedGroup = mergedGroup.clone(true);
    
    
    clonedGroup.userData = this.cloneMergedGroupUserData(mergedGroup.userData);
    clonedGroup.userData.elementId = `element_${Math.random().toString(36).substr(2, 9)}`;
    clonedGroup.userData.isSelected = false;
    clonedGroup.userData.mergeTime = new Date().toISOString();
    
    
    clonedGroup.userData.isCopiedMergedGroup = true;
    clonedGroup.userData.canBeSeparated = false;
    clonedGroup.userData.wasCopied = true;
    
    
    const originalElementsData = [];
    
    clonedGroup.children.forEach((child, index) => {
        if (child.isMesh) {
            
            if (!child.userData) child.userData = {};
            child.userData.elementId = `merged_part_${Date.now()}_${index}`;
            child.userData.isSelected = false;
            child.userData.isMergedPart = true;
            child.userData.mergedInto = clonedGroup.userData.elementId;
            child.userData.mergeIndex = index;
            child.userData.wasCopied = true; 
            
            
            if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                    if (mat.emissive) mat.emissive.set(0x000000);
                    mat.needsUpdate = true;
                });
            } else if (child.material && child.material.emissive) {
                child.material.emissive.set(0x000000);
                child.material.needsUpdate = true;
            }
            
            
            
            
            const elementData = {
                isCopiedGroup: true, 
                userData: {
                    ...child.userData,
                    wasCopied: true,
                    cannotBeSeparated: true
                }
            };
            originalElementsData.push(elementData);
        }
    });

    
    clonedGroup.userData.originalElements = originalElementsData;
    clonedGroup.userData.originalElementsCount = originalElementsData.length;
    
    return clonedGroup;
}
cleanHighlightFromElement(element) {
    
    element.traverse((child) => {
        if (child.userData) {
            
            child.userData = this.cloneUserData(child.userData);
            child.userData.elementId = `element_${Math.random().toString(36).substr(2, 9)}`;
            child.userData.isSelected = false;
            
            
            if (child.userData.isMerged && child.userData.originalElements) {
                child.userData.originalElements.forEach((elementData, index) => {
                    if (elementData.userData) {
                        elementData.userData.elementId = `element_${Math.random().toString(36).substr(2, 9)}`;
                    }
                    elementData.userData = { ...elementData.userData, isSelected: false };
                });
            }
            
            
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        if (mat && mat.emissive) {
                            mat.emissive.set(0x000000);
                            mat.needsUpdate = true;
                        }
                    });
                } else if (child.material && child.material.emissive) {
                    child.material.emissive.set(0x000000);
                    child.material.needsUpdate = true;
                }
            }
        }
    });

    return element;
}
captureElementDataForSeparation(element) {
    
    return {
        type: element.userData?.type || 'unknown',
        position: element.position ? element.position.clone() : new THREE.Vector3(),
        rotation: element.rotation ? element.rotation.clone() : new THREE.Euler(),
        quaternion: element.quaternion ? element.quaternion.clone() : new THREE.Quaternion(),
        scale: element.scale ? element.scale.clone() : new THREE.Vector3(1, 1, 1),
        userData: this.cloneUserData(element.userData || {}),
        modifications: element.userData?.modifications ? 
            JSON.parse(JSON.stringify(element.userData.modifications)) : {},
        currentHeight: element.userData?.originalHeight || 10,
        currentWidth: element.userData?.originalWidth || 10,
        currentDepth: element.userData?.originalDepth || 10,
        currentScale: element.scale ? element.scale.clone() : new THREE.Vector3(1, 1, 1),
        originalHeightInitial: element.userData?.originalHeightInitial || 
                              element.userData?.originalHeight || 10,
        originalWidth: element.userData?.originalWidth || 10,
        originalDepth: element.userData?.originalDepth || 10,
        baseHeight: element.userData?.baseHeight || element.userData?.originalHeight || 10,
        isExternalModel: element.userData?.isExternalModel || false,
        fileName: element.userData?.fileName,
        fileExtension: element.userData?.fileExtension,
        currentMaterials: this.captureCurrentMaterials(element),
        appliedTexture: element.userData?.appliedTexture || null,
        geometryData: element.geometry ? {
            type: element.geometry.type,
            parameters: element.geometry.parameters || {}
        } : null
    };
}
cloneMergedGroupUserData(userData) {
    if (!userData) return {};
    
    const cloned = {};
    
    
    Object.keys(userData).forEach(key => {
        const value = userData[key];
        
        if (key === 'originalElements') {
            
            cloned[key] = []; 
        } else if (value instanceof THREE.Vector3 || 
                   value instanceof THREE.Color || 
                   value instanceof THREE.Euler || 
                   value instanceof THREE.Quaternion) {
            cloned[key] = value.clone();
        } else if (typeof value === 'object' && value !== null) {
            try {
                cloned[key] = JSON.parse(JSON.stringify(value));
            } catch (e) {
                console.warn(`Could not clone ${key}:`, e);
                cloned[key] = null;
            }
        } else {
            cloned[key] = value;
        }
    });
    
    return cloned;
}
createElementCopyData(element) {
    
    const geometry = element.geometry.clone();
    const materials = Array.isArray(element.material) 
        ? element.material.map(mat => mat.clone())
        : element.material.clone();
    
    
    return {
        geometry: geometry,
        materials: materials,
        position: element.position.clone(),
        scale: element.scale.clone(),
        rotation: element.rotation.clone(),
        userData: this.cloneUserData(element.userData),
        type: element.userData.type || 'other',
        elementId: `element_${Math.random().toString(36).substr(2, 9)}`
    };
}


cloneUserData(userData) {
    if (!userData) {
        return {};
    }

    const cloned = {};

    Object.keys(userData).forEach(key => {
        const value = userData[key];

        if (value instanceof THREE.Vector3) {
            cloned[key] = value.clone();
        } else if (value instanceof THREE.Color) {
            cloned[key] = value.clone();
        } else if (value instanceof THREE.Euler) {
            cloned[key] = value.clone();
        } else if (value instanceof THREE.Quaternion) {
            cloned[key] = value.clone();
        } else if (key === 'originalElements' && Array.isArray(value)) {
            
            cloned[key] = value.map(elementData => {
                if (elementData && typeof elementData === 'object') {
                    
                    const clonedElementData = { ...elementData };
                    if (clonedElementData.userData) {
                        clonedElementData.userData = { ...clonedElementData.userData };
                        clonedElementData.userData.elementId = `restored_${Math.random().toString(36).substr(2, 9)}`;
                    }
                    return clonedElementData;
                }
                return elementData;
            });
        } else if (typeof value === 'object' && value !== null) {
            
            try {
                cloned[key] = JSON.parse(JSON.stringify(value));
            } catch (e) {
                console.warn(`Could not clone the key ${key} from userData:`, e);
                cloned[key] = null;
            }
        } else {
            cloned[key] = value;
        }
    });

    return cloned;
}


pasteElements() {
    if (!this.clipboard || this.clipboard.length === 0) {
        this.viewer.showNotification('Empty clipboard');
        return;
    }

    const pastedElements = [];
    const offset = new THREE.Vector3(5, 5, 0);

    
    const currentElements = this.getAllElements();
    this.viewer.saveState('Paste elements', null, null, currentElements);

    this.clipboard.forEach(clonedElement => {
        try {
            
            const newElement = clonedElement.clone(true);
            
            
            newElement.traverse((child) => {
                if (child.userData) {
                    child.userData.isSelected = false;
                    
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat && mat.emissive) mat.emissive.set(0x000000);
                            });
                        } else if (child.material && child.material.emissive) {
                            child.material.emissive.set(0x000000);
                        }
                    }
                }
            });
            
            
            newElement.position.add(offset);

            
            this.buildings.add(newElement);
            pastedElements.push(newElement);

            
            offset.x += 3;
            offset.y += 3;
        } catch (error) {
            console.error('Error pasting element:', error);
        }
    });

    
    this.deselectAllElements();
    
    
    pastedElements.forEach(element => {
        if (element.userData) {
            element.userData.isSelected = true;
        }
        
        element.traverse((child) => {
            if (child.userData) {
                child.userData.isSelected = true;
            }
        });
    });

    this.viewer.showNotification(`${pastedElements.length} elements merge`);
    this.viewer.saveState('Elements merge');
    return pastedElements.length;
}

createCleanElementCopy(element) {
    
    const cleanCopy = element.clone();
    
    
    cleanCopy.traverse((child) => {
        if (child.userData) {
            
            const newUserData = { ...child.userData };
            newUserData.isSelected = false;
            newUserData.originalMaterials = null; 
            
            
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    
                    child.material = child.material.map(mat => {
                        const cleanMat = mat.clone();
                        if (cleanMat.emissive) cleanMat.emissive.set(0x000000);
                        cleanMat.needsUpdate = true;
                        return cleanMat;
                    });
                    
                    
                    newUserData.originalMaterials = child.material.map(mat => mat.clone());
                } else {
                    
                    const cleanMat = child.material.clone();
                    if (cleanMat.emissive) cleanMat.emissive.set(0x000000);
                    cleanMat.needsUpdate = true;
                    child.material = cleanMat;
                    
                    
                    newUserData.originalMaterials = [cleanMat.clone()];
                }
            }
            
            child.userData = newUserData;
        }
    });
    
    return cleanCopy;
}

createElementFromCopyData(copyData, offset = new THREE.Vector3(0, 0, 0)) {
    try {
        
        const mesh = new THREE.Mesh(copyData.geometry, copyData.materials);
        
        
        mesh.position.copy(copyData.position).add(offset);
        mesh.scale.copy(copyData.scale);
        mesh.rotation.copy(copyData.rotation);
        
        
        mesh.userData = {...copyData.userData};
        mesh.userData.elementId = `element_${Math.random().toString(36).substr(2, 9)}`;
        mesh.userData.isSelected = false;
        
        
        if (Array.isArray(mesh.material)) {
            mesh.userData.originalMaterials = mesh.material.map(mat => mat.clone());
        } else {
            mesh.userData.originalMaterials = [mesh.material.clone()];
        }
        
        
        return mesh;
        
    } catch (error) {
        console.error(' Error creating element from clipboard:', error);
        return null;
    }
}



duplicateSelectedElements() {
    const selectedElements = this.getSelectedElements();
        if (selectedElements.length > 0) {
            this.viewer.saveState('Duplicate elements', selectedElements);
        }
    if (selectedElements.length === 0) {
        this.viewer.showNotification('No elements selected for duplication');
        return;
    }

    const duplicatedElements = [];
    const offset = new THREE.Vector3(3, 3, 0);

    selectedElements.forEach(originalElement => {
        try {
            
            const clonedElement = originalElement.clone(true);
            
            
            clonedElement.traverse((child) => {
                if (child.userData) {
                    
                    if (!child.userData.isMerged) {
                        child.userData.elementId = `element_${Math.random().toString(36).substr(2, 9)}`;
                    }
                    child.userData.isSelected = false;
                    
                    
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat && mat.emissive) mat.emissive.set(0x000000);
                            });
                        } else if (child.material && child.material.emissive) {
                            child.material.emissive.set(0x000000);
                        }
                    }
                }
            });
            
            
            clonedElement.position.add(offset);

            this.buildings.add(clonedElement);
            duplicatedElements.push(clonedElement);

            offset.x += 2;
            offset.y += 2;
        } catch (error) {
            console.error('Error duplicating element:', error);
        }
    });

    
    this.deselectAllElements();
    
    
    duplicatedElements.forEach(element => {
        if (element.userData) {
            element.userData.isSelected = true;
        }
        
        element.traverse((child) => {
            if (child.userData) {
                child.userData.isSelected = true;
            }
        });
    });

    this.viewer.showNotification(`${duplicatedElements.length} elements duplicated`);
    this.viewer.saveState('Elements duplicated');
    return duplicatedElements.length;
}

deleteSelectedElements() {
            const selectedElements = this.getSelectedElements();
        
        
        if (selectedElements.length > 0) {
            this.viewer.saveState('Delete elements', null, selectedElements);
        }
        if (selectedElements.length === 0) {
            this.viewer.showNotification('No elements selected for deletion', true);
            return;
        }

        
        this.viewer.saveState('Deletion elements', null, selectedElements);

        
        this.viewer.historyManager.hideElements(selectedElements);

        
        if (this.viewer.modelEditor) {
            this.viewer.modelEditor.deactivateTransformControls();
        }

        this.deselectAllElements();
        
        this.viewer.showNotification(`${selectedElements.length} elements deletion`);
        
    }

    purgeHiddenElements() {
        const hiddenElements = this.viewer.historyManager.getHiddenElements();
        let purgedCount = 0;
        
        hiddenElements.forEach(element => {
            if (element.parent) {
                element.parent.remove(element);
                
                
                if (element.geometry) element.geometry.dispose();
                if (element.material) {
                    if (Array.isArray(element.material)) {
                        element.material.forEach(mat => mat.dispose());
                    } else {
                        element.material.dispose();
                    }
                }
                
                purgedCount++;
            }
        });

        this.viewer.historyManager.purgeHiddenElements();
        
        return purgedCount;
    }
mergeSelectedElements() {

            const selectedElements = this.getSelectedElements();
        
        
        if (selectedElements.length > 0) {
            this.viewer.saveState('Merge elements', selectedElements);
        }
    try {
        const selectedElements = this.getSelectedElements();
        
        if (selectedElements.length < 2) {
            this.viewer.showNotification('Select at least 2 elements to merge', true);
            return 0;
        }

        
        const allElements = [];
        const findElementsRecursive = (obj) => {
            if (obj.isMesh) {
                allElements.push(obj);
            } else if (obj.isGroup && obj.userData && obj.userData.isMerged) {
                
                obj.children.forEach(child => findElementsRecursive(child));
            }
        };
        
        selectedElements.forEach(element => findElementsRecursive(element));
        
        if (allElements.length < 2) {
            this.viewer.showNotification('Not enough elements found to merge', true);
            return 0;
        }

        this.viewer.showNotification('Merging selected elements…');

        
        const boundingBox = new THREE.Box3();
        allElements.forEach(element => {
            boundingBox.expandByObject(element);
        });
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);

        
        const mergedGroup = new THREE.Group();
        mergedGroup.name = 'Merged_Group_' + Date.now();

        
        mergedGroup.position.copy(center);

        
        let groupType = 'other';
        const allTypes = allElements.map(el => el.userData?.type);
        const allSameType = allTypes.every(type => type === allTypes[0]);
        if (allSameType && allTypes[0]) {
            groupType = allTypes[0];
        }

        const originalElementsData = [];

        allElements.forEach((element, index) => {
            try {
                
                const clonedElement = element.clone();
                clonedElement.uuid = THREE.MathUtils.generateUUID();

                
                const worldPosition = new THREE.Vector3();
                element.getWorldPosition(worldPosition);

                
                const relativePosition = worldPosition.clone().sub(center);
                clonedElement.position.copy(relativePosition);

                
                clonedElement.rotation.copy(element.rotation);
                clonedElement.scale.copy(element.scale);

                clonedElement.name = element.name || `merged_part_${index}`;

                
                clonedElement.userData = JSON.parse(JSON.stringify(element.userData || {}));

                clonedElement.userData.isMergedPart = true;
                clonedElement.userData.isSelectable = false;
                clonedElement.userData.originalElementId = element.userData?.elementId || element.id || `unknown_${index}`;
                clonedElement.userData.mergeIndex = index;
                clonedElement.userData.mergeTimestamp = new Date().toISOString();

                if (!clonedElement.userData.elementId) {
                    clonedElement.userData.elementId = `merged_part_${Date.now()}_${index}`;
                }

                clonedElement.elementId = clonedElement.userData.elementId;

                mergedGroup.add(clonedElement);

                
                const elementData = {
                    type: element.userData?.type || 'unknown',
                    worldPosition: worldPosition.clone(),
                    relativePosition: relativePosition.clone(),
                    userData: JSON.parse(JSON.stringify(element.userData || {})),
                    modifications: element.userData.modifications ? 
                        JSON.parse(JSON.stringify(element.userData.modifications)) : {},
                    currentHeight: element.userData.originalHeight || 10,
                    currentWidth: element.userData.originalWidth || 10,
                    currentDepth: element.userData.originalDepth || 10,
                    currentScale: element.scale.clone(),
                    originalHeightInitial: element.userData.originalHeightInitial || element.userData.originalHeight || 10,
                    originalWidth: element.userData.originalWidth || 10,
                    originalDepth: element.userData.originalDepth || 10,
                    baseHeight: element.userData.baseHeight || element.userData.originalHeight || 10,
                    isExternalModel: element.userData.isExternalModel || false,
                    fileName: element.userData.fileName,
                    fileExtension: element.userData.fileExtension,
                    currentMaterials: this.captureCurrentMaterials(element),
                    appliedTexture: element.userData.appliedTexture || null
                };

                originalElementsData.push(elementData);

            } catch (elementError) {
                console.error(`Error processing element ${index}:`, elementError);
                this.viewer.showNotification(`Error processing one element`, true);
            }
        });

        if (mergedGroup.children.length === 0) {
            this.viewer.showNotification('Could not process elements for merging', true);
            return 0;
        }

        
 mergedGroup.userData = {
            type: groupType,
            isMerged: true,
            isSelectable: true,
            originalElements: originalElementsData,
            mergedFrom: allElements.map(el => el.userData?.elementId || el.id || 'unknown'),
            mergedCount: allElements.length,
            mergeTime: new Date().toISOString(),
            elementId: `element_${Math.random().toString(36).substr(2, 9)}`,
            originalCenter: center.clone(),
            isSelected: false,
            isUserCreated: true,
            canReceiveTextures: true,
            materialType: 'merged_group',
            modifications: {
                height: null,
                width: null,
                color: null,
                textures: {}
            },
            
            isCopiedMergedGroup: false,
            canBeSeparated: true,
            wasCopied: false
        };
        

        mergedGroup.elementId = mergedGroup.userData.elementId;

        
        this.buildings.add(mergedGroup);

        
        selectedElements.forEach(element => {
            element.visible = false;
            element.userData.wasMerged = true;
            element.userData.mergedInto = mergedGroup.userData.elementId;
            element.userData.isSelectable = false;
        });

        
        this.deselectAllElements();
        this.selectElement(mergedGroup, false);

        
        if (this.viewer.modelEditor) {
            this.viewer.modelEditor.activateTransformControls(mergedGroup);
        }

        this.viewer.showNotification(`Merge ${allElements.length} elements type ${groupType}`);
        this.viewer.saveState('Merge elements');

        return 1;

    } catch (error) {
        console.error('Error merging elements:', error);
        this.viewer.showNotification('Error merging elements: ' + error.message, true);
        return 0;
    }
}



captureCurrentMaterials(element) {
    try {
        if (!element.material) return null;
        
        if (Array.isArray(element.material)) {
            return element.material.map(mat => {
                const matData = {
                    type: mat.type,
                    color: mat.color ? mat.color.getHex() : 0x888888,
                    mapUrl: mat.map ? this.getTextureUrl(mat.map) : null,
                    emissive: mat.emissive ? mat.emissive.getHex() : 0x000000,
                    opacity: mat.opacity || 1.0,
                    transparent: mat.transparent || false
                };
                
                
                if (mat.map && element.geometry && element.geometry.attributes.uv) {
                    matData.uvData = {
                        hasUV: true,
                        count: element.geometry.attributes.uv.count
                    };
                }
                
                return matData;
            });
        } else {
            const matData = {
                type: element.material.type,
                color: element.material.color ? element.material.color.getHex() : 0x888888,
                mapUrl: element.material.map ? this.getTextureUrl(element.material.map) : null,
                emissive: element.material.emissive ? element.material.emissive.getHex() : 0x000000,
                opacity: element.material.opacity || 1.0,
                transparent: element.material.transparent || false
            };
            
            if (element.material.map && element.geometry && element.geometry.attributes.uv) {
                matData.uvData = {
                    hasUV: true,
                    count: element.geometry.attributes.uv.count
                };
            }
            
            return [matData];
        }
    } catch (error) {
        console.error('Error capturing materials:', error);
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


captureTextureData(element) {
    try {
        if (!element.userData || !element.userData.modifications || !element.userData.modifications.textures) {
            return null;
        }
        
        const textureData = {};
        const textures = element.userData.modifications.textures;
        
        
        Object.keys(textures).forEach(faceType => {
            textureData[faceType] = {
                url: textures[faceType],
                applied: true,
                face: faceType
            };
        });
        
        return textureData;
    } catch (error) {
        console.error('Error capturing texture data:', error);
        return null;
    }
}

setupExternalModelSelection() {
    
    
    
    this.externalModels.traverse((child) => {
        if (child.isMesh) {
            
            if (!child.userData) {
                child.userData = {};
            }
            
            if (!child.userData.elementId) {
                child.userData.elementId = `element_${Math.random().toString(36).substr(2, 9)}`;
            }
            
            child.userData.isExternalModel = true;
            child.userData.isSelected = false;
            
            if (!child.userData.originalMaterials) {
                if (Array.isArray(child.material)) {
                    child.userData.originalMaterials = child.material.map(mat => mat.clone());
                } else {
                    child.userData.originalMaterials = [child.material.clone()];
                }
            }
        }
    });
}




mergeGeometriesManually(geometries) {
    if (!geometries || geometries.length === 0) {
        throw new Error('No geometry to merge');
    }
    
    if (geometries.length === 1) {
        return geometries[0].clone();
    }
    
    const mergedGeometry = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    
    let vertexOffset = 0;
    
    geometries.forEach(geometry => {
        if (!geometry || !geometry.attributes || !geometry.attributes.position) {
            console.warn('Invalid geometry, skipping');
            return;
        }
        
        const positionAttr = geometry.attributes.position;
        const normalAttr = geometry.attributes.normal;
        const uvAttr = geometry.attributes.uv;
        const colorAttr = geometry.attributes.color;
        
        
        for (let i = 0; i < positionAttr.count; i++) {
            positions.push(
                positionAttr.getX(i),
                positionAttr.getY(i),
                positionAttr.getZ(i)
            );
        }
        
        
        if (normalAttr && normalAttr.count === positionAttr.count) {
            for (let i = 0; i < normalAttr.count; i++) {
                normals.push(
                    normalAttr.getX(i),
                    normalAttr.getY(i),
                    normalAttr.getZ(i)
                );
            }
        }
        
        
        if (uvAttr && uvAttr.count === positionAttr.count) {
            for (let i = 0; i < uvAttr.count; i++) {
                uvs.push(
                    uvAttr.getX(i),
                    uvAttr.getY(i)
                );
            }
        }
        
        
        if (colorAttr && colorAttr.count === positionAttr.count) {
            for (let i = 0; i < colorAttr.count; i++) {
                colors.push(
                    colorAttr.getX(i),
                    colorAttr.getY(i),
                    colorAttr.getZ(i)
                );
            }
        }
        
        
        if (geometry.index) {
            for (let i = 0; i < geometry.index.count; i++) {
                indices.push(geometry.index.getX(i) + vertexOffset);
            }
        } else {
            
            for (let i = 0; i < positionAttr.count; i++) {
                indices.push(vertexOffset + i);
            }
        }
        
        vertexOffset += positionAttr.count;
    });
    
    
    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    if (indices.length > 0) {
        mergedGeometry.setIndex(indices);
    }
    
    if (normals.length === positions.length) {
        mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
        mergedGeometry.computeVertexNormals();
    }
    
    if (uvs.length === positions.length / 3 * 2) {
        mergedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    
    if (colors.length === positions.length) {
        mergedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    
    return mergedGeometry;
}



separateMergedElement(mergedElement) {
    if (!mergedElement || !mergedElement.userData || !mergedElement.userData.isMerged) {
        
        this.viewer.showNotification('The element is not a valid merged element', true);
        return null;
    }
    
    
    
    try {
        
        if (!mergedElement.userData.originalElements) {
            console.error(' No original elements saved for separation');
            this.viewer.showNotification(' Cannot be separated', true);
            return null;
        }
        
        const originalElements = mergedElement.userData.originalElements;
        
        
        
        originalElements.forEach(element => {
            if (element && element.parent) {
                try {
                    
                    element.visible = true;
                    
                    
                    if (element.userData.originalPosition) {
                        element.position.copy(element.userData.originalPosition);
                    }
                    if (element.userData.originalRotation) {
                        element.rotation.copy(element.userData.originalRotation);
                    }
                    if (element.userData.originalScale) {
                        element.scale.copy(element.userData.originalScale);
                    }
                    
                    
                    if (element.userData.originalMaterials) {
                        if (Array.isArray(element.material)) {
                            element.material.forEach((mat, index) => {
                                if (element.userData.originalMaterials[index]) {
                                    mat.copy(element.userData.originalMaterials[index]);
                                }
                            });
                        } else if (element.userData.originalMaterials[0]) {
                            element.material.copy(element.userData.originalMaterials[0]);
                        }
                    }
                    
                    
                    element.userData.isSelected = false;
                    element.userData.wasMerged = true;
                    delete element.userData.isMerged;
                    
                    
                    
                } catch (elementError) {
                    console.error(` Error restoring element ${element.userData?.elementId}:`, elementError);
                }
            } else {
                console.warn(`The original element is not available for restoration`);
            }
        });
        
        
        if (mergedElement.parent) {
            mergedElement.parent.remove(mergedElement);
        }
        
        
        if (mergedElement.geometry) {
            mergedElement.geometry.dispose();
        }
        if (mergedElement.material) {
            if (Array.isArray(mergedElement.material)) {
                mergedElement.material.forEach(mat => mat.dispose());
            } else {
                mergedElement.material.dispose();
            }
        }
        
        
        this.viewer.showNotification(` Merged element separated - ${originalElements.length} elements restored`);
        this.viewer.saveState('Separare elemente');
        
        return originalElements;
        
    } catch (error) {
        console.error('Error separating merged element:', error);
        this.viewer.showNotification(' Error separating merged element', true);
        return null;
    }
}




mergeBufferGeometries(geometries, useGroups = false) {
    
    
    const isIndexed = geometries[0].index !== null;
    const attributesUsed = new Set(Object.keys(geometries[0].attributes));
    const morphAttributesUsed = new Set(Object.keys(geometries[0].morphAttributes));
    
    const baseGeometry = geometries[0];
    const mergedGeometry = new THREE.BufferGeometry();
    
    
    for (const name in baseGeometry.attributes) {
        const attribute = baseGeometry.attributes[name];
        const array = new attribute.array.constructor(attribute.array.length * geometries.length);
        mergedGeometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    
    
    for (const name in baseGeometry.morphAttributes) {
        const morphAttribute = baseGeometry.morphAttributes[name];
        const array = new morphAttribute.array.constructor(morphAttribute.array.length * geometries.length);
        const morphAttr = new THREE.BufferAttribute(array, morphAttribute.itemSize, morphAttribute.normalized);
        
        if (!mergedGeometry.morphAttributes) mergedGeometry.morphAttributes = {};
        mergedGeometry.morphAttributes[name] = [morphAttr];
    }
    
    
    
    return this.mergeGeometriesManually(geometries);
}


checkBufferGeometryUtils() {
    if (typeof THREE.BufferGeometryUtils === 'undefined') {
        console.warn('Using manual merge');
        
        
        if (typeof window !== 'undefined' && !window.BUFFER_GEOMETRY_UTILS_LOADING) {
            window.BUFFER_GEOMETRY_UTILS_LOADING = true;
            
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/jsm/utils/BufferGeometryUtils.js';
            script.onload = () => {
                
                window.BUFFER_GEOMETRY_UTILS_LOADING = false;
            };
            script.onerror = () => {
                console.error('Error loading THREE.BufferGeometryUtils');
                window.BUFFER_GEOMETRY_UTILS_LOADING = false;
            };
            document.head.appendChild(script);
        }
        
        return false;
    }
    return true;
}



isElementMerged(element) {
    return element.userData && element.userData.isMerged === true;
}

getAllMergedElements() {
    const mergedElements = [];
    
    
    this.buildings.traverse((child) => {
        if (child.isMesh && this.isElementMerged(child)) {
            mergedElements.push(child);
        }
    });
    
    
    if (this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse((child) => {
            if (child.isMesh && this.isElementMerged(child)) {
                mergedElements.push(child);
            }
        });
    }
    
    return mergedElements;
}


separateAllMergedElements() {
    const allMergedElements = this.getMergedElements();
    
    if (allMergedElements.length === 0) {
        this.viewer.showNotification('No merged elements in the scene', true);
        return 0;
    }
    
    let totalSeparated = 0;
    
    allMergedElements.forEach(mergedElement => {
        if (mergedElement.userData && mergedElement.userData.originalElements) {
            const originalElementsData = mergedElement.userData.originalElements;
            
            originalElementsData.forEach(data => {
                if (data.element && data.element.geometry && data.element.material) {
                    const restoredMesh = new THREE.Mesh(
                        data.element.geometry,
                        data.element.material
                    );
                    
                    restoredMesh.position.copy(data.position);
                    restoredMesh.rotation.copy(data.rotation);
                    restoredMesh.scale.copy(data.scale);
                    restoredMesh.userData = data.userData;
                    
                    this.buildings.add(restoredMesh);
                    totalSeparated++;
                }
            });
            
            if (mergedElement.parent) {
                mergedElement.parent.remove(mergedElement);
            }
            
            mergedElement.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
    });
    
    if (totalSeparated > 0) {
        this.viewer.showNotification(`Split ${totalSeparated} elements from ${allMergedElements.length} `);
        this.viewer.saveState('Separate all merged elements');
    }
    
    return totalSeparated;
}


hasMergedElementsSelected() {
    const selectedElements = this.getSelectedElements();
    return selectedElements.some(el => this.isElementMerged(el));
}


getSelectedMergedElements() {
    const selectedElements = this.getSelectedElements();
    return selectedElements.filter(el => this.isElementMerged(el));
}


getMergedElements() {
    const mergedElements = [];
    
    this.buildings.traverse((child) => {
        if (child.isGroup && child.userData && child.userData.isMerged) {
            mergedElements.push(child);
        }
    });
    
    return mergedElements;
}

clearAll() {
    if (!this.buildings) return;
    
    

    
    for (let i = this.buildings.children.length - 1; i >= 0; i--) {
        const child = this.buildings.children[i];
        
        
        this.buildings.remove(child);
        
        
        if (child.geometry) {
            child.geometry.dispose();
        }
        
        
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    }
    
    
    this.buildings.clear();

    
    this.stats = {
        buildings: 0,
        roads: 0,
        water: 0,
        natural: 0,
        landuse: 0,
        other: 0,
        triangles: 0,
        vertices: 0
    };
    
    
}

    removeDuplicates() {
        
        const uniqueSignatures = new Set();
        const objectsToRemove = [];
        const _pos = new THREE.Vector3();

        
        this.buildings.traverse((child) => {
            
            if (child.isMesh) {
                
                child.getWorldPosition(_pos);
                
                
                
                const x = _pos.x.toFixed(1);
                const y = _pos.y.toFixed(1);
                const z = _pos.z.toFixed(1);
                
                
                const vertexCount = child.geometry && child.geometry.attributes.position 
                                    ? child.geometry.attributes.position.count 
                                    : 0;
                
                const signature = `${x}_${y}_${z}_${vertexCount}`;

                if (uniqueSignatures.has(signature)) {
                    
                    objectsToRemove.push(child);
                } else {
                    
                    uniqueSignatures.add(signature);
                }
            }
        });
        if (objectsToRemove.length > 0) {
            
            objectsToRemove.forEach(obj => {
                
                if (obj.parent) {
                    obj.parent.remove(obj);
                }
                
                
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            
        } else {
            
        }
        
        
        return uniqueSignatures.size;
    }
getElementTypeStatistics() {
    const stats = {
        'building': 0,
        'highway': 0,
        'water': 0,
        'natural': 0,
        'landuse': 0,
        'other': 0,
        'external': 0,
        'merged': 0,
        'total': 0
    };
    
    const processElement = (child) => {
        if (child.isMesh) {
            let type = 'other';
            
            
            if (child.userData?.type) {
                type = child.userData.type;
            } else if (child.userData?.isBuilding) {
                type = 'building';
            } else if (child.userData?.isRoad) {
                type = 'highway';
            } else if (child.userData?.isWater) {
                type = 'water';
            } else if (child.userData?.isNatural) {
                type = 'natural';
            } else if (child.userData?.isLanduse) {
                type = 'landuse';
            } else if (child.userData?.isExternalModel) {
                type = 'external';
            } else if (child.userData?.isMerged) {
                type = 'merged';
            } else if (child.name) {
                const nameLower = child.name.toLowerCase();
                if (nameLower.includes('road') || nameLower.includes('highway')) {
                    type = 'highway';
                } else if (nameLower.includes('building')) {
                    type = 'building';
                } else if (nameLower.includes('water')) {
                    type = 'water';
                } else if (nameLower.includes('natural')) {
                    type = 'natural';
                } else if (nameLower.includes('landuse')) {
                    type = 'landuse';
                }
            }
            
            stats[type] = (stats[type] || 0) + 1;
            stats.total++;
        }
    };
    
    
    if (this.buildings) {
        this.buildings.traverse(processElement);
    }
    
    
    if (this.viewer && this.viewer.externalModels) {
        this.viewer.externalModels.traverse(processElement);
    }
    
    return stats;
}
}