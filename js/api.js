// Normalize auth token to start with a single "Bearer " prefix
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

// Normalize Blinko API base URL to end with "/api/v1"
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

// Get clean domain URL, removing trailing /api/v1 path and slashes
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

// Get original link prefix
function getOriginalLinkPrefix() {
    return chrome.i18n.getMessage('labelOriginalLink') || 'Original link:';
}

// Get image source prefix
function getImageSourcePrefix() {
    return chrome.i18n.getMessage('labelImageSource') || 'Source:';
}

// Get original link Markdown
function getOriginalLinkMarkdown(url, title) {
    return `${getOriginalLinkPrefix()}[${title || url}](${url})`;
}

// Get image source Markdown
function getImageSourceMarkdown(url, title) {
    return `> ${getImageSourcePrefix()}[${title || url}](${url})`;
}

// Escape regular expression special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get original link regular expression
function getOriginalLinkRegExp() {
    return new RegExp(escapeRegExp(getOriginalLinkPrefix()) + '\\[.*?\\]\\(.*?\\)', 'g');
}


// Get full API URL
function getFullApiUrl(baseUrl, endpoint) {
    try {
        const url = new URL(baseUrl);
        // Check if full API path is already included
        if (baseUrl.includes('/chat/completions')) {
            return baseUrl;
        }
        // Append endpoint directly to user-provided URL
        return baseUrl.replace(/\/+$/, '') + endpoint;
    } catch (error) {
        console.error('Error parsing URL:', error);
        throw new Error(chrome.i18n.getMessage('errorInvalidUrl', [error.message]) || 'Invalid URL: ' + error.message);
    }
}

// Helper: extract hostname from URL
function getHostnameFromUrl(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        console.warn('Failed to parse hostname from URL:', url, e);
        return null;
    }
}

// Helper: convert domain pattern to regular expression
// Supports *.example.com, example.com, www.example.com
function domainPatternToRegex(pattern) {
    if (typeof pattern !== 'string' || !pattern.trim()) { // Stricter check to ensure pattern is a valid string
        console.warn('Invalid domain pattern provided:', pattern);
        return null;
    }
    let regexString = pattern.trim();
    // Escape dots
    regexString = regexString.replace(/\./g, '\\.');
    // Handle wildcard *.
    if (regexString.startsWith('*\\.')) {
        // *.example.com should match sub.example.com or example.com (if allowed)
        // To match sub.example.com but not example.com: ^[^.]+(\.[^.]+)*\.(domain\.com)$
        // To match sub.example.com as well as example.com (if *.example.com means example.com or any subdomain)
        // regexString = `^([^.]+\\.)*?` + regexString.substring(2) + `$`;
        // Stricter *.example.com (subdomain required)
        regexString = `^(.+)\\.` + regexString.substring(3) + `$`; // *.example.com -> ^(.+)\.example\.com$
                                                                // Also allow example.com to match *.example.com (if subdomain is optional)
                                                                // Planned: ^.+\.example\.com$ (subdomain required)
                                                                // We use flexible ^(.+\.)?example\.com$ to match example.com and sub.example.com
    } else if (!regexString.startsWith('www\\.')) {
        // example.com should match example.com and www.example.com
        regexString = `^(www\\.)?` + regexString + `$`;
    } else {
        // www.example.com
        regexString = `^` + regexString + `$`;
    }
    try {
        return new RegExp(regexString, 'i'); // 'i' means case-insensitive
    } catch (e) {
        console.error('Failed to create regular expression:', pattern, e);
        return null;
    }
}


// Get effective prompt content considering domain-specific rules
function getEffectivePromptContent(pageUrl, settings) {
    const fallbackPromptContent = chrome.i18n.getMessage('promptFallbackContent') || "Please summarize the following content: {content}"; // System-level final fallback

    if (!settings || !settings.promptTemplates || settings.promptTemplates.length === 0) {
        console.warn('Prompt template settings not found or template list empty, using final fallback prompt.');
        return fallbackPromptContent;
    }

    const hostname = getHostnameFromUrl(pageUrl);
    let effectiveTemplateId = settings.activePromptTemplateId; // Default to globally active template

    if (hostname && settings.domainPromptMappings && settings.domainPromptMappings.length > 0) {
        for (const mapping of settings.domainPromptMappings) {
            if (mapping.domainPattern && mapping.templateId) {
                const regex = domainPatternToRegex(mapping.domainPattern);
                if (regex && regex.test(hostname)) {
                    // Check if this templateId is still valid
                    const mappedTemplate = settings.promptTemplates.find(t => t.id === mapping.templateId);
                    if (mappedTemplate) {
                        effectiveTemplateId = mapping.templateId;
                        console.log(`Domain rule matched: ${hostname} using template ID ${effectiveTemplateId} (from rule ${mapping.domainPattern})`);
                        break; // Stop at first matching rule
                    } else {
                        console.warn(`Domain rule ${mapping.domainPattern} points to non-existent template ID ${mapping.templateId}, continuing search.`);
                    }
                }
            }
        }
    }

    const finalTemplate = settings.promptTemplates.find(t => t.id === effectiveTemplateId);
    if (finalTemplate && finalTemplate.content) {
        return finalTemplate.content;
    } else {
        // If selected template (domain-specific or global default) is invalid or empty, fall back to first valid template in list
        if (settings.promptTemplates.length > 0 && settings.promptTemplates[0].content) {
            console.warn(`Selected template ID ${effectiveTemplateId} is invalid or empty, falling back to first available template.`);
            return settings.promptTemplates[0].content;
        }
    }
    
    console.warn('All templates invalid or empty, using final fallback prompt.');
    return fallbackPromptContent;
}


