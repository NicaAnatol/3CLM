    let threeViewerInitialized = false;
    
    document.addEventListener('DOMContentLoaded', function() {
      const subMenuButtons = document.querySelectorAll('.sub-menu-btn');
      const panelSections = document.querySelectorAll('.panel-section');
      
      subMenuButtons.forEach(button => {
        button.addEventListener('click', function() {
          subMenuButtons.forEach(btn => btn.classList.remove('active'));
          this.classList.add('active');
          
          panelSections.forEach(section => {
            section.style.display = 'none';
          });
          
          const sectionId = this.getAttribute('data-section') + '-section';
          const targetSection = document.getElementById(sectionId);
          if (targetSection) {
            targetSection.style.display = 'block';
          }
          
          document.getElementById('currentMode').textContent = this.textContent.trim();
      const mobilePanelTitle = document.getElementById('mobile-panel-title');
      if (mobilePanelTitle) {
        mobilePanelTitle.textContent = this.textContent.trim();
      }
    });
  });

      
      
      if (!threeViewerInitialized) {
        const originalHideLoading = ThreeViewer.prototype.hideLoading;
        ThreeViewer.prototype.hideLoading = function() {
          const loadingOverlay = document.getElementById('loadingOverlay');
          if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
          }
          originalHideLoading.call(this);
        };

        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
          loadingOverlay.style.display = 'flex';
        }

        
        window.threeViewer = new ThreeViewer();
        threeViewerInitialized = true;
        
        
        setupMobilePanel();
        
        setTimeout(() => {
          if (window.threeViewer && window.threeViewer.modelEditor) {
            window.threeViewer.modelEditor.loadAvailableTextures();
          }
        }, 1000);

        setInterval(() => {
          if (window.threeViewer && window.threeViewer.modelManager) {
            const stats = window.threeViewer.modelManager.getElementTypeStatistics();
            document.getElementById('buildingCount').textContent = stats.buildings || stats.building || 0;
            document.getElementById('roadCount').textContent = stats.highways || stats.road || stats.roads || 0;
            document.getElementById('waterCount').textContent = stats.water || 0;
            document.getElementById('naturalCount').textContent = stats.natural || 0;
            document.getElementById('landuseCount').textContent = stats.landuse || 0;
            document.getElementById('otherCount').textContent = stats.other || 0;
            document.getElementById('triangleCount').textContent = stats.total || stats.triangleCount || 0;
            document.getElementById('triangleCountStatus').textContent = stats.total || stats.triangleCount || 0;
          }
          
          if (window.threeViewer && window.threeViewer.stats) {
            document.getElementById('fps').textContent = window.threeViewer.stats.fps || 60;
            document.getElementById('fpsStatus').textContent = window.threeViewer.stats.fps || 60;
          }
        }, 1000);

        setupUIEventListeners();
        
        const closeInfoBtn = document.querySelector('.close-info-btn');
        if (closeInfoBtn) {
          closeInfoBtn.addEventListener('click', function() {
            const infoPanel = document.getElementById('elementInfoPanel');
            if (infoPanel) {
              infoPanel.style.display = 'none';
            }
          });
        }
        
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            const infoPanel = document.getElementById('elementInfoPanel');
            if (infoPanel && infoPanel.style.display !== 'none') {
              infoPanel.style.display = 'none';
            }
          }
        });
      } else {
        
      }
    });

    function setupUIEventListeners() {
  if (!window.threeViewer) {
    console.error('ThreeViewer is not initialized!');
    return;
  }
  
  const selectAllTypeBtn = document.getElementById('selectAllType');
  if (selectAllTypeBtn) {
    selectAllTypeBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        const elementType = document.getElementById('elementTypeSelect').value;
        const count = window.threeViewer.modelManager.selectElementsByType(elementType);
        window.threeViewer.showNotification(`Selected ${count} elements of type ${elementType}`);
      }
    });
  }

  const deselectAllBtn = document.getElementById('deselectAll');
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        window.threeViewer.modelManager.deselectAllElements();
        window.threeViewer.showNotification('All elements have been deselected');
      }
    });
  }

  const changeHeightBtn = document.getElementById('changeHeight');
  if (changeHeightBtn) {
    changeHeightBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        const heightInput = document.getElementById('elementHeight');
        const newHeight = parseFloat(heightInput.value);
        if (newHeight > 0) {
          const count = window.threeViewer.modelManager.changeSelectedElementsHeight(newHeight);
          window.threeViewer.showNotification(`Height changed for ${count} elements`);
        } else {
          window.threeViewer.showNotification('Height must be greater than 0', true);
        }
      }
    });
  }

  const changeWidthBtn = document.getElementById('changeWidth');
  if (changeWidthBtn) {
    changeWidthBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        const widthInput = document.getElementById('elementWidth');
        const newWidth = parseFloat(widthInput.value);
        if (newWidth > 0) {
          const count = window.threeViewer.modelManager.changeSelectedElementsWidth(newWidth);
          window.threeViewer.showNotification(`Width changed for ${count} elements`);
        } else {
          window.threeViewer.showNotification('Width must be greater than 0', true);
        }
      }
    });
  }

  const changeColorBtn = document.getElementById('changeColor');
  if (changeColorBtn) {
    changeColorBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        const colorInput = document.getElementById('elementColor');
        const newColor = colorInput.value;
        const count = window.threeViewer.modelManager.changeSelectedElementsColor(newColor);
        window.threeViewer.showNotification(`Color changed for ${count} elements`);
      }
    });
  }

  const applyTextureBtn = document.getElementById('applyTexture');
  if (applyTextureBtn) {
    applyTextureBtn.addEventListener('click', async function() {
      if (window.threeViewer && window.threeViewer.modelManager && window.threeViewer.modelEditor.selectedTexture) {
        const faceType = document.getElementById('textureFace').value;
        try {
          const count = await window.threeViewer.modelManager.applyTextureToSelected(
            window.threeViewer.modelEditor.selectedTexture.url, 
            faceType
          );
          window.threeViewer.showNotification(`Texture applied for ${count} elements`);
        } catch (error) {
          window.threeViewer.showNotification('Error applying texture', true);
        }
      } else {
        window.threeViewer.showNotification('Select a texture first', true);
      }
    });
  }

  const resetChangesBtn = document.getElementById('resetChanges');
  if (resetChangesBtn) {
    resetChangesBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        const count = window.threeViewer.modelManager.resetSelectedElements();
        window.threeViewer.showNotification(`Changes reset for ${count} elements`);
      }
    });
  }

  const reloadTexturesBtn = document.getElementById('reloadTextures');
  if (reloadTexturesBtn) {
    reloadTexturesBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.loadAvailableTextures();
        window.threeViewer.showNotification('Textures reloaded');
      }
    });
  }

  const resetViewBtn = document.getElementById('resetView');
  if (resetViewBtn) {
    resetViewBtn.addEventListener('click', function() {
      if (window.threeViewer) {
        window.threeViewer.resetCameraPosition();
      }
    });
  }

  const toggleGridBtn = document.getElementById('toggleGrid');
  if (toggleGridBtn) {
    toggleGridBtn.addEventListener('click', function() {
      if (window.threeViewer) {
        window.threeViewer.gridHelper.visible = !window.threeViewer.gridHelper.visible;
        window.threeViewer.showNotification(`Grid ${window.threeViewer.gridHelper.visible ? 'enabled' : 'disabled'}`);
      }
    });
  }

  const screenshotBtn = document.getElementById('screenshot');
  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', function() {
      if (window.threeViewer) {
        window.threeViewer.takeScreenshot();
      }
    });
  }

