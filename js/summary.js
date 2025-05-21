import { showStatus, hideStatus, showSummaryPreview, clearSummaryPreview } from './ui.js';
import { saveTempSummaryData, clearTempSummaryData } from './storage.js';

// 检查总结状态
async function checkSummaryState() {
    try {
        const currentSummary = await browser.storage.local.get('currentSummary');
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
        showStatus(response.isExtractOnly ? '提取成功' : '总结生成成功', 'success');
        setTimeout(hideStatus, 2000);
        showSummaryPreview({
            summary: response.summary,
            title: response.title,
            url: response.url
        });
    } else {
        showStatus((response.isExtractOnly ? '提取' : '总结') + '失败: ' + response.error, 'error');
    }
}

// 初始化总结相关事件监听器
function initializeSummaryListeners() {
    // 绑定总结按钮事件
    document.getElementById('extract').addEventListener('click', async () => {
        try {
            showStatus('正在生成总结...', 'loading');
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error('无法获取当前标签页');
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
                isExtractOnly: false
            });

        } catch (error) {
            console.error('生成总结失败:', error);
            showStatus('总结失败: ' + error.message, 'error');
        }
    });

    // 绑定取消按钮事件
    document.getElementById('cancelEdit').addEventListener('click', async () => {
        try {
            await clearTempSummaryData();
            await browser.storage.local.remove('currentSummary');
            clearSummaryPreview();
            showStatus('已取消', 'success');
            setTimeout(hideStatus, 2000);
        } catch (error) {
            console.error('取消编辑失败:', error);
            showStatus('取消失败: ' + error.message, 'error');
        }
    });

    // 绑定保存按钮事件
    document.getElementById('editSummary').addEventListener('click', async () => {
        try {
            const summaryText = document.getElementById('summaryText').value;
            if (!summaryText.trim()) {
                throw new Error('内容不能为空');
            }

            // 获取当前总结数据，判断是否是提取场景
            const currentSummary = await browser.storage.local.get('currentSummary');
            const isExtractOnly = currentSummary.currentSummary?.isExtractOnly;
            const url = currentSummary.currentSummary?.url;
            const title = currentSummary.currentSummary?.title;

            // 发送到background处理
            const response = await browser.runtime.sendMessage({
                action: 'saveSummary',
                content: summaryText,
                type: isExtractOnly ? 'extract' : 'summary',
                url: url,
                title: title
            });

            if (response && response.success) {
                clearSummaryPreview();
                showStatus('保存成功', 'success');
                setTimeout(hideStatus, 2000);
            } else {
                throw new Error(response.error || '保存失败');
            }
        } catch (error) {
            console.error('保存总结失败:', error);
            showStatus('保存失败: ' + error.message, 'error');
        }
    });
}

export {
    checkSummaryState,
    handleSummaryResponse,
    initializeSummaryListeners
}; 