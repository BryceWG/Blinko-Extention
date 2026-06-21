import { loadSettings, resetSettings, fetchAiConfig, defaultSettings } from './settings.js';

// Import/export config constants
const IMPORT_EXPORT_CONFIG = {
    MAX_FILE_SIZE: 1024 * 1024, // 1MB
    SUPPORTED_VERSION: "1.0",
    ALLOWED_FILE_TYPE: ".json"
};
import { showStatus, hideStatus } from './ui.js';

let currentLoadedSettings = {};
let debouncedRealtimeSave;
const DEBOUNCE_DELAY = 750;

// Debounce function
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

let prefersColorSchemeWatcher = null;

// Apply theme
function applyTheme(theme) {
    document.body.classList.remove('dark-theme', 'light-theme');
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    
    if (theme === 'system') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.add('light-theme');
        }
    } else if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.add('light-theme');
    }

    themeRadios.forEach(radio => {
        radio.checked = radio.value === theme;
    });
}

// Watch system theme changes
function watchSystemTheme() {
    if (prefersColorSchemeWatcher) {
        prefersColorSchemeWatcher.removeEventListener('change', handleSystemThemeChange);
    }
    
    if (window.matchMedia) {
        prefersColorSchemeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
        prefersColorSchemeWatcher.addEventListener('change', handleSystemThemeChange);
    }
}

function handleSystemThemeChange() {
    if (currentLoadedSettings.theme === 'system') {
        applyTheme('system');
    }
}

// Generate unique ID
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Populate prompt template selector
function populatePromptTemplateSelector(settings) {
    const selector = document.getElementById('promptTemplateSelector');
    if (!selector) return;

    selector.innerHTML = '';
    
    if (settings.promptTemplates && settings.promptTemplates.length > 0) {
        settings.promptTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            if (template.id === settings.activePromptTemplateId) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
    }

    updatePromptTemplateContent(settings);
}

// Update prompt template content
function updatePromptTemplateContent(settings) {
    const selector = document.getElementById('promptTemplateSelector');
    const textarea = document.getElementById('promptTemplate');
    
    if (!selector || !textarea) return;

    const selectedTemplateId = selector.value;
    const selectedTemplate = settings.promptTemplates?.find(t => t.id === selectedTemplateId);
    
    if (selectedTemplate) {
        textarea.value = selectedTemplate.content || '';
    }
}

// Populate domain rules list
function populateDomainMappingsList(settings) {
    const container = document.getElementById('domainMappingsListContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!settings.domainPromptMappings || settings.domainPromptMappings.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.textContent = chrome.i18n.getMessage('noDomainRulesMessage');
        emptyMessage.style.color = '#999';
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.padding = '8px';
        container.appendChild(emptyMessage);
        return;
    }

    settings.domainPromptMappings.forEach(mapping => {
        const mappingDiv = document.createElement('div');
        mappingDiv.style.cssText = `
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 8px 12px; 
            margin-bottom: 6px; 
            border: 1px solid var(--domain-rule-item-border); 
            border-radius: 6px; 
            background-color: var(--attachment-item-bg);
        `;

        const infoDiv = document.createElement('div');
        infoDiv.style.flex = '1';
        
        const domainSpan = document.createElement('div');
        domainSpan.textContent = mapping.domainPattern;
        domainSpan.style.fontWeight = 'bold';
        domainSpan.style.marginBottom = '2px';
        domainSpan.style.color = 'var(--text-color-primary)';
        
        const templateSpan = document.createElement('div');
        const templateName = settings.promptTemplates?.find(t => t.id === mapping.templateId)?.name || 'Unknown Template';
        templateSpan.textContent = chrome.i18n.getMessage('domainRuleMappingInfo', templateName);
        templateSpan.style.fontSize = '12px';
        templateSpan.style.color = 'var(--text-color-tertiary)';
        
        infoDiv.appendChild(domainSpan);
        infoDiv.appendChild(templateSpan);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.title = chrome.i18n.getMessage('deleteDomainRuleButtonTooltip');
        deleteBtn.classList.add('fetch-button', 'secondary');
        deleteBtn.style.cssText = 'padding: 4px 8px; min-width: auto; line-height: 1;';

        deleteBtn.addEventListener('click', () => {
            if (window.confirm(chrome.i18n.getMessage('confirmDeleteDomainRule', mapping.domainPattern))) {
                currentLoadedSettings.domainPromptMappings = currentLoadedSettings.domainPromptMappings.filter(m => m.id !== mapping.id);
                populateDomainMappingsList(currentLoadedSettings);
                chrome.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                    showStatus(chrome.i18n.getMessage('domainRuleDeletedSuccess', mapping.domainPattern), 'success');
                    setTimeout(hideStatus, 2000);
                }).catch(err => {
                    showStatus(chrome.i18n.getMessage('errorSavingDomainRule', err.message), 'error');
                });
            }
        });

        mappingDiv.appendChild(infoDiv);
        mappingDiv.appendChild(deleteBtn);
        container.appendChild(mappingDiv);
    });
}

