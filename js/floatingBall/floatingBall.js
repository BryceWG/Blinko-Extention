// floatingBallState.js 内容
const ballState = {
    isDragging: false,
    startX: 0, // For calculating delta in handleDragMove
    startY: 0, // For calculating delta in handleDragMove
    startRight: 0,
    startBottom: 0,
    isProcessing: false,
    dragStartTime: 0,
    dragStartMouseX: 0, // For differentiating click vs drag
    dragStartMouseY: 0, // For differentiating click vs drag
    wasDragging: false // Flag to indicate if a drag operation actually occurred
};

function getState() {
    return ballState;
}

function updateState(newState) {
    Object.assign(ballState, newState);
    return ballState;
}

async function loadPosition() {
    try {
        const result = await chrome.storage.local.get('floatingBallPosition');
        return result.floatingBallPosition || {
            right: '20px',
            bottom: '20px'
        };
    } catch (error) {
        console.error(chrome.i18n.getMessage('floatingBallCreateError'), error);
        return {
            right: '20px',
            bottom: '20px'
        };
    }
}

async function savePosition(position) {
    try {
        await chrome.storage.local.set({ floatingBallPosition: position });
    } catch (error) {
        console.error(chrome.i18n.getMessage('floatingBallCreateError'), error);
    }
}

// floatingBallUI.js 内容
async function createFloatingBallStyle() {
    const settingsResult = await chrome.storage.sync.get('settings');
    const ballSizeValue = settingsResult.settings?.floatingBallSize || 'medium'; // Default to medium

    let sizePx = '50px'; // Default medium
    if (ballSizeValue === 'small') {
        sizePx = '35px';
    } else if (ballSizeValue === 'large') {
        sizePx = '65px';
    }

    const style = document.createElement('style');
    style.id = 'blinko-floating-ball-style'; // Assign an ID to the style element
    style.textContent = `
        #blinko-floating-ball {
            position: fixed;
            width: ${sizePx}; /* Apply dynamic size */
            height: ${sizePx}; /* Apply dynamic size */
            cursor: move;
            z-index: 10000;
            user-select: none;
            touch-action: none;
        }

        .ball-icon {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: black;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.5s ease;
        }

        .ball-icon img {
            width: 75%;
            height: 75%;
            transition: transform 0.5s ease;
            filter: brightness(1);
        }

        .loading-circle {
            position: absolute;
            top: -5px;
            left: -5px;
            right: -5px;
            bottom: -5px;
            border: 2px solid transparent;
            border-top-color: #4CAF50;
            border-radius: 50%;
            display: none;
            animation: spin 1s linear infinite;
        }

        .loading-circle.reverse {
            border-top-color: #C35AF7;
            animation: spin-reverse 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @keyframes spin-reverse {
            0% { transform: rotate(360deg); }
            100% { transform: rotate(0deg); }
        }

        .processing .loading-circle {
            display: block;
        }

        .success .ball-icon img {
            transform: rotateY(180deg);
        }

        /* @media (max-width: 768px) block removed as fixed sizes are now used */
    `;
    return style;
}

function createFloatingBallElement() {
    const ball = document.createElement('div');
    ball.id = 'blinko-floating-ball';
    ball.innerHTML = `
        <div class="ball-icon">
            <img src="${chrome.runtime.getURL('images/icon128.png')}" alt="Blinko">
        </div>
        <div class="loading-circle"></div>
    `;
    return ball;
}

function setFloatingBallPosition(ball, position) {
    Object.assign(ball.style, position);
}

function showLoadingState(ball, isRightClick = false) {
    ball.classList.add('processing');
    const loadingCircle = ball.querySelector('.loading-circle');
    if (loadingCircle) {
        if (isRightClick) {
            loadingCircle.classList.add('reverse');
        } else {
            loadingCircle.classList.remove('reverse');
        }
    }
}

function hideLoadingState(ball) {
    ball.classList.remove('processing');
}