const transformTranslateBtn = document.getElementById('transformTranslate');
if (transformTranslateBtn) {
    transformTranslateBtn.addEventListener('click', function() {
        if (window.threeViewer && window.threeViewer.modelEditor) {
            window.threeViewer.modelEditor.setTransformMode('translate');
            window.threeViewer.showNotification('Translate mode activated - drag axes for movement');
        }
    });
}
const transformRotateBtn = document.getElementById('transformRotate');
if (transformRotateBtn) {
    transformRotateBtn.addEventListener('click', function() {
        if (window.threeViewer && window.threeViewer.modelEditor) {
            window.threeViewer.modelEditor.setTransformMode('rotate');
            window.threeViewer.showNotification('Rotate mode activated - drag circles for rotation');
        }
    });
}

const transformScaleBtn = document.getElementById('transformScale');
if (transformScaleBtn) {
    transformScaleBtn.addEventListener('click', function() {
        if (window.threeViewer && window.threeViewer.modelEditor) {
            window.threeViewer.modelEditor.setTransformMode('scale');
            window.threeViewer.showNotification('Scale mode activated - drag cubes for scaling');
        }
    });
}

  const resetTransformBtn = document.getElementById('resetTransform');
  if (resetTransformBtn) {
    resetTransformBtn.addEventListener('click', function() {
      const selectedElements = window.threeViewer?.modelManager?.getSelectedElements();
      if (selectedElements && selectedElements.length === 1) {
        const element = selectedElements[0];
        if (window.threeViewer.modelEditor.resetElementPosition(element)) {
          window.threeViewer.showNotification('Position reset');
        }
      } else {
        window.threeViewer?.showNotification('Select a single element for reset', true);
      }
    });
  }

  const detachTransformBtn = document.getElementById('detachTransform');
  if (detachTransformBtn) {
    detachTransformBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.deactivateTransformControls();
        window.threeViewer.showNotification('Transform controls deactivated');
      }
    });
  }

  const setPositionBtn = document.getElementById('setPosition');
  if (setPositionBtn) {
    setPositionBtn.addEventListener('click', function() {
      const x = parseFloat(document.getElementById('positionX').value) || 0;
      const y = parseFloat(document.getElementById('positionY').value) || 0;
      const z = parseFloat(document.getElementById('positionZ').value) || 0;
      
      const selectedElements = window.threeViewer?.modelManager?.getSelectedElements();
      if (selectedElements && selectedElements.length > 0) {
        selectedElements.forEach(element => {
          element.position.set(x, y, z);
        });
        window.threeViewer.showNotification(`Position set for ${selectedElements.length} elements`);
      } else {
        window.threeViewer?.showNotification('Select elements first', true);
      }
    });
  }

  const lightIntensitySlider = document.getElementById('lightIntensity');
  const lightValueDisplay = document.getElementById('lightValue');
  if (lightIntensitySlider && lightValueDisplay) {
    lightIntensitySlider.addEventListener('input', function(e) {
      const value = parseFloat(e.target.value);
      lightValueDisplay.textContent = value.toFixed(1);
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.updateLightIntensity(value);
      }
    });
  }

  const showBuildingsCheckbox = document.getElementById('showBuildings');
  if (showBuildingsCheckbox) {
    showBuildingsCheckbox.addEventListener('change', function(e) {
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.toggleElementVisibility('building', e.target.checked);
      }
    });
  }

  const showRoadsCheckbox = document.getElementById('showRoads');
  if (showRoadsCheckbox) {
    showRoadsCheckbox.addEventListener('change', function(e) {
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.toggleElementVisibility('highway', e.target.checked);
      }
    });
  }

  const showWaterCheckbox = document.getElementById('showWater');
  if (showWaterCheckbox) {
    showWaterCheckbox.addEventListener('change', function(e) {
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.toggleElementVisibility('water', e.target.checked);
      }
    });
  }

  const showNaturalCheckbox = document.getElementById('showNatural');
  if (showNaturalCheckbox) {
    showNaturalCheckbox.addEventListener('change', function(e) {
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.toggleElementVisibility('natural', e.target.checked);
      }
    });
  }

  const showLanduseCheckbox = document.getElementById('showLanduse');
  if (showLanduseCheckbox) {
    showLanduseCheckbox.addEventListener('change', function(e) {
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.toggleElementVisibility('landuse', e.target.checked);
      }
    });
  }

  const showOtherCheckbox = document.getElementById('showOther');
  if (showOtherCheckbox) {
    showOtherCheckbox.addEventListener('change', function(e) {
      if (window.threeViewer && window.threeViewer.modelEditor) {
        window.threeViewer.modelEditor.toggleOtherElementsVisibility(e.target.checked);
      }
    });
  }


  
  const startCreationBtn = document.getElementById('startCreationBtn');
  if (startCreationBtn) {
    startCreationBtn.addEventListener('click', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        window.threeViewer.elementCreator.startElementCreation();
      }
    });
  }
  
  const cancelCreationBtn = document.getElementById('cancelCreationBtn');
  if (cancelCreationBtn) {
    cancelCreationBtn.addEventListener('click', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        window.threeViewer.elementCreator.cancelElementCreation();
      }
    });
  }
  
  const rotateLeftBtn = document.getElementById('rotateLeftBtn');
  if (rotateLeftBtn) {
    rotateLeftBtn.addEventListener('click', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        window.threeViewer.elementCreator.rotatePreview(-15);
      }
    });
  }
  
  const rotateRightBtn = document.getElementById('rotateRightBtn');
  if (rotateRightBtn) {
    rotateRightBtn.addEventListener('click', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        window.threeViewer.elementCreator.rotatePreview(15);
      }
    });
  }
  
  const resetRotationBtn = document.getElementById('resetRotationBtn');
  if (resetRotationBtn) {
    resetRotationBtn.addEventListener('click', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        window.threeViewer.elementCreator.resetRotation();
      }
    });
  }
  
  const confirmColorBtn = document.getElementById('confirmColorBtn');
  if (confirmColorBtn) {
    confirmColorBtn.addEventListener('click', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        window.threeViewer.elementCreator.confirmColorSelection();
      }
    });
  }
  
  const importExternalModelBtn = document.getElementById('importExternalModelBtn');
  if (importExternalModelBtn) {
    importExternalModelBtn.addEventListener('click', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        window.threeViewer.elementCreator.openExternalModelImport();
      }
    });
  }
  
  
  const elementShape = document.getElementById('elementShape');
  if (elementShape) {
    elementShape.addEventListener('change', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        if (window.threeViewer.elementCreator.creationMode && window.threeViewer.elementCreator.previewElement) {
          window.threeViewer.elementCreator.updatePreviewElement();
        }
      }
    });
  }
  
  const elementColor = document.getElementById('newElementColor');
  if (elementColor) {
    elementColor.addEventListener('input', (e) => {
      const newColor = e.target.value;
      const currentColorHex = document.getElementById('currentColorHex');
      const colorPreview = document.getElementById('colorPreview');
      
      if (currentColorHex) {
        currentColorHex.textContent = newColor;
      }
      if (colorPreview) {
        colorPreview.style.background = newColor;
      }
    });
  }
  
  const elementRotation = document.getElementById('elementRotation');
  if (elementRotation) {
    elementRotation.addEventListener('input', () => {
      if (window.threeViewer && window.threeViewer.elementCreator) {
        if (window.threeViewer.elementCreator.creationMode && window.threeViewer.elementCreator.previewElement) {
          const rotation = parseFloat(elementRotation.value) || 0;
          window.threeViewer.elementCreator.rotationAngle = THREE.MathUtils.degToRad(rotation);
          window.threeViewer.elementCreator.updatePreviewRotation();
        }
      }
    });
  }

  
  const undoBtn = document.getElementById('undoBtn');
  if (undoBtn) {
    undoBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.historyManager) {
        window.threeViewer.historyManager.undo();
      }
    });
  }

  const redoBtn = document.getElementById('redoBtn');
  if (redoBtn) {
    redoBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.historyManager) {
        window.threeViewer.historyManager.redo();
      }
    });
  }

  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        window.threeViewer.modelManager.copySelectedElements();
      }
    });
  }

  const pasteBtn = document.getElementById('pasteBtn');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        window.threeViewer.modelManager.pasteElements();
      }
    });
  }

  const duplicateBtn = document.getElementById('duplicateBtn');
  if (duplicateBtn) {
    duplicateBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        window.threeViewer.modelManager.duplicateSelectedElements();
      }
    });
  }

  const mergeBtn = document.getElementById('mergeBtn');
  if (mergeBtn) {
    mergeBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager && 
          typeof window.threeViewer.modelManager.mergeSelectedElements === 'function') {
        window.threeViewer.modelManager.mergeSelectedElements();
      } else {
        console.warn('Funcția de unire nu este disponibilă');
        window.threeViewer.showNotification('Funcția de unire nu este disponibilă', true);
      }
    });
  }

  const separateBtn = document.getElementById('separateBtn');
  if (separateBtn) {
    separateBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager && 
          typeof window.threeViewer.modelManager.separateSelectedMergedElements === 'function') {
        window.threeViewer.modelManager.separateSelectedMergedElements();
      } else {
        console.warn('Funcția de separare nu este disponibilă');
        window.threeViewer.showNotification('Funcția de separare nu este disponibilă', true);
      }
    });
  }

  const deleteBtn = document.getElementById('deleteBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function() {
      if (window.threeViewer && window.threeViewer.modelManager) {
        window.threeViewer.modelManager.deleteSelectedElements();
      }
    });
  }
    const multiSelectToggleBtn = document.getElementById('multiSelectToggle');
  if (multiSelectToggleBtn) {
    multiSelectToggleBtn.addEventListener('click', function() {
      if (window.threeViewer) {
        window.threeViewer.toggleMultiSelectMode();
      }
    });
  }
  
}

    function handleResizeTransition() {
      const leftPanel = document.querySelector('.left-panel');
      if (!leftPanel) return;

      leftPanel.classList.add('resizing');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          leftPanel.classList.remove('resizing');
        });
      });
    }

    function setupMobilePanel() {
      const closePanelBtn = document.querySelector('.close-panel-btn');
      const leftPanel = document.querySelector('.left-panel');
      const subMenuButtons = document.querySelectorAll('.sub-menu-btn');
      const mobilePanelTitle = document.getElementById('mobile-panel-title');
      
      if (!leftPanel) return;
      
      const overlay = document.createElement('div');
      overlay.className = 'panel-overlay';
      document.querySelector('.main-content').appendChild(overlay);
      
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
      
      if (closePanelBtn) {
        closePanelBtn.addEventListener('click', closePanel);
      }
      
      overlay.addEventListener('click', closePanel);
      
      subMenuButtons.forEach(button => {
        button.addEventListener('click', function() {
          if (mobilePanelTitle) {
            const sectionText = this.textContent.trim();
            mobilePanelTitle.textContent = sectionText;
          }
          
          if (window.innerWidth <= 1024) {
            openPanel();
          }
        });
      });
      
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && leftPanel.classList.contains('mobile-visible')) {
          closePanel();
        }
      });
      
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



