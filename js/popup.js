import { loadSettings, resetSettings, fetchAiConfig, defaultSettings } from './settings.js';
import { initializeUIListeners, showStatus, hideStatus } from './ui.js';
import { loadQuickNote, initializeQuickNoteListeners } from './quickNote.js';
import { checkSummaryState, initializeSummaryListeners, handleSummaryResponse } from './summary.js';

let currentLoadedSettings = {}; // 用于存储加载的设置，方便在事件监听中修改
let debouncedRealtimeSave;
const DEBOUNCE_DELAY = 750; // ms

// 防抖函数
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

let prefersColorSchemeWatcher = null;

// Function to apply the selected theme
function applyTheme(theme) {
    document.body.classList.remove('dark-theme', 'light-theme'); // Remove any existing theme class
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    let selectedRadioValue = theme;

    if (theme === 'system') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
            selectedRadioValue = 'system'; // Keep it as system for the radio button
        } else {
            document.body.classList.add('light-theme');
            selectedRadioValue = 'system';
        }
    } else if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else { // 'light' or any other fallback
        document.body.classList.add('light-theme');
    }

    // Update radio buttons state
    themeRadios.forEach(radio => {
        if (radio.value === theme) { // Check against the original theme value from settings
            radio.checked = true;
        } else {
            radio.checked = false;
        }
    });
}

// Function to check and apply mobile-specific class
function checkAndApplyMobileView() {
    const mobileRegex = /Mobi|Android|iPhone/i;
    if (mobileRegex.test(navigator.userAgent)) {
        document.body.classList.add('mobile-view');
    }
}

// Handler for system theme changes
function handleSystemThemeChange(event) {
    if (currentLoadedSettings && currentLoadedSettings.theme === 'system') {
        applyTheme('system');
    }
}

async function realtimeSaveSettings() {
    try {
        if (!currentLoadedSettings || Object.keys(currentLoadedSettings).length === 0) {
            console.warn('Attempted to save empty or uninitialized settings. Aborting.');
            return;
        }

        await browser.storage.sync.set({ settings: currentLoadedSettings });
        showStatus(browser.i18n.getMessage('settingsSaved'), 'success');
        setTimeout(hideStatus, 1500); // Shorter duration for auto-save

        // 如果悬浮球设置有变化，通知所有标签页
        if (currentLoadedSettings.hasOwnProperty('enableFloatingBall') || currentLoadedSettings.hasOwnProperty('floatingBallSize')) {
            const tabs = await browser.tabs.query({});
            for (const tab of tabs) {
                try {
                    // 确保 tab.id 是有效的
                    if (tab.id) {
                        if (currentLoadedSettings.hasOwnProperty('enableFloatingBall')) {
                            await browser.tabs.sendMessage(tab.id, {
                                action: 'updateFloatingBallState',
                                enabled: currentLoadedSettings.enableFloatingBall
                            });
                        }
                        if (currentLoadedSettings.hasOwnProperty('floatingBallSize')) {
                            await browser.tabs.sendMessage(tab.id, {
                                action: 'updateFloatingBallSize',
                                size: currentLoadedSettings.floatingBallSize
                            });
                        }
                    }
                } catch (error) {
                    // console.warn('Could not send state/size update to tab:', tab.id, error.message);
                }
            }
        }
    } catch (error) {
        console.error('Error during real-time save:', error);
        showStatus(browser.i18n.getMessage('settingsSaveError', [error.message]), 'error');
    }
}

