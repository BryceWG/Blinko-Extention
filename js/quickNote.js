import { showStatus } from './ui.js';
import { getCleanDomainUrl } from './api.js';

// Save Quick Note content
function saveQuickNote() {
    const input = document.getElementById('quickNoteInput');
    if (input && input.value.trim()) {
        chrome.storage.local.set({ 'quickNote': input.value });
    }
}

// Load Quick Note content
async function loadQuickNote() {
    try {
        // Load text content
        const result = await chrome.storage.local.get(['quickNote', 'quickNoteAttachments']);
        if (result.quickNote) {
            document.getElementById('quickNoteInput').value = result.quickNote;
        }

        // Load and display attachments
        if (result.quickNoteAttachments && result.quickNoteAttachments.length > 0) {
            // Create local URL for each attachment without localUrl
            const attachments = await Promise.all(result.quickNoteAttachments.map(async (attachment) => {
                if (!attachment.localUrl && attachment.originalUrl) {
                    try {
                        const response = await fetch(attachment.originalUrl);
                        const blob = await response.blob();
                        attachment.localUrl = URL.createObjectURL(blob);
                    } catch (error) {
                        console.error('Failed to create local URL:', error);
                    }
                }
                return attachment;
            }));

            // Update attachment info in storage
            await chrome.storage.local.set({ 'quickNoteAttachments': attachments });
            
            // Display attachments
            updateAttachmentList(attachments);
        }
    } catch (error) {
        console.error('Failed to load Quick Note:', error);
    }
}

// Update attachment list display
async function updateAttachmentList(attachments) {
    const attachmentItems = document.getElementById('attachmentItems');
    const clearAttachmentsBtn = document.getElementById('clearAttachments');
    
    // Clear existing content
    attachmentItems.innerHTML = '';
    
    // Show clear button if attachments exist
    clearAttachmentsBtn.style.display = attachments.length > 0 ? 'block' : 'none';

    // Get settings info
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings;
    
    if (!settings || !settings.targetUrl) {
        console.error('Settings not found');
        return;
    }

    // Add attachment item
    attachments.forEach((attachment, index) => {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        
        // Create image preview
        const img = document.createElement('img');
        
        // Prefer local image URL, fall back to Blinko URL
        if (attachment.localUrl) {
            img.src = attachment.localUrl;
        } else if (attachment.path) {
            // Use Blinko URL as fallback
            const cleanDomain = getCleanDomainUrl(settings.targetUrl);
            const path = attachment.path.startsWith('/') ? attachment.path : '/' + attachment.path;
            img.src = cleanDomain + path;
        }
        
        img.alt = attachment.name || (chrome.i18n.getMessage('attachmentImageAlt') || 'Attachment image');
        img.onerror = () => {
            // Show file name if image fails to load
            img.style.display = 'none';
            const textSpan = document.createElement('span');
            textSpan.textContent = attachment.name || (chrome.i18n.getMessage('attachmentImageLabel') || 'Image');
            textSpan.style.display = 'block';
            textSpan.style.padding = '8px';
            textSpan.style.textAlign = 'center';
            item.insertBefore(textSpan, img);
        };
        item.appendChild(img);
        
        // Create remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-button';
        removeBtn.innerHTML = '×';
        removeBtn.title = chrome.i18n.getMessage('removeAttachmentTooltip') || 'Remove attachment';
        removeBtn.onclick = () => removeAttachment(index);
        item.appendChild(removeBtn);
        
        attachmentItems.appendChild(item);
    });
}

// Clear image cache
function clearImageCache(attachments) {
    if (Array.isArray(attachments)) {
        attachments.forEach(attachment => {
            if (attachment.localUrl) {
                URL.revokeObjectURL(attachment.localUrl);
            }
        });
    }
}

