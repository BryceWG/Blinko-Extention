// 临时存储键
const TEMP_STORAGE_KEY = 'tempSummaryData';

// 保存临时总结数据
async function saveTempSummaryData(data) {
    try {
        await browser.storage.local.set({ [TEMP_STORAGE_KEY]: data });
        console.log('临时数据已保存:', data);
    } catch (error) {
        console.error('保存临时数据失败:', error);
    }
}

// 清除临时总结数据
async function clearTempSummaryData() {
    try {
        await browser.storage.local.remove(TEMP_STORAGE_KEY);
        console.log('临时数据已清除');
    } catch (error) {
        console.error('清除临时数据失败:', error);
    }
}

// 加载临时总结数据
async function loadTempSummaryData() {
    try {
        const result = await browser.storage.local.get(TEMP_STORAGE_KEY);
        return result[TEMP_STORAGE_KEY];
    } catch (error) {
        console.error('加载临时数据失败:', error);
        return null;
    }
}

export {
    TEMP_STORAGE_KEY,
    saveTempSummaryData,
    clearTempSummaryData,
    loadTempSummaryData
}; 