/**
 * Enly Image Studio & Passport Photo Generator
 * Advanced Client-Side Image Processing Engine
 * Features: Outer-Boundary BFS Background Removal, Smart Magic Wand, Manual Brush, Passport Presets, Compliance Check
 */

(function () {
    // --- STATE MANAGEMENT ---
    let originalImage = null;
    let originalFileName = "passport_photo.png";

    // Canvas elements
    const mainCanvas = document.getElementById('main-canvas');
    const mainCtx = mainCanvas ? mainCanvas.getContext('2d', { willReadFrequently: true }) : null;

    let maskCanvas = document.createElement('canvas');
    let maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

    let bgImageObj = null;

    // History stack for Undo
    let historyStack = [];
    const MAX_HISTORY = 12;

    // Processing Settings
    let currentTool = 'none'; // 'none', 'auto-bg', 'wand', 'erase', 'restore'
    let activeBgColor = 'transparent';
    let activeBgImage = null;
    let activePreset = 'us-passport';
    let zoomScale = 1.0;
    let rotationAngle = 0; // 0, 90, 180, 270
    let brushSize = 30;
    let wandTolerance = 35;
    let targetCompressKB = 240;

    // Passport Presets Data
    const PRESETS = {
        'us-passport': { name: 'US Passport', width: 600, height: 600, physW: 51, physH: 51, unit: 'mm', maxKb: 240 },
        'uk-passport': { name: 'UK / EU Passport', width: 413, height: 531, physW: 35, physH: 45, unit: 'mm', maxKb: 300 },
        'canada-passport': { name: 'Canada Passport', width: 591, height: 827, physW: 50, physH: 70, unit: 'mm', maxKb: 500 },
        'china-passport': { name: 'China Passport', width: 390, height: 567, physW: 33, physH: 48, unit: 'mm', maxKb: 200 },
        'india-passport': { name: 'India Passport', width: 600, height: 600, physW: 51, physH: 51, unit: 'mm', maxKb: 300 },
        'id-card': { name: 'Standard ID Card', width: 638, height: 1016, physW: 54, physH: 86, unit: 'mm', maxKb: 500 }
    };

    // --- INITIALIZATION & EVENT BINDINGS ---
    document.addEventListener('DOMContentLoaded', () => {
        initUploadHandlers();
        initToolTabHandlers();
        initToolbarHandlers();
        initBgHandlers();
        initPresetHandlers();
        initCanvasBrushEvents();
        initExportHandlers();
    });

    // --- UPLOAD HANDLERS ---
    function initUploadHandlers() {
        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('file-input');
        const btnBrowse = document.getElementById('btn-browse-file');
        const btnNewImage = document.getElementById('btn-new-image');

        if (!dropzone || !fileInput) return;

        btnBrowse.addEventListener('click', () => fileInput.click());
        btnNewImage.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                loadImageFromFile(e.target.files[0]);
            }
        });

        // Drag & Drop
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropzone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropzone.classList.remove('drag-over');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt.files && dt.files[0]) {
                loadImageFromFile(dt.files[0]);
            }
        });
    }

    function loadImageFromFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please select a valid image file (JPG, PNG, WEBP, BMP).');
            return;
        }

        originalFileName = file.name;
        document.getElementById('image-filename-badge').textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                setupCanvasState();
                
                // Show studio UI, hide dropzone
                document.getElementById('upload-container').style.display = 'none';
                document.getElementById('studio-workspace').style.display = 'grid';
                
                // Render initial state
                renderCanvas();
                updateInspectorAndCompliance();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function setupCanvasState() {
        if (!originalImage) return;

        const w = originalImage.width;
        const h = originalImage.height;

        mainCanvas.width = w;
        mainCanvas.height = h;

        maskCanvas.width = w;
        maskCanvas.height = h;

        // Initialize mask canvas with full opacity (solid white = visible)
        maskCtx.fillStyle = '#ffffff';
        maskCtx.fillRect(0, 0, w, h);

        historyStack = [];
        saveHistoryState();
    }

    function saveHistoryState() {
        if (!maskCanvas) return;
        if (historyStack.length >= MAX_HISTORY) {
            historyStack.shift();
        }
        const imgData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        historyStack.push(imgData);
    }

    function undoLastAction() {
        if (historyStack.length > 1) {
            historyStack.pop(); // Remove current state
            const previousState = historyStack[historyStack.length - 1];
            maskCtx.putImageData(previousState, 0, 0);
            renderCanvas();
            updateInspectorAndCompliance();
        }
    }

    // --- TAB HANDLERS ---
    function initToolTabHandlers() {
        const tabs = [
            { btn: 'tab-bg', panel: 'panel-bg' },
            { btn: 'tab-sizing', panel: 'panel-sizing' },
            { btn: 'tab-inspector', panel: 'panel-inspector' }
        ];

        tabs.forEach(t => {
            const btnEl = document.getElementById(t.btn);
            const panelEl = document.getElementById(t.panel);
            if (!btnEl || !panelEl) return;

            btnEl.addEventListener('click', () => {
                tabs.forEach(item => {
                    document.getElementById(item.btn).classList.remove('active');
                    document.getElementById(item.panel).style.display = 'none';
                });
                btnEl.classList.add('active');
                panelEl.style.display = 'block';
            });
        });
    }

    // --- CANVAS TOOLBAR HANDLERS ---
    function initToolbarHandlers() {
        const btnAutoBg = document.getElementById('btn-auto-bg');
        const btnWand = document.getElementById('btn-wand');
        const btnErase = document.getElementById('btn-brush-erase');
        const btnRestore = document.getElementById('btn-brush-restore');
        const btnGuide = document.getElementById('btn-toggle-guide');
        const btnUndo = document.getElementById('btn-undo');
        const btnReset = document.getElementById('btn-reset');

        const settingsPanel = document.getElementById('brush-settings-panel');
        const sizeRange = document.getElementById('brush-size-range');
        const wandTolRange = document.getElementById('wand-tol-range');

        // Tool Mode Toggles
        const toolBtns = [btnWand, btnErase, btnRestore];
        
        function setToolMode(mode, activeBtn) {
            toolBtns.forEach(btn => btn.classList.remove('active'));
            if (currentTool === mode) {
                currentTool = 'none';
                settingsPanel.style.display = 'none';
            } else {
                currentTool = mode;
                if (activeBtn) activeBtn.classList.add('active');
                settingsPanel.style.display = 'block';

                document.getElementById('wand-tolerance-group').style.display = 'block';
            }
        }

        btnWand.addEventListener('click', () => setToolMode('wand', btnWand));
        btnErase.addEventListener('click', () => setToolMode('erase', btnErase));
        btnRestore.addEventListener('click', () => setToolMode('restore', btnRestore));

        // Auto Remove Background (Outer Boundary Connected BFS)
        btnAutoBg.addEventListener('click', () => {
            btnAutoBg.classList.add('active');
            btnAutoBg.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg><span>Processing...</span>';
            setTimeout(() => {
                autoRemoveBackgroundBorderBFS();
                btnAutoBg.classList.remove('active');
                btnAutoBg.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M3 12h3m12 0h3m-3.5-6.5l-2 2m-7 7l-2 2m0-11l2 2m7 7l2 2"/></svg><span>Auto Remove BG</span>';
            }, 50);
        });

        // Toggle Head Overlay Guide
        btnGuide.addEventListener('click', () => {
            const svgGuide = document.getElementById('head-guide-svg');
            const isHidden = svgGuide.style.display === 'none';
            svgGuide.style.display = isHidden ? 'flex' : 'none';
            btnGuide.classList.toggle('active', isHidden);
        });

        btnUndo.addEventListener('click', () => undoLastAction());

        btnReset.addEventListener('click', () => {
            setupCanvasState();
            renderCanvas();
            updateInspectorAndCompliance();
        });

        // Range Sliders
        sizeRange.addEventListener('input', (e) => {
            brushSize = parseInt(e.target.value, 10);
            document.getElementById('brush-size-val').textContent = brushSize + 'px';
        });

        wandTolRange.addEventListener('input', (e) => {
            wandTolerance = parseInt(e.target.value, 10);
            document.getElementById('wand-tol-val').textContent = wandTolerance;
        });
    }

    // --- OUTER BOUNDARY BFS BACKGROUND REMOVAL ALGORITHM ---
    // Protects internal subject pixels (like bottle contents, labels, text, peanuts, clothing details)
    function autoRemoveBackgroundBorderBFS() {
        if (!originalImage) return;

        const w = mainCanvas.width;
        const h = mainCanvas.height;

        // Extract original image pixel data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(originalImage, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // 1. Sample boundary/border pixels to calculate average background color
        const samples = [];
        const stepX = Math.max(1, Math.floor(w / 40));
        const stepY = Math.max(1, Math.floor(h / 40));

        for (let x = 0; x < w; x += stepX) {
            let iTop = (0 * w + x) * 4;
            let iBot = ((h - 1) * w + x) * 4;
            samples.push([data[iTop], data[iTop + 1], data[iTop + 2]]);
            samples.push([data[iBot], data[iBot + 1], data[iBot + 2]]);
        }
        for (let y = 0; y < h; y += stepY) {
            let iLeft = (y * w + 0) * 4;
            let iRight = (y * w + (w - 1)) * 4;
            samples.push([data[iLeft], data[iLeft + 1], data[iLeft + 2]]);
            samples.push([data[iRight], data[iRight + 1], data[iRight + 2]]);
        }

        let bgR = 0, bgG = 0, bgB = 0;
        samples.forEach(([r, g, b]) => { bgR += r; bgG += g; bgB += b; });
        bgR = Math.round(bgR / samples.length);
        bgG = Math.round(bgG / samples.length);
        bgB = Math.round(bgB / samples.length);

        // Maximum color distance allowed for background flood fill
        const maxDist = wandTolerance * 2.2;

        function colorDist(idx) {
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            return Math.sqrt(
                (r - bgR) ** 2 +
                (g - bgG) ** 2 +
                (b - bgB) ** 2
            );
        }

        // 2. BFS Outer Boundary Flood Fill
        const maskData = maskCtx.getImageData(0, 0, w, h);
        const mPixels = maskData.data;
        const visited = new Uint8Array(w * h);
        const queue = [];

        // Push border pixels that match background color into BFS queue
        for (let x = 0; x < w; x++) {
            let idxTop = 0 * w + x;
            let idxBot = (h - 1) * w + x;
            if (colorDist(idxTop * 4) <= maxDist) { visited[idxTop] = 1; queue.push(idxTop); }
            if (colorDist(idxBot * 4) <= maxDist) { visited[idxBot] = 1; queue.push(idxBot); }
        }
        for (let y = 0; y < h; y++) {
            let idxL = y * w + 0;
            let idxR = y * w + (w - 1);
            if (!visited[idxL] && colorDist(idxL * 4) <= maxDist) { visited[idxL] = 1; queue.push(idxL); }
            if (!visited[idxR] && colorDist(idxR * 4) <= maxDist) { visited[idxR] = 1; queue.push(idxR); }
        }

        let qIdx = 0;
        while (qIdx < queue.length) {
            const curr = queue[qIdx++];
            const cx = curr % w;
            const cy = Math.floor(curr / w);
            const pIdx = curr * 4;

            // Compute distance for feathering
            const dist = colorDist(pIdx);
            if (dist < maxDist * 0.75) {
                mPixels[pIdx + 3] = 0; // Completely transparent
            } else {
                // Soft edge anti-aliasing
                const alpha = Math.round(((dist - (maxDist * 0.75)) / (maxDist * 0.25)) * 255);
                mPixels[pIdx + 3] = Math.min(mPixels[pIdx + 3], alpha);
            }

            // Check 4-connected neighbors
            const nCoords = [];
            if (cx > 0) nCoords.push(curr - 1);
            if (cx < w - 1) nCoords.push(curr + 1);
            if (cy > 0) nCoords.push(curr - w);
            if (cy < h - 1) nCoords.push(curr + w);

            for (let n of nCoords) {
                if (!visited[n]) {
                    if (colorDist(n * 4) <= maxDist) {
                        visited[n] = 1;
                        queue.push(n);
                    }
                }
            }
        }

        maskCtx.putImageData(maskData, 0, 0);
        saveHistoryState();
        renderCanvas();
        updateInspectorAndCompliance();
    }

    // --- MAGIC WAND FLOOD FILL REMOVAL ---
    function applyMagicWandAt(startX, startY) {
        if (!originalImage) return;

        const w = mainCanvas.width;
        const h = mainCanvas.height;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(originalImage, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const startIdx = (startY * w + startX) * 4;
        const targetR = data[startIdx];
        const targetG = data[startIdx + 1];
        const targetB = data[startIdx + 2];

        const maskData = maskCtx.getImageData(0, 0, w, h);
        const mPixels = maskData.data;

        const visited = new Uint8Array(w * h);
        const queue = [startX + startY * w];
        visited[startX + startY * w] = 1;

        const maxTol = wandTolerance * 2.5;

        while (queue.length > 0) {
            const curr = queue.pop();
            const cx = curr % w;
            const cy = Math.floor(curr / w);
            const idx = curr * 4;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const diff = Math.sqrt(
                Math.pow(r - targetR, 2) +
                Math.pow(g - targetG, 2) +
                Math.pow(b - targetB, 2)
            );

            if (diff <= maxTol) {
                mPixels[idx + 3] = 0; // Erase alpha

                const neighbors = [];
                if (cx > 0) neighbors.push(curr - 1);
                if (cx < w - 1) neighbors.push(curr + 1);
                if (cy > 0) neighbors.push(curr - w);
                if (cy < h - 1) neighbors.push(curr + w);

                for (let n of neighbors) {
                    if (!visited[n]) {
                        visited[n] = 1;
                        queue.push(n);
                    }
                }
            }
        }

        maskCtx.putImageData(maskData, 0, 0);
        saveHistoryState();
        renderCanvas();
        updateInspectorAndCompliance();
    }

    // --- CANVAS BRUSH INTERACTIONS ---
    function initCanvasBrushEvents() {
        let isDrawing = false;

        function getCanvasCoords(e) {
            const rect = mainCanvas.getBoundingClientRect();
            const scaleX = mainCanvas.width / rect.width;
            const scaleY = mainCanvas.height / rect.height;

            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);

            return {
                x: Math.round((clientX - rect.left) * scaleX),
                y: Math.round((clientY - rect.top) * scaleY)
            };
        }

        function handlePointerDown(e) {
            if (!originalImage || currentTool === 'none') return;
            const coords = getCanvasCoords(e);

            if (currentTool === 'wand') {
                applyMagicWandAt(coords.x, coords.y);
                return;
            }

            isDrawing = true;
            applyBrushAt(coords.x, coords.y);
        }

        function handlePointerMove(e) {
            if (!isDrawing) return;
            const coords = getCanvasCoords(e);
            applyBrushAt(coords.x, coords.y);
        }

        function handlePointerUp() {
            if (isDrawing) {
                isDrawing = false;
                saveHistoryState();
                updateInspectorAndCompliance();
            }
        }

        mainCanvas.addEventListener('mousedown', handlePointerDown);
        mainCanvas.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);

        mainCanvas.addEventListener('touchstart', handlePointerDown, { passive: true });
        mainCanvas.addEventListener('touchmove', handlePointerMove, { passive: true });
        window.addEventListener('touchend', handlePointerUp);
    }

    function applyBrushAt(x, y) {
        maskCtx.save();
        maskCtx.globalCompositeOperation = (currentTool === 'erase') ? 'destination-out' : 'source-over';
        maskCtx.fillStyle = '#ffffff';
        maskCtx.beginPath();
        maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        maskCtx.fill();
        maskCtx.restore();

        renderCanvas();
    }

    // --- BACKGROUND COLOR & SWATCH HANDLERS ---
    function initBgHandlers() {
        const swatches = document.querySelectorAll('.bg-swatch');
        const customColorPicker = document.getElementById('custom-bg-color');
        const customHexInput = document.getElementById('custom-hex-input');
        const bgImgFileInput = document.getElementById('bg-img-file-input');
        const btnUploadBgImg = document.getElementById('btn-upload-bg-img');

        swatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                swatches.forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');

                activeBgColor = swatch.getAttribute('data-color');
                activeBgImage = null;

                if (activeBgColor !== 'transparent') {
                    customColorPicker.value = activeBgColor;
                    customHexInput.value = activeBgColor.toUpperCase();
                }

                renderCanvas();
                updateInspectorAndCompliance();
            });
        });

        customColorPicker.addEventListener('input', (e) => {
            activeBgColor = e.target.value;
            customHexInput.value = activeBgColor.toUpperCase();
            activeBgImage = null;
            swatches.forEach(s => s.classList.remove('active'));
            renderCanvas();
            updateInspectorAndCompliance();
        });

        customHexInput.addEventListener('change', (e) => {
            let hex = e.target.value.trim();
            if (!hex.startsWith('#')) hex = '#' + hex;
            if (/^#[0-9A-F]{6}$/i.test(hex)) {
                activeBgColor = hex;
                customColorPicker.value = hex;
                activeBgImage = null;
                swatches.forEach(s => s.classList.remove('active'));
                renderCanvas();
                updateInspectorAndCompliance();
            }
        });

        btnUploadBgImg.addEventListener('click', () => bgImgFileInput.click());
        bgImgFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const img = new Image();
                    img.onload = () => {
                        bgImageObj = img;
                        activeBgColor = 'image';
                        swatches.forEach(s => s.classList.remove('active'));
                        renderCanvas();
                    };
                    img.src = evt.target.result;
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    // --- PASSPORT & SIZING PRESET HANDLERS ---
    function initPresetHandlers() {
        const presetCards = document.querySelectorAll('.passport-card');
        const widthInput = document.getElementById('dim-width');
        const heightInput = document.getElementById('dim-height');
        const unitSelect = document.getElementById('dim-unit');
        const zoomRange = document.getElementById('zoom-range');
        const btnRotateLeft = document.getElementById('btn-rotate-left');
        const btnRotateRight = document.getElementById('btn-rotate-right');

        presetCards.forEach(card => {
            card.addEventListener('click', () => {
                presetCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                const key = card.getAttribute('data-preset');
                if (PRESETS[key]) {
                    activePreset = key;
                    const p = PRESETS[key];
                    widthInput.value = p.width;
                    heightInput.value = p.height;
                    unitSelect.value = p.unit;
                    targetCompressKB = p.maxKb;
                    document.getElementById('target-kb-input').value = p.maxKb;

                    renderCanvas();
                    updateInspectorAndCompliance();
                }
            });
        });

        [widthInput, heightInput, unitSelect].forEach(el => {
            el.addEventListener('change', () => {
                presetCards.forEach(c => c.classList.remove('active'));
                activePreset = 'custom';
                renderCanvas();
                updateInspectorAndCompliance();
            });
        });

        zoomRange.addEventListener('input', (e) => {
            zoomScale = parseInt(e.target.value, 10) / 100;
            document.getElementById('zoom-val-text').textContent = e.target.value + '%';
            renderCanvas();
        });

        btnRotateLeft.addEventListener('click', () => {
            rotationAngle = (rotationAngle - 90 + 360) % 360;
            renderCanvas();
        });

        btnRotateRight.addEventListener('click', () => {
            rotationAngle = (rotationAngle + 90) % 360;
            renderCanvas();
        });
    }

    // --- MAIN CANVAS RENDERING ENGINE ---
    function renderCanvas() {
        if (!originalImage || !mainCtx) return;

        const w = mainCanvas.width;
        const h = mainCanvas.height;

        mainCtx.clearRect(0, 0, w, h);

        // 1. Draw Background Layer
        if (activeBgColor === 'image' && bgImageObj) {
            mainCtx.drawImage(bgImageObj, 0, 0, w, h);
        } else if (activeBgColor !== 'transparent') {
            mainCtx.fillStyle = activeBgColor;
            mainCtx.fillRect(0, 0, w, h);
        }

        // 2. Composite Subject Image with Alpha Mask
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw original subject
        tempCtx.save();
        tempCtx.translate(w / 2, h / 2);
        tempCtx.rotate((rotationAngle * Math.PI) / 180);
        tempCtx.scale(zoomScale, zoomScale);
        tempCtx.drawImage(originalImage, -w / 2, -h / 2, w, h);
        tempCtx.restore();

        // Apply Alpha Mask using destination-in
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.drawImage(maskCanvas, 0, 0, w, h);

        // 3. Draw final composited subject on main display canvas
        mainCtx.drawImage(tempCanvas, 0, 0);
    }

    // --- COMPLIANCE INSPECTOR & METRICS CALCULATOR ---
    function updateInspectorAndCompliance() {
        if (!originalImage) return;

        const w = mainCanvas.width;
        const h = mainCanvas.height;

        // Physical dimensions (at 300 DPI)
        const mmW = Math.round((w / 300) * 25.4);
        const mmH = Math.round((h / 300) * 25.4);

        document.getElementById('metric-dim-px').textContent = `${w} × ${h}`;
        document.getElementById('metric-dim-physical').textContent = `${mmW} × ${mmH} mm`;

        // Estimate file size (JPEG @ 90% quality)
        const dataUrl = mainCanvas.toDataURL('image/jpeg', 0.9);
        const head = 'data:image/jpeg;base64,';
        const sizeBytes = Math.round((dataUrl.length - head.length) * 3 / 4);
        const sizeKB = Math.round(sizeBytes / 1024);

        document.getElementById('metric-file-size').textContent = `${sizeKB} KB`;

        // Aspect Ratio
        const gcd = (a, b) => b ? gcd(b, a % b) : a;
        const divisor = gcd(w, h);
        const ratioText = (divisor > 20) ? `${w / divisor} : ${h / divisor}` : `${(w / h).toFixed(2)} : 1`;
        document.getElementById('metric-ratio').textContent = ratioText;

        // Passport Compliance Checks
        const chkRes = document.getElementById('chk-res');
        const chkAspect = document.getElementById('chk-aspect');
        const chkSize = document.getElementById('chk-size');
        const chkBg = document.getElementById('chk-bg');

        // Check 1: Resolution (min 400px)
        if (w >= 600 && h >= 600) {
            setCheckBadge(chkRes, 'Pass', 'status-pass');
        } else if (w >= 400) {
            setCheckBadge(chkRes, 'Acceptable', 'status-warn');
        } else {
            setCheckBadge(chkRes, 'Low Res', 'status-fail');
        }

        // Check 2: Aspect Ratio
        const targetRatio = (PRESETS[activePreset]) ? (PRESETS[activePreset].width / PRESETS[activePreset].height) : (w / h);
        const currRatio = w / h;
        if (Math.abs(currRatio - targetRatio) < 0.05) {
            setCheckBadge(chkAspect, 'Pass', 'status-pass');
        } else {
            setCheckBadge(chkAspect, 'Mismatch', 'status-warn');
        }

        // Check 3: File Size
        if (sizeKB <= targetCompressKB) {
            setCheckBadge(chkSize, 'Pass', 'status-pass');
        } else {
            setCheckBadge(chkSize, 'Over Limit', 'status-fail');
        }

        // Check 4: Background Uniformity
        if (activeBgColor !== 'transparent') {
            setCheckBadge(chkBg, 'Pass', 'status-pass');
        } else {
            setCheckBadge(chkBg, 'Transparent', 'status-warn');
        }
    }

    function setCheckBadge(el, text, statusClass) {
        if (!el) return;
        el.textContent = text;
        el.className = `compliance-status ${statusClass}`;
    }

    // --- EXPORT & PRINT SHEET GENERATOR HANDLERS ---
    function initExportHandlers() {
        const btnDownload = document.getElementById('btn-download-photo');
        const btnDownloadSheet = document.getElementById('btn-download-sheet');
        const btnCompress = document.getElementById('btn-apply-compress');

        btnDownload.addEventListener('click', () => {
            if (!originalImage) return;

            const format = document.getElementById('export-format').value;
            const quality = parseFloat(document.getElementById('export-quality').value);

            const dataUrl = mainCanvas.toDataURL(format, quality);
            const ext = (format === 'image/png') ? 'png' : (format === 'image/webp') ? 'webp' : 'jpg';

            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `enly_passport_${Date.now()}.${ext}`;
            a.click();
        });

        // 4x6" Printable Sheet Generator (6 passport photos grid)
        btnDownloadSheet.addEventListener('click', () => {
            if (!originalImage) return;

            // Standard 4x6 inch photo paper at 300 DPI = 1800 x 1200 px
            const sheetCanvas = document.createElement('canvas');
            sheetCanvas.width = 1800; // Width 6 inches
            sheetCanvas.height = 1200; // Height 4 inches
            const sCtx = sheetCanvas.getContext('2d');

            // Fill white background for print sheet
            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(0, 0, 1800, 1200);

            // Title Header
            sCtx.fillStyle = '#94a3b8';
            sCtx.font = 'bold 20px sans-serif';
            sCtx.fillText('Enly Passport Photo Print Sheet (4×6 Inches)', 40, 45);

            // Print 6 passport photos (2 rows of 3 columns)
            const photoW = 450; // 1.5 inch photo
            const photoH = 450;
            const startX = 100;
            const startY = 80;
            const gapX = 80;
            const gapY = 60;

            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 3; col++) {
                    const x = startX + col * (photoW + gapX);
                    const y = startY + row * (photoH + gapY);

                    // Draw photo
                    sCtx.drawImage(mainCanvas, x, y, photoW, photoH);

                    // Cut lines
                    sCtx.strokeStyle = '#cbd5e1';
                    sCtx.lineWidth = 1;
                    sCtx.setLineDash([4, 4]);
                    sCtx.strokeRect(x, y, photoW, photoH);
                }
            }

            const dataUrl = sheetCanvas.toDataURL('image/jpeg', 0.95);
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `enly_passport_print_sheet_4x6_${Date.now()}.jpg`;
            a.click();
        });

        // Target File Size Compressor
        btnCompress.addEventListener('click', () => {
            const targetKB = parseInt(document.getElementById('target-kb-input').value, 10);
            if (!targetKB || targetKB <= 0) return;

            let quality = 0.95;
            let dataUrl = mainCanvas.toDataURL('image/jpeg', quality);
            let sizeKB = Math.round((dataUrl.length - 23) * 3 / 4 / 1024);

            while (sizeKB > targetKB && quality > 0.15) {
                quality -= 0.05;
                dataUrl = mainCanvas.toDataURL('image/jpeg', quality);
                sizeKB = Math.round((dataUrl.length - 23) * 3 / 4 / 1024);
            }

            alert(`Image compressed to ${sizeKB} KB at ${Math.round(quality * 100)}% quality.`);
            updateInspectorAndCompliance();
        });

        // Cloud Share & QR Code Generator Action
        const btnCloudShare = document.getElementById('btn-cloud-share-photo');
        if (btnCloudShare) {
            btnCloudShare.addEventListener('click', async () => {
                if (!originalImage) return;

                const format = document.getElementById('export-format').value;
                const quality = parseFloat(document.getElementById('export-quality').value);
                const dataUrl = mainCanvas.toDataURL(format, quality);
                const ext = (format === 'image/png') ? 'png' : (format === 'image/webp') ? 'webp' : 'jpg';
                const fileId = "fl_" + Math.random().toString(36).substring(2, 10);
                const name = `processed_photo_${Date.now()}.${ext}`;

                const fileRecord = {
                    id: fileId,
                    name: name,
                    size: Math.round((dataUrl.length - 23) * 3 / 4),
                    type: format,
                    category: 'images',
                    dataUrl: dataUrl,
                    createdAt: new Date().toISOString(),
                    downloads: 0
                };

                if (window.saveToEnlyCloudVault) {
                    await window.saveToEnlyCloudVault(fileRecord);
                } else {
                    localStorage.setItem(`enly_shared_file_${fileId}`, JSON.stringify(fileRecord));
                }

                window.location.href = `cloud-storage.html?file=${fileId}`;
            });
        }
    }

})();
