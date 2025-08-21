
import { initializeContextMenu, handleContextMenuClick } from './contextMenu.js';
import { handleContentRequest, handleSaveSummary, handleFloatingBallRequest } from './messageHandler.js';
import { getSummaryState, clearSummaryState } from './summaryState.js';

// 初始化右键菜单
initializeContextMenu();

// 监听来自popup和content script的消息
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getContent") {
        // 直接处理，不需要响应
        handleContentRequest(request);
        sendResponse({ received: true });
        return false;  // 不需要保持消息通道开放
    }
    
    if (request.action === "saveSummary") {
        // 立即处理并返回响应
        handleSaveSummary(request).then(response => {
            try {
                browser.runtime.sendMessage({
                    action: 'saveSummaryResponse',
                    response: response
                }).catch(() => {
                    // 忽略错误，popup可能已关闭
                });
            } catch (error) {
                console.log(browser.i18n.getMessage('popupClosedMessage'));
            }
        });
        // 返回一个初始响应
        sendResponse({ success: true });
        return false;
    }

    if (request.action === "processAndSendContent") {
        // 立即发送处理中的响应
        sendResponse({ processing: true });
        
        // 异步处理请求
        handleFloatingBallRequest(request).then(response => {
            // 尝试更新悬浮球状态
            if (sender.tab && sender.tab.id && browser.tabs && browser.tabs.sendMessage) {
                try {
                    browser.tabs.sendMessage(sender.tab.id, {
                        action: 'updateFloatingBallState',
                        success: response.success,
                        error: response.error
                    }).catch(() => {
                        console.log(browser.i18n.getMessage('updateBallStateError'));
                    });
                } catch (error) {
                    console.log(browser.i18n.getMessage('sendStatusUpdateError'));
                }
            }
        }).catch(error => {
            console.error(browser.i18n.getMessage('floatingBallRequestError'), error);
            // 尝试更新悬浮球状态
            if (sender.tab && sender.tab.id && browser.tabs && browser.tabs.sendMessage) {
                try {
                    browser.tabs.sendMessage(sender.tab.id, {
                        action: 'updateFloatingBallState',
                        success: false,
                        error: error.message || browser.i18n.getMessage('processingRequestError')
                    }).catch(() => {
                        console.log(browser.i18n.getMessage('updateBallStateError'));
                    });
                } catch (error) {
                    console.log(browser.i18n.getMessage('sendStatusUpdateError'));
                }
            }
        });
        
        return true; // 保持消息通道开放
    }

    if (request.action === "showNotification") {
        // 显示系统通知
        browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('images/icon128.png'),
            title: request.title || browser.i18n.getMessage('notification'),
            message: request.message || '',
            priority: 2
        });
        sendResponse({ received: true });
        return false;
    }

    if (request.action === "getSummaryState") {
        // 同步响应
        sendResponse(getSummaryState());
        return false;
    }

    if (request.action === "clearSummary") {
        // 立即发送响应，避免通道关闭
        clearSummaryState().then(() => {
            try {
                browser.runtime.sendMessage({
                    action: 'clearSummaryResponse',
                    success: true
                }).catch(() => {
                    // 忽略错误，popup可能已关闭
                });
            } catch (error) {
                console.log(browser.i18n.getMessage('popupClosedMessage'));
            }
        });
        sendResponse({ processing: true });
        return false;
    }

    return false;  // 默认不保持消息通道开放
});

// 监听右键菜单点击（仅在支持时）
if (browser.contextMenus && browser.contextMenus.onClicked) {
    browser.contextMenus.onClicked.addListener(handleContextMenuClick);
}

// 监听快捷键命令（仅在支持时）
if (browser.commands && browser.commands.onCommand) {
    browser.commands.onCommand.addListener(async (command) => {
        try {
            // 获取当前活动标签页
            if (!browser.tabs || !browser.tabs.query) {
                console.error('tabs API不支持');
                return;
            }
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                console.error('无法获取当前标签页');
                return;
            }

            // 根据命令类型模拟右键菜单点击
            const menuItemId = command === 'summarize-page' ? 'summarizePageContent' : 'extractPageContent';
            
            // 复用右键菜单的处理逻辑
            await handleContextMenuClick({ menuItemId }, tab);
            
        } catch (error) {
            console.error('快捷键处理失败:', error);
            browser.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: '快捷键执行失败',
                message: error.message
            });
        }
    });
}

// 监听通知点击
browser.notifications.onClicked.addListener(async (notificationId) => {
    try {
        // 获取当前标签页
        if (!browser.tabs || !browser.tabs.query) {
            console.error('tabs API不支持');
            return;
        }
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            // 设置标记
            await browser.storage.local.set({ 
                notificationClicked: true,
                notificationTabId: tab.id
            });
            // 清除通知
            browser.notifications.clear(notificationId);
        }
    } catch (error) {
        console.error(browser.i18n.getMessage('notificationClickError'), error);
    }
});