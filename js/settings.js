import { showStatus } from './ui.js';
import { normalizeAuthToken, normalizeBlinkoApiBaseUrl } from './api.js';

// 默认设置
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
    includeSummaryUrl: true,    // 总结笔记是否包含URL
    includeSelectionUrl: true,  // 划词保存是否包含URL
    includeImageUrl: true,      // 图片保存是否包含URL
    includeQuickNoteUrl: false, // 快捷记录是否包含URL
    summaryTag: chrome.i18n.getMessage('tagSummary') || '#Web/Summary',   // 网页总结的标签
    selectionTag: chrome.i18n.getMessage('tagSelection') || '#Web/Excerpt',  // 划词保存的标签
    imageTag: chrome.i18n.getMessage('tagImage') || '#Web/Image',     // 图片保存的标签
    extractTag: chrome.i18n.getMessage('tagExtract') || '#Web/Clip',   // 网页剪藏的标签
    enableFloatingBall: true,   // 是否启用悬浮球
    floatingBallSize: 'medium', // 悬浮球大小: 'small', 'medium', 'large'
    jinaApiKey: '',            // Jina Reader API Key
    useJinaApiKey: false,      // 是否使用API Key加速
    saveWebImages: false,       // 是否保存网页图片链接
    domainPromptMappings: [],   // 域名特定模板映射
    theme: 'system'             // 主题设置: 'light', 'dark', 'system'
};

// 加载设置
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get('settings');
        let settings = result.settings;
        
        // 如果没有保存的设置，使用默认值
        if (!settings) {
            settings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy
        } else {
            // 合并设置，优先使用已保存的，缺失则用默认值
            settings = { ...JSON.parse(JSON.stringify(defaultSettings)), ...settings };

            // 数据迁移：处理旧的 promptTemplate 字符串
            if (typeof settings.promptTemplate === 'string' && (!settings.promptTemplates || settings.promptTemplates.length === 0)) {
                console.log('Migrating old promptTemplate to new structure.');
                settings.promptTemplates = [
                    {
                        id: 'migrated-prompt',
                        name: chrome.i18n.getMessage('promptMigratedName') || 'Migrated Template',
                        content: settings.promptTemplate
                    },
                    ...defaultSettings.promptTemplates.filter(pt => pt.id !== 'default-summary') // 添加其他默认模板，避免重复
                ];
                settings.activePromptTemplateId = 'migrated-prompt';
                delete settings.promptTemplate; // 删除旧字段
            } else if (!settings.promptTemplates || settings.promptTemplates.length === 0) {
                settings.promptTemplates = JSON.parse(JSON.stringify(defaultSettings.promptTemplates));
                settings.activePromptTemplateId = defaultSettings.activePromptTemplateId;
            }
            
            // 确保 activePromptTemplateId 有效，否则设为默认
            if (!settings.promptTemplates.find(pt => pt.id === settings.activePromptTemplateId)) {
                settings.activePromptTemplateId = defaultSettings.activePromptTemplateId;
                 // 如果默认ID也不存在于当前模板列表中（例如，用户删除了所有模板），则选择第一个模板
                if (settings.promptTemplates.length > 0 && !settings.promptTemplates.find(pt => pt.id === settings.activePromptTemplateId)) {
                    settings.activePromptTemplateId = settings.promptTemplates[0].id;
                } else if (settings.promptTemplates.length === 0) {
                    // 如果没有任何模板，则恢复默认模板
                    settings.promptTemplates = JSON.parse(JSON.stringify(defaultSettings.promptTemplates));
                    settings.activePromptTemplateId = defaultSettings.activePromptTemplateId;
                }
            }

            // 确保其他设置项有默认值
            settings.modelName = settings.modelName || defaultSettings.modelName;
            settings.temperature = settings.temperature === undefined ? defaultSettings.temperature : settings.temperature;
            settings.includeSummaryUrl = settings.includeSummaryUrl !== undefined ? settings.includeSummaryUrl : defaultSettings.includeSummaryUrl;
            settings.includeSelectionUrl = settings.includeSelectionUrl !== undefined ? settings.includeSelectionUrl : defaultSettings.includeSelectionUrl;
            settings.includeImageUrl = settings.includeImageUrl !== undefined ? settings.includeImageUrl : defaultSettings.includeImageUrl;
            settings.includeQuickNoteUrl = settings.includeQuickNoteUrl !== undefined ? settings.includeQuickNoteUrl : defaultSettings.includeQuickNoteUrl;
            settings.enableFloatingBall = settings.enableFloatingBall !== undefined ? settings.enableFloatingBall : defaultSettings.enableFloatingBall;
            settings.floatingBallSize = settings.floatingBallSize || defaultSettings.floatingBallSize; // 确保 floatingBallSize 有默认值
            settings.jinaApiKey = settings.jinaApiKey || defaultSettings.jinaApiKey;
            settings.useJinaApiKey = settings.useJinaApiKey !== undefined ? settings.useJinaApiKey : defaultSettings.useJinaApiKey;
            settings.saveWebImages = settings.saveWebImages !== undefined ? settings.saveWebImages : defaultSettings.saveWebImages;
            settings.extractTag = settings.extractTag !== undefined ? settings.extractTag : defaultSettings.extractTag;
            settings.theme = settings.theme || defaultSettings.theme; // 确保 theme 有默认值
 
            // 确保 domainPromptMappings 是一个数组
            if (!Array.isArray(settings.domainPromptMappings)) {
                settings.domainPromptMappings = JSON.parse(JSON.stringify(defaultSettings.domainPromptMappings));
            }
        }

        // 获取当前激活的模板内容用于UI显示
        const activeTemplate = settings.promptTemplates.find(pt => pt.id === settings.activePromptTemplateId);
        const currentPromptContent = activeTemplate ? activeTemplate.content : (settings.promptTemplates.length > 0 ? settings.promptTemplates[0].content : '');

        const elements = {
            'targetUrl': settings.targetUrl || '',
            'authKey': settings.authKey || '',
            'modelUrl': settings.modelUrl || '',
            'apiKey': settings.apiKey || '',
            'modelName': settings.modelName || '',
            'temperature': settings.temperature !== undefined ? settings.temperature.toString() : defaultSettings.temperature.toString(),
            'promptTemplate': currentPromptContent, // 使用当前激活模板的内容
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
            // 'theme' 设置的UI更新主要在popup.js中通过applyTheme处理，这里仅为完整性
        };
 
        // 安全地更新每个元素
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
        console.error('加载设置时出错:', error);
        showStatus((chrome.i18n.getMessage('statusLoadingSettingsFailed') || 'Failed to load settings') + ': ' + error.message, 'error');
        return defaultSettings;
    }
}

