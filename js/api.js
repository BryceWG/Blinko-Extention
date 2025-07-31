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

// 辅助函数：从URL中提取主机名
function getHostnameFromUrl(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        console.warn('无法从URL解析主机名:', url, e);
        return null;
    }
}

// 辅助函数：将域名模式转换为正则表达式
// 支持 *.example.com, example.com, www.example.com
function domainPatternToRegex(pattern) {
    if (typeof pattern !== 'string' || !pattern.trim()) { // 更严格的检查，确保pattern是有效字符串
        console.warn('Invalid domain pattern provided:', pattern);
        return null;
    }
    let regexString = pattern.trim();
    // 转义点号
    regexString = regexString.replace(/\./g, '\\.');
    // 处理通配符 *.
    if (regexString.startsWith('*\\.')) {
        // *.example.com 应该匹配 sub.example.com 或 example.com (如果允许)
        // 为了匹配 sub.example.com 但不匹配 example.com: ^[^.]+(\.[^.]+)*\.(domain\.com)$
        // 为了匹配 sub.example.com 以及 example.com (如果 *.example.com 意味着 example.com 或其任何子域)
        // regexString = `^([^.]+\\.)*?` + regexString.substring(2) + `$`;
        // 更严格的 *.example.com (必须有子域)
        regexString = `^(.+)\\.` + regexString.substring(3) + `$`; // *.example.com -> ^(.+)\.example\.com$
                                                                // 也允许 example.com 匹配 *.example.com (如果子域是可选的)
                                                                // 计划中是 ^.+\.example\.com$ (必须有子域)
                                                                // 我们采用 ^(.+\.)?example\.com$ 这种更灵活的，能匹配 example.com 和 sub.example.com
    } else if (!regexString.startsWith('www\\.')) {
        // example.com 应该匹配 example.com 和 www.example.com
        regexString = `^(www\\.)?` + regexString + `$`;
    } else {
        // www.example.com
        regexString = `^` + regexString + `$`;
    }
    try {
        return new RegExp(regexString, 'i'); // i 表示不区分大小写
    } catch (e) {
        console.error('创建正则表达式失败:', pattern, e);
        return null;
    }
}


// 获取有效的提示词内容，考虑域名特定规则
function getEffectivePromptContent(pageUrl, settings) {
    const fallbackPromptContent = "请总结以下内容：{content}"; // 系统级最终回退

    if (!settings || !settings.promptTemplates || settings.promptTemplates.length === 0) {
        console.warn('未找到提示词模板设置或模板列表为空，使用最终回退提示词。');
        return fallbackPromptContent;
    }

    const hostname = getHostnameFromUrl(pageUrl);
    let effectiveTemplateId = settings.activePromptTemplateId; // 默认为全局设置的激活模板

    if (hostname && settings.domainPromptMappings && settings.domainPromptMappings.length > 0) {
        for (const mapping of settings.domainPromptMappings) {
            if (mapping.domainPattern && mapping.templateId) {
                const regex = domainPatternToRegex(mapping.domainPattern);
                if (regex && regex.test(hostname)) {
                    // 检查此 templateId 是否仍然有效
                    const mappedTemplate = settings.promptTemplates.find(t => t.id === mapping.templateId);
                    if (mappedTemplate) {
                        effectiveTemplateId = mapping.templateId;
                        console.log(`域名规则匹配: ${hostname} 使用模板ID ${effectiveTemplateId} (来自规则 ${mapping.domainPattern})`);
                        break; // 找到第一个匹配的规则即停止
                    } else {
                        console.warn(`域名规则 ${mapping.domainPattern} 指向的模板ID ${mapping.templateId} 不存在，继续查找。`);
                    }
                }
            }
        }
    }

    const finalTemplate = settings.promptTemplates.find(t => t.id === effectiveTemplateId);
    if (finalTemplate && finalTemplate.content) {
        return finalTemplate.content;
    } else {
        // 如果选中的模板（无论是域名特定还是全局默认）无效或内容为空，尝试用列表中的第一个有效模板
        if (settings.promptTemplates.length > 0 && settings.promptTemplates[0].content) {
            console.warn(`选定的模板ID ${effectiveTemplateId} 无效或内容为空，回退到第一个可用模板。`);
            return settings.promptTemplates[0].content;
        }
    }
    
    console.warn('所有模板均无效或内容为空，使用最终回退提示词。');
    return fallbackPromptContent;
}


// 从模型获取总结
async function getSummaryFromModel(content, pageUrl, settings) { // 添加 pageUrl 参数
    try {
        const effectivePromptString = getEffectivePromptContent(pageUrl, settings);
        const prompt = effectivePromptString.replace('{content}', content);
        
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
                temperature: typeof settings.temperature === 'number' ? settings.temperature : parseFloat(settings.temperature) || 0.5
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

        // 构建上传URL - 文件上传接口使用 /api/file/upload 路径
        const cleanBaseUrl = getCleanDomainUrl(settings.targetUrl);
        const uploadUrl = `${cleanBaseUrl}/api/file/upload`;

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
        const result = await browser.storage.sync.get('settings');
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