// Real-time save settings
function saveSettingsRealtime() {
    if (!currentLoadedSettings || Object.keys(currentLoadedSettings).length === 0) return;

    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        let value;
        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.type === 'radio') {
            if (input.checked) {
                value = input.value;
            } else {
                return;
            }
        } else {
            value = input.value;
        }

        const settingKey = input.id;
        if (settingKey && currentLoadedSettings.hasOwnProperty(settingKey)) {
            // Special handling for fields requiring numeric type
            if (settingKey === 'temperature') {
                value = parseFloat(value) || 0.5; // Default value 0.5
            }
            currentLoadedSettings[settingKey] = value;
        }
    });

    chrome.storage.sync.set({ settings: currentLoadedSettings });
}

// Handle setting change
function handleSettingChange(event) {
    const input = event.target;
    
    if (input.id === 'promptTemplateSelector') {
        const selectedTemplateId = input.value;
        currentLoadedSettings.activePromptTemplateId = selectedTemplateId;
        updatePromptTemplateContent(currentLoadedSettings);
        chrome.storage.sync.set({ settings: currentLoadedSettings });
        return;
    }

    if (input.id === 'promptTemplate') {
        const selectedTemplateId = document.getElementById('promptTemplateSelector').value;
        const template = currentLoadedSettings.promptTemplates?.find(t => t.id === selectedTemplateId);
        if (template) {
            template.content = input.value;
            chrome.storage.sync.set({ settings: currentLoadedSettings });
        }
        return;
    }

    if (input.name === 'theme') {
        currentLoadedSettings.theme = input.value;
        applyTheme(input.value);
        chrome.storage.sync.set({ settings: currentLoadedSettings });
        return;
    }

    if (input.name === 'floatingBallSize') {
        currentLoadedSettings.floatingBallSize = input.value;
        chrome.storage.sync.set({ settings: currentLoadedSettings });
        return;
    }

    debouncedRealtimeSave();
}

// Initialize settings page
async function initializeSettingsPage() {
    try {
        currentLoadedSettings = await loadSettings();
        
        // Populate form
        Object.keys(currentLoadedSettings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = currentLoadedSettings[key];
                    // Update corresponding toggle switch state
                    const toggleSwitch = document.querySelector(`[data-checkbox="${key}"]`);
                    if (toggleSwitch) {
                        updateToggleSwitch(toggleSwitch, element.checked);
                    }
                } else if (element.type === 'radio') {
                    if (element.value === currentLoadedSettings[key]) {
                        element.checked = true;
                    }
                } else {
                    element.value = currentLoadedSettings[key] || '';
                }
            }
        });

        // Handle special radio button groups
        if (currentLoadedSettings.theme) {
            const themeRadio = document.querySelector(`input[name="theme"][value="${currentLoadedSettings.theme}"]`);
            if (themeRadio) {
                themeRadio.checked = true;
                // Update triple-option slider
                const themeSlider = document.querySelector('[data-slider="theme"]');
                if (themeSlider) {
                    updateTripleSliderPosition(themeSlider, currentLoadedSettings.theme);
                }
            }
        }

        if (currentLoadedSettings.floatingBallSize) {
            const ballSizeRadio = document.querySelector(`input[name="floatingBallSize"][value="${currentLoadedSettings.floatingBallSize}"]`);
            if (ballSizeRadio) {
                ballSizeRadio.checked = true;
                // Update triple-option slider
                const ballSizeSlider = document.querySelector('[data-slider="floatingBallSize"]');
                if (ballSizeSlider) {
                    updateTripleSliderPosition(ballSizeSlider, currentLoadedSettings.floatingBallSize);
                }
            }
        }

        // Populate template-related UI
        populatePromptTemplateSelector(currentLoadedSettings);
        populateDomainMappingsList(currentLoadedSettings);
        
        // Apply theme
        applyTheme(currentLoadedSettings.theme || 'system');
        watchSystemTheme();

        // Initialize debounced save
        debouncedRealtimeSave = debounce(saveSettingsRealtime, DEBOUNCE_DELAY);

        // Bind event listeners
        bindEventListeners();

    } catch (error) {
        console.error('Failed to initialize settings page:', error);
        showStatus(chrome.i18n.getMessage('settingsLoadError', [error.message]), 'error');
    }
}

