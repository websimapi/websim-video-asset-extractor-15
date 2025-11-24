import { state } from 'app/state';
import { initUI, preloadGifWorker } from 'app/ui';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements and event listeners
    initUI();
    // Preload the GIF worker script
    preloadGifWorker();
});