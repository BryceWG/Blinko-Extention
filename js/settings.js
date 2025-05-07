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
            name: '默认摘要模板',
            content: `请你根据提供的网页内容，撰写一份结构清晰、重点突出且不遗漏重要内容的摘要。
    
要求：
1. **摘要结构：**
    *   第一行使用'# 标题'格式取一个简要的大标题。
    *   一句话总结：请提供一个简洁、精炼的概括性语句，准确概括整个网页的核心内容。
    *   按照网页内容的逻辑顺序，依次总结各个主要部分的核心内容。
    
2. **突出重点：**  请识别并突出显示网页中的关键信息、主题、重要论点和结论。如果网页内容包含重要数据或结论，请务必在摘要中体现。
3. **不遗漏重要内容：**  在总结时，请确保覆盖网页的所有重要方面，避免关键信息缺失。
    
请注意：
*   摘要应保持客观中立，避免掺杂个人观点或情感色彩。
*   摘要的语言应简洁明了，避免使用过于专业或晦涩的词汇,并使用中文进行总结。
*   摘要的长度适中，既要全面覆盖重要内容，又要避免冗长啰嗦。
*   总结的末尾无需再进行总结，有一句话总结代替。
以下是网页内容：{content}`
        },
        {
            id: 'short-summary',
            name: '简洁摘要模板',
            content: `请用一句话总结以下网页内容：{content}`
        }
    ],
    activePromptTemplateId: 'default-summary',
    includeSummaryUrl: true,    // 总结笔记是否包含URL
    includeSelectionUrl: true,  // 划词保存是否包含URL
    includeImageUrl: true,      // 图片保存是否包含URL
    includeQuickNoteUrl: false, // 快捷记录是否包含URL
    summaryTag: '#网页/总结',   // 网页总结的标签
    selectionTag: '#网页/摘录',  // 划词保存的标签
    imageTag: '#网页/图片',     // 图片保存的标签
    extractTag: '#网页/剪藏',   // 网页剪藏的标签
    enableFloatingBall: true,   // 是否启用悬浮球
    jinaApiKey: '',            // Jina Reader API Key
    useJinaApiKey: false,      // 是否使用API Key加速
    saveWebImages: false       // 是否保存网页图片链接
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
                        name: '迁移的模板',
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
            settings.jinaApiKey = settings.jinaApiKey || defaultSettings.jinaApiKey;
            settings.useJinaApiKey = settings.useJinaApiKey !== undefined ? settings.useJinaApiKey : defaultSettings.useJinaApiKey;
            settings.saveWebImages = settings.saveWebImages !== undefined ? settings.saveWebImages : defaultSettings.saveWebImages;
            settings.extractTag = settings.extractTag !== undefined ? settings.extractTag : defaultSettings.extractTag;
        }

        console.log('加载的设置:', settings);
        
        // 更新UI
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
            'extractTag': settings.extractTag || ''
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
        showStatus('加载设置失败: ' + error.message, 'error');
        return defaultSettings;
    }
}