// Bind event listeners
function bindEventListeners() {
    // Basic input events
    const inputs = document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]), textarea, select');
    inputs.forEach(input => {
        if (input.id === 'promptTemplate' || input.id === 'promptTemplateSelector') {
            input.addEventListener('change', handleSettingChange);
            input.addEventListener('input', handleSettingChange);
        } else {
            input.addEventListener('input', handleSettingChange);
        }
    });

    // Checkboxes and radio buttons
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleSettingChange);
    });

    const radios = document.querySelectorAll('input[type="radio"]');
    radios.forEach(radio => {
        radio.addEventListener('change', handleSettingChange);
    });

    // Toggle switch interactions
    const toggleSwitches = document.querySelectorAll('.toggle-switch');
    toggleSwitches.forEach(toggleSwitch => {
        const checkboxId = toggleSwitch.getAttribute('data-checkbox');
        const checkbox = document.getElementById(checkboxId);
        
        if (checkbox) {
            // Initial state
            updateToggleSwitch(toggleSwitch, checkbox.checked);
            
            // Click toggle to switch state
            toggleSwitch.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                updateToggleSwitch(toggleSwitch, checkbox.checked);
                
                // Trigger change event
                const event = new Event('change');
                checkbox.dispatchEvent(event);
            });
            
            // Listen for checkbox state changes
            checkbox.addEventListener('change', () => {
                updateToggleSwitch(toggleSwitch, checkbox.checked);
            });
        }
    });

    // Triple-option slider interactions
    const tripleSliders = document.querySelectorAll('.triple-slider');
    tripleSliders.forEach(slider => {
        const sliderType = slider.getAttribute('data-slider');
        const radios = slider.querySelectorAll(`input[name="${sliderType}"]`);
        
        // Initialize slider position
        updateTripleSliderPosition(slider, getCurrentRadioValue(radios));
        
        // Click slider to switch option
        slider.addEventListener('click', (e) => {
            const rect = slider.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const sliderWidth = rect.width;
            
            let selectedIndex = 0;
            if (clickX > sliderWidth * 2/3) {
                selectedIndex = 2; // Right
            } else if (clickX > sliderWidth * 1/3) {
                selectedIndex = 1; // Center
            } else {
                selectedIndex = 0; // Left
            }
            
            // Select corresponding radio button
            radios[selectedIndex].checked = true;
            updateTripleSliderPosition(slider, radios[selectedIndex].value);
            
            // Trigger change event
            const event = new Event('change');
            radios[selectedIndex].dispatchEvent(event);
        });
        
        // Listen for radio button state changes
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    updateTripleSliderPosition(slider, radio.value);
                }
            });
        });
    });

    // Password visibility toggle
    const toggleButtons = document.querySelectorAll('.toggle-visibility');
    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const input = button.previousElementSibling;
            if (input && input.classList.contains('sensitive-input')) {
                if (input.type === 'password') {
                    input.type = 'text';
                    button.textContent = '🙈';
                } else {
                    input.type = 'password';
                    button.textContent = '👁️';
                }
            }
        });
    });

    // Fetch AI config button
    const fetchAiConfigBtn = document.getElementById('fetchAiConfig');
    if (fetchAiConfigBtn) {
        fetchAiConfigBtn.addEventListener('click', async () => {
            try {
                await fetchAiConfig();
                
                // Update current settings and sync to storage
                const modelUrlInput = document.getElementById('modelUrl');
                const apiKeyInput = document.getElementById('apiKey');
                const modelNameInput = document.getElementById('modelName');

                if (modelUrlInput && apiKeyInput && modelNameInput) {
                    currentLoadedSettings.modelUrl = modelUrlInput.value;
                    currentLoadedSettings.apiKey = apiKeyInput.value;
                    currentLoadedSettings.modelName = modelNameInput.value;
                    
                    chrome.storage.sync.set({ settings: currentLoadedSettings });
                }
            } catch (error) {
                console.error('Failed to fetch AI config:', error);
            }
        });
    }

    // Reset settings button
    const resetBtn = document.getElementById('resetSettings');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            try {
                await resetSettings();
                currentLoadedSettings = await loadSettings();
                populatePromptTemplateSelector(currentLoadedSettings);
                populateDomainMappingsList(currentLoadedSettings);
                applyTheme(currentLoadedSettings.theme || 'system');
                showStatus(chrome.i18n.getMessage('settingsReset'), 'success');
                setTimeout(hideStatus, 2000);
                
                // Repopulate form
                Object.keys(currentLoadedSettings).forEach(key => {
                    const element = document.getElementById(key);
                    if (element) {
                        if (element.type === 'checkbox') {
                            element.checked = currentLoadedSettings[key];
                            // Update corresponding toggle switch state
                            const toggleSwitch = document.querySelector(`[data-checkbox="${key}"]`);
                            if (toggleSwitch) {
                                updateToggleSwitch(toggleSwitch, element.checked);
                            }
                        } else if (element.type === 'radio') {
                            if (element.value === currentLoadedSettings[key]) {
                                element.checked = true;
                                // Update corresponding triple-option slider
                                const sliderType = element.getAttribute('name');
                                const slider = document.querySelector(`[data-slider="${sliderType}"]`);
                                if (slider) {
                                    updateTripleSliderPosition(slider, element.value);
                                }
                            }
                        } else {
                            element.value = currentLoadedSettings[key] || '';
                        }
                    }
                });
            } catch (error) {
                showStatus(chrome.i18n.getMessage('settingsResetError', [error.message]), 'error');
            }
        });
    }

    // Template management buttons
    bindTemplateManagementListeners();
    
    // Domain rule management buttons
    bindDomainRuleManagementListeners();

    // Import/export functionality
    bindImportExportListeners();
}

