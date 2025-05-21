import { getState, updateState, savePosition } from './floatingBallState.js';
import { showLoadingState, showSuccessState, resetState } from './floatingBallUI.js';
import { extractPageContent, getPageMetadata } from '../content/contentExtractor.js';

// 处理拖拽开始
function handleDragStart(e, ball) {
    const state = getState();
    if (state.isProcessing) return;
    
    updateState({
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY
    });
    
    const rect = ball.getBoundingClientRect();
    updateState({
        startRight: window.innerWidth - rect.right,
        startBottom: window.innerHeight - rect.bottom
    });
    
    ball.style.transition = 'none';
}

// 处理拖拽移动
function handleDragMove(e, ball) {
    const state = getState();
    if (!state.isDragging) return;
    
    const deltaX = state.startX - e.clientX;
    const deltaY = state.startY - e.clientY;
    
    const newRight = state.startRight + deltaX;
    const newBottom = state.startBottom + deltaY;
    
    ball.style.right = newRight + 'px';
    ball.style.bottom = newBottom + 'px';
}

// 处理拖拽结束
function handleDragEnd(ball) {
    const state = getState();
    if (!state.isDragging) return;
    
    updateState({ isDragging: false });
    ball.style.transition = 'transform 0.5s ease';
    
    // 保存新位置
    const position = {
        right: ball.style.right,
        bottom: ball.style.bottom
    };
    savePosition(position);
}

// 处理点击事件
async function handleClick(ball) {
    const state = getState();
    if (state.isDragging || state.isProcessing) return;
    
    updateState({ isProcessing: true });
    showLoadingState(ball);

    try {
        // 获取页面内容
        const content = extractPageContent();
        const metadata = getPageMetadata();

        // 发送消息给background script处理
        const response = await browser.runtime.sendMessage({
            action: 'processAndSendContent',
            content: content,
            title: metadata.title,
            url: metadata.url
        });

        if (response && response.processing) {
            // 等待实际的响应
            return;  // background会处理剩余的流程
        } else {
            throw new Error('请求处理失败');
        }
    } catch (error) {
        console.error('Error processing content:', error);
        resetState(ball);
        updateState({ isProcessing: false });
    }
}

// 初始化事件监听器
function initializeEventListeners(ball) {
    // 处理拖拽
    ball.addEventListener('mousedown', e => handleDragStart(e, ball));
    document.addEventListener('mousemove', e => handleDragMove(e, ball));
    document.addEventListener('mouseup', () => handleDragEnd(ball));

    // 处理点击
    ball.addEventListener('click', () => handleClick(ball));
}

export {
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleClick,
    initializeEventListeners
}; 