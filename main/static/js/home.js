let map, drawnItems;
let isSelecting = false;
let selectionStart = null;
let selectionRectangle = null;
let selectedBounds = null;
let selectedDataTypes = ['building'];
let mapPreviewScene, mapPreviewCamera, mapPreviewRenderer, mapPreviewControls, mapPreviewBuildings;

document.addEventListener('DOMContentLoaded', function() {
  initializeMap();
  setupEventListeners();
  setupMobileMenu();
  initializeSelectionInfo();
  updateSelectedDataTypesDisplay();
});

function initializeMap() {
    if (window.mapInitialized) return;
    map = L.map('map').setView([45.46427, 9.18951], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    setupMapEvents();
    window.mapInitialized = true;
}

let searchTimeout = null;
let currentSearchResults = [];


document.getElementById('mapSearchBtn').addEventListener('click', searchLocation);
document.getElementById('mapSearchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchLocation();
    }
});


async function searchLocation() {
    const searchInput = document.getElementById('mapSearchInput').value.trim();
    if (!searchInput) return;
    
    const resultsContainer = document.getElementById('mapSearchResults');
    resultsContainer.innerHTML = '<div class="loading-search"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
    resultsContainer.classList.add('active');
    
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}&limit=10&accept-language=en`);
        const data = await response.json();
        
        currentSearchResults = data;
        
        if (data.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
            return;
        }
        
        resultsContainer.innerHTML = data.map(result => `
            <div class="search-result-item" data-lat="${result.lat}" data-lon="${result.lon}">
                <div class="search-result-name">${result.display_name.split(',')[0]}</div>
                <div class="search-result-details">
                    <span><i class="fas fa-map-marker-alt"></i> ${result.type}</span>
                    <span><i class="fas fa-globe-europe"></i> ${result.lat}, ${result.lon}</span>
                </div>
            </div>
        `).join('');
        
        
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', function() {
                const lat = parseFloat(this.dataset.lat);
                const lon = parseFloat(this.dataset.lon);
                flyToLocation(lat, lon);
                resultsContainer.classList.remove('active');
                document.getElementById('mapSearchInput').value = this.querySelector('.search-result-name').textContent;
            });
        });
        
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<div class="no-results">Error searching. Try again.</div>';
    }
}


function flyToLocation(lat, lon) {
    map.flyTo([lat, lon], 15, {
        duration: 1.5,
        easeLinearity: 0.25
    });
    
    
    if (window.searchMarker) {
        map.removeLayer(window.searchMarker);
    }
    
    window.searchMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'search-marker',
            html: '<i class="fas fa-map-marker-alt" style="color: #667eea; font-size: 24px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);"></i>',
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        })
    }).addTo(map);
    
    
    setTimeout(() => {
        if (window.searchMarker) {
            map.removeLayer(window.searchMarker);
            window.searchMarker = null;
        }
    }, 5000);
    
    
    showMessage(`Flying to location: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, 'success');
}