// Update toggle switch state
function updateToggleSwitch(toggleSwitch, checked) {
    if (checked) {
        toggleSwitch.classList.add('checked');
    } else {
        toggleSwitch.classList.remove('checked');
    }
}

// Update triple-option slider position
function updateTripleSliderPosition(slider, value) {
    // Remove all position classes
    slider.classList.remove('position-left', 'position-center', 'position-right');
    
    // Set position based on slider type and value
    const sliderType = slider.getAttribute('data-slider');
    
    if (sliderType === 'floatingBallSize') {
        switch (value) {
            case 'small':
                slider.classList.add('position-left');
                break;
            case 'medium':
                slider.classList.add('position-center');
                break;
            case 'large':
                slider.classList.add('position-right');
                break;
        }
    } else if (sliderType === 'theme') {
        switch (value) {
            case 'light':
                slider.classList.add('position-left');
                break;
            case 'dark':
                slider.classList.add('position-center');
                break;
            case 'system':
                slider.classList.add('position-right');
                break;
        }
    }
}

// Get currently selected radio button value
function getCurrentRadioValue(radios) {
    for (let radio of radios) {
        if (radio.checked) {
            return radio.value;
        }
    }
    return radios[0]?.value || '';
}

// Bind template management listeners
function bindTemplateManagementListeners() {
    const addTemplateBtn = document.getElementById('addPromptTemplateBtn');
    const deleteTemplateBtn = document.getElementById('deletePromptTemplateBtn');
    const templateSelector = document.getElementById('promptTemplateSelector');

    if (addTemplateBtn) {
        addTemplateBtn.addEventListener('click', () => {
            const templateName = window.prompt(chrome.i18n.getMessage('promptForTemplateName'));
            if (templateName === null) return;
            if (!templateName.trim()) {
                window.alert(chrome.i18n.getMessage('errorTemplateNameEmpty'));
                return;
            }

            const newTemplate = {
                id: generateUniqueId(),
                name: templateName.trim(),
                content: ''
            };

            if (!currentLoadedSettings.promptTemplates) {
                currentLoadedSettings.promptTemplates = [];
            }
            currentLoadedSettings.promptTemplates.push(newTemplate);
            currentLoadedSettings.activePromptTemplateId = newTemplate.id;

            populatePromptTemplateSelector(currentLoadedSettings);
            chrome.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                showStatus(chrome.i18n.getMessage('templateAddedSuccess', newTemplate.name), 'success');
                setTimeout(hideStatus, 2000);
            }).catch(err => {
                showStatus(chrome.i18n.getMessage('templateAddError', err.message), 'error');
            });
        });
    }

    if (deleteTemplateBtn) {
        deleteTemplateBtn.addEventListener('click', () => {
            if (!currentLoadedSettings.promptTemplates || currentLoadedSettings.promptTemplates.length <= 1) {
                window.alert(chrome.i18n.getMessage('errorMinOneTemplate'));
                return;
            }

            const selectedOption = templateSelector.options[templateSelector.selectedIndex];
            const templateIdToDelete = selectedOption.value;
            const templateNameToDelete = selectedOption.textContent;

            if (window.confirm(chrome.i18n.getMessage('confirmDeleteTemplate', templateNameToDelete))) {
                currentLoadedSettings.promptTemplates = currentLoadedSettings.promptTemplates.filter(t => t.id !== templateIdToDelete);
                
                if (currentLoadedSettings.activePromptTemplateId === templateIdToDelete) {
                    currentLoadedSettings.activePromptTemplateId = currentLoadedSettings.promptTemplates[0]?.id;
                }

                populatePromptTemplateSelector(currentLoadedSettings);
                chrome.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                    showStatus(chrome.i18n.getMessage('templateDeleteSuccess', templateNameToDelete), 'success');
                    setTimeout(hideStatus, 2000);
                }).catch(err => {
                    showStatus(chrome.i18n.getMessage('templateDeleteError', err.message), 'error');
                });
            }
        });
    }
}

