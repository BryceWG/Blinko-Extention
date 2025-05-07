import { showStatus } from './ui.js';
import { getCleanDomainUrl } from './api.js';

// 保存快捷记录内容
function saveQuickNote() {
    const input = document.getElementById('quickNoteInput');
    if (input && input.value.trim()) {
        chrome.storage.local.set({ 'quickNote': input.value });
    }
}

// 加载快捷记录内容
async function loadQuickNote() {
    try {
        // 加载文本内容
        const result = await chrome.storage.local.get(['quickNote', 'quickNoteAttachments']);
        if (result.quickNote) {
            document.getElementById('quickNoteInput').value = result.quickNote;
        }

        // 加载并显示附件
        if (result.quickNoteAttachments && result.quickNoteAttachments.length > 0) {
            // 为每个没有localUrl的附件创建本地URL
            const attachments = await Promise.all(result.quickNoteAttachments.map(async (attachment) => {
                if (!attachment.localUrl && attachment.originalUrl) {
                    try {
                        const response = await fetch(attachment.originalUrl);
                        const blob = await response.blob();
                        attachment.localUrl = URL.createObjectURL(blob);
                    } catch (error) {
                        console.error('创建本地URL失败:', error);
                    }
                }
                return attachment;
            }));

            // 更新存储中的附件信息
            await chrome.storage.local.set({ 'quickNoteAttachments': attachments });
            
            // 显示附件
            updateAttachmentList(attachments);
        }
    } catch (error) {
        console.error('加载快捷记录失败:', error);
    }
}

// 更新附件列表显示
async function updateAttachmentList(attachments) {
    const attachmentItems = document.getElementById('attachmentItems');
    const clearAttachmentsBtn = document.getElementById('clearAttachments');
    
    // 清空现有内容
    attachmentItems.innerHTML = '';
    
    // 如果有附件，显示清除按钮
    clearAttachmentsBtn.style.display = attachments.length > 0 ? 'block' : 'none';

    // 获取设置信息
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings;
    
    if (!settings || !settings.targetUrl) {
        console.error('未找到设置信息');
        return;
    }

    // 添加附件项
    attachments.forEach((attachment, index) => {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        
        // 创建图片预览
        const img = document.createElement('img');
        
        // 优先使用本地图片URL，如果不存在则使用Blinko URL
        if (attachment.localUrl) {
            img.src = attachment.localUrl;
        } else if (attachment.path) {
            // 使用Blinko URL作为后备
            const cleanDomain = getCleanDomainUrl(settings.targetUrl);
            const path = attachment.path.startsWith('/') ? attachment.path : '/' + attachment.path;
            img.src = cleanDomain + path;
        }
        
        img.alt = attachment.name || '附件图片';
        img.onerror = () => {
            // 如果图片加载失败，显示文件名
            img.style.display = 'none';
            const textSpan = document.createElement('span');
            textSpan.textContent = attachment.name || '图片';
            textSpan.style.display = 'block';
            textSpan.style.padding = '8px';
            textSpan.style.textAlign = 'center';
            item.insertBefore(textSpan, img);
        };
        item.appendChild(img);
        
        // 创建删除按钮
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-button';
        removeBtn.innerHTML = '×';
        removeBtn.title = '移除附件';
        removeBtn.onclick = () => removeAttachment(index);
        item.appendChild(removeBtn);
        
        attachmentItems.appendChild(item);
    });
}

// 清理图片缓存
function clearImageCache(attachments) {
    if (Array.isArray(attachments)) {
        attachments.forEach(attachment => {
            if (attachment.localUrl) {
                URL.revokeObjectURL(attachment.localUrl);
            }
        });
    }
}

// 清除所有附件
async function clearAttachments() {
    try {
        // 获取当前附件列表以清理缓存
        const result = await chrome.storage.local.get('quickNoteAttachments');
        if (result.quickNoteAttachments) {
            clearImageCache(result.quickNoteAttachments);
        }
        await chrome.storage.local.remove('quickNoteAttachments');
        updateAttachmentList([]);
    } catch (error) {
        console.error('清除附件失败:', error);
        showStatus('清除附件失败: ' + error.message, 'error');
    }
}

