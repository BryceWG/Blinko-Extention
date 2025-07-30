import { loadSettings, resetSettings, fetchAiConfig, defaultSettings } from './settings.js';
import { initializeUIListeners, showStatus, hideStatus } from './ui.js';
import { loadQuickNote, initializeQuickNoteListeners } from './quickNote.js';
import { checkSummaryState, initializeSummaryListeners, handleSummaryResponse } from './summary.js';

let prefersColorSchemeWatcher = null;

// 应用主题
function applyTheme(theme) {
    document.body.classList.remove('dark-theme', 'light-theme');
    
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
}

// 监听系统主题变化
function watchSystemTheme(currentTheme) {
    if (prefersColorSchemeWatcher) {
        prefersColorSchemeWatcher.removeEventListener('change', handleSystemThemeChange);
    }
    
    if (window.matchMedia) {
        prefersColorSchemeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
        prefersColorSchemeWatcher.addEventListener('change', () => handleSystemThemeChange(currentTheme));
    }
}

function handleSystemThemeChange(currentTheme) {
    if (currentTheme === 'system') {
        applyTheme('system');
    }
}

// 初始化国际化文本
function initializeI18n() {
    document.querySelectorAll('[title]').forEach(element => {
        const messageKey = element.getAttribute('title');
        if (messageKey.startsWith('__MSG_') && messageKey.endsWith('__')) {
            const key = messageKey.slice(6, -2);
            element.setAttribute('title', chrome.i18n.getMessage(key));
        }
    });

    document.querySelectorAll('*').forEach(element => {
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

    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(element => {
        const placeholderKey = element.getAttribute('placeholder');
        if (placeholderKey.startsWith('__MSG_') && placeholderKey.endsWith('__')) {
            const key = placeholderKey.slice(6, -2);
            element.setAttribute('placeholder', chrome.i18n.getMessage(key));
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // 初始化国际化文本
        initializeI18n();

        // 加载设置并应用主题
        const settings = await loadSettings();
        const theme = settings.theme || 'system';
        applyTheme(theme);
        watchSystemTheme(theme);

        // 检查是否是通过通知点击打开的
        const urlParams = new URLSearchParams(window.location.search);
        const defaultTab = urlParams.get('tab') || 'common';

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
        const defaultTabButton = document.querySelector(`.tablinks[data-tab="${defaultTab}"]`);
        if (defaultTabButton) {
            defaultTabButton.classList.add('active');
        }

        // 初始化所有事件监听器
        initializeUIListeners();
        initializeQuickNoteListeners();
        initializeSummaryListeners();

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
                    throw new Error(response?.error || chrome.i18n.getMessage('contentExtractionFailed'));
                }

                // 发送到background处理
                chrome.runtime.sendMessage({
                    action: 'processContent',
                    content: response.content,
                    title: response.title,
                    url: response.url,
                    isExtractOnly: true
                });

            } catch (error) {
                console.error('提取网页内容失败:', error);
                showStatus(chrome.i18n.getMessage('settingsSaveError', [error.message]), 'error');
            }
        });

        // 加载快速笔记
        await loadQuickNote();

        // 检查是否有待显示的摘要
        await checkSummaryState();

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

        // 清理主题监听器
        if (prefersColorSchemeWatcher) {
            prefersColorSchemeWatcher.removeEventListener('change', handleSystemThemeChange);
        }
    } catch (error) {
        // 忽略错误
    }
});