// Bind domain rule management listeners
function bindDomainRuleManagementListeners() {
    const addDomainRuleBtn = document.getElementById('addDomainRuleBtn');
    const addDomainRuleFormContainer = document.getElementById('addDomainRuleFormContainer');
    const newDomainPatternInput = document.getElementById('newDomainPatternInput'); 
    const domainRuleTemplateSelector = document.getElementById('domainRuleTemplateSelector');
    const saveDomainRuleBtn = document.getElementById('saveDomainRuleBtn');
    const cancelDomainRuleBtn = document.getElementById('cancelDomainRuleBtn');

    if (addDomainRuleBtn) {
        addDomainRuleBtn.addEventListener('click', () => {
            newDomainPatternInput.value = '';
            domainRuleTemplateSelector.innerHTML = '';
            
            if (currentLoadedSettings.promptTemplates && currentLoadedSettings.promptTemplates.length > 0) {
                currentLoadedSettings.promptTemplates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.id;
                    option.textContent = template.name;
                    domainRuleTemplateSelector.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = chrome.i18n.getMessage('errorNoTemplatesAvailableForDomainRule');
                option.disabled = true;
                domainRuleTemplateSelector.appendChild(option);
            }
            
            addDomainRuleFormContainer.style.display = 'block';
            addDomainRuleBtn.style.display = 'none';
        });
    }

    if (cancelDomainRuleBtn) {
        cancelDomainRuleBtn.addEventListener('click', () => {
            addDomainRuleFormContainer.style.display = 'none';
            if (addDomainRuleBtn) addDomainRuleBtn.style.display = 'inline-block';
        });
    }

    if (saveDomainRuleBtn) {
        saveDomainRuleBtn.addEventListener('click', () => {
            const domainPattern = newDomainPatternInput.value.trim();
            const templateId = domainRuleTemplateSelector.value;

            if (!domainPattern) {
                window.alert(chrome.i18n.getMessage('errorDomainPatternEmpty'));
                newDomainPatternInput.focus();
                return;
            }
            
            if (!templateId || (domainRuleTemplateSelector.options[domainRuleTemplateSelector.selectedIndex] && domainRuleTemplateSelector.options[domainRuleTemplateSelector.selectedIndex].disabled)) {
                window.alert(chrome.i18n.getMessage('errorTemplateNotSelected'));
                return;
            }

            const newRule = {
                id: generateUniqueId(),
                domainPattern: domainPattern,
                templateId: templateId
            };

            if (!currentLoadedSettings.domainPromptMappings) {
                currentLoadedSettings.domainPromptMappings = [];
            }
            currentLoadedSettings.domainPromptMappings.push(newRule);

            populateDomainMappingsList(currentLoadedSettings);
            chrome.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                showStatus(chrome.i18n.getMessage('domainRuleSavedSuccess', domainPattern), 'success');
                setTimeout(hideStatus, 2000);
                addDomainRuleFormContainer.style.display = 'none';
                if (addDomainRuleBtn) addDomainRuleBtn.style.display = 'inline-block';
            }).catch(err => {
                showStatus(chrome.i18n.getMessage('errorSavingDomainRule', err.message), 'error');
            });
        });
    }
}

