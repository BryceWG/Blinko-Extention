import { sendToBlinko, uploadFile } from './api.js';
import { showSuccessIcon } from './ui.js';
import { handleContentRequest } from './messageHandler.js';

// 初始化右键菜单
function initializeContextMenu() {
    chrome.runtime.onInstalled.addListener(() => {
        // 创建父级菜单
        chrome.contextMenus.create({
            id: "blinkoExtension",
            title: chrome.i18n.getMessage("extensionName"),
            contexts: ["all"]
        });

        // 创建选中文本菜单
        chrome.contextMenus.create({
            id: "sendSelectedText",
            title: chrome.i18n.getMessage("sendSelectedText"),
            contexts: ["selection"],
            parentId: "blinkoExtension"
        });

        // 添加预存到快捷记录菜单（文本）
        chrome.contextMenus.create({
            id: "saveToQuickNote",
            title: chrome.i18n.getMessage("saveToQuickNote"),
            contexts: ["selection"],
            parentId: "blinkoExtension"
        });

        // 添加预存到快捷记录菜单（图片）
        chrome.contextMenus.create({
            id: "saveImageToQuickNote",
            title: chrome.i18n.getMessage("saveImageToQuickNote"),
            contexts: ["image"],
            parentId: "blinkoExtension"
        });

        // 创建图片右键菜单
        chrome.contextMenus.create({
            id: 'saveImageToBlinko',
            title: chrome.i18n.getMessage("saveImageToBlinko"),
            contexts: ['image'],
            parentId: "blinkoExtension"
        });

        // 创建总结网页内容菜单
        chrome.contextMenus.create({
            id: 'summarizePageContent',
            title: chrome.i18n.getMessage("summarizePageContent"),
            contexts: ['page'],
            parentId: "blinkoExtension"
        });

        // 创建提取网页内容菜单
        chrome.contextMenus.create({
            id: 'extractPageContent',
            title: chrome.i18n.getMessage("extractPageContent"),
            contexts: ['page'],
            parentId: "blinkoExtension"
        });

        // 创建保存剪贴板内容菜单
        chrome.contextMenus.create({
            id: 'saveClipboardContent',
            title: chrome.i18n.getMessage("saveClipboardContent") || "Save Clipboard Content to Blinko",
            contexts: ['page'],
            parentId: "blinkoExtension"
        });

        // 创建跳转到Blinko主页菜单
        chrome.contextMenus.create({
            id: 'openBlinkoHomepage',
            title: chrome.i18n.getMessage("openBlinkoHomepage") || "Open Blinko Homepage",
            contexts: ['all'],
            parentId: "blinkoExtension"
        });
    });
}

