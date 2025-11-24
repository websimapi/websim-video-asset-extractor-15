import { dom, state } from './state.js';

export function generateGifs() {
    if (!state.cellFrames.length) {
        alert('Please process the video first to capture frames.');
        return;
    }
    if (!state.gifWorkerBlob) {
        alert('GIF generator is not ready. Please wait a moment and try again.');
        return;
    }

    const selectedIndices = [];
    document.querySelectorAll('.cell-checkbox').forEach((cb, index) => {
        if (cb.checked) {
            selectedIndices.push(index);
        }
    });

    if (selectedIndices.length === 0) {
        alert('Please select at least one cell to export.');
        return;
    }

    dom.generateGifsButton.disabled = true;
    dom.generateGifsButton.textContent = 'Generating...';

    const generationMode = document.querySelector('input[name="gen-mode"]:checked').value;

    if (generationMode === 'parallel') {
        generateGifsParallel(selectedIndices);
    } else {
        generateGifsSequentially(selectedIndices);
    }
}

function generateGifsParallel(indices) {
    const gifFps = parseInt(dom.gifFpsInput.value, 10);
    // Speed is handled during capture via video.playbackRate, so we don't modify delay here
    const delay = (1000 / gifFps);
    let gifsCompleted = 0;

    indices.forEach(index => {
        generateSingleGif(index, delay, () => {
            gifsCompleted++;
            if (gifsCompleted === indices.length) {
                dom.generateGifsButton.disabled = false;
                dom.generateGifsButton.textContent = '3. Generate GIFs';
            }
        });
    });
}

function generateGifsSequentially(indices) {
    const gifFps = parseInt(dom.gifFpsInput.value, 10);
    // Speed is handled during capture via video.playbackRate
    const delay = (1000 / gifFps);
    let currentIndex = 0;

    function next() {
        if (currentIndex >= indices.length) {
            dom.generateGifsButton.disabled = false;
            dom.generateGifsButton.textContent = '3. Generate GIFs';
            return;
        }
        const cellIndex = indices[currentIndex];
        currentIndex++;
        generateSingleGif(cellIndex, delay, next);
    }
    next();
}

function prepareFramesForTwitch(frames) {
    // Spec 4: Max 60 frames
    let processedFrames = frames;
    if (frames.length > 60) {
        processedFrames = [];
        const step = frames.length / 60;
        for (let i = 0; i < 60; i++) {
            const frameIndex = Math.floor(i * step);
            processedFrames.push(frames[frameIndex]);
        }
    }

    if (processedFrames.length === 0) return { frames: [], width: 0, height: 0 };
    
    const firstFrame = processedFrames[0];
    const sourceWidth = firstFrame.width;
    const sourceHeight = firstFrame.height;

    // Spec 1 & 3: Square shape, 112x112 resolution
    const TWITCH_TARGET_SIZE = 112;
    const finalFrames = [];

    processedFrames.forEach(frame => {
        const squareCanvas = document.createElement('canvas');
        squareCanvas.width = TWITCH_TARGET_SIZE;
        squareCanvas.height = TWITCH_TARGET_SIZE;
        const ctx = squareCanvas.getContext('2d');

        let drawWidth, drawHeight, dx, dy;
        const aspectRatio = sourceWidth / sourceHeight;
        
        if (aspectRatio > 1) { // Landscape
            drawWidth = TWITCH_TARGET_SIZE;
            drawHeight = TWITCH_TARGET_SIZE / aspectRatio;
        } else { // Portrait or square
            drawHeight = TWITCH_TARGET_SIZE;
            drawWidth = TWITCH_TARGET_SIZE * aspectRatio;
        }

        dx = (TWITCH_TARGET_SIZE - drawWidth) / 2;
        dy = (TWITCH_TARGET_SIZE - drawHeight) / 2;

        ctx.drawImage(frame, dx, dy, drawWidth, drawHeight);
        finalFrames.push(squareCanvas);
    });

    return { frames: finalFrames, width: TWITCH_TARGET_SIZE, height: TWITCH_TARGET_SIZE };
}


function generateSingleGif(index, delay, onFinishedCallback, qualityOverride = null) {
    let frames = state.cellFrames[index];
    const cellContainer = dom.gridContainer.children[index];
    if (!cellContainer) return;

    if (frames.length === 0) {
        console.warn(`No frames captured for cell ${index}. Skipping GIF generation.`);
        if (onFinishedCallback) onFinishedCallback();
        return;
    }

    const statusEl = cellContainer.querySelector('.status');
    statusEl.textContent = 'Building...';

    let width, height;

    if (dom.twitchToggle.checked) {
        const twitchFrames = prepareFramesForTwitch(frames);
        frames = twitchFrames.frames;
        width = twitchFrames.width;
        height = twitchFrames.height;
    } else {
        const firstFrame = frames[0];
        width = firstFrame.width;
        height = firstFrame.height;
    }
    
    if (frames.length === 0) {
         console.warn(`No frames to process for cell ${index} after Twitch prep. Skipping.`);
         statusEl.textContent = 'Error!';
         if (onFinishedCallback) onFinishedCallback();
         return;
    }

    const workerUrl = URL.createObjectURL(state.gifWorkerBlob);
    
    const quality = qualityOverride !== null ? qualityOverride : parseInt(dom.gifQualityInput.value, 10);
    let dither = dom.gifDitherInput.value;
    if (dither === 'false') {
        dither = false;
    }

    const gif = new GIF({
        workers: 2,
        quality: quality,
        dither: dither,
        width,
        height,
        workerScript: workerUrl,
        transparent: 0x000000
    });

    frames.forEach(frame => {
        gif.addFrame(frame, { delay });
    });

    gif.on('progress', (p) => {
        statusEl.textContent = `Building... ${(p * 100).toFixed(0)}%`;
    });

    gif.on('finished', (blob) => {
        URL.revokeObjectURL(workerUrl);

        // Spec 2: Max 1MB file size
        if (dom.twitchToggle.checked && blob.size > 1024 * 1024) {
            const newQuality = quality + 5;
            if (newQuality <= 30) {
                statusEl.textContent = `Too big, retrying... (Q:${newQuality})`;
                // Retry with lower quality
                generateSingleGif(index, delay, onFinishedCallback, newQuality);
                return;
            } else {
                statusEl.textContent = 'Too big (>1MB)';
                console.warn(`GIF for cell ${index} is > 1MB even at lowest quality.`);
            }
        }

        const url = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.src = url;

        const a = document.createElement('a');
        a.href = url;
        a.download = `asset_${index}.gif`;
        a.appendChild(img);

        const canvas = cellContainer.querySelector('canvas');
        if (canvas) {
             cellContainer.replaceChild(a, canvas);
        }
        statusEl.textContent = 'Done!';

        if (onFinishedCallback) {
            onFinishedCallback();
        }
    });

    gif.render();
}