// Initialize i18n text
function initializeI18n() {
    // Handle title attributes
    document.querySelectorAll('[title]').forEach(element => {
        const messageKey = element.getAttribute('title');
        if (messageKey.startsWith('__MSG_') && messageKey.endsWith('__')) {
            const key = messageKey.slice(6, -2);
            element.setAttribute('title', chrome.i18n.getMessage(key));
        }
    });

    // Handle text content
    document.querySelectorAll('*').forEach(element => {
        // Create a NodeIterator to traverse all text nodes
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            const originalText = textNode.textContent;
            if (originalText.includes('__MSG_') && originalText.includes('__')) {
                const translatedText = originalText.replace(/__MSG_(\w+)__/g, (match, key) => {
                    return chrome.i18n.getMessage(key) || match;
                });
                textNode.textContent = translatedText;
            }
        });
    });

    // Handle placeholder text
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(element => {
        const placeholderKey = element.getAttribute('placeholder');
        if (placeholderKey.startsWith('__MSG_') && placeholderKey.endsWith('__')) {
            const key = placeholderKey.slice(6, -2);
            element.setAttribute('placeholder', chrome.i18n.getMessage(key));
        }
    });

    // Handle page title
    const title = document.title;
    if (title.includes('__MSG_') && title.includes('__')) {
        document.title = title.replace(/__MSG_(\w+)__/g, (match, key) => {
            return chrome.i18n.getMessage(key) || match;
        });
    }
}

// Initialize after page load
document.addEventListener('DOMContentLoaded', async function() {
    // First initialize i18n text
    initializeI18n();
    
    // Then initialize settings functionality
    await initializeSettingsPage();
});

// Bind import/export listeners
function bindImportExportListeners() {
    const exportBtn = document.getElementById('exportSettings');
    const importBtn = document.getElementById('importSettings');
    const importFileInput = document.getElementById('importFileInput');

    if (exportBtn) {
        exportBtn.addEventListener('click', exportSettings);
    }

    if (importBtn) {
        importBtn.addEventListener('click', () => {
            importFileInput.click();
        });
    }

    if (importFileInput) {
        importFileInput.addEventListener('change', handleImportFile);
    }
}

// Export settings
async function exportSettings() {
    try {
        showStatus(chrome.i18n.getMessage('exportingSettings'), 'loading');
        
        // Get current settings
        const settings = await chrome.storage.sync.get('settings');
        const settingsData = settings.settings || {};
        
        // Create export data object
        const exportData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            settings: settingsData
        };
        
        // Create and download file
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        
        // Generate more detailed file name
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T');
        const dateStr = timestamp[0];
        const timeStr = timestamp[1].split('.')[0];
        link.download = `blinko-settings-${dateStr}-${timeStr}.json`;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up URL object
        URL.revokeObjectURL(link.href);
        
        showStatus(chrome.i18n.getMessage('exportSuccess'), 'success');
        setTimeout(hideStatus, 2000);
        
    } catch (error) {
        console.error('Failed to export settings:', error);
        showStatus(chrome.i18n.getMessage('exportError', [error.message]), 'error');
    }
}