function handleSettingChange(event) {
    if (!currentLoadedSettings || Object.keys(currentLoadedSettings).length === 0) {
        // console.warn('currentLoadedSettings not ready, skipping update.');
        return;
    }
    const element = event.target;
    const key = element.id;
    const name = element.name;
    let value;

    if (name === 'theme') {
        value = element.value; // 'light', 'dark', or 'system'
        if (currentLoadedSettings.theme !== value) {
            currentLoadedSettings.theme = value;
            applyTheme(value);
        }
    } else if (name === 'floatingBallSize') {
        value = element.value; // 'small', 'medium', or 'large'
        if (currentLoadedSettings.floatingBallSize !== value) {
            currentLoadedSettings.floatingBallSize = value;
        }
    } else if (element.type === 'checkbox') {
        value = element.checked;
        currentLoadedSettings[key] = value;
    } else if (element.type === 'number') {
        const valStr = element.value;
        let numVal = parseFloat(valStr);
        if (valStr.trim() === '' || isNaN(numVal)) {
            if (defaultSettings.hasOwnProperty(key) && typeof defaultSettings[key] === 'number') {
                numVal = defaultSettings[key];
            } else {
                numVal = currentLoadedSettings[key]; // Revert to previous value if default is not applicable
            }
        }
        currentLoadedSettings[key] = numVal;
    } else if (key === 'promptTemplateSelector') {
        value = element.value;
        currentLoadedSettings.activePromptTemplateId = value;
        const activeTemplate = currentLoadedSettings.promptTemplates.find(t => t.id === value);
        const promptTemplateTextarea = document.getElementById('promptTemplate');
        if (activeTemplate && promptTemplateTextarea) {
            promptTemplateTextarea.value = activeTemplate.content;
        }
        // No direct assignment to currentLoadedSettings[key] here, activePromptTemplateId is the primary store
    } else if (key === 'promptTemplate') { // This is the textarea
        value = element.value; // textarea value, no trim for templates
        if (currentLoadedSettings.promptTemplates && currentLoadedSettings.activePromptTemplateId) {
            const activeTemplate = currentLoadedSettings.promptTemplates.find(t => t.id === currentLoadedSettings.activePromptTemplateId);
            if (activeTemplate) {
                activeTemplate.content = value;
            }
        }
    } else { // General text inputs
        value = element.value.trim();
        currentLoadedSettings[key] = value;
    }

    if(debouncedRealtimeSave) {
        debouncedRealtimeSave();
    }
}

// 初始化国际化文本
function initializeI18n() {
    // 替换所有带有 __MSG_ 前缀的文本
    document.querySelectorAll('*').forEach(element => {
        // 处理文本内容
        if (element.childNodes && element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
            const text = element.textContent;
            if (text.includes('__MSG_')) {
                const msgName = text.match(/__MSG_(\w+)__/)[1];
                element.textContent = browser.i18n.getMessage(msgName);
            }
        }
        
        // 处理 placeholder 属性
        if (element.hasAttribute('placeholder')) {
            const placeholder = element.getAttribute('placeholder');
            if (placeholder.includes('__MSG_')) {
                const msgName = placeholder.match(/__MSG_(\w+)__/)[1];
                element.setAttribute('placeholder', browser.i18n.getMessage(msgName));
            }
        }
        
        // 处理 title 属性
        if (element.hasAttribute('title')) {
            const title = element.getAttribute('title');
            if (title.includes('__MSG_')) {
                const msgName = title.match(/__MSG_(\w+)__/)[1];
                element.setAttribute('title', browser.i18n.getMessage(msgName));
            }
        }
    });
}

// 初始化事件监听器

// 函数：填充模板选择器并设置活动模板内容
function populatePromptTemplateSelector(settings) {
    const selector = document.getElementById('promptTemplateSelector');
    const templateContentTextarea = document.getElementById('promptTemplate');
    if (!selector || !templateContentTextarea || !settings || !settings.promptTemplates) return;

    selector.innerHTML = ''; // 清空现有选项

    settings.promptTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        if (template.id === settings.activePromptTemplateId) {
            option.selected = true;
        }
        selector.appendChild(option);
    });

    const activeTemplate = settings.promptTemplates.find(t => t.id === settings.activePromptTemplateId);
    templateContentTextarea.value = activeTemplate ? activeTemplate.content : (settings.promptTemplates.length > 0 ? settings.promptTemplates[0].content : '');
    
    // 控制删除按钮的可用性
    const deleteBtn = document.getElementById('deletePromptTemplateBtn');
    if (deleteBtn) {
        deleteBtn.disabled = settings.promptTemplates.length <= 1;
    }
}