// 重置设置
async function resetSettings() {
    try {
        await chrome.storage.sync.remove('settings');
        const settings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy
        
        // 更新UI
        document.getElementById('targetUrl').value = settings.targetUrl;
        document.getElementById('authKey').value = settings.authKey;
        document.getElementById('modelUrl').value = settings.modelUrl;
        document.getElementById('apiKey').value = settings.apiKey;
        document.getElementById('modelName').value = settings.modelName;
        document.getElementById('temperature').value = settings.temperature.toString();
        
        const activeTemplate = settings.promptTemplates.find(pt => pt.id === settings.activePromptTemplateId);
        document.getElementById('promptTemplate').value = activeTemplate ? activeTemplate.content : (settings.promptTemplates.length > 0 ? settings.promptTemplates[0].content : '');
        
        // 更新 promptTemplateSelector (这部分通常在 popup.js 中完成，但重置时也需要更新)
        const promptSelector = document.getElementById('promptTemplateSelector');
        if (promptSelector) {
            promptSelector.innerHTML = ''; // 清空现有选项
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
        
        console.log('设置已重置为默认值:', settings);
        showStatus(chrome.i18n.getMessage('settingsReset') || 'Settings have been reset to defaults', 'success');
    } catch (error) {
        console.error('重置设置时出错:', error);
        showStatus(chrome.i18n.getMessage('settingsResetError', [error.message]) || 'Failed to reset settings: ' + error.message, 'error');
    }
}

// 从Blinko获取AI配置
async function fetchAiConfig() {
    try {
        const targetUrl = document.getElementById('targetUrl').value.trim();
        const authKey = document.getElementById('authKey').value.trim();

        if (!targetUrl || !authKey) {
            showStatus(chrome.i18n.getMessage('statusPleaseConfigure') || 'Please fill in the Blinko API URL and authentication key first', 'error');
            return;
        }

        // 构建请求URL，确保包含/api/v1
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
            // 更新UI
            document.getElementById('modelUrl').value = config.aiApiEndpoint || '';
            document.getElementById('apiKey').value = config.aiApiKey || '';
            document.getElementById('modelName').value = config.aiModel || '';
            
            showStatus(chrome.i18n.getMessage('statusAiConfigSuccess') || 'AI configuration fetched successfully', 'success');
        } else {
            showStatus((chrome.i18n.getMessage('statusUnsupportedAiProvider') || 'Unsupported AI provider') + ': ' + config.aiModelProvider, 'error');
        }
    } catch (error) {
        console.error('获取AI配置时出错:', error);
        showStatus((chrome.i18n.getMessage('statusFetchAiConfigFailed') || 'Failed to fetch AI configuration') + ': ' + error.message, 'error');
    }
}

export {
    defaultSettings,
    loadSettings,
    resetSettings,
    fetchAiConfig
};