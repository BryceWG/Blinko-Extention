// Original link prefix (used for link deduplication in content)
const ORIGINAL_LINK_PREFIX = chrome.i18n.getMessage('labelOriginalLink') || 'Original link:';

// Escape regular expression special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get original link regular expression
function getOriginalLinkRegExp() {
    return new RegExp(escapeRegExp(ORIGINAL_LINK_PREFIX) + '\\[.*?\\]\\(.*?\\)', 'g');
}

// Extract page content
function extractPageContent() {
    try {
        // Get body content
        const content = document.body.innerText
            .replace(/[\n\r]+/g, '\n') // Replace multiple line breaks with single
            .replace(/\s+/g, ' ') // Replace multiple spaces with single
            .replace(getOriginalLinkRegExp(), '') // Remove possibly existing original link
            .trim(); // Trim leading and trailing whitespace
        
        return content;
    } catch (error) {
        console.error('Error extracting content:', error);
        throw error;
    }
}

// Get page metadata
function getPageMetadata() {
    return {
        url: window.location.href,
        title: document.title
    };
}

// Get selected text
function getSelectedText() {
    return window.getSelection().toString();
}

// Get image info
function getImageInfo(img) {
    return {
        src: img.src,
        alt: img.alt || '',
        title: img.title || ''
    };
}

// Expose functions to global scope
window.extractPageContent = extractPageContent;
window.getPageMetadata = getPageMetadata;
window.getSelectedText = getSelectedText;
window.getImageInfo = getImageInfo; 