// 函数：填充域名规则列表
function populateDomainMappingsList(settings) {
    const container = document.getElementById('domainMappingsListContainer');
    if (!container || !settings || !settings.domainPromptMappings || !settings.promptTemplates) return;

    container.innerHTML = ''; // 清空现有列表

    if (settings.domainPromptMappings.length === 0) {
        const noRulesMsg = document.createElement('p');
        noRulesMsg.textContent = browser.i18n.getMessage('noDomainRulesDefined');
        noRulesMsg.style.textAlign = 'center';
        noRulesMsg.style.color = '#777';
        container.appendChild(noRulesMsg);
        return;
    }

    const ul = document.createElement('ul');
    ul.style.listStyleType = 'none';
    ul.style.paddingLeft = '0';
    ul.style.margin = '0';

    settings.domainPromptMappings.forEach(mapping => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '6px 0';
        li.style.borderBottom = '1px solid #f0f0f0';

        const template = settings.promptTemplates.find(t => t.id === mapping.templateId);
        const templateName = template ? template.name : '[模板已删除]'; // Handle case where template might be deleted

        const textSpan = document.createElement('span');
        textSpan.textContent = `${mapping.domainPattern} → ${templateName}`;
        textSpan.title = `域名模式: ${mapping.domainPattern}\n指定模板: ${templateName}`;
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.flexGrow = '1';
        textSpan.style.marginRight = '8px';


        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×'; // Simple delete symbol
        deleteBtn.title = browser.i18n.getMessage('deleteDomainRuleButtonTooltip');
        deleteBtn.classList.add('fetch-button', 'secondary'); // Re-use existing styles
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.minWidth = 'auto';
        deleteBtn.style.lineHeight = '1';


        deleteBtn.addEventListener('click', () => {
            if (window.confirm(browser.i18n.getMessage('confirmDeleteDomainRule', mapping.domainPattern))) {
                currentLoadedSettings.domainPromptMappings = currentLoadedSettings.domainPromptMappings.filter(m => m.id !== mapping.id);
                populateDomainMappingsList(currentLoadedSettings);
                browser.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                    showStatus(browser.i18n.getMessage('domainRuleDeletedSuccess', mapping.domainPattern), 'success');
                    setTimeout(hideStatus, 2000);
                }).catch(err => {
                    showStatus(browser.i18n.getMessage('errorSavingDomainRule', err.message), 'error');
                });
            }
        });

        li.appendChild(textSpan);
        li.appendChild(deleteBtn);
        ul.appendChild(li);
    });
    container.appendChild(ul);
}


