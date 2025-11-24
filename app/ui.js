import { dom, state } from './state.js';
import { setupGridAndCanvases, startPreviewLoop } from './preview.js';
import { updateCellRects } from './grid.js';
import { generateGifs } from './gif.js';

export function initUI() {
    dom.videoUpload.addEventListener('change', handleVideoUpload);
    dom.thresholdInput.addEventListener('input', (event) => {
        dom.thresholdValue.textContent = event.target.value;
    });

    dom.toggleSettingsButton.addEventListener('click', () => {
        const isHidden = dom.settingsPanel.style.display === 'none';
        dom.settingsPanel.style.display = isHidden ? 'block' : 'none';
        dom.toggleSettingsButton.textContent = isHidden ? 'Hide Settings' : 'Settings';
    });

    const rowsInputs = [dom.settingsRowsInput, dom.videoRowsInput];
    const colsInputs = [dom.settingsColsInput, dom.videoColsInput];

    rowsInputs.forEach(input => {
        input.addEventListener('change', () => {
            rowsInputs.forEach(otherInput => otherInput.value = input.value);
            if (state.video && state.video.videoWidth > 0) {
                setupGridAndCanvases();
            }
        });
    });

    colsInputs.forEach(input => {
        input.addEventListener('change', () => {
            colsInputs.forEach(otherInput => otherInput.value = input.value);
            if (state.video && state.video.videoWidth > 0) {
                setupGridAndCanvases();
            }
        });
    });

    document.querySelectorAll('.btn-increment, .btn-decrement').forEach(button => {
        button.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                const stepAttr = targetInput.getAttribute('step');
                const isFloat = stepAttr && stepAttr.includes('.');
                
                const step = e.target.classList.contains('btn-increment') ? 1 : -1;
                const stepValue = parseFloat(stepAttr || '1');

                let currentValue = isFloat ? parseFloat(targetInput.value) : parseInt(targetInput.value, 10);
                let value = currentValue + (step * stepValue);
                
                const min = parseFloat(targetInput.min);
                if (!isNaN(min) && value < min) {
                    value = min;
                }

                const max = parseFloat(targetInput.max);
                if (!isNaN(max) && value > max) {
                    value = max;
                }

                targetInput.value = isFloat ? value.toFixed(1) : value;
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });

    [dom.paddingTopInput, dom.paddingRightInput, dom.paddingBottomInput, dom.paddingLeftInput].forEach(input => {
        input.addEventListener('input', () => {
            if (state.video && state.video.videoWidth > 0) {
                updateCellRects(); // Update preview rects in real-time
            }
        });
    });

    // Update video playback rate when speed input changes
    const updateSpeed = () => {
        if (state.video) {
            state.video.playbackRate = parseFloat(dom.gifSpeedInput.value);
        }
    };
    dom.gifSpeedInput.addEventListener('input', updateSpeed);
    dom.gifSpeedInput.addEventListener('change', updateSpeed);

    dom.selectAllButton.addEventListener('click', () => {
        document.querySelectorAll('.cell-checkbox').forEach(cb => cb.checked = true);
    });

    dom.deselectAllButton.addEventListener('click', () => {
        document.querySelectorAll('.cell-checkbox').forEach(cb => cb.checked = false);
    });

    dom.processButton.addEventListener('click', handleProcess);
    dom.generateGifsButton.addEventListener('click', generateGifs);
}

export async function preloadGifWorker() {
    try {
        const resp = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
        state.gifWorkerBlob = await resp.blob();
    } catch (e) {
        console.error("Failed to load gif.worker.js", e);
        alert("Could not load a required component for GIF generation. Please check your internet connection and try again.");
    }
}

function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const fileURL = URL.createObjectURL(file);
        dom.videoPreview.src = fileURL;
        state.video = dom.videoPreview;
        dom.fileNameDisplay.textContent = file.name;

        state.video.addEventListener('loadedmetadata', () => {
            if (state.previewLoopId) {
                cancelAnimationFrame(state.previewLoopId);
            }
            // Apply current speed setting to new video
            state.video.playbackRate = parseFloat(dom.gifSpeedInput.value);
            
            setupGridAndCanvases();
            startPreviewLoop();
        }, { once: true });
    }
}

function handleProcess() {
    if (!state.video || !state.video.src || state.video.src.endsWith('placeholder.png')) {
        alert('Please upload a video first.');
        return;
    }

    if (state.isCapturing) return;

    // Update rects to ensure padding is correctly applied for capture
    updateCellRects(); 
    // Pre-calculate the stable source rectangles for each cell before capture.
    state.cellCaptureRects = JSON.parse(JSON.stringify(state.cellPreviewRects));

    state.video.currentTime = 0;
    state.video.playbackRate = parseFloat(dom.gifSpeedInput.value); // Ensure capture runs at selected speed
    state.video.pause(); // Pause to ensure the first frame is drawn correctly.
    state.isCapturing = true;
    state.cellFrames = Array.from({ length: dom.videoRowsInput.value * dom.videoColsInput.value }, () => []);

    dom.processButton.disabled = true;
    dom.processButton.textContent = 'Capturing...';
    
    // Ensure the preview is active from the start of capture
    if (state.previewLoopId) {
        cancelAnimationFrame(state.previewLoopId);
    }
    startPreviewLoop();


    const captureDuration = parseFloat(dom.gifDurationInput.value);
    setTimeout(() => {
        state.isCapturing = false;
        console.log(`Finished capturing ${captureDuration}s of frames.`);
        dom.processButton.disabled = false;
        dom.processButton.textContent = '2. Capture Frames';
        state.video.pause();
    }, captureDuration * 1000);

    state.video.play().catch(err => {
        alert("Could not play video to capture. Make sure you've interacted with the page.");
        console.error("Video play error:", err);
    });
}