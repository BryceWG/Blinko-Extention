import { sendToBlinko, uploadFile } from './api.js';
import { showSuccessIcon } from './ui.js';
import { handleContentRequest } from './messageHandler.js';

// Initialize context menu
function initializeContextMenu() {
    chrome.runtime.onInstalled.addListener(() => {
        // Create parent menu
        chrome.contextMenus.create({
            id: "blinkoExtension",
            title: chrome.i18n.getMessage("extensionName"),
            contexts: ["all"]
        });

        // Create selected text menu
        chrome.contextMenus.create({
            id: "sendSelectedText",
            title: chrome.i18n.getMessage("sendSelectedText"),
            contexts: ["selection"],
            parentId: "blinkoExtension"
        });

        // Add save to Quick Note menu (text)
        chrome.contextMenus.create({
            id: "saveToQuickNote",
            title: chrome.i18n.getMessage("saveToQuickNote"),
            contexts: ["selection"],
            parentId: "blinkoExtension"
        });

        // Add save to Quick Note menu (image)
        chrome.contextMenus.create({
            id: "saveImageToQuickNote",
            title: chrome.i18n.getMessage("saveImageToQuickNote"),
            contexts: ["image"],
            parentId: "blinkoExtension"
        });

        // Create image context menu
        chrome.contextMenus.create({
            id: 'saveImageToBlinko',
            title: chrome.i18n.getMessage("saveImageToBlinko"),
            contexts: ['image'],
            parentId: "blinkoExtension"
        });

        // Create summarize page content menu
        chrome.contextMenus.create({
            id: 'summarizePageContent',
            title: chrome.i18n.getMessage("summarizePageContent"),
            contexts: ['page'],
            parentId: "blinkoExtension"
        });

        // Create extract page content menu
        chrome.contextMenus.create({
            id: 'extractPageContent',
            title: chrome.i18n.getMessage("extractPageContent"),
            contexts: ['page'],
            parentId: "blinkoExtension"
        });

        // Create save clipboard content menu
        chrome.contextMenus.create({
            id: 'saveClipboardContent',
            title: chrome.i18n.getMessage("saveClipboardContent") || "Save Clipboard Content to Blinko",
            contexts: ['page'],
            parentId: "blinkoExtension"
        });

        // Create open Blinko homepage menu
        chrome.contextMenus.create({
            id: 'openBlinkoHomepage',
            title: chrome.i18n.getMessage("openBlinkoHomepage") || "Open Blinko Homepage",
            contexts: ['all'],
            parentId: "blinkoExtension"
        });
    });
}

// Handle context menu click
async function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "sendSelectedText") {
        try {
            const result = await chrome.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error(chrome.i18n.getMessage('errorSettingsNotFound') || 'Settings not found');
            }

            // Prepare content
            let content = info.selectionText.trim();

            // Send to Blinko
            const response = await sendToBlinko(
                content,
                tab.url,
                tab.title,
                null,
                'extract'  // Selection save uses extract type
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
            console.error('Failed to send selected text:', error);
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
            // Get current Quick Note content
            const result = await chrome.storage.local.get('quickNote');
            let currentContent = result.quickNote || '';
            
            // Add new selected content
            if (currentContent) {
                currentContent += '\n\n'; // If content exists, add two line breaks
            }
            currentContent += info.selectionText.trim();
            
            // Save updated content
            await chrome.storage.local.set({ 'quickNote': currentContent });
            
            // Show success notification
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusAddedToQuickNote') || 'Added to Quick Note',
                message: chrome.i18n.getMessage('messageTextAddedToQuickNote') || 'Selected text has been added to Quick Note.'
            });
        } catch (error) {
            console.error('Failed to save to Quick Note:', error);
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
            // Get settings
            const result = await chrome.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error(chrome.i18n.getMessage('errorSettingsNotFound') || 'Settings not found');
            }

            // Get image file
            const imageResponse = await fetch(info.srcUrl);
            const blob = await imageResponse.blob();
            const file = new File([blob], 'image.png', { type: blob.type });
            
            // Upload image file
            const imageAttachment = await uploadFile(file, settings);

            // Get current Quick Note attachments list
            const quickNoteResult = await chrome.storage.local.get(['quickNoteAttachments']);
            let attachments = quickNoteResult.quickNoteAttachments || [];

            // Add new attachment, only save original URL
            attachments.push({
                ...imageAttachment,
                originalUrl: info.srcUrl // Save original URL to create local URL in popup
            });

            // Save updated attachments list
            await chrome.storage.local.set({ 'quickNoteAttachments': attachments });
            
            // Show success notification
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusAddedToQuickNote') || 'Added to Quick Note',
                message: chrome.i18n.getMessage('messageImageAddedToQuickNote') || 'Image has been added to Quick Note.'
            });
        } catch (error) {
            console.error('Failed to save image to Quick Note:', error);
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
            // Get settings
            const result = await chrome.storage.sync.get('settings');
            const settings = result.settings;
            
            if (!settings) {
                throw new Error(chrome.i18n.getMessage('errorSettingsNotFound') || 'Settings not found');
            }

            // Get image file
            const imageResponse = await fetch(info.srcUrl);
            const blob = await imageResponse.blob();
            const file = new File([blob], 'image.png', { type: blob.type });
            
            // Upload image file
            const imageAttachment = await uploadFile(file, settings);

            // Send to Blinko with image attachment
            const response = await sendToBlinko('', tab.url, tab.title, imageAttachment, 'image');
            
            if (response.success) {
                // Notify user of successful save
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
            console.error('Failed to save image:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusSaveFailed') || 'Save failed',
                message: error.message
            });
        }
    }

    // Handle summarize and extract page content
    if (info.menuItemId === 'summarizePageContent' || info.menuItemId === 'extractPageContent') {
        try {
            // Get page content
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'getContent'
            });

            if (!response || !response.success) {
                throw new Error(response.error || (chrome.i18n.getMessage('errorGetContentFailed') || 'Failed to get content'));
            }

            // Process and save content directly
            await handleContentRequest({
                content: response.content,
                url: response.url,
                title: response.title,
                isExtractOnly: info.menuItemId === 'extractPageContent',
                directSave: true  // Mark as direct save
            });

            // Success notification is handled in handleContentRequest
        } catch (error) {
            console.error('Failed to process page content:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: info.menuItemId === 'summarizePageContent' ? (chrome.i18n.getMessage('statusSummaryFailed') || 'Summary failed') : (chrome.i18n.getMessage('notificationExtractErrorTitle') || 'Extract failed'),
                message: error.message
            });
        }
    }

    // Handle save clipboard content
    if (info.menuItemId === 'saveClipboardContent') {
        try {
            // Read clipboard content
            const clipboardText = await navigator.clipboard.readText();
            
            if (!clipboardText || !clipboardText.trim()) {
                throw new Error(chrome.i18n.getMessage('errorClipboardEmpty') || 'Clipboard is empty');
            }

            // Send to Blinko using quickNote type
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
            console.error('Failed to save clipboard content:', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: chrome.i18n.getMessage('statusSaveFailed') || 'Save failed',
                message: error.message
            });
        }
    }

    // Handle open Blinko homepage
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

            // Get clean domain URL (remove /api/v1 path)
            let homepageUrl = settings.targetUrl.trim();
            if (homepageUrl.includes('/api/v1')) {
                homepageUrl = homepageUrl.split('/api/v1')[0];
            }

            // Open Blinko homepage in new tab
            await chrome.tabs.create({ url: homepageUrl });
        } catch (error) {
            console.error('Failed to open Blinko homepage:', error);
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
