import { loadSettings, saveSettings, resetSettings, fetchAiConfig } from './settings.js';
import { initializeUIListeners, showStatus, hideStatus } from './ui.js';
import { loadQuickNote, initializeQuickNoteListeners } from './quickNote.js';
import { checkSummaryState, initializeSummaryListeners, handleSummaryResponse } from './summary.js';

let currentLoadedSettings = {}; // 用于存储加载的设置，方便在事件监听中修改

// 初始化国际化文本
function initializeI18n() {
    // 替换所有带有 __MSG_ 前缀的文本
    document.querySelectorAll('*').forEach(element => {
        // 处理文本内容
        if (element.childNodes && element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
            const text = element.textContent;
            if (text.includes('__MSG_')) {
                const msgName = text.match(/__MSG_(\w+)__/)[1];
                element.textContent = chrome.i18n.getMessage(msgName);
            }
        }
        
        // 处理 placeholder 属性
        if (element.hasAttribute('placeholder')) {
            const placeholder = element.getAttribute('placeholder');
            if (placeholder.includes('__MSG_')) {
                const msgName = placeholder.match(/__MSG_(\w+)__/)[1];
                element.setAttribute('placeholder', chrome.i18n.getMessage(msgName));
            }
        }
        
        // 处理 title 属性
        if (element.hasAttribute('title')) {
            const title = element.getAttribute('title');
            if (title.includes('__MSG_')) {
                const msgName = title.match(/__MSG_(\w+)__/)[1];
                element.setAttribute('title', chrome.i18n.getMessage(msgName));
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

// 生成唯一ID的简单方法
function generateUniqueId() {
    return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // 初始化国际化文本
        initializeI18n();

        // 检查是否是通过通知点击打开的
        const result = await chrome.storage.local.get(['notificationClicked', 'notificationTabId', 'quickNote', 'quickNoteAttachments']);
        
        // 加载设置
        currentLoadedSettings = await loadSettings();
        populatePromptTemplateSelector(currentLoadedSettings); // 填充选择器
        
        // 检查总结状态
        await checkSummaryState();
        
        // 加载快捷记录内容
        await loadQuickNote();

        // 决定显示哪个标签页
        let defaultTab = 'common';
        if (result.notificationClicked) {
            // 检查当前标签页是否匹配
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id === result.notificationTabId) {
                // 清除标记
                await chrome.storage.local.remove(['notificationClicked', 'notificationTabId']);
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

        // 绑定模板选择器和文本域事件
        const promptTemplateSelector = document.getElementById('promptTemplateSelector');
        const promptTemplateTextarea = document.getElementById('promptTemplate');

        if (promptTemplateSelector) {
            promptTemplateSelector.addEventListener('change', () => {
                const selectedId = promptTemplateSelector.value;
                currentLoadedSettings.activePromptTemplateId = selectedId;
                const activeTemplate = currentLoadedSettings.promptTemplates.find(t => t.id === selectedId);
                if (activeTemplate && promptTemplateTextarea) {
                    promptTemplateTextarea.value = activeTemplate.content;
                }
            });
        }

        if (promptTemplateTextarea) {
            promptTemplateTextarea.addEventListener('input', () => {
                if (currentLoadedSettings && currentLoadedSettings.promptTemplates && currentLoadedSettings.activePromptTemplateId) {
                    const activeTemplate = currentLoadedSettings.promptTemplates.find(t => t.id === currentLoadedSettings.activePromptTemplateId);
                    if (activeTemplate) {
                        activeTemplate.content = promptTemplateTextarea.value;
                    }
                }
            });
        }

        // 绑定提取网页正文按钮事件
        document.getElementById('extractContent').addEventListener('click', async () => {
            try {
                showStatus(chrome.i18n.getMessage('extractingContent'), 'loading');
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) {
                    throw new Error(chrome.i18n.getMessage('cannotGetTab'));
                }

                // 发送消息到content script获取内容
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'getContent'
                });

                if (!response || !response.success) {
                    throw new Error(response.error || '获取内容失败');
                }

                // 发送到background处理
                await chrome.runtime.sendMessage({
                    action: 'getContent',
                    content: response.content,
                    url: response.url,
                    title: response.title,
                    isExtractOnly: true
                });

            } catch (error) {
                console.error('提取网页内容失败:', error);
                showStatus(chrome.i18n.getMessage('settingsSaveError', [error.message]), 'error');
            }
        });

        // 绑定设置相关事件
        document.getElementById('saveSettings').addEventListener('click', async () => {
            try {

                if (currentLoadedSettings && currentLoadedSettings.promptTemplates && currentLoadedSettings.activePromptTemplateId) {
                    const activeTpl = currentLoadedSettings.promptTemplates.find(t => t.id === currentLoadedSettings.activePromptTemplateId);
                    if (activeTpl && document.getElementById('promptTemplate')) {
                        activeTpl.content = document.getElementById('promptTemplate').value;
                    }
                }
                await chrome.storage.sync.set({ settings: currentLoadedSettings }); // 确保内存中的修改写入存储
                await saveSettings(); // settings.js 的 saveSettings 会从存储加载，所以能拿到最新版

                showStatus(chrome.i18n.getMessage('settingsSaved'), 'success');
                setTimeout(hideStatus, 2000);
            } catch (error) {
                showStatus(chrome.i18n.getMessage('settingsSaveError', [error.message]), 'error');
            }
        });

        document.getElementById('resetSettings').addEventListener('click', async () => {
            try {
                await resetSettings(); // settings.js 中的 resetSettings 会更新UI并保存到storage
                currentLoadedSettings = await loadSettings(); // 重新加载到内存
                populatePromptTemplateSelector(currentLoadedSettings); // 重新填充选择器
                showStatus(chrome.i18n.getMessage('settingsReset'), 'success');
                setTimeout(hideStatus, 2000);
            } catch (error) {
                showStatus(chrome.i18n.getMessage('settingsResetError', [error.message]), 'error');
            }
        });
        
        // 绑定添加和删除模板按钮事件
        const addPromptTemplateBtn = document.getElementById('addPromptTemplateBtn');
        const deletePromptTemplateBtn = document.getElementById('deletePromptTemplateBtn');

        if (addPromptTemplateBtn) {
            addPromptTemplateBtn.addEventListener('click', () => {
                const templateName = window.prompt(chrome.i18n.getMessage('promptForTemplateName'));
                if (templateName === null) return; // 用户取消
                if (!templateName.trim()) {
                    window.alert(chrome.i18n.getMessage('errorTemplateNameEmpty'));
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
                chrome.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                    showStatus(chrome.i18n.getMessage('templateAddedSuccess', newTemplate.name), 'success');
                    setTimeout(hideStatus, 2000);
                }).catch(err => {
                    showStatus(chrome.i18n.getMessage('templateAddError', err.message), 'error');
                });
            });
        }

        if (deletePromptTemplateBtn) {
            deletePromptTemplateBtn.addEventListener('click', () => {
                if (!currentLoadedSettings.promptTemplates || currentLoadedSettings.promptTemplates.length <= 1) {
                    window.alert(chrome.i18n.getMessage('errorMinOneTemplate'));
                    return;
                }

                const selectedOption = promptTemplateSelector.options[promptTemplateSelector.selectedIndex];
                const templateIdToDelete = selectedOption.value;
                const templateNameToDelete = selectedOption.textContent;

                if (window.confirm(chrome.i18n.getMessage('confirmDeleteTemplate', templateNameToDelete))) {
                    currentLoadedSettings.promptTemplates = currentLoadedSettings.promptTemplates.filter(t => t.id !== templateIdToDelete);
                    
                    // 如果删除的是当前激活的模板，则选择列表中的第一个作为新的激活模板
                    if (currentLoadedSettings.activePromptTemplateId === templateIdToDelete) {
                        currentLoadedSettings.activePromptTemplateId = currentLoadedSettings.promptTemplates.length > 0 ? currentLoadedSettings.promptTemplates[0].id : null;
                    }
                    
                    populatePromptTemplateSelector(currentLoadedSettings);
                     // 更改后立即保存
                    chrome.storage.sync.set({ settings: currentLoadedSettings }).then(() => {
                        showStatus(chrome.i18n.getMessage('templateDeleteSuccess', templateNameToDelete), 'success');
                         setTimeout(hideStatus, 2000);
                    }).catch(err => {
                        showStatus(chrome.i18n.getMessage('templateDeleteError', err.message), 'error');
                    });
                }
            });
        }

        // 绑定获取AI配置按钮事件
        document.getElementById('fetchAiConfig').addEventListener('click', fetchAiConfig);

    } catch (error) {
        console.error('初始化失败:', error);
        showStatus(chrome.i18n.getMessage('initializationError', [error.message]), 'error');
    }
});

// 监听来自background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
            await chrome.storage.local.remove('currentSummary');
        }
        
        chrome.runtime.sendMessage({ action: "popupClosed" }).catch(() => {
            // 忽略错误，popup关闭时可能会出现连接错误
        });
    } catch (error) {
        // 忽略错误
    }
}); 