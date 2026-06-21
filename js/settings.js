import { showStatus } from './ui.js';
import { normalizeAuthToken, normalizeBlinkoApiBaseUrl } from './api.js';

// Default settings
const defaultSettings = {
    targetUrl: '',
    authKey: '',
    modelUrl: '',
    apiKey: '',
    modelName: 'gpt-4o-mini',
    temperature: 0.5,
    promptTemplates: [
        {
            id: 'default-summary',
            name: chrome.i18n.getMessage('promptDefaultSummaryName') || 'Default Summary Template',
            content: chrome.i18n.getMessage('promptDefaultSummaryContent') || `Please summarize the following content: {content}`
        },
        {
            id: 'short-summary',
            name: chrome.i18n.getMessage('promptShortSummaryName') || 'Short Summary Template',
            content: chrome.i18n.getMessage('promptShortSummaryContent') || `Please summarize the following web content in one sentence: {content}`
        }
    ],
    activePromptTemplateId: 'default-summary',
    includeSummaryUrl: true,    // Whether summary notes include URL
    includeSelectionUrl: true,  // Whether selected text save includes URL
    includeImageUrl: true,      // Whether image save includes URL
    includeQuickNoteUrl: false, // Whether Quick Note includes URL
    summaryTag: chrome.i18n.getMessage('tagSummary') || '#Web/Summary',   // Tag for web summary
    selectionTag: chrome.i18n.getMessage('tagSelection') || '#Web/Excerpt',  // Tag for selected text
    imageTag: chrome.i18n.getMessage('tagImage') || '#Web/Image',     // Tag for image save
    extractTag: chrome.i18n.getMessage('tagExtract') || '#Web/Clip',   // Tag for web clip
    enableFloatingBall: true,   // Whether to enable floating ball
    floatingBallSize: 'medium', // Floating ball size: 'small', 'medium', 'large'
    jinaApiKey: '',            // Jina Reader API Key
    useJinaApiKey: false,      // Whether to use API key to accelerate
    saveWebImages: false,       // Whether to save web image links
    domainPromptMappings: [],   // Domain-specific template mappings
    theme: 'system'             // Theme setting: 'light', 'dark', 'system'
};

