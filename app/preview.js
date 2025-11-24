import { dom, state } from './state.js';
import { resetGridLines, drawGridOverlay, setupDragListeners, updateRenderedVideoRect } from './grid.js';

export function setupGridAndCanvases() {
    const rows = parseInt(dom.videoRowsInput.value);
    const cols = parseInt(dom.videoColsInput.value);

    dom.gridContainer.innerHTML = '';
    dom.gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    dom.generateGifsButton.style.display = 'inline-block';
    dom.exportOptions.style.display = 'flex';
    dom.processButton.textContent = '2. Capture Frames';

    state.cellCanvases = [];
    state.cellFrames = [];
    for (let i = 0; i < rows * cols; i++) {
        const cellContainer = document.createElement('div');
        cellContainer.className = 'cell-container';

        const canvas = document.createElement('canvas');
        const status = document.createElement('div');
        status.className = 'status';
        status.textContent = 'Preview';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'cell-checkbox';
        checkbox.checked = true;
        checkbox.title = 'Export this cell';

        cellContainer.appendChild(canvas);
        cellContainer.appendChild(status);
        cellContainer.appendChild(checkbox);
        dom.gridContainer.appendChild(cellContainer);

        state.cellCanvases.push(canvas);
        state.cellFrames.push([]);
    }

    updateRenderedVideoRect();
    resetGridLines();
    drawGridOverlay();
    setupDragListeners();

    if (!state.hiddenCanvas) {
        state.hiddenCanvas = document.createElement('canvas');
        state.hiddenCtx = state.hiddenCanvas.getContext('2d', { willReadFrequently: true });
    }
    state.hiddenCanvas.width = state.video.videoWidth;
    state.hiddenCanvas.height = state.video.videoHeight;
}

export function startPreviewLoop() {
    if (state.previewLoopId) {
        cancelAnimationFrame(state.previewLoopId);
    }

    function updatePreviewLoop() {
        if (state.video.paused || state.video.ended || state.video.videoWidth === 0) {
            state.previewLoopId = requestAnimationFrame(updatePreviewLoop);
            return;
        }

        const rows = parseInt(dom.videoRowsInput.value);
        const cols = parseInt(dom.videoColsInput.value);
        const threshold = parseInt(dom.thresholdInput.value);

        state.hiddenCtx.drawImage(state.video, 0, 0, state.video.videoWidth, state.video.videoHeight);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellIndex = r * cols + c;
                const cellCanvas = state.cellCanvases[cellIndex];
                if (!cellCanvas || !state.cellPreviewRects[cellIndex]) continue;

                const cellCtx = cellCanvas.getContext('2d');
                const { sx, sy, sWidth, sHeight } = state.cellPreviewRects[cellIndex];

                if (cellCanvas.width !== sWidth) cellCanvas.width = sWidth;
                if (cellCanvas.height !== sHeight) cellCanvas.height = sHeight;

                try {
                    const imageData = state.hiddenCtx.getImageData(sx, sy, sWidth, sHeight);
                    const data = imageData.data;

                    for (let i = 0; i < data.length; i += 4) {
                        if (data[i] <= threshold && data[i + 1] <= threshold && data[i + 2] <= threshold) {
                            data[i + 3] = 0; // Make transparent
                        }
                    }
                    cellCtx.putImageData(imageData, 0, 0);

                    if (state.isCapturing) {
                        const captureRect = state.cellCaptureRects[cellIndex];
                        if (!captureRect) continue;

                        const frameCanvas = document.createElement('canvas');
                        frameCanvas.width = captureRect.sWidth;
                        frameCanvas.height = captureRect.sHeight;
                        const frameCtx = frameCanvas.getContext('2d');

                        const frameImageData = state.hiddenCtx.getImageData(captureRect.sx, captureRect.sy, captureRect.sWidth, captureRect.sHeight);
                        const frameData = frameImageData.data;
                        for (let i = 0; i < frameData.length; i += 4) {
                            if (frameData[i] <= threshold && frameData[i+1] <= threshold && frameData[i+2] <= threshold) {
                                frameData[i+3] = 0;
                            }
                        }
                        frameCtx.putImageData(frameImageData, 0, 0);
                        state.cellFrames[cellIndex].push(frameCanvas);
                    }
                } catch (e) {
                     if (e instanceof DOMException && e.name === "IndexSizeError") {
                        cellCtx.clearRect(0, 0, cellCanvas.width, cellCanvas.height);
                    } else {
                        console.error(`Error processing cell (${r},${c}):`, e);
                        cancelAnimationFrame(state.previewLoopId);
                        return;
                    }
                }
            }
        }
        state.previewLoopId = requestAnimationFrame(updatePreviewLoop);
    }
    updatePreviewLoop();
}