// 生成唯一ID的简单方法
function generateUniqueId(prefix = 'id_') { // Added prefix option
    return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Apply mobile view adjustments first
        checkAndApplyMobileView();

        // 初始化国际化文本
        initializeI18n();

        // 检查是否是通过通知点击打开的
        const result = await browser.storage.local.get(['notificationClicked', 'notificationTabId', 'quickNote', 'quickNoteAttachments']);
        
        // 加载设置
        currentLoadedSettings = await loadSettings();
        applyTheme(currentLoadedSettings.theme || 'system'); // Apply initial theme
        
        // 设置浮动球的初始状态
        const ballSize = currentLoadedSettings.floatingBallSize || 'medium'; // Default to medium if not set
        const selectedRadio = document.querySelector(`input[name="floatingBallSize"][value="${ballSize}"]`);
        if (selectedRadio) {
            selectedRadio.checked = true;
        }

        populatePromptTemplateSelector(currentLoadedSettings); // 填充模板选择器
        populateDomainMappingsList(currentLoadedSettings); // 填充域名规则列表
        
        // Setup prefers-color-scheme watcher
        if (window.matchMedia) {
            prefersColorSchemeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
            prefersColorSchemeWatcher.addEventListener('change', handleSystemThemeChange);
        }
        
        // 检查总结状态
        await checkSummaryState();
        
        // 加载快捷记录内容
        await loadQuickNote();

        // 决定显示哪个标签页
        let defaultTab = 'common';
        if (result.notificationClicked) {
            // 检查当前标签页是否匹配
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id === result.notificationTabId) {
                // 清除标记
                await browser.storage.local.remove(['notificationClicked', 'notificationTabId']);
                defaultTab = 'quicknote';
            }
        } else if ((result.quickNote && result.quickNote.trim()) || 
                  (result.quickNoteAttachments && result.quickNoteAttachments.length > 0)) {
            // 如果快捷记录有内容或有附件，显示快捷记录标签页
            defaultTab = 'quicknote';
        }

        // 隐藏所有标签页内容
        document.querySelectorAll('.tabcontent').forEach(content => {
            content.style.display = 'none';
        });

        // 移除所有标签的激活状态
        document.querySelectorAll('.tablinks').forEach(btn => {
            btn.classList.remove('active');
        });

        // 显示默认标签页并激活对应的标签
        document.getElementById(defaultTab).style.display = 'block';
        document.querySelector(`.tablinks[data-tab="${defaultTab}"]`).classList.add('active');

        // 初始化所有事件监听器
        initializeUIListeners();
        initializeQuickNoteListeners();
        initializeSummaryListeners();

        debouncedRealtimeSave = debounce(realtimeSaveSettings, DEBOUNCE_DELAY);

        // 绑定设置页面所有相关控件的事件，以实现实时保存
        const settingsContainer = document.getElementById('settings');
        if (settingsContainer) {
            const inputs = settingsContainer.querySelectorAll('input[type="text"], input[type="number"], textarea');
            inputs.forEach(input => {
                input.addEventListener('input', handleSettingChange);
            });

            const checkboxes = settingsContainer.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', handleSettingChange);
            });

            const selects = settingsContainer.querySelectorAll('select');
            selects.forEach(select => {
                select.addEventListener('change', handleSettingChange);
            });

            // Add event listeners for theme radio buttons
            const themeRadios = settingsContainer.querySelectorAll('input[name="theme"]');
            themeRadios.forEach(radio => {
                radio.addEventListener('change', handleSettingChange);
            });

            // Add event listeners for floating ball size radio buttons
            const ballSizeRadios = settingsContainer.querySelectorAll('input[name="floatingBallSize"]');
            ballSizeRadios.forEach(radio => {
                radio.addEventListener('change', handleSettingChange);
            });
        }
 
        // 绑定提取网页正文按钮事件
        document.getElementById('extractContent').addEventListener('click', async () => {
            try {
                showStatus(browser.i18n.getMessage('extractingContent'), 'loading');
                const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
                if (!tab) {
                    throw new Error(browser.i18n.getMessage('cannotGetTab'));
                }

                // 发送消息到content script获取内容
                const response = await browser.tabs.sendMessage(tab.id, {
                    action: 'getContent'
                });

                if (!response || !response.success) {
                    throw new Error(response.error || '获取内容失败');
                }

                // 发送到background处理
                await browser.runtime.sendMessage({
                    action: 'getContent',
                    content: response.content,
                    url: response.url,
                    title: response.title,
                    isExtractOnly: true
                });

            } catch (error) {
                console.error('提取网页内容失败:', error);
                showStatus(browser.i18n.getMessage('settingsSaveError', [error.message]), 'error');
            }
        });

 
        document.getElementById('resetSettings').addEventListener('click', async () => {
            try {
                await resetSettings(); // settings.js 中的 resetSettings 会更新UI并保存到storage
                currentLoadedSettings = await loadSettings(); // 重新加载到内存
                populatePromptTemplateSelector(currentLoadedSettings); // 重新填充选择器
                populateDomainMappingsList(currentLoadedSettings); // 重新填充域名规则列表
                applyTheme(currentLoadedSettings.theme || 'system'); // Apply theme after reset
                showStatus(browser.i18n.getMessage('settingsReset'), 'success');
                setTimeout(hideStatus, 2000);
            } catch (error) {
                showStatus(browser.i18n.getMessage('settingsResetError', [error.message]), 'error');
            }
        });
        
        // 绑定添加和删除模板按钮事件
        const addPromptTemplateBtn = document.getElementById('addPromptTemplateBtn');
        const deletePromptTemplateBtn = document.getElementById('deletePromptTemplateBtn');

        if (addPromptTemplateBtn) {
            addPromptTemplateBtn.addEventListener('click', () => {
                const templateName = window.prompt(browser.i18n.getMessage('promptForTemplateName'));
                if (templateName === null) return; // 用户取消
                if (!templateName.trim()) {
                    window.alert(browser.i18n.getMessage('errorTemplateNameEmpty'));
                    return;
                }

                const newTemplate = {
                    id: generateUniqueId(),
                    name: templateName.trim(),
                    content: '' // 新模板内容默认为空
                };

                currentLoadedSettings.promptTemplates.push(newTemplate);
                currentLoadedSettings.activePromptTemplateId = newTemplate.id;
                populatePromptTemplateSelector(currentLoadedSettings);
                // 更改后立即保存，以便用户不点击主保存按钮也能保留新模板结构
                browser.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                    showStatus(browser.i18n.getMessage('templateAddedSuccess', newTemplate.name), 'success');
                    setTimeout(hideStatus, 2000);
                }).catch(err => {
                    showStatus(browser.i18n.getMessage('templateAddError', err.message), 'error');
                });
            });
        }

        if (deletePromptTemplateBtn) {
            deletePromptTemplateBtn.addEventListener('click', () => {
                if (!currentLoadedSettings.promptTemplates || currentLoadedSettings.promptTemplates.length <= 1) {
                    window.alert(browser.i18n.getMessage('errorMinOneTemplate'));
                    return;
                }

                const selectedOption = promptTemplateSelector.options[promptTemplateSelector.selectedIndex];
                const templateIdToDelete = selectedOption.value;
                const templateNameToDelete = selectedOption.textContent;

                if (window.confirm(browser.i18n.getMessage('confirmDeleteTemplate', templateNameToDelete))) {
                    currentLoadedSettings.promptTemplates = currentLoadedSettings.promptTemplates.filter(t => t.id !== templateIdToDelete);
                    
                    // 如果删除的是当前激活的模板，则选择列表中的第一个作为新的激活模板
                    if (currentLoadedSettings.activePromptTemplateId === templateIdToDelete) {
                        currentLoadedSettings.activePromptTemplateId = currentLoadedSettings.promptTemplates.length > 0 ? currentLoadedSettings.promptTemplates[0].id : null;
                    }
                    
                    populatePromptTemplateSelector(currentLoadedSettings);
                     // 更改后立即保存
                    browser.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                        showStatus(browser.i18n.getMessage('templateDeleteSuccess', templateNameToDelete), 'success');
                         setTimeout(hideStatus, 2000);
                    }).catch(err => {
                        showStatus(browser.i18n.getMessage('templateDeleteError', err.message), 'error');
                    });
                }
            });
        }

        // 绑定获取AI配置按钮事件
        document.getElementById('fetchAiConfig').addEventListener('click', async () => {
            try {
                // 调用 settings.js 中的 fetchAiConfig 来更新UI
                await fetchAiConfig();
                
                // fetchAiConfig 成功后，UI 上的 modelUrl, apiKey, modelName 会被更新
                // 现在我们需要将这些更新同步到 currentLoadedSettings 并触发保存
                if (currentLoadedSettings && Object.keys(currentLoadedSettings).length > 0) {
                    const modelUrlInput = document.getElementById('modelUrl');
                    const apiKeyInput = document.getElementById('apiKey');
                    const modelNameInput = document.getElementById('modelName');

                    if (modelUrlInput) {
                        currentLoadedSettings.modelUrl = modelUrlInput.value.trim();
                    }
                    if (apiKeyInput) {
                        currentLoadedSettings.apiKey = apiKeyInput.value.trim(); // API Key 通常不需要 trim，但保持一致
                    }
                    if (modelNameInput) {
                        currentLoadedSettings.modelName = modelNameInput.value.trim();
                    }

                    if (debouncedRealtimeSave) {
                        debouncedRealtimeSave();
                    }
                }
            } catch (error) {
                // fetchAiConfig 内部已经处理了错误显示，这里可以不用重复显示
                console.error('Error in fetchAiConfig wrapper or subsequent save:', error);
            }
        });

        // 域名特定模板规则管理UI事件
        const addDomainRuleBtn = document.getElementById('addDomainRuleBtn');
        const addDomainRuleFormContainer = document.getElementById('addDomainRuleFormContainer');
        const newDomainPatternInput = document.getElementById('newDomainPatternInput');
        const domainRuleTemplateSelector = document.getElementById('domainRuleTemplateSelector');
        const saveDomainRuleBtn = document.getElementById('saveDomainRuleBtn');
        const cancelDomainRuleBtn = document.getElementById('cancelDomainRuleBtn');

        if (addDomainRuleBtn) {
            addDomainRuleBtn.addEventListener('click', () => {
                newDomainPatternInput.value = ''; // 清空输入
                // 填充模板选择器
                domainRuleTemplateSelector.innerHTML = '';
                if (currentLoadedSettings.promptTemplates && currentLoadedSettings.promptTemplates.length > 0) {
                    currentLoadedSettings.promptTemplates.forEach(template => {
                        const option = document.createElement('option');
                        option.value = template.id;
                        option.textContent = template.name;
                        domainRuleTemplateSelector.appendChild(option);
                    });
                    if (domainRuleTemplateSelector.options.length > 0) {
                        domainRuleTemplateSelector.selectedIndex = 0;
                    }
                } else {
                     // 如果没有模板可选，可以禁用或提示
                    const option = document.createElement('option');
                    option.textContent = browser.i18n.getMessage('errorNoTemplatesAvailableForDomainRule');
                    option.disabled = true;
                    domainRuleTemplateSelector.appendChild(option);
                }
                addDomainRuleFormContainer.style.display = 'block';
                addDomainRuleBtn.style.display = 'none'; // 隐藏添加按钮，防止重复打开
            });
        }

        if (cancelDomainRuleBtn) {
            cancelDomainRuleBtn.addEventListener('click', () => {
                addDomainRuleFormContainer.style.display = 'none';
                if(addDomainRuleBtn) addDomainRuleBtn.style.display = 'inline-block'; //恢复添加按钮
            });
        }

        if (saveDomainRuleBtn) {
            saveDomainRuleBtn.addEventListener('click', () => {
                const domainPattern = newDomainPatternInput.value.trim();
                const templateId = domainRuleTemplateSelector.value;

                if (!domainPattern) {
                    window.alert(browser.i18n.getMessage('errorDomainPatternEmpty'));
                    newDomainPatternInput.focus();
                    return;
                }
                if (!templateId || (domainRuleTemplateSelector.options[domainRuleTemplateSelector.selectedIndex] && domainRuleTemplateSelector.options[domainRuleTemplateSelector.selectedIndex].disabled)) {
                    window.alert(browser.i18n.getMessage('errorTemplateNotSelected'));
                    return;
                }

                const newRule = {
                    id: generateUniqueId('dm_'), // 使用前缀区分
                    domainPattern: domainPattern,
                    templateId: templateId
                };

                if (!currentLoadedSettings.domainPromptMappings) {
                    currentLoadedSettings.domainPromptMappings = [];
                }
                currentLoadedSettings.domainPromptMappings.push(newRule);
                
                populateDomainMappingsList(currentLoadedSettings);
                addDomainRuleFormContainer.style.display = 'none';
                if(addDomainRuleBtn) addDomainRuleBtn.style.display = 'inline-block';

                browser.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                    showStatus(browser.i18n.getMessage('domainRuleAddedSuccess', domainPattern), 'success');
                    setTimeout(hideStatus, 2000);
                }).catch(err => {
                    showStatus(browser.i18n.getMessage('errorSavingDomainRule', err.message), 'error');
                     // 如果保存失败，可能需要从 currentLoadedSettings 中移除刚添加的规则
                    currentLoadedSettings.domainPromptMappings.pop();
                    populateDomainMappingsList(currentLoadedSettings);
                });
            });
        }

    } catch (error) {
        console.error('初始化失败:', error);
        showStatus(browser.i18n.getMessage('initializationError', [error.message]), 'error');
    }
});