// Load settings
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get('settings');
        let settings = result.settings;
        
        // If no saved settings, use defaults
        if (!settings) {
            settings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy
        } else {
            // Merge settings, saved values take precedence, defaults fill gaps
            settings = { ...JSON.parse(JSON.stringify(defaultSettings)), ...settings };

            // Data migration: handle old promptTemplate string
            if (typeof settings.promptTemplate === 'string' && (!settings.promptTemplates || settings.promptTemplates.length === 0)) {
                console.log('Migrating old promptTemplate to new structure.');
                settings.promptTemplates = [
                    {
                        id: 'migrated-prompt',
                        name: chrome.i18n.getMessage('promptMigratedName') || 'Migrated Template',
                        content: settings.promptTemplate
                    },
                    ...defaultSettings.promptTemplates.filter(pt => pt.id !== 'default-summary') // Add other default templates to avoid duplicates
                ];
                settings.activePromptTemplateId = 'migrated-prompt';
                delete settings.promptTemplate; // Delete old field
            } else if (!settings.promptTemplates || settings.promptTemplates.length === 0) {
                settings.promptTemplates = JSON.parse(JSON.stringify(defaultSettings.promptTemplates));
                settings.activePromptTemplateId = defaultSettings.activePromptTemplateId;
            }
            
            // Ensure activePromptTemplateId is valid, otherwise set to default
            if (!settings.promptTemplates.find(pt => pt.id === settings.activePromptTemplateId)) {
                settings.activePromptTemplateId = defaultSettings.activePromptTemplateId;
                 // If default ID also doesn't exist in current template list (e.g., user deleted all templates), select first template
                if (settings.promptTemplates.length > 0 && !settings.promptTemplates.find(pt => pt.id === settings.activePromptTemplateId)) {
                    settings.activePromptTemplateId = settings.promptTemplates[0].id;
                } else if (settings.promptTemplates.length === 0) {
                    // If no templates exist, restore default templates
                    settings.promptTemplates = JSON.parse(JSON.stringify(defaultSettings.promptTemplates));
                    settings.activePromptTemplateId = defaultSettings.activePromptTemplateId;
                }
            }

            // Ensure other settings have default values
            settings.modelName = settings.modelName || defaultSettings.modelName;
            settings.temperature = settings.temperature === undefined ? defaultSettings.temperature : settings.temperature;
            settings.includeSummaryUrl = settings.includeSummaryUrl !== undefined ? settings.includeSummaryUrl : defaultSettings.includeSummaryUrl;
            settings.includeSelectionUrl = settings.includeSelectionUrl !== undefined ? settings.includeSelectionUrl : defaultSettings.includeSelectionUrl;
            settings.includeImageUrl = settings.includeImageUrl !== undefined ? settings.includeImageUrl : defaultSettings.includeImageUrl;
            settings.includeQuickNoteUrl = settings.includeQuickNoteUrl !== undefined ? settings.includeQuickNoteUrl : defaultSettings.includeQuickNoteUrl;
            settings.enableFloatingBall = settings.enableFloatingBall !== undefined ? settings.enableFloatingBall : defaultSettings.enableFloatingBall;
            settings.floatingBallSize = settings.floatingBallSize || defaultSettings.floatingBallSize; // Ensure floatingBallSize has default value
            settings.jinaApiKey = settings.jinaApiKey || defaultSettings.jinaApiKey;
            settings.useJinaApiKey = settings.useJinaApiKey !== undefined ? settings.useJinaApiKey : defaultSettings.useJinaApiKey;
            settings.saveWebImages = settings.saveWebImages !== undefined ? settings.saveWebImages : defaultSettings.saveWebImages;
            settings.extractTag = settings.extractTag !== undefined ? settings.extractTag : defaultSettings.extractTag;
            settings.theme = settings.theme || defaultSettings.theme; // Ensure theme has default value
 
            // Ensure domainPromptMappings is an array
            if (!Array.isArray(settings.domainPromptMappings)) {
                settings.domainPromptMappings = JSON.parse(JSON.stringify(defaultSettings.domainPromptMappings));
            }
        }

        // Get currently active template content for UI display
        const activeTemplate = settings.promptTemplates.find(pt => pt.id === settings.activePromptTemplateId);
        const currentPromptContent = activeTemplate ? activeTemplate.content : (settings.promptTemplates.length > 0 ? settings.promptTemplates[0].content : '');

        const elements = {
            'targetUrl': settings.targetUrl || '',
            'authKey': settings.authKey || '',
            'modelUrl': settings.modelUrl || '',
            'apiKey': settings.apiKey || '',
            'modelName': settings.modelName || '',
            'temperature': settings.temperature !== undefined ? settings.temperature.toString() : defaultSettings.temperature.toString(),
            'promptTemplate': currentPromptContent, // Use currently active template content
            'includeSummaryUrl': settings.includeSummaryUrl !== false,
            'includeSelectionUrl': settings.includeSelectionUrl !== false,
            'includeImageUrl': settings.includeImageUrl !== false,
            'includeQuickNoteUrl': settings.includeQuickNoteUrl !== false,
            'summaryTag': settings.summaryTag || '',
            'selectionTag': settings.selectionTag || '',
            'imageTag': settings.imageTag || '',
            'enableFloatingBall': settings.enableFloatingBall !== false,
            'jinaApiKey': settings.jinaApiKey || '',
            'useJinaApiKey': settings.useJinaApiKey !== false,
            'saveWebImages': settings.saveWebImages !== false,
            'extractTag': settings.extractTag || '',
            // 'theme' UI update is handled mainly in popup.js via applyTheme; included here for completeness
        };
 
        // Safely update each element
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            }
        });
        
        return settings;
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus((chrome.i18n.getMessage('statusLoadingSettingsFailed') || 'Failed to load settings') + ': ' + error.message, 'error');
        return defaultSettings;
    }
}

