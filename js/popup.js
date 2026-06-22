import { loadSettings, resetSettings, fetchAiConfig, defaultSettings } from './settings.js';
import { initializeUIListeners, showStatus, hideStatus } from './ui.js';
import { loadQuickNote, initializeQuickNoteListeners } from './quickNote.js';
import { checkSummaryState, initializeSummaryListeners, handleSummaryResponse } from './summary.js';

let prefersColorSchemeWatcher = null;

// Apply theme
function applyTheme(theme) {
    document.body.classList.remove('dark-theme', 'light-theme');
    
    if (theme === 'system') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.add('light-theme');
        }
    } else if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.add('light-theme');
    }
}

// Watch system theme changes
function watchSystemTheme(currentTheme) {
    if (prefersColorSchemeWatcher) {
        prefersColorSchemeWatcher.removeEventListener('change', handleSystemThemeChange);
    }
    
    if (window.matchMedia) {
        prefersColorSchemeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
        prefersColorSchemeWatcher.addEventListener('change', () => handleSystemThemeChange(currentTheme));
    }
}

function handleSystemThemeChange(currentTheme) {
    if (currentTheme === 'system') {
        applyTheme('system');
    }
}

// Initialize i18n text
function initializeI18n() {
    document.querySelectorAll('[title]').forEach(element => {
        const messageKey = element.getAttribute('title');
        if (messageKey.startsWith('__MSG_') && messageKey.endsWith('__')) {
            const key = messageKey.slice(6, -2);
            element.setAttribute('title', chrome.i18n.getMessage(key));
        }
    });

    document.querySelectorAll('*').forEach(element => {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            const originalText = textNode.textContent;
            if (originalText.includes('__MSG_') && originalText.includes('__')) {
                const translatedText = originalText.replace(/__MSG_(\w+)__/g, (match, key) => {
                    return chrome.i18n.getMessage(key) || match;
                });
                textNode.textContent = translatedText;
            }
        });
    });

    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(element => {
        const placeholderKey = element.getAttribute('placeholder');
        if (placeholderKey.startsWith('__MSG_') && placeholderKey.endsWith('__')) {
            const key = placeholderKey.slice(6, -2);
            element.setAttribute('placeholder', chrome.i18n.getMessage(key));
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Initialize i18n text
        initializeI18n();

        // Load settings and apply theme
        const settings = await loadSettings();
        const theme = settings.theme || 'system';
        applyTheme(theme);
        watchSystemTheme(theme);

        // Check if opened via notification click
        const urlParams = new URLSearchParams(window.location.search);
        const defaultTab = urlParams.get('tab') || 'common';

        // Hide all tab contents
        document.querySelectorAll('.tabcontent').forEach(content => {
            content.style.display = 'none';
        });

        // Remove active state from all tabs
        document.querySelectorAll('.tablinks').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show default tab and activate corresponding tab
        document.getElementById(defaultTab).style.display = 'block';
        const defaultTabButton = document.querySelector(`.tablinks[data-tab="${defaultTab}"]`);
        if (defaultTabButton) {
            defaultTabButton.classList.add('active');
        }

        // Initialize all event listeners
        initializeUIListeners();
        initializeQuickNoteListeners();
        initializeSummaryListeners();

        // Bind extract page content button event
        document.getElementById('extractContent').addEventListener('click', async () => {
            try {
                showStatus(chrome.i18n.getMessage('extractingContent'), 'loading');
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) {
                    throw new Error(chrome.i18n.getMessage('cannotGetTab'));
                }

                // Send message to content script to get content
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'getContent'
                });

                if (!response || !response.success) {
                    throw new Error(response?.error || chrome.i18n.getMessage('contentExtractionFailed'));
                }

                // Send to background for processing
                chrome.runtime.sendMessage({
                    action: 'processContent',
                    content: response.content,
                    title: response.title,
                    url: response.url,
                    isExtractOnly: true
                });

            } catch (error) {
                console.error('Failed to extract page content:', error);
                showStatus(chrome.i18n.getMessage('settingsSaveError', [error.message]), 'error');
            }
        });

        // Load Quick Note
        await loadQuickNote();

        // Check for pending summary to display
        await checkSummaryState();

    } catch (error) {
        console.error('Initialization failed:', error);
        showStatus(chrome.i18n.getMessage('initializationError', [error.message]), 'error');
    }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'handleSummaryResponse') {
        handleSummaryResponse(request);
        sendResponse({ received: true });
    } else if (request && request.action === 'saveSummaryResponse') {
        if (request.response.success) {
            showStatus(chrome.i18n.getMessage('statusSaveSuccess') || 'Saved successfully', 'success');
            setTimeout(hideStatus, 2000);
        } else {
            showStatus((chrome.i18n.getMessage('statusSaveFailed') || 'Save failed') + ': ' + request.response.error, 'error');
        }
        sendResponse({ received: true });
    } else if (request && request.action === 'floatingBallResponse') {
        if (request.response.success) {
            showStatus(request.response.isExtractOnly ? (chrome.i18n.getMessage('statusExtractSuccess') || 'Extracted successfully') : (chrome.i18n.getMessage('statusSummarySuccess') || 'Summarized successfully'), 'success');
            setTimeout(hideStatus, 2000);
        } else {
            showStatus((request.response.isExtractOnly ? (chrome.i18n.getMessage('notificationExtractErrorTitle') || 'Extract failed') : (chrome.i18n.getMessage('statusSummaryFailed') || 'Summary failed')) + ': ' + request.response.error, 'error');
        }
        sendResponse({ received: true });
    } else if (request && request.action === 'clearSummaryResponse') {
        if (request.success) {
            showStatus(chrome.i18n.getMessage('statusClearSuccess') || 'Cleared successfully', 'success');
            setTimeout(hideStatus, 2000);
        }
        sendResponse({ received: true });
    }
    return false;  // Do not keep message channel open
});

// Notify background when popup closes
window.addEventListener('unload', async () => {
    try {
        // If summaryPreview is hidden, user cancelled or saved content; clean up storage
        const summaryPreview = document.getElementById('summaryPreview');
        if (summaryPreview && summaryPreview.style.display === 'none') {
            await chrome.storage.local.remove('currentSummary');
        }
        
        chrome.runtime.sendMessage({ action: "popupClosed" }).catch(() => {
            // Ignore error, connection error may occur when popup closes
        });

        // Clean up theme listener
        if (prefersColorSchemeWatcher) {
            prefersColorSchemeWatcher.removeEventListener('change', handleSystemThemeChange);
        }
    } catch (error) {
        // Ignore error
    }
});