// 保存设置
async function saveSettings() {
    try {
        // 从UI读取基本设置，promptTemplates 和 activePromptTemplateId 应由 popup.js 更新到内存中的 settings 对象
        // 然后在调用 saveSettings 之前，popup.js 会将内存中的 settings 对象传递过来或settings.js能访问到它
        // 这里我们假设 settings 对象已经包含了最新的 promptTemplates 和 activePromptTemplateId
        // 因此，我们只需要读取其他表单元素的值并合并到传入的或已加载的 settings 对象上

        // 重新加载一次内存中的settings，确保拿到最新的（包含popup.js中对promptTemplates的修改）
        // 这一步通常由调用者（如popup.js）在调用saveSettings前完成，
        // 此处为了模块独立性，再次获取或依赖 popup.js 更新 settings 对象。
        // 更好的做法是 saveSettings 接收一个 settings 对象作为参数。
        // 为简化，此处假设 settings 变量已在 loadSettings 后被 popup.js 更新。
        // 或者，我们直接从 storage 加载最新的，然后合并 UI 的改动。

        // 此处的 settings 应该是 loadSettings 返回并可能被 popup.js 修改过的版本
        // 我们只更新那些直接从UI元素读取的字段
        const currentSettings = await loadSettings(); // 获取包含最新模板数据的设置

        const updatedSettings = {
            ...currentSettings, // 保留已有的 promptTemplates 和 activePromptTemplateId
            targetUrl: document.getElementById('targetUrl').value.trim(),
            authKey: document.getElementById('authKey').value.trim(),
            modelUrl: document.getElementById('modelUrl').value.trim(),
            apiKey: document.getElementById('apiKey').value.trim(),
            modelName: document.getElementById('modelName').value.trim() || defaultSettings.modelName,
            temperature: parseFloat(document.getElementById('temperature').value) || defaultSettings.temperature,
            // promptTemplate 字段不再直接保存，其内容已合并到 currentSettings.promptTemplates 中
            includeSummaryUrl: document.getElementById('includeSummaryUrl').checked,
            includeSelectionUrl: document.getElementById('includeSelectionUrl').checked,
            includeImageUrl: document.getElementById('includeImageUrl').checked,
            includeQuickNoteUrl: document.getElementById('includeQuickNoteUrl').checked,
            summaryTag: document.getElementById('summaryTag').value,
            selectionTag: document.getElementById('selectionTag').value,
            imageTag: document.getElementById('imageTag').value,
            enableFloatingBall: document.getElementById('enableFloatingBall').checked,
            jinaApiKey: document.getElementById('jinaApiKey').value.trim(),
            useJinaApiKey: document.getElementById('useJinaApiKey').checked,
            saveWebImages: document.getElementById('saveWebImages').checked,
            extractTag: document.getElementById('extractTag').value
        };
        
        // 确保 promptTemplate 字段被移除（如果存在于旧结构中）
        delete updatedSettings.promptTemplate;

        // 保存到chrome.storage
        await chrome.storage.sync.set({ settings: updatedSettings });
        
        // 通知所有标签页更新悬浮球状态
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'updateFloatingBallState',
                    enabled: updatedSettings.enableFloatingBall
                });
            } catch (error) {
                console.log('Tab not ready:', tab.id);
            }
        }

        console.log('设置已保存:', updatedSettings);
        showStatus('设置已保存', 'success');
        return updatedSettings;

    } catch (error) {
        console.error('保存设置时出错:', error);
        showStatus('保存设置失败: ' + error.message, 'error');
        throw error;
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
        showStatus('设置已重置为默认值', 'success');
    } catch (error) {
        console.error('重置设置时出错:', error);
        showStatus('重置设置失败: ' + error.message, 'error');
    }
}

// 从Blinko获取AI配置
async function fetchAiConfig() {
    try {
        const targetUrl = document.getElementById('targetUrl').value.trim();
        const authKey = document.getElementById('authKey').value.trim();

        if (!targetUrl || !authKey) {
            showStatus('请先填写Blinko API URL和认证密钥', 'error');
            return;
        }

        // 构建请求URL，确保包含/api/v1
        const normalizedBaseUrl = normalizeBlinkoApiBaseUrl(targetUrl);
        const configUrl = `${normalizedBaseUrl}/config/list`;

        showStatus('正在获取配置...', 'loading');
        
        const response = await fetch(configUrl, {
            method: 'GET',
            headers: {
                'Authorization': normalizeAuthToken(authKey)
            }
        });

        if (!response.ok) {
            throw new Error(`获取配置失败: ${response.status}`);
        }

        const config = await response.json();
        
        if (config.aiModelProvider === 'OpenAI') {
            // 更新UI
            document.getElementById('modelUrl').value = config.aiApiEndpoint || '';
            document.getElementById('apiKey').value = config.aiApiKey || '';
            document.getElementById('modelName').value = config.aiModel || '';
            
            showStatus('AI配置获取成功', 'success');
        } else {
            showStatus('当前不支持的AI提供商: ' + config.aiModelProvider, 'error');
        }
    } catch (error) {
        console.error('获取AI配置时出错:', error);
        showStatus('获取AI配置失败: ' + error.message, 'error');
    }
}

export {
    defaultSettings,
    loadSettings,
    saveSettings,
    resetSettings,
    fetchAiConfig
}; 