// 处理右键菜单点击
async function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "sendSelectedText") {
        try {
            const result = await chrome.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error(chrome.i18n.getMessage('errorSettingsNotFound') || 'Settings not found');
            }

            // 准备内容
            let content = info.selectionText.trim();

            // 发送到Blinko
            const response = await sendToBlinko(
                content,
                tab.url,
                tab.title,
                null,
                'extract'  // 划词保存使用extract类型
            );
            
            if (response.success) {
                showSuccessIcon();
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'images/icon128.png',
                    title: chrome.i18n.getMessage('statusSendSuccess') || 'Sent successfully',
                    message: chrome.i18n.getMessage('notificationSendSuccessMessage') || 'Selected text has been sent to Blinko successfully.'
                });
            } else {
                throw new Error(response.error || (chrome.i18n.getMessage('notificationSendErrorTitle') || 'Send failed'));
            }
        } catch (error) {
            console.error('发送选中文本失败:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('notificationSendErrorTitle') || 'Send failed',
                message: error.message
            });
        }
    }

    if (info.menuItemId === "saveToQuickNote") {
        try {
            // 获取当前快捷记录内容
            const result = await chrome.storage.local.get('quickNote');
            let currentContent = result.quickNote || '';
            
            // 添加新的选中内容
            if (currentContent) {
                currentContent += '\n\n'; // 如果已有内容，添加两个换行符
            }
            currentContent += info.selectionText.trim();
            
            // 保存更新后的内容
            await chrome.storage.local.set({ 'quickNote': currentContent });
            
            // 显示成功通知
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusAddedToQuickNote') || 'Added to Quick Note',
                message: chrome.i18n.getMessage('messageTextAddedToQuickNote') || 'Selected text has been added to Quick Note.'
            });
        } catch (error) {
            console.error('保存到快捷记录失败:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusSaveFailed') || 'Save failed',
                message: error.message
            });
        }
    }

    if (info.menuItemId === "saveImageToQuickNote") {
        try {
            // 获取设置
            const result = await chrome.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error(chrome.i18n.getMessage('errorSettingsNotFound') || 'Settings not found');
            }

            // 获取图片文件
            const imageResponse = await fetch(info.srcUrl);
            const blob = await imageResponse.blob();
            const file = new File([blob], 'image.png', { type: blob.type });
            
            // 上传图片文件
            const imageAttachment = await uploadFile(file, settings);

            // 获取当前快捷记录的附件列表
            const quickNoteResult = await chrome.storage.local.get(['quickNoteAttachments']);
            let attachments = quickNoteResult.quickNoteAttachments || [];

            // 添加新的附件，只保存原始URL
            attachments.push({
                ...imageAttachment,
                originalUrl: info.srcUrl // 保存原始URL以便在popup中创建本地URL
            });

            // 保存更新后的附件列表
            await chrome.storage.local.set({ 'quickNoteAttachments': attachments });
            
            // 显示成功通知
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusAddedToQuickNote') || 'Added to Quick Note',
                message: chrome.i18n.getMessage('messageImageAddedToQuickNote') || 'Image has been added to Quick Note.'
            });
        } catch (error) {
            console.error('保存图片到快捷记录失败:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusSaveFailed') || 'Save failed',
                message: error.message
            });
        }
    }

    if (info.menuItemId === 'saveImageToBlinko') {
        try {
            // 获取设置
            const result = await chrome.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error(chrome.i18n.getMessage('errorSettingsNotFound') || 'Settings not found');
            }

            // 获取图片文件
            const imageResponse = await fetch(info.srcUrl);
            const blob = await imageResponse.blob();
            const file = new File([blob], 'image.png', { type: blob.type });
            
            // 上传图片文件
            const imageAttachment = await uploadFile(file, settings);

            // 发送到Blinko，包含图片附件
            const response = await sendToBlinko('', tab.url, tab.title, imageAttachment, 'image');
            
            if (response.success) {
                // 通知用户保存成功
                showSuccessIcon();
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'images/icon128.png',
                    title: chrome.i18n.getMessage('statusSaveSuccess') || 'Saved successfully',
                    message: chrome.i18n.getMessage('messageImageSaved') || 'Image has been saved to Blinko successfully.'
                });
            } else {
                throw new Error(response.error || (chrome.i18n.getMessage('statusSaveFailed') || 'Save failed'));
            }
        } catch (error) {
            console.error('保存图片失败:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusSaveFailed') || 'Save failed',
                message: error.message
            });
        }
    }

    // 处理总结和提取网页内容
    if (info.menuItemId === 'summarizePageContent' || info.menuItemId === 'extractPageContent') {
        try {
            // 获取页面内容
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'getContent'
            });

            if (!response || !response.success) {
                throw new Error(response.error || (chrome.i18n.getMessage('errorGetContentFailed') || 'Failed to get content'));
            }

            // 直接处理并保存内容
            await handleContentRequest({
                content: response.content,
                url: response.url,
                title: response.title,
                isExtractOnly: info.menuItemId === 'extractPageContent',
                directSave: true  // 标记为直接保存
            });

            // 成功通知会在handleContentRequest中处理
        } catch (error) {
            console.error('处理网页内容失败:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: info.menuItemId === 'summarizePageContent' ? (chrome.i18n.getMessage('statusSummaryFailed') || 'Summary failed') : (chrome.i18n.getMessage('notificationExtractErrorTitle') || 'Extract failed'),
                message: error.message
            });
        }
    }

    // 处理保存剪贴板内容
    if (info.menuItemId === 'saveClipboardContent') {
        try {
            // 读取剪贴板内容
            const clipboardText = await navigator.clipboard.readText();
            
            if (!clipboardText || !clipboardText.trim()) {
                throw new Error(chrome.i18n.getMessage('errorClipboardEmpty') || 'Clipboard is empty');
            }

            // 发送到Blinko，使用quickNote类型
            const response = await sendToBlinko(
                clipboardText.trim(),
                tab.url,
                tab.title,
                null,
                'quickNote'
            );
            
            if (response.success) {
                showSuccessIcon();
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'images/icon128.png',
                    title: chrome.i18n.getMessage('statusSaveSuccess') || 'Saved successfully',
                    message: chrome.i18n.getMessage('messageClipboardSaved') || 'Clipboard content has been saved to Blinko.'
                });
            } else {
                throw new Error(response.error || (chrome.i18n.getMessage('errorSaveClipboardFailed') || 'Failed to save clipboard content'));
            }
        } catch (error) {
            console.error('保存剪贴板内容失败:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusSaveFailed') || 'Save failed',
                message: error.message
            });
        }
    }

    // 处理跳转到Blinko主页
    if (info.menuItemId === 'openBlinkoHomepage') {
        try {
            const result = await chrome.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings || !settings.targetUrl) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'images/icon128.png',
                    title: chrome.i18n.getMessage('statusBlinkoNotConfigured') || 'Blinko address is not configured',
                    message: chrome.i18n.getMessage('statusPleaseConfigure') || 'Please fill in the Blinko API URL and authentication key first'
                });
                return;
            }

            // 获取纯净的域名URL（移除/api/v1路径）
            let homepageUrl = settings.targetUrl.trim();
            if (homepageUrl.includes('/api/v1')) {
                homepageUrl = homepageUrl.split('/api/v1')[0];
            }

            // 在新标签页中打开Blinko主页
            await chrome.tabs.create({ url: homepageUrl });
        } catch (error) {
            console.error('跳转到Blinko主页失败:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusJumpFailed') || 'Jump failed',
                message: error.message
            });
        }
    }
}

export {
    initializeContextMenu,
    handleContextMenuClick
};
