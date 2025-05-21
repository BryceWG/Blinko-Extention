// 存储全局总结状态
let summaryState = {
    status: 'none',
    summary: null,
    url: null,
    title: null
};

// 获取总结状态
function getSummaryState() {
    return summaryState;
}

// 更新总结状态
function updateSummaryState(newState) {
    summaryState = { ...summaryState, ...newState };
    return summaryState;
}

// 清除总结状态
async function clearSummaryState() {
    summaryState = {
        status: 'none',
        summary: null,
        url: null,
        title: null
    };
    // 同时清除存储的内容
    await browser.storage.local.remove('currentSummary');
    return summaryState;
}

// 保存总结到存储
async function saveSummaryToStorage(summary, url, title) {
    await browser.storage.local.set({
        currentSummary: {
            summary,
            url,
            title,
            timestamp: Date.now()
        }
    });
}

// 从存储加载总结
async function loadSummaryFromStorage() {
    const result = await browser.storage.local.get('currentSummary');
    return result.currentSummary;
}

export {
    getSummaryState,
    updateSummaryState,
    clearSummaryState,
    saveSummaryToStorage,
    loadSummaryFromStorage
}; 