// Reset settings
async function resetSettings() {
    try {
        await chrome.storage.sync.remove('settings');
        const settings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy
        
        // Update UI
        document.getElementById('targetUrl').value = settings.targetUrl;
        document.getElementById('authKey').value = settings.authKey;
        document.getElementById('modelUrl').value = settings.modelUrl;
        document.getElementById('apiKey').value = settings.apiKey;
        document.getElementById('modelName').value = settings.modelName;
        document.getElementById('temperature').value = settings.temperature.toString();
        
        const activeTemplate = settings.promptTemplates.find(pt => pt.id === settings.activePromptTemplateId);
        document.getElementById('promptTemplate').value = activeTemplate ? activeTemplate.content : (settings.promptTemplates.length > 0 ? settings.promptTemplates[0].content : '');
        
        // Update promptTemplateSelector (usually done in popup.js, but also needed on reset)
        const promptSelector = document.getElementById('promptTemplateSelector');
        if (promptSelector) {
            promptSelector.innerHTML = ''; // Clear existing options
            settings.promptTemplates.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = template.name;
                promptSelector.appendChild(option);
            });
            promptSelector.value = settings.activePromptTemplateId;
        }

        document.getElementById('includeSummaryUrl').checked = settings.includeSummaryUrl;
        document.getElementById('includeSelectionUrl').checked = settings.includeSelectionUrl;
        document.getElementById('includeImageUrl').checked = settings.includeImageUrl;
        document.getElementById('includeQuickNoteUrl').checked = settings.includeQuickNoteUrl; // Added missing field
        document.getElementById('summaryTag').value = settings.summaryTag;
        document.getElementById('selectionTag').value = settings.selectionTag;
        document.getElementById('imageTag').value = settings.imageTag;
        document.getElementById('enableFloatingBall').checked = settings.enableFloatingBall;
        document.getElementById('jinaApiKey').value = settings.jinaApiKey;
        document.getElementById('useJinaApiKey').checked = settings.useJinaApiKey;
        document.getElementById('saveWebImages').checked = settings.saveWebImages;
        document.getElementById('extractTag').value = settings.extractTag;
        
        console.log('Settings reset to defaults:', settings);
        showStatus(chrome.i18n.getMessage('settingsReset') || 'Settings have been reset to defaults', 'success');
    } catch (error) {
        console.error('Error resetting settings:', error);
        showStatus(chrome.i18n.getMessage('settingsResetError', [error.message]) || 'Failed to reset settings: ' + error.message, 'error');
    }
}

// Fetch AI config from Blinko
async function fetchAiConfig() {
    try {
        const targetUrl = document.getElementById('targetUrl').value.trim();
        const authKey = document.getElementById('authKey').value.trim();

        if (!targetUrl || !authKey) {
            showStatus(chrome.i18n.getMessage('statusPleaseConfigure') || 'Please fill in the Blinko API URL and authentication key first', 'error');
            return;
        }

        // Build request URL ensuring it includes /api/v1
        const normalizedBaseUrl = normalizeBlinkoApiBaseUrl(targetUrl);
        const configUrl = `${normalizedBaseUrl}/config/list`;

        showStatus(chrome.i18n.getMessage('statusFetchingConfig') || 'Fetching configuration...', 'loading');
        
        const response = await fetch(configUrl, {
            method: 'GET',
            headers: {
                'Authorization': normalizeAuthToken(authKey)
            }
        });

        if (!response.ok) {
            throw new Error((chrome.i18n.getMessage('errorFetchConfigFailed') || 'Failed to fetch configuration') + ': ' + response.status);
        }

        const config = await response.json();
        
        if (config.aiModelProvider === 'OpenAI') {
            // Update UI
            document.getElementById('modelUrl').value = config.aiApiEndpoint || '';
            document.getElementById('apiKey').value = config.aiApiKey || '';
            document.getElementById('modelName').value = config.aiModel || '';
            
            showStatus(chrome.i18n.getMessage('statusAiConfigSuccess') || 'AI configuration fetched successfully', 'success');
        } else {
            showStatus((chrome.i18n.getMessage('statusUnsupportedAiProvider') || 'Unsupported AI provider') + ': ' + config.aiModelProvider, 'error');
        }
    } catch (error) {
        console.error('Error fetching AI config:', error);
        showStatus((chrome.i18n.getMessage('statusFetchAiConfigFailed') || 'Failed to fetch AI configuration') + ': ' + error.message, 'error');
    }
}

export {
    defaultSettings,
    loadSettings,
    resetSettings,
    fetchAiConfig
};