// Docx & Printed Document Scanner Studio Engine for Enly

document.addEventListener('DOMContentLoaded', () => {

    // --- State Variables ---
    let pages = []; // Array of { id, originalImage, canvas, text, filter, brightness, contrast, rotation, type }
    let selectedIndex = -1;
    let cameraStream = null;

    let pdfConfig = {
        format: 'a4',
        orientation: 'portrait',
        margins: 'normal',
        watermark: '',
        headerText: 'ENLY SCANNED DOCUMENT',
        footerOption: 'page_num',
        theme: 'executive'
    };

    // --- DOM Elements ---
    const openCameraBtn = document.getElementById('open-camera-btn');
    const uploadDocxBtn = document.getElementById('upload-docx-btn');
    const uploadScansBtn = document.getElementById('upload-scans-btn');
    const docxFileInput = document.getElementById('docx-file-input');
    const imageFileInput = document.getElementById('image-file-input');

    const pagesContainer = document.getElementById('pages-container');
    const pageCountBadge = document.getElementById('page-count-badge');
    const pageEditPanel = document.getElementById('page-edit-panel');

    const filterPills = document.querySelectorAll('.filter-pill');
    const brightnessSlider = document.getElementById('brightness-slider');
    const contrastSlider = document.getElementById('contrast-slider');
    const brightnessVal = document.getElementById('brightness-val');
    const contrastVal = document.getElementById('contrast-val');
    const rotateLeftBtn = document.getElementById('rotate-left-btn');
    const ocrExtractBtn = document.getElementById('ocr-extract-btn');

    const pdfFormatSelect = document.getElementById('pdf-format');
    const pdfOrientationSelect = document.getElementById('pdf-orientation');
    const pdfMarginsSelect = document.getElementById('pdf-margins');
    const pdfWatermarkInput = document.getElementById('pdf-watermark');
    const pdfHeaderTextInput = document.getElementById('pdf-header-text');
    const pdfFooterOptionSelect = document.getElementById('pdf-footer-option');
    const themeCards = document.querySelectorAll('.theme-preset-card');

    const paperSheetDisplay = document.getElementById('paper-sheet-display');
    const paperBodyContent = document.getElementById('paper-body-content');
    const watermarkDisplay = document.getElementById('watermark-display');
    const paperHeaderLeft = document.getElementById('paper-header-left');
    const paperHeaderDate = document.getElementById('paper-header-date');
    const paperFooterPage = document.getElementById('paper-footer-page');

    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const exportDocxBtn = document.getElementById('export-docx-btn');
    const exportZipBtn = document.getElementById('export-zip-btn');

    const cameraModal = document.getElementById('camera-modal');
    const cameraVideo = document.getElementById('camera-video');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    const snapPhotoBtn = document.getElementById('snap-photo-btn');

    const ocrModal = document.getElementById('ocr-modal');
    const ocrTextArea = document.getElementById('ocr-text-area');
    const closeOcrBtn = document.getElementById('close-ocr-btn');
    const copyOcrBtn = document.getElementById('copy-ocr-btn');
    const applyOcrBtn = document.getElementById('apply-ocr-btn');

    // --- Init Date in Header ---
    const todayStr = new Date().toISOString().split('T')[0];
    if (paperHeaderDate) paperHeaderDate.textContent = todayStr;

    // --- Event Listeners: Image & DOCX Uploads ---
    uploadScansBtn.addEventListener('click', () => imageFileInput.click());
    uploadDocxBtn.addEventListener('click', () => docxFileInput.click());

    imageFileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    addPageFromImage(img);
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
        imageFileInput.value = '';
    });

    docxFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'docx' || ext === 'doc') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const arrayBuffer = evt.target.result;
                if (window.mammoth) {
                    window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
                        .then((result) => {
                            addPageFromText(result.value, file.name);
                        })
                        .catch((err) => {
                            alert('Failed to parse DOCX file: ' + err.message);
                        });
                } else {
                    alert('DOCX processor library is loading, please try again.');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Plain text or Markdown
            const reader = new FileReader();
            reader.onload = (evt) => {
                addPageFromText(`<pre style="font-family: inherit; white-space: pre-wrap;">${escapeHtml(evt.target.result)}</pre>`, file.name);
            };
            reader.readAsText(file);
        }
        docxFileInput.value = '';
    });

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // --- Camera Handling ---
    openCameraBtn.addEventListener('click', async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            cameraVideo.srcObject = cameraStream;
            cameraModal.style.display = 'flex';
        } catch (err) {
            alert('Camera access unavailable or permission denied. You can upload photo scans instead.');
            console.error('Camera Error:', err);
        }
    });

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        cameraModal.style.display = 'none';
    }

    closeCameraBtn.addEventListener('click', stopCamera);

    snapPhotoBtn.addEventListener('click', () => {
        if (!cameraVideo.videoWidth) return;

        const canvas = document.createElement('canvas');
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cameraVideo, 0, 0);

        const img = new Image();
        img.onload = () => {
            addPageFromImage(img);
        };
        img.src = canvas.toDataURL('image/jpeg', 0.95);

        // Flash visual effect
        cameraModal.style.opacity = '0.5';
        setTimeout(() => cameraModal.style.opacity = '1', 150);
    });

    // --- Page Management ---
    function addPageFromImage(img) {
        const pageId = 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const pageObj = {
            id: pageId,
            type: 'image',
            originalImage: img,
            filter: 'magic',
            brightness: 100,
            contrast: 100,
            rotation: 0,
            text: '',
            processedCanvas: null
        };

        pageObj.processedCanvas = renderProcessedCanvas(pageObj);
        pages.push(pageObj);

        if (selectedIndex === -1) selectedIndex = 0;
        renderPagesList();
        updatePreview();
    }

    function addPageFromText(htmlContent, title) {
        const pageId = 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const pageObj = {
            id: pageId,
            type: 'text',
            originalImage: null,
            text: htmlContent,
            title: title || 'Imported Document',
            filter: 'original',
            brightness: 100,
            contrast: 100,
            rotation: 0,
            processedCanvas: null
        };

        pages.push(pageObj);
        if (selectedIndex === -1) selectedIndex = 0;
        renderPagesList();
        updatePreview();
    }

    function renderPagesList() {
        pagesContainer.innerHTML = '';
        pageCountBadge.textContent = `${pages.length} Page${pages.length === 1 ? '' : 's'}`;

        if (pages.length === 0) {
            selectedIndex = -1;
            pageEditPanel.style.display = 'none';
            pagesContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--text-secondary);">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-muted); margin-bottom: 10px;">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <p style="font-size: 13px; font-weight: 600;">No scanned pages yet</p>
                    <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Use camera capture, upload DOCX or images above to start.</p>
                </div>
            `;
            updatePreview();
            return;
        }

        pages.forEach((page, idx) => {
            const card = document.createElement('div');
            card.className = `page-thumb-card ${idx === selectedIndex ? 'active' : ''}`;
            card.addEventListener('click', () => {
                selectedIndex = idx;
                renderPagesList();
                syncControlsWithSelectedPage();
                updatePreview();
            });

            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'page-thumb-img-wrapper';

            if (page.type === 'image' && page.processedCanvas) {
                const thumbImg = document.createElement('img');
                thumbImg.src = page.processedCanvas.toDataURL('image/jpeg', 0.8);
                imgWrapper.appendChild(thumbImg);
            } else {
                imgWrapper.innerHTML = `<div style="padding: 10px; font-size: 10px; color: #475569; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical;">${page.text}</div>`;
            }

            const footer = document.createElement('div');
            footer.className = 'page-thumb-footer';
            footer.innerHTML = `<span>Page ${idx + 1}</span>`;

            const actions = document.createElement('div');
            actions.className = 'page-thumb-actions';

            if (idx > 0) {
                const upBtn = document.createElement('button');
                upBtn.className = 'page-action-btn move-btn';
                upBtn.innerHTML = '↑';
                upBtn.title = 'Move Page Up';
                upBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const temp = pages[idx];
                    pages[idx] = pages[idx - 1];
                    pages[idx - 1] = temp;
                    selectedIndex = idx - 1;
                    renderPagesList();
                    updatePreview();
                });
                actions.appendChild(upBtn);
            }

            if (idx < pages.length - 1) {
                const downBtn = document.createElement('button');
                downBtn.className = 'page-action-btn move-btn';
                downBtn.innerHTML = '↓';
                downBtn.title = 'Move Page Down';
                downBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const temp = pages[idx];
                    pages[idx] = pages[idx + 1];
                    pages[idx + 1] = temp;
                    selectedIndex = idx + 1;
                    renderPagesList();
                    updatePreview();
                });
                actions.appendChild(downBtn);
            }

            const delBtn = document.createElement('button');
            delBtn.className = 'page-action-btn';
            delBtn.innerHTML = '✕';
            delBtn.title = 'Delete Page';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                pages.splice(idx, 1);
                if (selectedIndex >= pages.length) selectedIndex = pages.length - 1;
                renderPagesList();
                syncControlsWithSelectedPage();
                updatePreview();
            });
            actions.appendChild(delBtn);

            footer.appendChild(actions);
            card.appendChild(imgWrapper);
            card.appendChild(footer);
            pagesContainer.appendChild(card);
        });

        syncControlsWithSelectedPage();
    }

    function syncControlsWithSelectedPage() {
        if (selectedIndex < 0 || selectedIndex >= pages.length) {
            pageEditPanel.style.display = 'none';
            return;
        }

        const page = pages[selectedIndex];
        if (page.type === 'text') {
            pageEditPanel.style.display = 'none';
            return;
        }

        pageEditPanel.style.display = 'block';

        filterPills.forEach(pill => {
            if (pill.getAttribute('data-filter') === page.filter) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });

        brightnessSlider.value = page.brightness;
        brightnessVal.textContent = page.brightness + '%';

        contrastSlider.value = page.contrast;
        contrastVal.textContent = page.contrast + '%';
    }

    // --- Image Processing Filters Engine ---
    function renderProcessedCanvas(page) {
        if (!page.originalImage) return null;

        const img = page.originalImage;
        const canvas = document.createElement('canvas');
        const rot = page.rotation % 360;

        if (rot === 90 || rot === 270) {
            canvas.width = img.naturalHeight || img.height;
            canvas.height = img.naturalWidth || img.width;
        } else {
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
        }

        const ctx = canvas.getContext('2d');
        ctx.save();

        if (rot === 90) {
            ctx.translate(canvas.width, 0);
            ctx.rotate(90 * Math.PI / 180);
        } else if (rot === 180) {
            ctx.translate(canvas.width, canvas.height);
            ctx.rotate(180 * Math.PI / 180);
        } else if (rot === 270) {
            ctx.translate(0, canvas.height);
            ctx.rotate(270 * Math.PI / 180);
        }

        ctx.filter = `brightness(${page.brightness}%) contrast(${page.contrast}%)`;
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        // Apply CamScanner Pixel Filter
        if (page.filter !== 'original') {
            applyPixelFilter(ctx, canvas.width, canvas.height, page.filter);
        }

        return canvas;
    }

    function applyPixelFilter(ctx, width, height, filterType) {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            if (filterType === 'magic') {
                // Magic Color: Brighten paper background, sharpen dark ink
                let lum = 0.299 * r + 0.587 * g + 0.114 * b;
                if (lum > 175) {
                    // Brighten paper
                    r = Math.min(255, r * 1.15 + 15);
                    g = Math.min(255, g * 1.15 + 15);
                    b = Math.min(255, b * 1.15 + 15);
                } else {
                    // Darken text ink
                    r = Math.max(0, r * 0.85);
                    g = Math.max(0, g * 0.85);
                    b = Math.max(0, b * 0.85);
                }
            } else if (filterType === 'bw') {
                // Crisp B&W Adaptive Thresholding
                let lum = 0.299 * r + 0.587 * g + 0.114 * b;
                let val = lum > 140 ? 255 : 0;
                r = val; g = val; b = val;
            } else if (filterType === 'grayscale') {
                // Smooth Monochrome Grayscale
                let gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = gray; g = gray; b = gray;
            } else if (filterType === 'contrast') {
                // High Contrast
                r = r > 128 ? Math.min(255, r * 1.2) : Math.max(0, r * 0.7);
                g = g > 128 ? Math.min(255, g * 1.2) : Math.max(0, g * 0.7);
                b = b > 128 ? Math.min(255, b * 1.2) : Math.max(0, b * 0.7);
            }

            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
        }

        ctx.putImageData(imgData, 0, 0);
    }

    // --- Filter Controls Handlers ---
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            if (selectedIndex < 0 || selectedIndex >= pages.length) return;
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const filterName = pill.getAttribute('data-filter');
            pages[selectedIndex].filter = filterName;
            pages[selectedIndex].processedCanvas = renderProcessedCanvas(pages[selectedIndex]);

            renderPagesList();
            updatePreview();
        });
    });

    brightnessSlider.addEventListener('input', (e) => {
        if (selectedIndex < 0 || selectedIndex >= pages.length) return;
        const val = e.target.value;
        brightnessVal.textContent = val + '%';
        pages[selectedIndex].brightness = val;
        pages[selectedIndex].processedCanvas = renderProcessedCanvas(pages[selectedIndex]);
        updatePreview();
    });

    contrastSlider.addEventListener('input', (e) => {
        if (selectedIndex < 0 || selectedIndex >= pages.length) return;
        const val = e.target.value;
        contrastVal.textContent = val + '%';
        pages[selectedIndex].contrast = val;
        pages[selectedIndex].processedCanvas = renderProcessedCanvas(pages[selectedIndex]);
        updatePreview();
    });

    rotateLeftBtn.addEventListener('click', () => {
        if (selectedIndex < 0 || selectedIndex >= pages.length) return;
        pages[selectedIndex].rotation = (pages[selectedIndex].rotation + 270) % 360;
        pages[selectedIndex].processedCanvas = renderProcessedCanvas(pages[selectedIndex]);
        renderPagesList();
        updatePreview();
    });

    // --- OCR Text Extractor ---
    ocrExtractBtn.addEventListener('click', () => {
        if (selectedIndex < 0 || selectedIndex >= pages.length) return;
        const page = pages[selectedIndex];
        if (!page.processedCanvas) return;

        ocrTextArea.value = 'Extracting text from page with OCR engine... Please wait...';
        ocrModal.style.display = 'flex';

        if (window.Tesseract) {
            const dataUrl = page.processedCanvas.toDataURL('image/png');
            Tesseract.recognize(dataUrl, 'eng')
                .then(({ data: { text } }) => {
                    ocrTextArea.value = text.trim() || 'No clear text recognized on this document page.';
                })
                .catch((err) => {
                    ocrTextArea.value = 'OCR Error: ' + err.message;
                });
        } else {
            ocrTextArea.value = 'Tesseract OCR library is loading... Try again in a moment.';
        }
    });

    closeOcrBtn.addEventListener('click', () => ocrModal.style.display = 'none');
    copyOcrBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(ocrTextArea.value);
        copyOcrBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Copied!</span>';
        setTimeout(() => {
            copyOcrBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> <span>Copy Text</span>';
        }, 2000);
    });

    applyOcrBtn.addEventListener('click', () => {
        if (selectedIndex >= 0 && selectedIndex < pages.length) {
            pages[selectedIndex].text = ocrTextArea.value;
        }
        ocrModal.style.display = 'none';
        updatePreview();
    });

    // --- PDF Export Config Listeners ---
    pdfFormatSelect.addEventListener('change', (e) => {
        pdfConfig.format = e.target.value;
        paperSheetDisplay.className = `paper-sheet ${pdfConfig.format} ${pdfConfig.orientation}`;
        updatePreview();
    });

    pdfOrientationSelect.addEventListener('change', (e) => {
        pdfConfig.orientation = e.target.value;
        paperSheetDisplay.className = `paper-sheet ${pdfConfig.format} ${pdfConfig.orientation}`;
        updatePreview();
    });

    pdfMarginsSelect.addEventListener('change', (e) => {
        pdfConfig.margins = e.target.value;
        updatePreview();
    });

    pdfWatermarkInput.addEventListener('input', (e) => {
        pdfConfig.watermark = e.target.value.toUpperCase();
        updatePreview();
    });

    pdfHeaderTextInput.addEventListener('input', (e) => {
        pdfConfig.headerText = e.target.value.toUpperCase();
        updatePreview();
    });

    pdfFooterOptionSelect.addEventListener('change', (e) => {
        pdfConfig.footerOption = e.target.value;
        updatePreview();
    });

    themeCards.forEach(card => {
        card.addEventListener('click', () => {
            themeCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            pdfConfig.theme = card.getAttribute('data-theme');
            updatePreview();
        });
    });

    // --- Live Document Paper Preview Update ---
    function updatePreview() {
        if (!paperSheetDisplay) return;

        // Apply Margin Padding to Body Content
        let marginPx = '24px';
        if (pdfConfig.margins === 'compact') marginPx = '12px';
        if (pdfConfig.margins === 'wide') marginPx = '36px';
        if (pdfConfig.margins === 'zero') marginPx = '0px';

        paperBodyContent.style.top = pdfConfig.margins === 'zero' ? '0px' : '48px';
        paperBodyContent.style.bottom = pdfConfig.margins === 'zero' ? '0px' : '48px';
        paperBodyContent.style.left = marginPx;
        paperBodyContent.style.right = marginPx;

        // Watermark Text
        if (pdfConfig.watermark && pdfConfig.watermark.trim() !== '') {
            watermarkDisplay.style.display = 'block';
            watermarkDisplay.textContent = pdfConfig.watermark;
        } else {
            watermarkDisplay.style.display = 'none';
        }

        // Header Title
        if (paperHeaderLeft) {
            paperHeaderLeft.textContent = pdfConfig.headerText || 'ENLY SCANNED DOCUMENT';
        }

        // Footer Text & Page Numbering
        if (paperFooterPage) {
            const currPageNum = selectedIndex >= 0 ? selectedIndex + 1 : 1;
            const totalPages = pages.length > 0 ? pages.length : 1;
            if (pdfConfig.footerOption === 'none') {
                paperFooterPage.style.display = 'none';
            } else {
                paperFooterPage.style.display = 'block';
                paperFooterPage.textContent = `Page ${currPageNum} of ${totalPages}`;
            }
        }

        // Body Content Display
        paperBodyContent.innerHTML = '';
        if (selectedIndex >= 0 && selectedIndex < pages.length) {
            const curPage = pages[selectedIndex];
            if (curPage.type === 'image' && curPage.processedCanvas) {
                const previewImg = new Image();
                previewImg.src = curPage.processedCanvas.toDataURL('image/jpeg', 0.9);
                previewImg.style.width = '100%';
                previewImg.style.height = '100%';
                previewImg.style.objectFit = pdfConfig.margins === 'zero' ? 'cover' : 'contain';
                paperBodyContent.appendChild(previewImg);
            } else if (curPage.text) {
                const textDiv = document.createElement('div');
                textDiv.className = 'paper-body-text';
                textDiv.innerHTML = curPage.text;
                paperBodyContent.appendChild(textDiv);
            }
        } else {
            paperBodyContent.innerHTML = `
                <div style="margin: auto; text-align: center; color: #94a3b8;">
                    <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <p style="font-size: 14px; font-weight: 600; margin-top: 8px;">Paper Preview Standby</p>
                </div>
            `;
        }
    }

    // --- PDF Export Engine ---
    exportPdfBtn.addEventListener('click', async () => {
        if (!pages.length) {
            alert('Please add or scan at least one document page before exporting PDF.');
            return;
        }

        exportPdfBtn.disabled = true;
        exportPdfBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> <span>Generating PDF...</span>';

        try {
            const { jsPDF } = window.jspdf;
            const orientation = pdfConfig.orientation === 'landscape' ? 'l' : 'p';
            const doc = new jsPDF({
                orientation: orientation,
                unit: 'mm',
                format: pdfConfig.format
            });

            const pdfWidth = doc.internal.pageSize.getWidth();
            const pdfHeight = doc.internal.pageSize.getHeight();

            for (let i = 0; i < pages.length; i++) {
                if (i > 0) doc.addPage(pdfConfig.format, orientation);
                const page = pages[i];

                // Page Margin Calculation
                let marginMm = 20;
                if (pdfConfig.margins === 'compact') marginMm = 10;
                if (pdfConfig.margins === 'wide') marginMm = 30;
                if (pdfConfig.margins === 'zero') marginMm = 0;

                // Render Header if not zero margin
                if (marginMm > 0) {
                    doc.setFontSize(9);
                    doc.setTextColor(100, 116, 139);
                    doc.text(pdfConfig.headerText || 'ENLY SCANNED DOCUMENT', marginMm, 12);
                    doc.text(todayStr, pdfWidth - marginMm, 12, { align: 'right' });
                    doc.setDrawColor(226, 232, 240);
                    doc.line(marginMm, 14, pdfWidth - marginMm, 14);
                }

                // Draw Page Image or Text
                const contentTop = marginMm > 0 ? 18 : 0;
                const contentHeight = marginMm > 0 ? pdfHeight - 34 : pdfHeight;
                const contentWidth = pdfWidth - (marginMm * 2);

                if (page.type === 'image' && page.processedCanvas) {
                    const imgData = page.processedCanvas.toDataURL('image/jpeg', 0.95);
                    doc.addImage(imgData, 'JPEG', marginMm, contentTop, contentWidth, contentHeight, undefined, 'FAST');
                } else if (page.text) {
                    doc.setFontSize(11);
                    doc.setTextColor(30, 41, 59);
                    const cleanText = page.text.replace(/<[^>]*>?/gm, ''); // strip HTML tags
                    const splitLines = doc.splitTextToSize(cleanText, contentWidth);
                    doc.text(splitLines, marginMm, contentTop + 6);
                }

                // Render Watermark
                if (pdfConfig.watermark && pdfConfig.watermark.trim() !== '') {
                    doc.saveGraphicsState();
                    doc.setFontSize(36);
                    doc.setTextColor(200, 200, 200);
                    doc.text(pdfConfig.watermark, pdfWidth / 2, pdfHeight / 2, {
                        align: 'center',
                        angle: 35
                    });
                    doc.restoreGraphicsState();
                }

                // Render Footer Page Numbers
                if (marginMm > 0 && pdfConfig.footerOption !== 'none') {
                    doc.setDrawColor(226, 232, 240);
                    doc.line(marginMm, pdfHeight - 14, pdfWidth - marginMm, pdfHeight - 14);
                    doc.setFontSize(9);
                    doc.setTextColor(100, 116, 139);
                    doc.text(`CONFIDENTIAL`, marginMm, pdfHeight - 8);
                    doc.text(`Page ${i + 1} of ${pages.length}`, pdfWidth - marginMm, pdfHeight - 8, { align: 'right' });
                }
            }

            const timeStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            doc.save(`Enly_Scanned_Document_${timeStamp}.pdf`);

        } catch (err) {
            console.error('PDF Export Error:', err);
            alert('Failed to export PDF: ' + err.message);
        } finally {
            exportPdfBtn.disabled = false;
            exportPdfBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> <span>Export Polished PDF</span>';
        }
    });

    // --- Export DOCX File ---
    exportDocxBtn.addEventListener('click', () => {
        if (!pages.length) {
            alert('No document pages to export.');
            return;
        }

        let combinedHtml = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><title>Enly Scanned Document</title><style>body{font-family: Arial, sans-serif; margin: 30px;}</style></head>
            <body>
            <h2>${escapeHtml(pdfConfig.headerText)}</h2>
            <hr/>
        `;

        pages.forEach((p, idx) => {
            combinedHtml += `<h3>Page ${idx + 1}</h3>`;
            if (p.type === 'image' && p.processedCanvas) {
                combinedHtml += `<p><img src="${p.processedCanvas.toDataURL('image/jpeg', 0.8)}" style="max-width: 100%; height: auto;"/></p>`;
            } else if (p.text) {
                combinedHtml += `<div>${p.text}</div>`;
            }
            combinedHtml += `<br style="page-break-before:always;"/>`;
        });

        combinedHtml += `</body></html>`;

        const blob = new Blob(['\ufeff', combinedHtml], { type: 'application/msword' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Enly_Scanned_Docx_${Date.now()}.docx`;
        link.click();
    });

    // --- Export Images ZIP ---
    exportZipBtn.addEventListener('click', async () => {
        if (!pages.length) {
            alert('No scanned pages to export.');
            return;
        }

        if (!window.JSZip) {
            alert('JSZip library is loading, please try again.');
            return;
        }

        const zip = new JSZip();
        const folder = zip.folder('Scanned_Document_Pages');

        pages.forEach((p, idx) => {
            if (p.type === 'image' && p.processedCanvas) {
                const dataUrl = p.processedCanvas.toDataURL('image/jpeg', 0.95);
                const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
                folder.file(`Page_${idx + 1}.jpg`, base64Data, { base64: true });
            } else if (p.text) {
                const cleanText = p.text.replace(/<[^>]*>?/gm, '');
                folder.file(`Page_${idx + 1}.txt`, cleanText);
            }
        });

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `Enly_Scanned_Pages_${Date.now()}.zip`;
        link.click();
    });

});