// Handle import file
async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // Validate file type
        if (!file.name.toLowerCase().endsWith(IMPORT_EXPORT_CONFIG.ALLOWED_FILE_TYPE)) {
            showStatus(chrome.i18n.getMessage('importFileTypeInvalid'), 'error');
            event.target.value = '';
            return;
        }
        
        // Validate file size
        if (file.size > IMPORT_EXPORT_CONFIG.MAX_FILE_SIZE) {
            showStatus(chrome.i18n.getMessage('importFileTooLarge'), 'error');
            event.target.value = '';
            return;
        }
        
        showStatus(chrome.i18n.getMessage('importingSettings'), 'loading');
        
        // Read file content
        const fileContent = await readFileAsText(file);
        
        // Parse JSON
        let importData;
        try {
            importData = JSON.parse(fileContent);
        } catch (parseError) {
            throw new Error(chrome.i18n.getMessage('importFileInvalid'));
        }
        
        // Validate data format and version
        if (!importData.settings || typeof importData.settings !== 'object') {
            throw new Error(chrome.i18n.getMessage('importFileInvalid'));
        }
        
        if (importData.version && importData.version !== IMPORT_EXPORT_CONFIG.SUPPORTED_VERSION) {
            if (!window.confirm(chrome.i18n.getMessage('confirmImportDifferentVersion', [importData.version, IMPORT_EXPORT_CONFIG.SUPPORTED_VERSION]))) {
                hideStatus();
                return;
            }
        }
        
        // Confirm import
        if (!window.confirm(chrome.i18n.getMessage('confirmImportSettings'))) {
            hideStatus();
            return;
        }
        
        // Import settings
        await importSettings(importData.settings);
        
        // Wait briefly to ensure data is saved
        await new Promise(resolve => setTimeout(resolve, 500));
        
        showStatus(chrome.i18n.getMessage('importSuccess'), 'success');
        setTimeout(() => {
            hideStatus();
            // Reload page to apply new settings
            window.location.reload();
        }, 1500);
        
    } catch (error) {
        console.error('Failed to import settings:', error);
        showStatus(chrome.i18n.getMessage('importError', [error.message]), 'error');
    } finally {
        // Clear file input
        event.target.value = '';
    }
}

// Read file as text
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error(chrome.i18n.getMessage('errorFileReadFailed') || 'Failed to read file'));
        reader.readAsText(file);
    });
}

// Import settings
async function importSettings(importedSettings) {
    // Validate and clean imported settings
    const validatedSettings = validateAndCleanSettings(importedSettings);
    
    // Clear existing settings first to prevent conflicts
    await chrome.storage.sync.remove('settings');
    
    // Wait briefly to ensure clearing is complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Save to storage
    await chrome.storage.sync.set({ settings: validatedSettings });
    
    // Update currently loaded settings
    currentLoadedSettings = validatedSettings;
}

// Validate and clean settings data
function validateAndCleanSettings(settings) {
    // Use default settings as base to ensure all required fields exist
    const cleanedSettings = { ...JSON.parse(JSON.stringify(defaultSettings)), ...settings };
    
    // Special validation
    // Ensure promptTemplates is a valid array
    if (!Array.isArray(cleanedSettings.promptTemplates) || cleanedSettings.promptTemplates.length === 0) {
        cleanedSettings.promptTemplates = JSON.parse(JSON.stringify(defaultSettings.promptTemplates));
        cleanedSettings.activePromptTemplateId = defaultSettings.activePromptTemplateId;
    } else {
        // Ensure each template has required fields
        cleanedSettings.promptTemplates = cleanedSettings.promptTemplates.map(template => ({
            id: template.id || generateUniqueId(),
            name: template.name || (chrome.i18n.getMessage('unnamedTemplate') || 'Unnamed Template'),
            content: template.content || ''
        }));
        
        // Ensure activePromptTemplateId is valid
        if (!cleanedSettings.promptTemplates.find(t => t.id === cleanedSettings.activePromptTemplateId)) {
            cleanedSettings.activePromptTemplateId = cleanedSettings.promptTemplates[0].id;
        }
    }
    
    // Ensure domainPromptMappings is a valid array
    if (!Array.isArray(cleanedSettings.domainPromptMappings)) {
        cleanedSettings.domainPromptMappings = [];
    } else {
        // Clean domain mappings ensuring referenced templates exist
        cleanedSettings.domainPromptMappings = cleanedSettings.domainPromptMappings.filter(mapping => {
            return mapping.domainPattern && 
                   mapping.templateId && 
                   cleanedSettings.promptTemplates.find(t => t.id === mapping.templateId);
        }).map(mapping => ({
            id: mapping.id || generateUniqueId(),
            domainPattern: mapping.domainPattern,
            templateId: mapping.templateId
        }));
    }
    
    // Validate numeric types
    if (typeof cleanedSettings.temperature !== 'number' || cleanedSettings.temperature < 0 || cleanedSettings.temperature > 1) {
        cleanedSettings.temperature = defaultSettings.temperature;
    }
    
    // Validate enum values
    const validThemes = ['light', 'dark', 'system'];
    if (!validThemes.includes(cleanedSettings.theme)) {
        cleanedSettings.theme = defaultSettings.theme;
    }
    
    const validBallSizes = ['small', 'medium', 'large'];
    if (!validBallSizes.includes(cleanedSettings.floatingBallSize)) {
        cleanedSettings.floatingBallSize = defaultSettings.floatingBallSize;
    }
    
    return cleanedSettings;
}