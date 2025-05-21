import { sendToBlinko, uploadFile } from './api.js';
import { showSuccessIcon } from './ui.js';
import { handleContentRequest } from './messageHandler.js';

// 初始化右键菜单
function initializeContextMenu() {
    browser.runtime.onInstalled.addListener(() => {
        // 创建父级菜单
        browser.contextMenus.create({
            id: "blinkoExtension",
            title: browser.i18n.getMessage("extensionName"),
            contexts: ["all"]
        });

        // 创建选中文本菜单
        browser.contextMenus.create({
            id: "sendSelectedText",
            title: browser.i18n.getMessage("sendSelectedText"),
            contexts: ["selection"],
            parentId: "blinkoExtension"
        });

        // 添加预存到快捷记录菜单（文本）
        browser.contextMenus.create({
            id: "saveToQuickNote",
            title: browser.i18n.getMessage("saveToQuickNote"),
            contexts: ["selection"],
            parentId: "blinkoExtension"
        });

        // 添加预存到快捷记录菜单（图片）
        browser.contextMenus.create({
            id: "saveImageToQuickNote",
            title: browser.i18n.getMessage("saveImageToQuickNote"),
            contexts: ["image"],
            parentId: "blinkoExtension"
        });

        // 创建图片右键菜单
        browser.contextMenus.create({
            id: 'saveImageToBlinko',
            title: browser.i18n.getMessage("saveImageToBlinko"),
            contexts: ['image'],
            parentId: "blinkoExtension"
        });

        // 创建总结网页内容菜单
        browser.contextMenus.create({
            id: 'summarizePageContent',
            title: browser.i18n.getMessage("summarizePageContent"),
            contexts: ['page'],
            parentId: "blinkoExtension"
        });

        // 创建提取网页内容菜单
        browser.contextMenus.create({
            id: 'extractPageContent',
            title: browser.i18n.getMessage("extractPageContent"),
            contexts: ['page'],
            parentId: "blinkoExtension"
        });
    });
}

// 处理右键菜单点击
async function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "sendSelectedText") {
        try {
            const result = await browser.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error('未找到设置信息');
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
                browser.notifications.create({
                    type: 'basic',
                    iconUrl: 'images/icon128.png',
                    title: '发送成功',
                    message: '已成功发送选中文本到Blinko'
                });
            } else {
                throw new Error(response.error || '发送选中文本失败');
            }
        } catch (error) {
            console.error('发送选中文本失败:', error);
            browser.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: '发送失败',
                message: error.message
            });
        }
    }

    if (info.menuItemId === "saveToQuickNote") {
        try {
            // 获取当前快捷记录内容
            const result = await browser.storage.local.get('quickNote');
            let currentContent = result.quickNote || '';
            
            // 添加新的选中内容
            if (currentContent) {
                currentContent += '\n\n'; // 如果已有内容，添加两个换行符
            }
            currentContent += info.selectionText.trim();
            
            // 保存更新后的内容
            await browser.storage.local.set({ 'quickNote': currentContent });
            
            // 显示成功通知
            browser.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: '已添加到快捷记录',
                message: '选中的文本已添加到快捷记录中'
            });
        } catch (error) {
            console.error('保存到快捷记录失败:', error);
            browser.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: '保存失败',
                message: error.message
            });
        }
    }

    if (info.menuItemId === "saveImageToQuickNote") {
        try {
            // 获取设置
            const result = await browser.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error('未找到设置信息');
            }

            // 获取图片文件
            const imageResponse = await fetch(info.srcUrl);
            const blob = await imageResponse.blob();
            const file = new File([blob], 'image.png', { type: blob.type });
            
            // 上传图片文件
            const imageAttachment = await uploadFile(file, settings);

            // 获取当前快捷记录的附件列表
            const quickNoteResult = await browser.storage.local.get(['quickNoteAttachments']);
            let attachments = quickNoteResult.quickNoteAttachments || [];

            // 添加新的附件，只保存原始URL
            attachments.push({
                ...imageAttachment,
                originalUrl: info.srcUrl // 保存原始URL以便在popup中创建本地URL
            });

            // 保存更新后的附件列表
            await browser.storage.local.set({ 'quickNoteAttachments': attachments });
            
            // 显示成功通知
            browser.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: '已添加到快捷记录',
                message: '图片已添加到快捷记录中'
            });
        } catch (error) {
            console.error('保存图片到快捷记录失败:', error);
            browser.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: '保存失败',
                message: error.message
            });
        }
    }

    if (info.menuItemId === 'saveImageToBlinko') {
        try {
            // 获取设置
            const result = await browser.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error('未找到设置信息');
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
                browser.notifications.create({
                    type: 'basic',
                    iconUrl: 'images/icon128.png',
                    title: '保存成功',
                    message: '已成功保存图片到Blinko'
                });
            } else {
                throw new Error(response.error || '保存失败');
            }
        } catch (error) {
            console.error('保存图片失败:', error);
            browser.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: '保存失败',
                message: error.message
            });
        }
    }

    // 处理总结和提取网页内容
    if (info.menuItemId === 'summarizePageContent' || info.menuItemId === 'extractPageContent') {
        try {
            // 获取页面内容
            const response = await browser.tabs.sendMessage(tab.id, {
                action: 'getContent'
            });

            if (!response || !response.success) {
                throw new Error(response.error || '获取内容失败');
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
            browser.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: info.menuItemId === 'summarizePageContent' ? '总结失败' : '提取失败',
                message: error.message
            });
        }
    }
}

export {
    initializeContextMenu,
    handleContextMenuClick
};
