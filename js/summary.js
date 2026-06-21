import { showStatus, hideStatus, showSummaryPreview, clearSummaryPreview } from './ui.js';
import { saveTempSummaryData, clearTempSummaryData } from './storage.js';

// 检查总结状态
async function checkSummaryState() {
    try {
        const currentSummary = await chrome.storage.local.get('currentSummary');
        if (currentSummary.currentSummary) {
            await showSummaryPreview(currentSummary.currentSummary);
        }
    } catch (error) {
        console.error('检查总结状态失败:', error);
    }
}

// 处理总结响应
function handleSummaryResponse(response) {
    if (response.success) {
        showStatus(response.isExtractOnly ? (chrome.i18n.getMessage('statusExtractSuccess') || 'Extracted successfully') : (chrome.i18n.getMessage('statusSummarySuccess') || 'Summarized successfully'), 'success');
        setTimeout(hideStatus, 2000);
        showSummaryPreview({
            summary: response.summary,
            title: response.title,
            url: response.url
        });
    } else {
        showStatus((response.isExtractOnly ? (chrome.i18n.getMessage('notificationExtractErrorTitle') || 'Extract failed') : (chrome.i18n.getMessage('statusSummaryFailed') || 'Summary failed')) + ': ' + response.error, 'error');
    }
}

// 初始化总结相关事件监听器
function initializeSummaryListeners() {
    // 绑定总结按钮事件
    document.getElementById('extract').addEventListener('click', async () => {
        try {
            showStatus(chrome.i18n.getMessage('statusGeneratingSummary') || 'Generating summary...', 'loading');
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error(chrome.i18n.getMessage('cannotGetTab') || 'Cannot get current tab');
            }

            // 发送消息到content script获取内容
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'getContent'
            });

            if (!response || !response.success) {
                throw new Error(response.error || (chrome.i18n.getMessage('errorGetContentFailed') || 'Failed to get content'));
            }

            // 发送到background处理
            await chrome.runtime.sendMessage({
                action: 'getContent',
                content: response.content,
                url: response.url,
                title: response.title,
                isExtractOnly: false
            });

        } catch (error) {
            console.error('生成总结失败:', error);
            showStatus((chrome.i18n.getMessage('statusSummaryFailed') || 'Summary failed') + ': ' + error.message, 'error');
        }
    });

    // 绑定取消按钮事件
    document.getElementById('cancelEdit').addEventListener('click', async () => {
        try {
            await clearTempSummaryData();
            await chrome.storage.local.remove('currentSummary');
            clearSummaryPreview();
            showStatus(chrome.i18n.getMessage('statusCancelled') || 'Cancelled', 'success');
            setTimeout(hideStatus, 2000);
        } catch (error) {
            console.error('取消编辑失败:', error);
            showStatus((chrome.i18n.getMessage('statusCancelFailed') || 'Cancel failed') + ': ' + error.message, 'error');
        }
    });

    // 绑定保存按钮事件
    document.getElementById('editSummary').addEventListener('click', async () => {
        try {
            const summaryText = document.getElementById('summaryText').value;
            if (!summaryText.trim()) {
                throw new Error(chrome.i18n.getMessage('statusContentRequired') || 'Content cannot be empty');
            }

            // 获取当前总结数据，判断是否是提取场景
            const currentSummary = await chrome.storage.local.get('currentSummary');
            const isExtractOnly = currentSummary.currentSummary?.isExtractOnly;
            const url = currentSummary.currentSummary?.url;
            const title = currentSummary.currentSummary?.title;

            // 发送到background处理
            const response = await chrome.runtime.sendMessage({
                action: 'saveSummary',
                content: summaryText,
                type: isExtractOnly ? 'extract' : 'summary',
                url: url,
                title: title
            });

            if (response && response.success) {
                clearSummaryPreview();
                showStatus(chrome.i18n.getMessage('statusSaveSuccess') || 'Saved successfully', 'success');
                setTimeout(hideStatus, 2000);
            } else {
                throw new Error(response.error || (chrome.i18n.getMessage('statusSaveFailed') || 'Save failed'));
            }
        } catch (error) {
            console.error('保存总结失败:', error);
            showStatus((chrome.i18n.getMessage('statusSaveFailed') || 'Save failed') + ': ' + error.message, 'error');
        }
    });
}

export {
    checkSummaryState,
    handleSummaryResponse,
    initializeSummaryListeners
}; 