document.getElementById('mapSearchInput').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    const value = this.value.trim();
    
    if (value.length < 3) {
        document.getElementById('mapSearchResults').classList.remove('active');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5&accept-language=en`);
            const data = await response.json();
            
            if (data.length > 0) {
                const resultsContainer = document.getElementById('mapSearchResults');
                resultsContainer.innerHTML = data.map(result => `
                    <div class="search-result-item" data-lat="${result.lat}" data-lon="${result.lon}">
                        <div class="search-result-name">${result.display_name.split(',')[0]}</div>
                        <div class="search-result-details">
                            <span><i class="fas fa-map-marker-alt"></i> ${result.type}</span>
                        </div>
                    </div>
                `).join('');
                
                resultsContainer.classList.add('active');
                
                
                document.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', function() {
                        const lat = parseFloat(this.dataset.lat);
                        const lon = parseFloat(this.dataset.lon);
                        flyToLocation(lat, lon);
                        resultsContainer.classList.remove('active');
                        document.getElementById('mapSearchInput').value = this.querySelector('.search-result-name').textContent;
                    });
                });
            }
        } catch (error) {
            console.log('Autocomplete error:', error);
        }
    }, 500);
});


document.addEventListener('click', function(e) {
    const searchContainer = document.querySelector('.map-search-container');
    const resultsContainer = document.getElementById('mapSearchResults');
    
    if (!searchContainer.contains(e.target) && resultsContainer.classList.contains('active')) {
        resultsContainer.classList.remove('active');
    }
});
function setupMapEvents() {
    map.on('contextmenu', function(e) {
        e.originalEvent.preventDefault();
        
        if (selectedBounds) {
            showMessage('There is already a selected area. ', 'info');
            return;
        }
        
        isSelecting = true;
        selectionStart = e.latlng;
        
        selectionRectangle = createSelectionRectangle([selectionStart, selectionStart]);
    });

    map.on('mousemove', function(e) {
        if (!isSelecting || !selectionStart) return;
        
        const currentPos = e.latlng;
        const bounds = L.latLngBounds([selectionStart, currentPos]);
        
        if (selectionRectangle) {
            selectionRectangle.setBounds(bounds);
        } else {
            selectionRectangle = createSelectionRectangle(bounds);
        }
    });

    map.on('mouseup', function(e) {
        if (!isSelecting || !selectionStart) return;
        
        isSelecting = false;
        const selectionEnd = e.latlng;
        
        const bounds = L.latLngBounds([selectionStart, selectionEnd]);
        
        const area = calculateArea(bounds);
        if (area < 0.001) {
            showMessage('The selected area is too small. Try with a larger area.', 'info');
            map.removeLayer(selectionRectangle);
            selectionRectangle = null;
            selectionStart = null;
            return;
        }
        
        
        addSelectedRectangle(bounds);
        
        if (selectionRectangle) {
            map.removeLayer(selectionRectangle);
            selectionRectangle = null;
        }
        selectionStart = null;
    });
}


function createSelectionRectangle(bounds) {
    if (selectionRectangle) {
        map.removeLayer(selectionRectangle);
    }
    
    selectionRectangle = L.rectangle(bounds, {
        color: '#2563eb',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 0.2,
        className: 'temp-rectangle',
        dashArray: '5, 5'
    }).addTo(map);
    
    return selectionRectangle;
}

function addSelectedRectangle(bounds) {
    const area = calculateArea(bounds);
    
    
    const MAX_RECOMMENDED_AREA = 1.0;
    
    
    if (area > MAX_RECOMMENDED_AREA) {
        
        showAreaWarning(area, bounds);
        return;
    }
    
    
    actuallyAddRectangle(bounds);
}

document.getElementById('clear-selection').addEventListener('click', function() {
    drawnItems.clearLayers();
    selectedBounds = null;
    
    isSelecting = false;
    selectionStart = null;
    if (selectionRectangle) {
        map.removeLayer(selectionRectangle);
        selectionRectangle = null;
    }
    
    updateSelectionInfo();
    
});

function calculateArea(bounds) {
    const latDiff = bounds.getNorth() - bounds.getSouth();
    const lngDiff = bounds.getEast() - bounds.getWest();
    
    return (latDiff * lngDiff * 111.32 * 111.32);
}

function calculateTotalArea() {
    return selectedBounds ? calculateArea(selectedBounds) : 0;
}

function getTotalBounds() {
    return selectedBounds;
}

function updateSelectionInfo() {
    const totalArea = calculateTotalArea();
    const totalBounds = getTotalBounds();
    
    const count = selectedBounds ? 1 : 0;
    
    document.getElementById('selected-count').textContent = count;
    document.getElementById('selected-area').textContent = totalArea.toFixed(2) + ' km²';
    
    document.getElementById('selection-counter').textContent = selectedBounds ? '1 area selected' : '0 areas selected';
    
    document.getElementById('generateBtn').disabled = !selectedBounds || selectedDataTypes.length === 0;
    
    retryCount = 0;
}


function updateSelectedDataTypesDisplay() {
    const dataTypeNames = {
        'building': 'Buildings',
        'highway': 'Roads',
        'water': 'Natural elements',
        'natural': 'Natural elements',
        'landuse': 'Land use'
    };
    
    const selectedNames = selectedDataTypes.map(type => dataTypeNames[type]);
    const displayText = selectedNames.length > 0 ? selectedNames.join(', ') : 'No type selected';
    
    document.getElementById('data-type').textContent = displayText;
}

function setupEventListeners() {
    document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const value = this.value;
            
            if (this.checked) {
                if (!selectedDataTypes.includes(value)) {
                    selectedDataTypes.push(value);
                }
            } else {
                const index = selectedDataTypes.indexOf(value);
                if (index > -1) {
                    selectedDataTypes.splice(index, 1);
                }
            }
            
            updateSelectedDataTypesDisplay();
            updateSelectionInfo();
            
            const dataTypeNames = {
        'building': 'Buildings',
        'highway': 'Roads',
        'water': 'Natural elements',
        'natural': 'Natural elements',
        'landuse': 'Land use'
            };
            
            const action = this.checked ? 'selected' : 'deselected';
            
        });
    });

    document.getElementById('clear-selection').addEventListener('click', function() {
        drawnItems.clearLayers();
        selectedBounds = null;
        updateSelectionInfo();
        
    });

    document.getElementById('generateBtn').addEventListener('click', generate3DModel);
}

document.addEventListener('DOMContentLoaded', function() {
  initializeMap();
  setupEventListeners();
  setupMobileMenu();
  initializeSelectionInfo();
  updateSelectedDataTypesDisplay();
});

function initializeSelectionInfo() {
    updateSelectionInfo();
}

const R = 6378137;
function lonLatToMeters(lon, lat) {
    const x = R * lon * Math.PI / 180;
    const z = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); 
    return [x, z]; 
}

async function fetchOverpassData(bounds, dataTypes) {
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    
    const queries = dataTypes.map(dataType => 
        getOverpassQuery(dataType, south, west, north, east)
    );
    
    const combinedQuery = `
        [out:json][timeout:60];
        (
            ${queries.join('\n                ')}
        );
        out body;
        >;
        out skel qt;
    `;
    
    try {
        const resp = await fetch("/api/proxy/overpass/", {
            method: "POST",
            body: combinedQuery,
            headers: { "Content-Type": "text/plain" }
        });
        
        if(!resp.ok) throw new Error("Overpass error " + resp.status);
        const data = await resp.json();
        return data;
        
    } catch(e) {
        console.log(`Error fetching data: ${e}`);
        throw e;
    }
}

async function fetchOverpassDataAlternative(bounds, dataTypes) {
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    
    const queries = dataTypes.map(dataType => 
        getOverpassQuery(dataType, south, west, north, east)
    );
    
    const combinedQuery = `
        [out:json][timeout:90];
        (
            ${queries.join('\n                ')}
        );
        out body;
        >;
        out skel qt;
    `;
    
    
    
    try {
        const resp = await fetch("https://overpass.kumi.systems/api/interpreter", {
            method: "POST",
            body: combinedQuery,
            headers: { "Content-Type": "text/plain" }
        });
        
        if(!resp.ok) throw new Error("Overpass alternative error " + resp.status);
        const data = await resp.json();
        
        
        return data;
        
    } catch(e) {
        console.log(` Error on alternative server too: ${e}`);
        throw e;
    }
}

function getOverpassQuery(dataType, south, west, north, east) {
    switch(dataType) {
        case 'building':
            return `way["building"](${south},${west},${north},${east});
                relation["building"](${south},${west},${north},${east});`;
        case 'highway':
            return `way["highway"](${south},${west},${north},${east});`;
        case 'water':
            return `way["waterway"](${south},${west},${north},${east});
                way["natural"="water"](${south},${west},${north},${east});
                relation["natural"="water"](${south},${west},${north},${east});`;
        case 'natural':
            return `way["natural"](${south},${west},${north},${east});
                relation["natural"](${south},${west},${north},${east});`;
        case 'landuse':
            return `way["landuse"](${south},${west},${north},${east});
                relation["landuse"](${south},${west},${north},${east});`;
        default:
            return '';
    }
}

function osmToGeoJSON(osm) {
    const nodes = {};
    osm.elements.filter(e => e.type === "node").forEach(n => nodes[n.id] = [n.lon, n.lat]);
    
    const features = [];
    osm.elements.filter(e => e.type === "way").forEach(w => {
        const coords = w.nodes.map(id => nodes[id]).filter(Boolean);
        if (coords.length < 3) return;
        features.push({
            type: "Feature",
            properties: w.tags || {},
            geometry: { type: "Polygon", coordinates: [coords] }
        });
    });
    
    return { type: "FeatureCollection", features };
}

function addData(geojson, origin, dataTypes) {
    mapPreviewBuildings.clear();
    let elementsCreated = 0;
    
    geojson.features.forEach(f => {
        const fp = f.geometry.coordinates[0];
        const props = f.properties;
        
        let elementType = 'default';
        if (props.building) elementType = 'building';
        else if (props.highway) elementType = 'highway';
        else if (props.waterway || props.natural === 'water') elementType = 'water';
        else if (props.natural) elementType = 'natural';
        else if (props.landuse) elementType = 'landuse';
        
        let h = 0;
        let color = 0xcccccc;
        
        switch(elementType) {
            case 'building':
                h = parseFloat(props.height) || (props['building:levels'] ? props['building:levels'] * 3 : 10);
                color = 0xcccccc;
                break;
            case 'highway':
                h = 0.5;
                color = 0x666666;
                break;
            case 'water':
                h = 0.1;
                color = 0x0066cc;
                break;
            case 'natural':
                h = props.natural === 'wood' ? 5 : 1;
                color = props.natural === 'wood' ? 0x228B22 : 0x90EE90;
                break;
            case 'landuse':
                h = 0.2;
                color = 0x98FB98;
                break;
            default:
                h = 1;
                color = 0xcccccc;
        }
        
        
        const shapePts = fp.map(([lon, lat]) => {
            const [mx, mz] = lonLatToMeters(lon, lat); 
            return new THREE.Vector2(mx - origin[0], mz - origin[1]);
        });
        
        try {
            const shape = new THREE.Shape(shapePts);
            const geom = new THREE.ExtrudeGeometry(shape, {
                depth: h,
                bevelEnabled: false
            });
            
            
            geom.rotateX(-Math.PI / 2);
            
            const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color }));
            mapPreviewBuildings.add(mesh);
            elementsCreated++;
        } catch(e) {
            console.warn('Error creating element:', e);
        }
    });
    
    return elementsCreated;
}

function getCSRFToken() {
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

async function saveBuildingDataToAPI(geojson, bounds, origin, dataTypes) {
    const buildingData = {
        geojson: {
            type: "FeatureCollection",
            features: geojson.features.map(f => ({
                type: "Feature",
                properties: f.properties,
                geometry: f.geometry
            }))
        },
        bounds: {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest()
        },
        origin: origin,
        dataType: dataTypes.join(','),
        timestamp: new Date().toISOString(),
        elementCount: geojson.features.length
    };
    
    
    
    try {
        const response = await fetch('/api/models/import/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(buildingData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            
            return result.file_id || result.id;
        } else {
            throw new Error(result.message || 'Error saving data');
        }
    } catch (error) {
        console.error(' Error saving data:', error);
        throw error;
    }
}

let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000;
const OSM_ERRORS = ['Overpass error', 'timeout', '429 Too Many Requests', 'Gateway Timeout', 'Service Unavailable'];

async function generate3DModel() {
    if (!selectedBounds) { 
        console.log('Error: Select an area!');
        alert('Select an area on the map before generating the 3D model!');
        return; 
    }
    
    if (selectedDataTypes.length === 0) {
        console.log('Error: Select at least one data type!');
        alert('Select at least one data type (ex: Buildings, Roads, etc.)!');
        return;
    }
    
    document.getElementById('generateBtn').disabled = true;
    const generateBtn = document.getElementById('generateBtn');
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extracting data...';
    
    const dataTypeNames = {
        'building': 'Buildings',
        'highway': 'Roads',
        'water': 'Natural elements',
        'natural': 'Natural elements',
        'landuse': 'Land use'
    };
    
    const selectedNames = selectedDataTypes.map(type => dataTypeNames[type]);
    
    
    
    try {
        let osm;
        let fetchRetries = 0;
        const MAX_FETCH_RETRIES = 5;
        
        while (fetchRetries <= MAX_FETCH_RETRIES) {
            try {
                osm = await fetchOverpassData(selectedBounds, selectedDataTypes);
                break;
            } catch (fetchError) {
                fetchRetries++;
                
                const isOsmError = OSM_ERRORS.some(error => 
                    fetchError.message && fetchError.message.includes(error)
                );
                
                if (isOsmError && fetchRetries <= MAX_FETCH_RETRIES) {
                    console.log(` OSM error (${fetchRetries}/${MAX_FETCH_RETRIES}): ${fetchError.message}`);
                    
                    generateBtn.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Retry ${fetchRetries}/${MAX_FETCH_RETRIES}...`;
                    
                    const backoffDelay = RETRY_DELAY * Math.pow(2, fetchRetries - 1);
                    
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                    
                    continue;
                } else {
                    throw fetchError;
                }
            }
        }
        
        const geojson = osmToGeoJSON(osm);
        
        
        
        if (geojson.features.length === 0 && retryCount < MAX_RETRIES) {
            retryCount++;
            
            
            generateBtn.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Retry ${retryCount}/${MAX_RETRIES}...`;
            
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            
            await generate3DModel();
            return;
        }
        
        retryCount = 0;
        
        if (geojson.features.length === 0) {
            
            generateBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No data found';
            document.getElementById('generateBtn').disabled = false;
            
            alert('No elements found in selected area. Try:\n' +
                  '1. A larger area\n' +
                  '2. Other data types\n' +
                  '3. Another location');
            return;
        }
        
        const cLon = (selectedBounds.getEast() + selectedBounds.getWest()) / 2;
        const cLat = (selectedBounds.getNorth() + selectedBounds.getSouth()) / 2;
        const origin = lonLatToMeters(cLon, cLat);
        
        
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        const fileId = await saveBuildingDataToAPI(geojson, selectedBounds, origin, selectedDataTypes);
        
        generateBtn.innerHTML = '<i class="fas fa-check"></i> Generation complete!';
        
        
        
        
        setTimeout(() => {
            window.location.href = '/view-3d/' + fileId + '/';
        }, 1500);
        
    } catch(e) {
        console.error("Final error generating model:", e);
        document.getElementById('generateBtn').disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-cube"></i> Generate 3D Model';
        retryCount = 0;
        
        const isOsmError = OSM_ERRORS.some(error => 
            e.message && e.message.includes(error)
        );
        
        if (isOsmError) {
            alert('Error connecting to OpenStreetMap server.\n' +
                  'OSM server is temporarily unavailable or overloaded.\n' +
                  'Try again in a few minutes or choose a smaller area.');
        } else {
            alert('Error generating model: ' + e.message);
        }
    }
}

async function unifiedExport() {
    const viewer = window.threeViewer;
    if (!viewer) return;

    
    viewer.showNotification(' Preparing unified export...');

    const exportGroup = new THREE.Group();
    
    const occupiedSpaces = new Set();
    let count = 0;

    const _center = new THREE.Vector3();
    const _box = new THREE.Box3();

    const processObject = (obj) => {
        if (!obj.isMesh || !obj.visible) return;

        obj.updateWorldMatrix(true, false);
        _box.setFromObject(obj);
        _box.getCenter(_center);
        
        const key = `${_center.x.toFixed(1)}_${_center.y.toFixed(1)}_${_center.z.toFixed(1)}`;

        if (occupiedSpaces.has(key)) {
            return;
        }
        occupiedSpaces.add(key);

        const clone = obj.clone();
        
        clone.applyMatrix4(obj.matrixWorld);
        
        clone.position.copy(_center);
        clone.rotation.set(0,0,0);
        clone.scale.set(1,1,1);
        clone.userData = { type: obj.userData.type || 'imported_model' };
        
        exportGroup.add(clone);
        count++;
    };

    if (viewer.modelManager && viewer.modelManager.buildings) {
        viewer.modelManager.buildings.traverse(processObject);
    }
    if (viewer.externalModels) {
        viewer.externalModels.traverse(processObject);
    }

    if (count === 0) {
        viewer.showNotification(' Nothing to export', true);
        return;
    }

    const exporter = new THREE.GLTFExporter();
    exporter.parse(
        exportGroup,
        async function (result) {
            const glbData = result instanceof ArrayBuffer ? result : new TextEncoder().encode(JSON.stringify(result));
            const blob = new Blob([glbData], { type: 'model/gltf-binary' });
            const filename = `project_clean_${Date.now()}.glb`;

            try {
                if (typeof viewer.saveExportToServer === 'function') {
                     await viewer.saveExportToServer(blob, filename, count);
                }
            } catch (e) {}

            const link = document.createElement('a');
            link.style.display = 'none';
            document.body.appendChild(link);
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            document.body.removeChild(link);
            
            viewer.showNotification(` Exported: ${count} unique objects`);
        },
        (err) => console.error(err),
        { binary: true, onlyVisible: true, trs: true }
    );
}

window.unifiedExport = unifiedExport;

function setupMobileMenu() {
  const mobileToggleBtn = document.getElementById('mobile-menu-toggle');
  const closePanelBtn = document.querySelector('.close-panel-btn');
  const leftPanel = document.querySelector('.left-panel');
  
  if (!mobileToggleBtn || !leftPanel) return;
  
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  document.querySelector('.main').appendChild(overlay);
  
  function openPanel() {
    leftPanel.classList.add('mobile-visible');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  
  function closePanel() {
    leftPanel.classList.remove('mobile-visible');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
  
  mobileToggleBtn.addEventListener('click', openPanel);
  
  if (closePanelBtn) {
    closePanelBtn.addEventListener('click', closePanel);
  }
  
  overlay.addEventListener('click', closePanel);
  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && leftPanel.classList.contains('mobile-visible')) {
      closePanel();
    }
  });
  
  function handleResizeTransition() {
    leftPanel.classList.add('resizing');
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        leftPanel.classList.remove('resizing');
      });
    });
  }
  
  let resizeTimeout;
  window.addEventListener('resize', function() {
    handleResizeTransition();
    
    clearTimeout(resizeTimeout);
    
    resizeTimeout = setTimeout(function() {
      if (window.innerWidth > 1024) {
        closePanel();
      }
    }, 100);
  });
  
  if (window.innerWidth <= 1024) {
    handleResizeTransition();
  }
}
function showAreaWarning(area, bounds) {
    
    document.getElementById('warningAreaSize').textContent = area.toFixed(2);
    
    const modal = document.getElementById('areaWarningModal');
    modal.style.display = 'flex';
    
    
    document.getElementById('confirmProceed').onclick = function() {
        modal.style.display = 'none';
        actuallyAddRectangle(bounds);
    };
    
    
    document.getElementById('cancelProceed').onclick = function() {
        modal.style.display = 'none';
        
        if (selectionRectangle) {
            map.removeLayer(selectionRectangle);
            selectionRectangle = null;
        }
        
        selectionStart = null;
        isSelecting = false;
        
        
        showMessage('Selection has been canceled.', 'info');
    };
}
function actuallyAddRectangle(bounds) {
    const rectangle = L.rectangle(bounds, {
        color: '#10b981',
        weight: 3,
        fillColor: '#10b981',
        fillOpacity: 0.3,
        className: 'selected-rectangle'
    });
    
    drawnItems.addLayer(rectangle);
    selectedBounds = bounds;
    updateSelectionInfo();
    
    
    isSelecting = false;
    selectionStart = null;
    
    
    const area = calculateArea(bounds);
    showMessage(`Selected area: ${area.toFixed(2)} km².`, 'success');
}

function showMessage(message, type) {
    
    const existingMessage = document.getElementById('dynamicMessage');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const messageEl = document.createElement('div');
    messageEl.id = 'dynamicMessage';
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
        animation: slideInRight 0.3s ease;
        border: 1px solid rgba(255,255,255,0.1);
        font-family: 'Inter', sans-serif;
        line-height: 1.4;
    `;
    
    const colors = {
        'success': { background: '#10b981', color: 'white' },
        'error': { background: '#dc3545', color: 'white' },
        'info': { background: '#17a2b8', color: 'white' },
        'warning': { background: '#ffc107', color: '#212529' }
    };
    
    messageEl.innerHTML = message;
    messageEl.style.background = colors[type]?.background || 'rgba(51, 51, 51, 0.9)';
    messageEl.style.color = colors[type]?.color || 'white';
    messageEl.style.display = 'block';
    
    document.body.appendChild(messageEl);
    
    
    messageEl.addEventListener('click', function() {
        messageEl.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 300);
    });
    
    
    setTimeout(() => {
        if (messageEl.parentNode) {
            messageEl.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        }
    }, 5000);
}


if (!document.querySelector('#messageAnimations')) {
    const style = document.createElement('style');
    style.id = 'messageAnimations';
    style.textContent = `
        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes slideOutRight {
            from {
                opacity: 1;
                transform: translateX(0);
            }
            to {
                opacity: 0;
                transform: translateX(100%);
            }
        }
    `;
    document.head.appendChild(style);
}