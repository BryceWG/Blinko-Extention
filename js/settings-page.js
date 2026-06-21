import { loadSettings, resetSettings, fetchAiConfig, defaultSettings } from './settings.js';

// 导入导出配置常量
const IMPORT_EXPORT_CONFIG = {
    MAX_FILE_SIZE: 1024 * 1024, // 1MB
    SUPPORTED_VERSION: "1.0",
    ALLOWED_FILE_TYPE: ".json"
};
import { showStatus, hideStatus } from './ui.js';

let currentLoadedSettings = {};
let debouncedRealtimeSave;
const DEBOUNCE_DELAY = 750;

// 防抖函数
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

let prefersColorSchemeWatcher = null;

// 应用主题
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

// 监听系统主题变化
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

// 生成唯一ID
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 填充提示模板选择器  
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

// 更新提示模板内容
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

// 填充域名规则列表
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

// 实时保存设置
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
            // 特殊处理需要数字类型的字段
            if (settingKey === 'temperature') {
                value = parseFloat(value) || 0.5; // 默认值0.5
            }
            currentLoadedSettings[settingKey] = value;
        }
    });

    chrome.storage.sync.set({ settings: currentLoadedSettings });
}

// 处理设置变更
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

// 初始化设置页面
async function initializeSettingsPage() {
    try {
        currentLoadedSettings = await loadSettings();
        
        // 填充表单
        Object.keys(currentLoadedSettings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = currentLoadedSettings[key];
                    // 更新对应的开关按钮状态
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

        // 处理特殊的单选按钮组
        if (currentLoadedSettings.theme) {
            const themeRadio = document.querySelector(`input[name="theme"][value="${currentLoadedSettings.theme}"]`);
            if (themeRadio) {
                themeRadio.checked = true;
                // 更新三选项滑块
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
                // 更新三选项滑块
                const ballSizeSlider = document.querySelector('[data-slider="floatingBallSize"]');
                if (ballSizeSlider) {
                    updateTripleSliderPosition(ballSizeSlider, currentLoadedSettings.floatingBallSize);
                }
            }
        }

        // 填充模板相关UI
        populatePromptTemplateSelector(currentLoadedSettings);
        populateDomainMappingsList(currentLoadedSettings);
        
        // 应用主题
        applyTheme(currentLoadedSettings.theme || 'system');
        watchSystemTheme();

        // 初始化防抖保存
        debouncedRealtimeSave = debounce(saveSettingsRealtime, DEBOUNCE_DELAY);

        // 绑定事件监听器
        bindEventListeners();

    } catch (error) {
        console.error('初始化设置页面失败:', error);
        showStatus(chrome.i18n.getMessage('settingsLoadError', [error.message]), 'error');
    }
}

// 绑定事件监听器
function bindEventListeners() {
    // 基本输入事件
    const inputs = document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]), textarea, select');
    inputs.forEach(input => {
        if (input.id === 'promptTemplate' || input.id === 'promptTemplateSelector') {
            input.addEventListener('change', handleSettingChange);
            input.addEventListener('input', handleSettingChange);
        } else {
            input.addEventListener('input', handleSettingChange);
        }
    });

    // 复选框和单选按钮
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleSettingChange);
    });

    const radios = document.querySelectorAll('input[type="radio"]');
    radios.forEach(radio => {
        radio.addEventListener('change', handleSettingChange);
    });

    // 开关按钮交互
    const toggleSwitches = document.querySelectorAll('.toggle-switch');
    toggleSwitches.forEach(toggleSwitch => {
        const checkboxId = toggleSwitch.getAttribute('data-checkbox');
        const checkbox = document.getElementById(checkboxId);
        
        if (checkbox) {
            // 初始状态
            updateToggleSwitch(toggleSwitch, checkbox.checked);
            
            // 点击开关切换状态
            toggleSwitch.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                updateToggleSwitch(toggleSwitch, checkbox.checked);
                
                // 触发change事件
                const event = new Event('change');
                checkbox.dispatchEvent(event);
            });
            
            // 监听复选框状态变化
            checkbox.addEventListener('change', () => {
                updateToggleSwitch(toggleSwitch, checkbox.checked);
            });
        }
    });

    // 三选项滑块交互
    const tripleSliders = document.querySelectorAll('.triple-slider');
    tripleSliders.forEach(slider => {
        const sliderType = slider.getAttribute('data-slider');
        const radios = slider.querySelectorAll(`input[name="${sliderType}"]`);
        
        // 初始化滑块位置
        updateTripleSliderPosition(slider, getCurrentRadioValue(radios));
        
        // 点击滑块切换选项
        slider.addEventListener('click', (e) => {
            const rect = slider.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const sliderWidth = rect.width;
            
            let selectedIndex = 0;
            if (clickX > sliderWidth * 2/3) {
                selectedIndex = 2; // 右侧
            } else if (clickX > sliderWidth * 1/3) {
                selectedIndex = 1; // 中间
            } else {
                selectedIndex = 0; // 左侧
            }
            
            // 选中对应的单选按钮
            radios[selectedIndex].checked = true;
            updateTripleSliderPosition(slider, radios[selectedIndex].value);
            
            // 触发change事件
            const event = new Event('change');
            radios[selectedIndex].dispatchEvent(event);
        });
        
        // 监听单选按钮状态变化
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    updateTripleSliderPosition(slider, radio.value);
                }
            });
        });
    });

    // 密码可见性切换
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

    // 获取AI配置按钮
    const fetchAiConfigBtn = document.getElementById('fetchAiConfig');
    if (fetchAiConfigBtn) {
        fetchAiConfigBtn.addEventListener('click', async () => {
            try {
                await fetchAiConfig();
                
                // 更新当前设置并同步到存储
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
                console.error('获取AI配置失败:', error);
            }
        });
    }

    // 重置设置按钮
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
                
                // 重新填充表单
                Object.keys(currentLoadedSettings).forEach(key => {
                    const element = document.getElementById(key);
                    if (element) {
                        if (element.type === 'checkbox') {
                            element.checked = currentLoadedSettings[key];
                            // 更新对应的开关按钮状态
                            const toggleSwitch = document.querySelector(`[data-checkbox="${key}"]`);
                            if (toggleSwitch) {
                                updateToggleSwitch(toggleSwitch, element.checked);
                            }
                        } else if (element.type === 'radio') {
                            if (element.value === currentLoadedSettings[key]) {
                                element.checked = true;
                                // 更新对应的三选项滑块
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

    // 模板管理按钮
    bindTemplateManagementListeners();
    
    // 域名规则管理按钮
    bindDomainRuleManagementListeners();

    // 导入导出功能
    bindImportExportListeners();
}

// 更新开关按钮状态
function updateToggleSwitch(toggleSwitch, checked) {
    if (checked) {
        toggleSwitch.classList.add('checked');
    } else {
        toggleSwitch.classList.remove('checked');
    }
}

// 更新三选项滑块位置
function updateTripleSliderPosition(slider, value) {
    // 移除所有位置类
    slider.classList.remove('position-left', 'position-center', 'position-right');
    
    // 根据滑块类型和值设置位置
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

// 获取当前选中的单选按钮值
function getCurrentRadioValue(radios) {
    for (let radio of radios) {
        if (radio.checked) {
            return radio.value;
        }
    }
    return radios[0]?.value || '';
}

// 绑定模板管理监听器
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

// 绑定域名规则管理监听器
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

// 初始化国际化文本
function initializeI18n() {
    // 处理标题属性（title）
    document.querySelectorAll('[title]').forEach(element => {
        const messageKey = element.getAttribute('title');
        if (messageKey.startsWith('__MSG_') && messageKey.endsWith('__')) {
            const key = messageKey.slice(6, -2);
            element.setAttribute('title', chrome.i18n.getMessage(key));
        }
    });

    // 处理文本内容
    document.querySelectorAll('*').forEach(element => {
        // 创建一个NodeIterator来遍历所有文本节点
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

    // 处理占位符文本（placeholder）
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(element => {
        const placeholderKey = element.getAttribute('placeholder');
        if (placeholderKey.startsWith('__MSG_') && placeholderKey.endsWith('__')) {
            const key = placeholderKey.slice(6, -2);
            element.setAttribute('placeholder', chrome.i18n.getMessage(key));
        }
    });

    // 处理页面标题
    const title = document.title;
    if (title.includes('__MSG_') && title.includes('__')) {
        document.title = title.replace(/__MSG_(\w+)__/g, (match, key) => {
            return chrome.i18n.getMessage(key) || match;
        });
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function() {
    // 首先初始化国际化文本
    initializeI18n();
    
    // 然后初始化设置功能
    await initializeSettingsPage();
});

// 绑定导入导出监听器
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

// 导出设置
async function exportSettings() {
    try {
        showStatus(chrome.i18n.getMessage('exportingSettings'), 'loading');
        
        // 获取当前设置
        const settings = await chrome.storage.sync.get('settings');
        const settingsData = settings.settings || {};
        
        // 创建导出数据对象
        const exportData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            settings: settingsData
        };
        
        // 创建并下载文件
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        
        // 生成更详细的文件名
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T');
        const dateStr = timestamp[0];
        const timeStr = timestamp[1].split('.')[0];
        link.download = `blinko-settings-${dateStr}-${timeStr}.json`;
        
        // 触发下载
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 清理URL对象
        URL.revokeObjectURL(link.href);
        
        showStatus(chrome.i18n.getMessage('exportSuccess'), 'success');
        setTimeout(hideStatus, 2000);
        
    } catch (error) {
        console.error('导出设置失败:', error);
        showStatus(chrome.i18n.getMessage('exportError', [error.message]), 'error');
    }
}

// 处理导入文件
async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // 验证文件类型
        if (!file.name.toLowerCase().endsWith(IMPORT_EXPORT_CONFIG.ALLOWED_FILE_TYPE)) {
            showStatus(chrome.i18n.getMessage('importFileTypeInvalid'), 'error');
            event.target.value = '';
            return;
        }
        
        // 验证文件大小
        if (file.size > IMPORT_EXPORT_CONFIG.MAX_FILE_SIZE) {
            showStatus(chrome.i18n.getMessage('importFileTooLarge'), 'error');
            event.target.value = '';
            return;
        }
        
        showStatus(chrome.i18n.getMessage('importingSettings'), 'loading');
        
        // 读取文件内容
        const fileContent = await readFileAsText(file);
        
        // 解析JSON
        let importData;
        try {
            importData = JSON.parse(fileContent);
        } catch (parseError) {
            throw new Error(chrome.i18n.getMessage('importFileInvalid'));
        }
        
        // 验证数据格式和版本
        if (!importData.settings || typeof importData.settings !== 'object') {
            throw new Error(chrome.i18n.getMessage('importFileInvalid'));
        }
        
        if (importData.version && importData.version !== IMPORT_EXPORT_CONFIG.SUPPORTED_VERSION) {
            if (!window.confirm(chrome.i18n.getMessage('confirmImportDifferentVersion', [importData.version, IMPORT_EXPORT_CONFIG.SUPPORTED_VERSION]))) {
                hideStatus();
                return;
            }
        }
        
        // 确认导入
        if (!window.confirm(chrome.i18n.getMessage('confirmImportSettings'))) {
            hideStatus();
            return;
        }
        
        // 导入设置
        await importSettings(importData.settings);
        
        // 等待一下确保数据保存完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        showStatus(chrome.i18n.getMessage('importSuccess'), 'success');
        setTimeout(() => {
            hideStatus();
            // 重新加载页面以应用新设置
            window.location.reload();
        }, 1500);
        
    } catch (error) {
        console.error('导入设置失败:', error);
        showStatus(chrome.i18n.getMessage('importError', [error.message]), 'error');
    } finally {
        // 清空文件输入
        event.target.value = '';
    }
}

// 读取文件为文本
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error(chrome.i18n.getMessage('errorFileReadFailed') || 'Failed to read file'));
        reader.readAsText(file);
    });
}

// 导入设置
async function importSettings(importedSettings) {
    // 验证和清理导入的设置
    const validatedSettings = validateAndCleanSettings(importedSettings);
    
    // 先清除现有的设置，防止冲突
    await chrome.storage.sync.remove('settings');
    
    // 等待一下确保清除完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 保存到存储
    await chrome.storage.sync.set({ settings: validatedSettings });
    
    // 更新当前加载的设置
    currentLoadedSettings = validatedSettings;
}

// 验证和清理设置数据
function validateAndCleanSettings(settings) {
    // 使用默认设置作为基础，确保所有必需字段都存在
    const cleanedSettings = { ...JSON.parse(JSON.stringify(defaultSettings)), ...settings };
    
    // 特殊验证
    // 确保 promptTemplates 是有效数组
    if (!Array.isArray(cleanedSettings.promptTemplates) || cleanedSettings.promptTemplates.length === 0) {
        cleanedSettings.promptTemplates = JSON.parse(JSON.stringify(defaultSettings.promptTemplates));
        cleanedSettings.activePromptTemplateId = defaultSettings.activePromptTemplateId;
    } else {
        // 确保每个模板都有必需的字段
        cleanedSettings.promptTemplates = cleanedSettings.promptTemplates.map(template => ({
            id: template.id || generateUniqueId(),
            name: template.name || (chrome.i18n.getMessage('unnamedTemplate') || 'Unnamed Template'),
            content: template.content || ''
        }));
        
        // 确保 activePromptTemplateId 有效
        if (!cleanedSettings.promptTemplates.find(t => t.id === cleanedSettings.activePromptTemplateId)) {
            cleanedSettings.activePromptTemplateId = cleanedSettings.promptTemplates[0].id;
        }
    }
    
    // 确保 domainPromptMappings 是有效数组
    if (!Array.isArray(cleanedSettings.domainPromptMappings)) {
        cleanedSettings.domainPromptMappings = [];
    } else {
        // 清理域名映射，确保引用的模板存在
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
    
    // 验证数值类型
    if (typeof cleanedSettings.temperature !== 'number' || cleanedSettings.temperature < 0 || cleanedSettings.temperature > 1) {
        cleanedSettings.temperature = defaultSettings.temperature;
    }
    
    // 验证枚举值
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