// floatingBallState.js 内容
const ballState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    startRight: 0,
    startBottom: 0,
    isProcessing: false
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
        const result = await browser.storage.local.get('floatingBallPosition');
        return result.floatingBallPosition || {
            right: '20px',
            bottom: '20px'
        };
    } catch (error) {
        console.error('加载悬浮球位置失败:', error);
        return {
            right: '20px',
            bottom: '20px'
        };
    }
}

async function savePosition(position) {
    try {
        await browser.storage.local.set({ floatingBallPosition: position });
    } catch (error) {
        console.error('保存悬浮球位置失败:', error);
    }
}

// floatingBallUI.js 内容
function createFloatingBallStyle() {
    const style = document.createElement('style');
    style.textContent = `
        #blinko-floating-ball {
            position: fixed;
            width: min(50px, 5vw);
            height: min(50px, 5vw);
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

        @media (max-width: 768px) {
            #blinko-floating-ball {
                width: min(40px, 8vw);
                height: min(40px, 8vw);
            }
        }
    `;
    return style;
}

function createFloatingBallElement() {
    const ball = document.createElement('div');
    ball.id = 'blinko-floating-ball';
    ball.innerHTML = `
        <div class="ball-icon">
            <img src="${browser.runtime.getURL('images/icon128.png')}" alt="Blinko">
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
    iconImg.src = browser.runtime.getURL('images/icon128_success_reverse.png');
}

function resetState(ball) {
    ball.classList.remove('success', 'processing');
    const iconImg = ball.querySelector('img');
    iconImg.src = browser.runtime.getURL('images/icon128.png');
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

async function handleClick(ball, isRightClick = false) {
    const state = getState();
    if (state.isDragging || state.isProcessing) return;
    
    updateState({ isProcessing: true });
    showLoadingState(ball, isRightClick);

    try {
        // 获取页面内容
        const content = extractPageContent();
        const metadata = getPageMetadata();

        // 发送消息给background script处理
        const response = await browser.runtime.sendMessage({
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
            throw new Error('请求处理失败');
        }
    } catch (error) {
        console.error('处理内容时出错:', error);
        resetState(ball);
        updateState({ isProcessing: false });
        // 显示错误通知
        browser.runtime.sendMessage({
            action: 'showNotification',
            type: 'error',
            title: '操作失败',
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
        const result = await browser.storage.sync.get('settings');
        const settings = result.settings || {};
        if (settings.enableFloatingBall === false) {
            return;
        }

        // 添加样式
        const style = createFloatingBallStyle();
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
        console.error('创建悬浮球时出错:', error);
    }
}

function initializeMessageListener() {
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateFloatingBallState') {
            const ball = document.getElementById('blinko-floating-ball');
            if (!ball) return;

            if (request.enabled === false) {
                removeFloatingBall();
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
                    console.error('总结失败:', request.error);
                }
            } else if (!document.getElementById('blinko-floating-ball')) {
                createFloatingBall();
            }
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