// Clear all attachments
async function clearAttachments() {
    try {
        // Get current attachments list to clear cache
        const result = await chrome.storage.local.get('quickNoteAttachments');
        if (result.quickNoteAttachments) {
            clearImageCache(result.quickNoteAttachments);
        }
        await chrome.storage.local.remove('quickNoteAttachments');
        updateAttachmentList([]);
    } catch (error) {
        console.error('Failed to clear attachments:', error);
        showStatus((chrome.i18n.getMessage('statusClearAttachmentsFailed') || 'Failed to clear attachments') + ': ' + error.message, 'error');
    }
}

// Remove single attachment
async function removeAttachment(index) {
    try {
        const result = await chrome.storage.local.get('quickNoteAttachments');
        let attachments = result.quickNoteAttachments || [];
        
        // Clear image cache for attachment to be removed
        if (attachments[index] && attachments[index].localUrl) {
            URL.revokeObjectURL(attachments[index].localUrl);
        }
        
        // Remove attachment at specified index
        attachments.splice(index, 1);
        
        // Save updated attachments list
        await chrome.storage.local.set({ 'quickNoteAttachments': attachments });
        
        // Update display
        updateAttachmentList(attachments);
    } catch (error) {
        console.error('Failed to remove attachment:', error);
        showStatus((chrome.i18n.getMessage('statusRemoveAttachmentFailed') || 'Failed to remove attachment') + ': ' + error.message, 'error');
    }
}

// Clear Quick Note content
function clearQuickNote() {
    const input = document.getElementById('quickNoteInput');
    if (input) {
        input.value = '';
        // Get current attachments list to clear cache
        chrome.storage.local.get(['quickNoteAttachments'], result => {
            if (result.quickNoteAttachments) {
                clearImageCache(result.quickNoteAttachments);
            }
            // Clear data in storage
            chrome.storage.local.remove(['quickNote', 'quickNoteAttachments']);
            // Update attachment list display
            updateAttachmentList([]);
        });
    }
}

// Send Quick Note
async function sendQuickNote() {
    try {
        const input = document.getElementById('quickNoteInput');
        const content = input.value;
        if (!content.trim()) {
            showStatus(chrome.i18n.getMessage('statusPleaseEnterNote') || 'Please enter note content', 'error');
            return;
        }

        const result = await chrome.storage.sync.get('settings');
        const settings = result.settings;
        
        if (!settings) {
            throw new Error(chrome.i18n.getMessage('errorSettingsNotFound') || 'Settings not found');
        }

        showStatus(chrome.i18n.getMessage('statusSending') || 'Sending...', 'loading');

        // Get current tab info
        let url = '';
        let title = '';
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                url = tab.url;
                title = tab.title;
            }
        } catch (error) {
            console.error('Failed to get current tab info:', error);
        }

        // Get attachments list
        const attachmentsResult = await chrome.storage.local.get(['quickNoteAttachments']);
        const attachments = attachmentsResult.quickNoteAttachments || [];

        // Send message and wait for saveSummaryResponse
        const responsePromise = new Promise((resolve) => {
            const listener = (message) => {
                if (message.action === 'saveSummaryResponse') {
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(message.response);
                }
            };
            chrome.runtime.onMessage.addListener(listener);
            
            // Send request
            chrome.runtime.sendMessage({
                action: 'saveSummary',
                type: 'quickNote',
                content: content.trim(),
                url: url,
                title: title,
                attachments: attachments
            });
        });

        // Wait for response
        const response = await responsePromise;

        if (response && response.success) {
            showStatus(chrome.i18n.getMessage('statusSendSuccess') || 'Sent successfully', 'success');
            // Clear image cache after successful send
            clearImageCache(attachments);
            // Clear content and storage
            input.value = '';
            await chrome.storage.local.remove(['quickNote', 'quickNoteAttachments']);
            // Immediately update attachment list display
            updateAttachmentList([]);
        } else {
            showStatus((chrome.i18n.getMessage('statusSaveFailed') || 'Save failed') + ': ' + (response?.error || (chrome.i18n.getMessage('statusUnknownError') || 'Unknown error')), 'error');
        }
    } catch (error) {
        showStatus((chrome.i18n.getMessage('statusSaveFailed') || 'Save failed') + ': ' + error.message, 'error');
    }
}

// Initialize Quick Note event listeners
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