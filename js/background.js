import { initializeContextMenu, handleContextMenuClick } from './contextMenu.js';
import { handleContentRequest, handleSaveSummary, handleFloatingBallRequest } from './messageHandler.js';
import { getSummaryState, clearSummaryState } from './summaryState.js';

// Initialize context menu
initializeContextMenu();

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getContent") {
        // Process directly, no response needed
        handleContentRequest(request);
        sendResponse({ received: true });
        return false;  // No need to keep message channel open
    }
    
    if (request.action === "saveSummary") {
        // Process immediately and return response
        handleSaveSummary(request).then(response => {
            try {
                chrome.runtime.sendMessage({
                    action: 'saveSummaryResponse',
                    response: response
                }).catch(() => {
                    // Ignore error, popup may be closed
                });
            } catch (error) {
                console.log(chrome.i18n.getMessage('popupClosedMessage'));
            }
        });
        // Return an initial response
        sendResponse({ success: true });
        return false;
    }

    if (request.action === "processAndSendContent") {
        // Send processing response immediately
        sendResponse({ processing: true });
        
        // Process request asynchronously
        handleFloatingBallRequest(request).then(response => {
            // Try to update floating ball state
            if (sender.tab && sender.tab.id) {
                try {
                    chrome.tabs.sendMessage(sender.tab.id, {
                        action: 'updateFloatingBallState',
                        success: response.success,
                        error: response.error
                    }).catch(() => {
                        console.log(chrome.i18n.getMessage('updateBallStateError'));
                    });
                } catch (error) {
                    console.log(chrome.i18n.getMessage('sendStatusUpdateError'));
                }
            }
        }).catch(error => {
            console.error(chrome.i18n.getMessage('floatingBallRequestError'), error);
            // Try to update floating ball state
            if (sender.tab && sender.tab.id) {
                try {
                    chrome.tabs.sendMessage(sender.tab.id, {
                        action: 'updateFloatingBallState',
                        success: false,
                        error: error.message || chrome.i18n.getMessage('processingRequestError')
                    }).catch(() => {
                        console.log(chrome.i18n.getMessage('updateBallStateError'));
                    });
                } catch (error) {
                    console.log(chrome.i18n.getMessage('sendStatusUpdateError'));
                }
            }
        });
        
        return true; // Keep message channel open
    }

    if (request.action === "showNotification") {
        // Show system notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('images/icon128.png'),
            title: request.title || chrome.i18n.getMessage('notification'),
            message: request.message || '',
            priority: 2
        });
        sendResponse({ received: true });
        return false;
    }

    if (request.action === "getSummaryState") {
        // Synchronous response
        sendResponse(getSummaryState());
        return false;
    }

    if (request.action === "clearSummary") {
        // Send response immediately to avoid channel closing
        clearSummaryState().then(() => {
            try {
                chrome.runtime.sendMessage({
                    action: 'clearSummaryResponse',
                    success: true
                }).catch(() => {
                    // Ignore error, popup may be closed
                });
            } catch (error) {
                console.log(chrome.i18n.getMessage('popupClosedMessage'));
            }
        });
        sendResponse({ processing: true });
        return false;
    }

    return false;  // Default: do not keep message channel open
});

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
    try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            console.error(chrome.i18n.getMessage('statusCannotGetCurrentTab') || 'Cannot get current tab');
            return;
        }

        // Simulate context menu click based on command type
        const menuItemId = command === 'summarize-page' ? 'summarizePageContent' : 'extractPageContent';
        
        // Reuse context menu handling logic
        await handleContextMenuClick({ menuItemId }, tab);
        
    } catch (error) {
        console.error('Shortcut handling failed:', error);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: chrome.i18n.getMessage('statusShortcutFailed') || 'Shortcut execution failed',
            message: error.message
        });
    }
});

// Listen for notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
    try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            // Set flag
            await chrome.storage.local.set({ 
                notificationClicked: true,
                notificationTabId: tab.id
            });
            // Clear notification
            chrome.notifications.clear(notificationId);
        }
    } catch (error) {
        console.error(chrome.i18n.getMessage('notificationClickError'), error);
    }
});