// 移除单个附件
async function removeAttachment(index) {
    try {
        const result = await chrome.storage.local.get('quickNoteAttachments');
        let attachments = result.quickNoteAttachments || [];
        
        // 清理要移除的附件的图片缓存
        if (attachments[index] && attachments[index].localUrl) {
            URL.revokeObjectURL(attachments[index].localUrl);
        }
        
        // 移除指定索引的附件
        attachments.splice(index, 1);
        
        // 保存更新后的附件列表
        await chrome.storage.local.set({ 'quickNoteAttachments': attachments });
        
        // 更新显示
        updateAttachmentList(attachments);
    } catch (error) {
        console.error('移除附件失败:', error);
        showStatus('移除附件失败: ' + error.message, 'error');
    }
}

// 清除快捷记录内容
function clearQuickNote() {
    const input = document.getElementById('quickNoteInput');
    if (input) {
        input.value = '';
        // 获取当前附件列表以清理缓存
        chrome.storage.local.get(['quickNoteAttachments'], result => {
            if (result.quickNoteAttachments) {
                clearImageCache(result.quickNoteAttachments);
            }
            // 清除storage中的数据
            chrome.storage.local.remove(['quickNote', 'quickNoteAttachments']);
            // 更新附件列表显示
            updateAttachmentList([]);
        });
    }
}

// 发送快捷记录
async function sendQuickNote() {
    try {
        const input = document.getElementById('quickNoteInput');
        const content = input.value;
        if (!content.trim()) {
            showStatus('请输入笔记内容', 'error');
            return;
        }

        const result = await chrome.storage.sync.get('settings');
        const settings = result.settings;
        
        if (!settings) {
            throw new Error('未找到设置信息');
        }

        showStatus('正在发送...', 'loading');

        // 获取当前标签页信息
        let url = '';
        let title = '';
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                url = tab.url;
                title = tab.title;
            }
        } catch (error) {
            console.error('获取当前标签页信息失败:', error);
        }

        // 获取附件列表
        const attachmentsResult = await chrome.storage.local.get(['quickNoteAttachments']);
        const attachments = attachmentsResult.quickNoteAttachments || [];

        // 发送消息并等待saveSummaryResponse
        const responsePromise = new Promise((resolve) => {
            const listener = (message) => {
                if (message.action === 'saveSummaryResponse') {
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(message.response);
                }
            };
            chrome.runtime.onMessage.addListener(listener);
            
            // 发送请求
            chrome.runtime.sendMessage({
                action: 'saveSummary',
                type: 'quickNote',
                content: content.trim(),
                url: url,
                title: title,
                attachments: attachments
            });
        });

        // 等待响应
        const response = await responsePromise;

        if (response && response.success) {
            showStatus('发送成功', 'success');
            // 发送成功后清理图片缓存
            clearImageCache(attachments);
            // 清除内容和存储
            input.value = '';
            await chrome.storage.local.remove(['quickNote', 'quickNoteAttachments']);
            // 立即更新附件列表显示
            updateAttachmentList([]);
        } else {
            showStatus('发送失败: ' + (response?.error || '未知错误'), 'error');
        }
    } catch (error) {
        showStatus('发送失败: ' + error.message, 'error');
    }
}

// 初始化快捷记录相关的事件监听器
function initializeQuickNoteListeners() {
    document.getElementById('quickNoteInput').addEventListener('input', saveQuickNote);
    document.getElementById('sendQuickNote').addEventListener('click', sendQuickNote);
    document.getElementById('clearQuickNote').addEventListener('click', clearQuickNote);
    document.getElementById('clearAttachments').addEventListener('click', clearAttachments);
}

export {
    saveQuickNote,
    loadQuickNote,
    clearQuickNote,
    sendQuickNote,
    initializeQuickNoteListeners,
    updateAttachmentList,
    clearImageCache
}; 