document.addEventListener('DOMContentLoaded', function() {
    
    const newElementColor = document.getElementById('newElementColor');
    if (newElementColor) {
        newElementColor.addEventListener('input', function(e) {
            const color = e.target.value;
            const currentColorHex = document.getElementById('currentColorHex');
            const colorPreview = document.getElementById('colorPreview');
            
            if (currentColorHex) {
                currentColorHex.textContent = color;
            }
            if (colorPreview) {
                colorPreview.style.background = color;
            }
        });
    }
    
    
    const elementRotation = document.getElementById('elementRotation');
    if (elementRotation) {
        elementRotation.addEventListener('input', function() {
            if (window.threeViewer && window.threeViewer.elementCreator) {
                const rotation = parseFloat(elementRotation.value) || 0;
                window.threeViewer.elementCreator.rotationAngle = THREE.MathUtils.degToRad(rotation);
                window.threeViewer.elementCreator.updatePreviewRotation();
            }
        });
    }
    
    
    const elementShape = document.getElementById('elementShape');
    if (elementShape) {
        elementShape.addEventListener('change', function() {
            if (window.threeViewer && window.threeViewer.elementCreator) {
                if (window.threeViewer.elementCreator.creationMode && window.threeViewer.elementCreator.previewElement) {
                    window.threeViewer.elementCreator.updatePreviewElement();
                }
            }
        });
    }
    
    
    const heightInput = document.getElementById('newElementHeight');
    const widthInput = document.getElementById('newElementWidth');
    const depthInput = document.getElementById('newElementDepth');
    
    [heightInput, widthInput, depthInput].forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                if (window.threeViewer && window.threeViewer.elementCreator) {
                    if (window.threeViewer.elementCreator.creationMode && window.threeViewer.elementCreator.previewElement) {
                        window.threeViewer.elementCreator.updatePreviewElement();
                    }
                }
            });
        }
    });
});
 