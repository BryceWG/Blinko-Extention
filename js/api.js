// 规范化认证令牌，确保以 "Bearer " 开头且只有一个前缀
function normalizeAuthToken(tokenString) {
   if (!tokenString) {
       return '';
   }
   
   const trimmedToken = tokenString.trim();
   const bearerRegex = /^bearer\s+/i;
   
   if (bearerRegex.test(trimmedToken)) {
       const baseToken = trimmedToken.replace(bearerRegex, '').trim();
       return `Bearer ${baseToken}`;
   }
   
   return `Bearer ${trimmedToken}`;
}

// 规范化Blinko API基础URL，确保以 "/api/v1" 结尾
function normalizeBlinkoApiBaseUrl(userInputUrl) {
   if (!userInputUrl) {
       return '';
   }
   
   const trimmedUrl = userInputUrl.trim().replace(/\/+$/, '');
   if (trimmedUrl.includes('/api/v1')) {
       return trimmedUrl.split('/api/v1')[0] + '/api/v1';
   }
   
   return `${trimmedUrl}/api/v1`;
}

// 获取纯净的域名URL，移除末尾的/api/v1路径和所有末尾斜杠
function getCleanDomainUrl(userInputUrl) {
   if (!userInputUrl) {
       return '';
   }
   
   const trimmedUrl = userInputUrl.trim();
   const apiV1Index = trimmedUrl.indexOf('/api/v1');
   let cleanUrl = apiV1Index !== -1 ? trimmedUrl.substring(0, apiV1Index) : trimmedUrl;
   cleanUrl = cleanUrl.replace(/\/+$/, '');
   return cleanUrl;
}

// 获取完整的API URL
function getFullApiUrl(baseUrl, endpoint) {
    try {
        const url = new URL(baseUrl);
        // 检查是否已经包含了完整的API路径
        if (baseUrl.includes('/v1/chat/completions')) {
            return baseUrl;
        }
        // 如果URL中包含/v1，则使用它之前的部分作为基础URL
        if (baseUrl.includes('/v1')) {
            return baseUrl.split('/v1')[0] + '/v1' + endpoint;
        }
        // 如果URL不包含/v1，则直接添加
        return baseUrl.replace(/\/+$/, '') + '/v1' + endpoint;
    } catch (error) {
        console.error('解析URL时出错:', error);
        throw new Error('URL格式不正确: ' + error.message);
    }
}

// 从模型获取总结
async function getSummaryFromModel(content, settings) {
    try {
        const prompt = settings.promptTemplate.replace('{content}', content);
        
        // 获取完整的API URL
        const fullUrl = getFullApiUrl(settings.modelUrl, '/chat/completions');
        
        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': normalizeAuthToken(settings.apiKey)
            },
            body: JSON.stringify({
                model: settings.modelName,
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: settings.temperature
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API请求失败: ${response.status} ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API返回式错误');
        }

        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('获取总结时出错:', error);
        throw error;
    }
}

// 上传图片文件到Blinko
async function uploadFile(file, settings) {
    try {
        if (!settings.targetUrl || !settings.authKey) {
            throw new Error('请先配置Blinko API URL和认证密钥');
        }

        // 构建上传URL
        const normalizedBaseUrl = normalizeBlinkoApiBaseUrl(settings.targetUrl);
        const uploadUrl = `${normalizedBaseUrl}/file/upload`;

        // 创建FormData对象
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': normalizeAuthToken(settings.authKey)
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`上传图片失败: ${response.status}`);
        }

        const data = await response.json();
        if (data.status !== 200 || !data.filePath) {
            throw new Error('上传图片响应格式错误');
        }

        return {
            name: data.fileName,
            path: data.filePath,
            size: data.size,
            type: data.type
        };
    } catch (error) {
        console.error('上传图片失败:', error);
        throw error;
    }
}

// 发送内容到Blinko
async function sendToBlinko(content, url, title, imageAttachment = null, type = 'summary') {
    try {
        // 获取设置
        const result = await chrome.storage.sync.get('settings');
        const settings = result.settings;
        
        if (!settings || !settings.targetUrl || !settings.authKey) {
            throw new Error('请先配置Blinko API URL和认证密钥');
        }

        // 构建请求URL，确保不重复添加v1
        const normalizedBaseUrl = normalizeBlinkoApiBaseUrl(settings.targetUrl);
        const requestUrl = `${normalizedBaseUrl}/note/upsert`;

        // 根据不同类型添加不同的标签和URL
        let finalContent = content;
        
        // 根据设置和类型决定是否添加URL
        if (url && (
            (type === 'summary' && settings.includeSummaryUrl) ||
            (type === 'extract' && settings.includeSelectionUrl) ||
            (type === 'image' && settings.includeImageUrl) ||
            // 对于快捷记录，只有在内容中没有链接时才添加
            (type === 'quickNote' && settings.includeQuickNoteUrl && 
             !finalContent.includes(`原文链接：[${title || url}](${url})`))
        )) {
            // 对于图片类型，使用不同的链接格式
            if (type === 'image') {
                finalContent = finalContent || '';  // 确保finalContent不是undefined
                finalContent = `${finalContent}${finalContent ? '\n\n' : ''}> 来源：[${title || url}](${url})`;
            } else {
                finalContent = `${finalContent}\n\n原文链接：[${title || url}](${url})`;
            }
        }

        // 添加标签
        if (type === 'summary' && settings.summaryTag) {
            finalContent = `${finalContent}\n\n${settings.summaryTag}`;
        } else if (type === 'extract' && settings.extractTag) {
            finalContent = `${finalContent}\n\n${settings.extractTag}`;
        } else if (type === 'image' && settings.imageTag) {
            finalContent = finalContent ? `${finalContent}\n\n${settings.imageTag}` : settings.imageTag;
        }

        // 构建请求体
        const requestBody = {
            content: finalContent,
            type: 0
        };

        // 处理附件
        if (Array.isArray(imageAttachment)) {
            // 如果是数组，直接使用
            requestBody.attachments = imageAttachment;
        } else if (imageAttachment) {
            // 如果是单个附件，转换为数组
            requestBody.attachments = [imageAttachment];
        }

        // 发送请求
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': normalizeAuthToken(settings.authKey)
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // 检查HTTP状态码
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${data.message || response.statusText}`);
        }

        // 如果能解析响应数据，就认为请求成功了
        // Blinko API 在成功时可能不会返回特定的状态字段
        return { success: true, data };
    } catch (error) {
        console.error('发送到Blinko失败:', error);
        return { success: false, error: error.message };
    }
}

export {
    getFullApiUrl,
    getSummaryFromModel,
    sendToBlinko,
    uploadFile,
    normalizeAuthToken,
    normalizeBlinkoApiBaseUrl,
    getCleanDomainUrl
};