function showSuccessState(ball) {
    ball.classList.remove('processing');
    ball.classList.add('success');
    const iconImg = ball.querySelector('img');
    iconImg.src = chrome.runtime.getURL('images/icon128_success_reverse.png');
}

function resetState(ball) {
    ball.classList.remove('success', 'processing');
    const iconImg = ball.querySelector('img');
    iconImg.src = chrome.runtime.getURL('images/icon128.png');
}

function removeFloatingBall() {
    const ball = document.getElementById('blinko-floating-ball');
    if (ball) {
        ball.remove();
    }
}

// floatingBallHandler.js 内容
function handleDragStart(e, ball) {
    const state = getState();
    if (state.isProcessing) return;
    
    updateState({
        isDragging: true,
        startX: e.clientX, // Used for delta calculation in handleDragMove
        startY: e.clientY, // Used for delta calculation in handleDragMove
        dragStartMouseX: e.clientX, // New for differentiating click vs drag
        dragStartMouseY: e.clientY, // New for differentiating click vs drag
        dragStartTime: Date.now(),
        wasDragging: false, // Reset wasDragging flag
    });
    
    const rect = ball.getBoundingClientRect();
    updateState({
        startRight: window.innerWidth - rect.right,
        startBottom: window.innerHeight - rect.bottom
    });
    
    ball.style.transition = 'none';
}

function handleDragMove(e, ball) {
    const state = getState();
    if (!state.isDragging) return;
    
    // Existing delta calculations for positioning
    const deltaX = state.startX - e.clientX;
    const deltaY = state.startY - e.clientY;
    const newRight = state.startRight + deltaX;
    const newBottom = state.startBottom + deltaY;
    ball.style.right = newRight + 'px';
    ball.style.bottom = newBottom + 'px';

    // New logic to detect if actual dragging occurred beyond a threshold
    const moveThreshold = 5; // 5 pixels
    const movedX = Math.abs(e.clientX - state.dragStartMouseX);
    const movedY = Math.abs(e.clientY - state.dragStartMouseY);

    if (movedX > moveThreshold || movedY > moveThreshold) {
        if (!state.wasDragging) { // Only update if not already set to true
            updateState({ wasDragging: true });
        }
    }
}

function handleDragEnd(ball) {
    const state = getState();
    if (!state.isDragging) return; // Should still check this
    
    // isDragging is set to false, wasDragging is checked by handleClick
    updateState({ isDragging: false }); 
    ball.style.transition = 'transform 0.5s ease'; // Restore transition
    
    // 保存新位置
    const position = {
        right: ball.style.right,
        bottom: ball.style.bottom
    };
    savePosition(position);
}

async function handleClick(ball, isRightClick = false) {
    const state = getState();
    // Check if a drag operation just finished
    if (state.wasDragging) {
        updateState({ wasDragging: false }); // Reset the flag for the next interaction
        return; // Skip click action because a drag just ended
    }

    // Existing check to prevent click during ongoing drag or processing
    if (state.isDragging || state.isProcessing) return;
    
    updateState({ isProcessing: true });
    showLoadingState(ball, isRightClick);

    try {
        // 获取页面内容
        const content = extractPageContent();
        const metadata = getPageMetadata();

        // 发送消息给background script处理
        const response = await chrome.runtime.sendMessage({
            action: 'processAndSendContent',
            content: content,
            title: metadata.title,
            url: metadata.url,
            isExtractOnly: isRightClick  // 添加标记表明是否仅提取内容
        });

        if (response && response.processing) {
            // 等待实际的响应
            return;  // background会处理剩余的流程
        } else {
            throw new Error(chrome.i18n.getMessage('requestProcessError'));
        }
    } catch (error) {
        console.error(chrome.i18n.getMessage('contentProcessError'), error);
        resetState(ball);
        updateState({ isProcessing: false });
        // 显示错误通知
        chrome.runtime.sendMessage({
            action: 'showNotification',
            type: 'error',
            title: chrome.i18n.getMessage('operationFailed'),
            message: error.message
        });
    }
}

