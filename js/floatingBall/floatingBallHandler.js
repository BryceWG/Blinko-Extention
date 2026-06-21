import { getState, updateState, savePosition } from './floatingBallState.js';
import { showLoadingState, showSuccessState, resetState } from './floatingBallUI.js';
import { extractPageContent, getPageMetadata } from '../content/contentExtractor.js';

// Handle drag start
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

// Handle drag move
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

// Handle drag end
function handleDragEnd(ball) {
    const state = getState();
    if (!state.isDragging) return;
    
    updateState({ isDragging: false });
    ball.style.transition = 'transform 0.5s ease';
    
    // Save new position
    const position = {
        right: ball.style.right,
        bottom: ball.style.bottom
    };
    savePosition(position);
}

// Handle click event
async function handleClick(ball) {
    const state = getState();
    if (state.isDragging || state.isProcessing) return;
    
    updateState({ isProcessing: true });
    showLoadingState(ball);

    try {
        // Get page content
        const content = extractPageContent();
        const metadata = getPageMetadata();

        // Send message to background script for processing
        const response = await chrome.runtime.sendMessage({
            action: 'processAndSendContent',
            content: content,
            title: metadata.title,
            url: metadata.url
        });

        if (response && response.processing) {
            // Wait for actual response
            return;  // Background will handle the remaining flow
        } else {
            throw new Error(chrome.i18n.getMessage('requestProcessError') || 'Request processing failed');
        }
    } catch (error) {
        console.error('Error processing content:', error);
        resetState(ball);
        updateState({ isProcessing: false });
    }
}

// Initialize event listeners
function initializeEventListeners(ball) {
    // Handle drag
    ball.addEventListener('mousedown', e => handleDragStart(e, ball));
    document.addEventListener('mousemove', e => handleDragMove(e, ball));
    document.addEventListener('mouseup', () => handleDragEnd(ball));

    // Handle click
    ball.addEventListener('click', () => handleClick(ball));
}

export {
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleClick,
    initializeEventListeners
}; 