// 监听来自background的消息
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'handleSummaryResponse') {
        handleSummaryResponse(request);
        sendResponse({ received: true });
    } else if (request && request.action === 'saveSummaryResponse') {
        if (request.response.success) {
            showStatus('保存成功', 'success');
            setTimeout(hideStatus, 2000);
        } else {
            showStatus('保存失败: ' + request.response.error, 'error');
        }
        sendResponse({ received: true });
    } else if (request && request.action === 'floatingBallResponse') {
        if (request.response.success) {
            showStatus(request.response.isExtractOnly ? '提取成功' : '总结成功', 'success');
            setTimeout(hideStatus, 2000);
        } else {
            showStatus((request.response.isExtractOnly ? '提取' : '总结') + '失败: ' + request.response.error, 'error');
        }
        sendResponse({ received: true });
    } else if (request && request.action === 'clearSummaryResponse') {
        if (request.success) {
            showStatus('清除成功', 'success');
            setTimeout(hideStatus, 2000);
        }
        sendResponse({ received: true });
    }
    return false;  // 不保持消息通道开放
});

// 在popup关闭时通知background
window.addEventListener('unload', async () => {
    try {
        // 如果summaryPreview是隐藏的，说明用户已经取消或保存了内容，这时我们需要清理存储
        const summaryPreview = document.getElementById('summaryPreview');
        if (summaryPreview && summaryPreview.style.display === 'none') {
            await browser.storage.local.remove('currentSummary');
        }
        
        browser.runtime.sendMessage({ action: "popupClosed" }).catch(() => {
            // 忽略错误，popup关闭时可能会出现连接错误
        });

        // Clean up prefers-color-scheme watcher
        if (prefersColorSchemeWatcher) {
            prefersColorSchemeWatcher.removeEventListener('change', handleSystemThemeChange);
        }
    } catch (error) {
        // 忽略错误
    }
});