function initializeEventListeners(ball) {
    // 处理拖拽
    ball.addEventListener('mousedown', e => {
        if (e.button === 0) { // 左键
            handleDragStart(e, ball);
        }
    });
    document.addEventListener('mousemove', e => handleDragMove(e, ball));
    document.addEventListener('mouseup', () => handleDragEnd(ball));

    // 处理点击
    ball.addEventListener('click', () => handleClick(ball, false));  // 左键点击
    ball.addEventListener('contextmenu', (e) => {
        e.preventDefault();  // 阻止默认右键菜单
        handleClick(ball, true);  // 右键点击
    });
}

// 主要逻辑
async function createFloatingBall() {
    try {
        // 检查是否启用悬浮球
        const result = await chrome.storage.sync.get('settings');
        const settings = result.settings || {};
        if (settings.enableFloatingBall === false) {
            return;
        }

        // 添加样式
        const style = await createFloatingBallStyle(); // Await the async function
        // style.id is already set within createFloatingBallStyle
        document.head.appendChild(style);

        // 创建悬浮球元素
        const ball = createFloatingBallElement();

        // 从存储中获取位置
        const position = await loadPosition();
        setFloatingBallPosition(ball, position);

        // 添加到页面
        document.body.appendChild(ball);

        // 初始化事件监听器
        initializeEventListeners(ball);
    } catch (error) {
        console.error(chrome.i18n.getMessage('floatingBallCreateError'), error);
    }
}

function initializeMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateFloatingBallState') {
            const ball = document.getElementById('blinko-floating-ball');
            // No ball and we are trying to enable it, or trying to update success state for a non-existent ball.
            if (!ball && request.enabled !== false && request.success === undefined) { 
                 // If enabling and ball doesn't exist, create it.
                if(request.enabled === true) createFloatingBall();
                return;
            } else if (!ball) { // Ball doesn't exist, nothing to do for success/disable.
                return;
            }

            if (request.enabled === false) {
                removeFloatingBall();
                // Also remove the style tag if the ball is disabled
                const styleElement = document.getElementById('blinko-floating-ball-style');
                if (styleElement) {
                    styleElement.remove();
                }
            } else if (request.success !== undefined) {
                // 处理总结结果
                if (request.success) {
                    showSuccessState(ball);
                    // 3秒后恢复原状
                    setTimeout(() => {
                        resetState(ball);
                        updateState({ isProcessing: false });
                    }, 3000);
                } else {
                    resetState(ball);
                    updateState({ isProcessing: false });
                    // 可以考虑显示错误提示
                    console.error(chrome.i18n.getMessage('summaryFailedError'), request.error);
                }
            } else if (request.enabled === true && !document.getElementById('blinko-floating-ball')) {
                // This case handles re-enabling the ball if it was removed.
                createFloatingBall();
            }
        } else if (request.action === 'updateFloatingBallSize') {
            const ball = document.getElementById('blinko-floating-ball');
            if (!ball) return;

            const newSizeValue = request.size || 'medium';
            let newSizePx = '50px';
            if (newSizeValue === 'small') newSizePx = '40px';
            else if (newSizeValue === 'large') newSizePx = '60px';

            ball.style.width = newSizePx;
            ball.style.height = newSizePx;

            // Update or replace the stylesheet
            const oldStyle = document.getElementById('blinko-floating-ball-style');
            if (oldStyle) oldStyle.remove();
            
            // Create and append the new style. createFloatingBallStyle will fetch the latest settings.
            // This is wrapped in an async IIFE because the listener itself cannot be async.
            (async () => {
                try {
                    const newStyleElement = await createFloatingBallStyle();
                    // ID is set inside createFloatingBallStyle
                    document.head.appendChild(newStyleElement);
                } catch (error) {
                    console.error(chrome.i18n.getMessage('floatingBallStyleError'), error);
                }
            })();
        }
    });
}

// 初始化
async function initialize() {
    initializeMessageListener();
    await createFloatingBall();
}

// 导出需要的函数
window.initialize = initialize;