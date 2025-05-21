import { extractPageContent, getPageMetadata } from './contentExtractor.js';

// 处理来自popup的消息
function handlePopupMessages(request, sender, sendResponse) {
    if (request.action === "getContent") {
        try {
            const content = extractPageContent();
            const metadata = getPageMetadata();
            console.log('提取的内容长度:', content.length);
            sendResponse({
                success: true,
                content: content,
                url: metadata.url,
                title: metadata.title
            });
        } catch (error) {
            console.error('提取内容时出错:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }
}

// 处理来自background的消息
function handleBackgroundMessages(request, sender, sendResponse) {
    // 目前没有特定的background消息需要处理
    // 保留此函数以便将来扩展
}

// 初始化消息监听器
function initializeMessageListeners() {
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // 根据发送者处理不同的消息
        if (sender.id === browser.runtime.id) {
            if (sender.tab) {
                // 来自其他content script的消息
                handleContentScriptMessages(request, sender, sendResponse);
            } else {
                // 来自popup或background的消息
                handlePopupMessages(request, sender, sendResponse);
            }
        }
        return true; // 保持消息通道开放
    });
}

// 处理来自其他content script的消息
function handleContentScriptMessages(request, sender, sendResponse) {
    // 目前没有特定的content script消息需要处理
    // 保留此函数以便将来扩展
}

export {
    initializeMessageListeners,
    handlePopupMessages,
    handleBackgroundMessages,
    handleContentScriptMessages
}; 