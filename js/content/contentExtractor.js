// 原文链接前缀（用于内容中链接去重）
const ORIGINAL_LINK_PREFIX = chrome.i18n.getMessage('labelOriginalLink') || 'Original link:';

// 转义正则表达式特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 获取原文链接正则表达式
function getOriginalLinkRegExp() {
    return new RegExp(escapeRegExp(ORIGINAL_LINK_PREFIX) + '\\[.*?\\]\\(.*?\\)', 'g');
}

// 提取页面内容
function extractPageContent() {
    try {
        // 获取正文内容
        const content = document.body.innerText
            .replace(/[\n\r]+/g, '\n') // 将多个换行符替换为单个
            .replace(/\s+/g, ' ') // 将多个空格替换为单个
            .replace(getOriginalLinkRegExp(), '') // 移除可能已存在的原文链接
            .trim(); // 移除首尾空白
        
        return content;
    } catch (error) {
        console.error('提取内容时出错:', error);
        throw error;
    }
}

// 获取页面元数据
function getPageMetadata() {
    return {
        url: window.location.href,
        title: document.title
    };
}

// 获取选中的文本
function getSelectedText() {
    return window.getSelection().toString();
}

// 获取图片信息
function getImageInfo(img) {
    return {
        src: img.src,
        alt: img.alt || '',
        title: img.title || ''
    };
}

// 将函数暴露到全局作用域
window.extractPageContent = extractPageContent;
window.getPageMetadata = getPageMetadata;
window.getSelectedText = getSelectedText;
window.getImageInfo = getImageInfo; 