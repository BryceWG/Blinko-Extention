import { showStatus } from './ui.js';
import { normalizeAuthToken } from './api.js';

// 默认设置
const defaultSettings = {
    targetUrl: '',
    authKey: '',
    modelUrl: '',
    apiKey: '',
    modelName: 'gpt-4o-mini',
    temperature: 0.5,
    promptTemplate: `请你根据提供的网页内容，撰写一份结构清晰、重点突出且不遗漏重要内容的摘要。
    
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
以下是网页内容：{content}`,
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
            settings = { ...defaultSettings };
        } else {
            // 只为必需的设置项提供默认值
            settings.modelName = settings.modelName || defaultSettings.modelName;
            settings.temperature = settings.temperature || defaultSettings.temperature;
            settings.promptTemplate = settings.promptTemplate || defaultSettings.promptTemplate;
            settings.includeSummaryUrl = settings.includeSummaryUrl !== undefined ? settings.includeSummaryUrl : defaultSettings.includeSummaryUrl;
            settings.includeSelectionUrl = settings.includeSelectionUrl !== undefined ? settings.includeSelectionUrl : defaultSettings.includeSelectionUrl;
            settings.includeImageUrl = settings.includeImageUrl !== undefined ? settings.includeImageUrl : defaultSettings.includeImageUrl;
            settings.includeQuickNoteUrl = settings.includeQuickNoteUrl !== undefined ? settings.includeQuickNoteUrl : defaultSettings.includeQuickNoteUrl;
            settings.enableFloatingBall = settings.enableFloatingBall !== undefined ? settings.enableFloatingBall : defaultSettings.enableFloatingBall;
            settings.jinaApiKey = settings.jinaApiKey || defaultSettings.jinaApiKey;
            settings.useJinaApiKey = settings.useJinaApiKey !== undefined ? settings.useJinaApiKey : defaultSettings.useJinaApiKey;
            settings.saveWebImages = settings.saveWebImages !== undefined ? settings.saveWebImages : defaultSettings.saveWebImages;
            settings.extractTag = settings.extractTag !== undefined ? settings.extractTag : defaultSettings.extractTag;
            // 标签设置保持原样，不使用默认值
        }

        console.log('加载的设置:', settings);
        
        // 更新UI
        const elements = {
            'targetUrl': settings.targetUrl || '',
            'authKey': settings.authKey || '',
            'modelUrl': settings.modelUrl || '',
            'apiKey': settings.apiKey || '',
            'modelName': settings.modelName || '',
            'temperature': settings.temperature || '0.7',
            'promptTemplate': settings.promptTemplate || '',
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
        const settings = {
            targetUrl: document.getElementById('targetUrl').value.trim(),
            authKey: document.getElementById('authKey').value.trim(),
            modelUrl: document.getElementById('modelUrl').value.trim(),
            apiKey: document.getElementById('apiKey').value.trim(),
            modelName: document.getElementById('modelName').value.trim() || defaultSettings.modelName,
            temperature: parseFloat(document.getElementById('temperature').value) || defaultSettings.temperature,
            promptTemplate: document.getElementById('promptTemplate').value || defaultSettings.promptTemplate,
            includeSummaryUrl: document.getElementById('includeSummaryUrl').checked,
            includeSelectionUrl: document.getElementById('includeSelectionUrl').checked,
            includeImageUrl: document.getElementById('includeImageUrl').checked,
            includeQuickNoteUrl: document.getElementById('includeQuickNoteUrl').checked,
            summaryTag: document.getElementById('summaryTag').value,  // 不使用trim()，允许空值
            selectionTag: document.getElementById('selectionTag').value,  // 不使用trim()，允许空值
            imageTag: document.getElementById('imageTag').value,  // 不使用trim()，允许空值
            enableFloatingBall: document.getElementById('enableFloatingBall').checked,
            jinaApiKey: document.getElementById('jinaApiKey').value.trim(),
            useJinaApiKey: document.getElementById('useJinaApiKey').checked,
            saveWebImages: document.getElementById('saveWebImages').checked,
            extractTag: document.getElementById('extractTag').value  // 不使用trim()，允许空值
        };

        // 保存到chrome.storage
        await chrome.storage.sync.set({ settings });
        
        // 通知所有标签页更新悬浮球状态
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'updateFloatingBallState',
                    enabled: settings.enableFloatingBall
                });
            } catch (error) {
                console.log('Tab not ready:', tab.id);
            }
        }

        console.log('设置已保存:', settings);
        showStatus('设置已保存', 'success');
        return settings;
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
        const settings = { ...defaultSettings };
        
        // 更新UI
        document.getElementById('targetUrl').value = settings.targetUrl;
        document.getElementById('authKey').value = settings.authKey;
        document.getElementById('modelUrl').value = settings.modelUrl;
        document.getElementById('apiKey').value = settings.apiKey;
        document.getElementById('modelName').value = settings.modelName;
        document.getElementById('temperature').value = settings.temperature;
        document.getElementById('promptTemplate').value = settings.promptTemplate;
        document.getElementById('includeSummaryUrl').checked = settings.includeSummaryUrl;
        document.getElementById('includeSelectionUrl').checked = settings.includeSelectionUrl;
        document.getElementById('includeImageUrl').checked = settings.includeImageUrl;
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

        // 构建请求URL，确保不重复添加v1
        const baseUrl = targetUrl.replace(/\/+$/, ''); // 移除尾的斜杠
        const configUrl = `${baseUrl}/config/list`;

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