// Get summary from model
async function getSummaryFromModel(content, pageUrl, settings) { // Added pageUrl parameter
    try {
        const effectivePromptString = getEffectivePromptContent(pageUrl, settings);
        const prompt = effectivePromptString.replace('{content}', content);
        
        // Get full API URL
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
            throw new Error(chrome.i18n.getMessage('errorApiRequestFailed', [response.status, errorData.error?.message || response.statusText]) || `API request failed: ${response.status} ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error(chrome.i18n.getMessage('errorApiInvalidResponse') || 'Invalid API response');
        }

        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error getting summary:', error);
        throw error;
    }
}

// Upload image file to Blinko
async function uploadFile(file, settings) {
    try {
        if (!settings.targetUrl || !settings.authKey) {
            throw new Error(chrome.i18n.getMessage('errorConfigureBlinko') || 'Please configure Blinko API URL and auth key first');
        }

        // Build upload URL - file upload endpoint uses /api/file/upload path
        const cleanBaseUrl = getCleanDomainUrl(settings.targetUrl);
        const uploadUrl = `${cleanBaseUrl}/api/file/upload`;

        // Create FormData object
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
            throw new Error(chrome.i18n.getMessage('errorUploadImageFailed', [response.status]) || `Image upload failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.status !== 200 || !data.filePath) {
            throw new Error(chrome.i18n.getMessage('errorUploadImageResponseFormat') || 'Invalid image upload response');
        }

        return {
            name: data.fileName,
            path: data.filePath,
            size: data.size,
            type: data.type
        };
    } catch (error) {
        console.error('Image upload failed:', error);
        throw error;
    }
}

// Send content to Blinko
async function sendToBlinko(content, url, title, imageAttachment = null, type = 'summary') {
    try {
        // Get settings
        const result = await chrome.storage.sync.get('settings');
        const settings = result.settings;
        
        if (!settings || !settings.targetUrl || !settings.authKey) {
            throw new Error(chrome.i18n.getMessage('errorConfigureBlinko') || 'Please configure Blinko API URL and auth key first');
        }

        // Build request URL without duplicate v1
        const normalizedBaseUrl = normalizeBlinkoApiBaseUrl(settings.targetUrl);
        const requestUrl = `${normalizedBaseUrl}/note/upsert`;

        // Add different tags and URL based on type
        let finalContent = content;
        
        // Decide whether to add URL based on settings and type
        if (url && (
            (type === 'summary' && settings.includeSummaryUrl) ||
            (type === 'extract' && settings.includeSelectionUrl) ||
            (type === 'image' && settings.includeImageUrl) ||
            // For Quick Note, only add if content doesn't already contain a link
            (type === 'quickNote' && settings.includeQuickNoteUrl && 
             !finalContent.includes(getOriginalLinkMarkdown(url, title)))
        )) {
            // For image type, use different link format
            if (type === 'image') {
                finalContent = finalContent || '';  // Ensure finalContent is not undefined
                finalContent = `${finalContent}${finalContent ? '\n\n' : ''}${getImageSourceMarkdown(url, title)}`;
            } else {
                finalContent = `${finalContent}\n\n${getOriginalLinkMarkdown(url, title)}`;
            }
        }

        // Add tag
        if (type === 'summary' && settings.summaryTag) {
            finalContent = `${finalContent}\n\n${settings.summaryTag}`;
        } else if (type === 'extract' && settings.extractTag) {
            finalContent = `${finalContent}\n\n${settings.extractTag}`;
        } else if (type === 'image' && settings.imageTag) {
            finalContent = finalContent ? `${finalContent}\n\n${settings.imageTag}` : settings.imageTag;
        }

        // Build request body
        const requestBody = {
            content: finalContent,
            type: 0
        };

        // Handle attachments
        if (Array.isArray(imageAttachment)) {
            // If array, use directly
            requestBody.attachments = imageAttachment;
        } else if (imageAttachment) {
            // If single attachment, convert to array
            requestBody.attachments = [imageAttachment];
        }

        // Send request
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': normalizeAuthToken(settings.authKey)
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // Check HTTP status code
        if (!response.ok) {
            throw new Error(chrome.i18n.getMessage('errorHttpFailed', [response.status, data.message || response.statusText]) || `HTTP error: ${response.status} ${data.message || response.statusText}`);
        }

        // If response data can be parsed, treat request as successful
        // Blinko API may not return a specific status field on success
        return { success: true, data };
    } catch (error) {
        console.error('Failed to send to Blinko:', error);
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
    getCleanDomainUrl,
    getOriginalLinkRegExp
};
