// 初始化悬浮球
initialize();

// 监听来自popup的消息
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getContent') {
        try {
            const content = extractPageContent();
            const metadata = getPageMetadata();
            sendResponse({
                success: true,
                content: content,
                url: metadata.url,
                title: metadata.title
            });
        } catch (error) {
            console.error('获取内容时出错:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }
    return true;  // 保持消息通道开放
});