// 创建悬浮球样式
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

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
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

// 创建悬浮球元素
function createFloatingBallElement() {
    const ball = document.createElement('div');
    ball.id = 'blinko-floating-ball';

    const ballIcon = document.createElement('div');
    ballIcon.className = 'ball-icon';

    const img = document.createElement('img');
    img.src = browser.runtime.getURL('images/icon128.png');
    img.alt = 'Blinko';

    ballIcon.appendChild(img);

    const loadingCircle = document.createElement('div');
    loadingCircle.className = 'loading-circle';

    ball.appendChild(ballIcon);
    ball.appendChild(loadingCircle);

    return ball;
}

// 设置悬浮球位置
function setFloatingBallPosition(ball, position) {
    Object.assign(ball.style, position);
}

// 显示加载状态
function showLoadingState(ball) {
    ball.classList.add('processing');
}

// 隐藏加载状态
function hideLoadingState(ball) {
    ball.classList.remove('processing');
}

// 显示成功状态
function showSuccessState(ball) {
    ball.classList.remove('processing');
    ball.classList.add('success');
    const iconImg = ball.querySelector('img');
    iconImg.src = browser.runtime.getURL('images/icon128_success_reverse.png');
}

// 重置状态
function resetState(ball) {
    ball.classList.remove('success', 'processing');
    const iconImg = ball.querySelector('img');
    iconImg.src = browser.runtime.getURL('images/icon128.png');
}

// 移除悬浮球
function removeFloatingBall() {
    const ball = document.getElementById('blinko-floating-ball');
    if (ball) {
        ball.remove();
    }
}

export {
    createFloatingBallStyle,
    createFloatingBallElement,
    setFloatingBallPosition,
    showLoadingState,
    hideLoadingState,
    showSuccessState,
    resetState,
    removeFloatingBall
}; 