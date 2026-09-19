// Client-Side Document & Presentation Converter Logic for Enly

document.addEventListener('DOMContentLoaded', () => {
    // Configure PDF.js worker
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // DOM Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const fileList = document.getElementById('file-list');
    const controlsCard = document.getElementById('controls-card');
    const targetFormatSelect = document.getElementById('target-format-select');
    const orientationSelect = document.getElementById('orientation-select');
    const papersizeSelect = document.getElementById('papersize-select');
    const watermarkInput = document.getElementById('watermark-input');
    const detectedTypeLabel = document.getElementById('detected-type-label');
    const startConvertBtn = document.getElementById('start-convert-btn');
    const clearFilesBtn = document.getElementById('clear-files-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const statusText = document.getElementById('status-text');
    const previewContainer = document.getElementById('preview-container');
    const previewWrapper = document.getElementById('preview-wrapper');
    const downloadActionsHeader = document.getElementById('download-actions-header');
    const presetPills = document.querySelectorAll('.preset-pill');

    // State Variables
    let uploadedFiles = []; // Array of { id, file, name, size, inputExt, targetExt, status }
    let convertedOutputs = []; // Array of { blob, fileName, type, content, canvas, element }

    // Preset Pill Click Handler
    presetPills.forEach(pill => {
        pill.addEventListener('click', () => {
            presetPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const targetFormat = pill.getAttribute('data-to');
            const formatVal = targetFormat === 'img' ? 'png' : targetFormat;
            
            if (targetFormatSelect) {
                targetFormatSelect.value = formatVal;
                updateControlsVisibility();
            }

            // Apply preset format to all files in queue if uploaded
            uploadedFiles.forEach(item => {
                const validOptions = getAvailableTargetOptions(item.inputExt);
                if (validOptions.some(opt => opt.val === formatVal)) {
                    item.targetExt = formatVal;
                }
            });
            renderFileList();
        });
    });

    // Browse Button Click
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(Array.from(e.target.files));
    });

    // Drag & Drop Events
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });

    // Handle Uploaded Files Batch
    function handleFiles(files) {
        if (!files || files.length === 0) return;

        const validExtensions = ['pptx', 'docx', 'pdf', 'xlsx', 'xls', 'csv', 'txt', 'md', 'png', 'jpg', 'jpeg', 'webp'];
        
        files.forEach(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (validExtensions.includes(ext)) {
                // Avoid exact duplicate file uploads
                if (!uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                    const defaultTarget = getDefaultTargetForExt(ext);
                    uploadedFiles.push({
                        id: 'file_' + Math.random().toString(36).substr(2, 9),
                        file: file,
                        name: file.name,
                        size: file.size,
                        inputExt: ext,
                        targetExt: defaultTarget,
                        status: 'queued'
                    });
                }
            }
        });

        renderFileList();
        updateControlsState();
    }

    function getDefaultTargetForExt(ext) {
        if (['pptx', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'pdf';
        if (ext === 'pdf') return 'png';
        if (['csv', 'txt', 'md'].includes(ext)) return 'pdf';
        return 'pdf';
    }

    function getAvailableTargetOptions(ext) {
        if (ext === 'pptx') {
            return [
                { val: 'pdf', text: 'PDF (.pdf)' },
                { val: 'png', text: 'PNG Images (.png)' },
                { val: 'jpg', text: 'JPEG Images (.jpg)' },
                { val: 'html', text: 'HTML (.html)' },
                { val: 'txt', text: 'Text (.txt)' }
            ];
        } else if (ext === 'docx') {
            return [
                { val: 'pdf', text: 'PDF (.pdf)' },
                { val: 'html', text: 'HTML (.html)' },
                { val: 'txt', text: 'Text (.txt)' },
                { val: 'md', text: 'Markdown (.md)' }
            ];
        } else if (ext === 'pdf') {
            return [
                { val: 'png', text: 'PNG Images (.png)' },
                { val: 'jpg', text: 'JPEG Images (.jpg)' },
                { val: 'txt', text: 'Text (.txt)' }
            ];
        } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
            return [
                { val: 'pdf', text: 'PDF (.pdf)' },
                { val: 'csv', text: 'CSV (.csv)' },
                { val: 'html', text: 'HTML Table (.html)' },
                { val: 'txt', text: 'Text (.txt)' }
            ];
        } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            return [
                { val: 'pdf', text: 'PDF Document (.pdf)' },
                { val: 'png', text: 'PNG Image' },
                { val: 'jpg', text: 'JPEG Image' }
            ];
        } else {
            return [
                { val: 'pdf', text: 'PDF (.pdf)' },
                { val: 'html', text: 'HTML (.html)' },
                { val: 'txt', text: 'Text (.txt)' }
            ];
        }
    }

    // Render File Queue List
    function renderFileList() {
        fileList.innerHTML = '';
        if (uploadedFiles.length === 0) {
            controlsCard.style.display = 'none';
            previewContainer.style.display = 'none';
            return;
        }

        // Header line for queue list
        const queueHeader = document.createElement('div');
        queueHeader.style.display = 'flex';
        queueHeader.style.justifyContent = 'space-between';
        queueHeader.style.alignItems = 'center';
        queueHeader.style.margin = '20px 0 10px';
        queueHeader.style.padding = '0 5px';

        queueHeader.innerHTML = `
            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">
                Uploaded Files Batch Queue (${uploadedFiles.length} ${uploadedFiles.length === 1 ? 'File' : 'Files'})
            </div>
            <button type="button" class="btn btn-secondary" id="add-more-files-btn" style="padding: 5px 12px; font-size: 12px;">
                + Add More Files
            </button>
        `;

        fileList.appendChild(queueHeader);

        const addBtn = queueHeader.querySelector('#add-more-files-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => fileInput.click());
        }

        uploadedFiles.forEach((itemObj, index) => {
            const ext = itemObj.inputExt.toUpperCase();
            const sizeFormatted = (itemObj.size / 1024 < 1024) 
                ? (itemObj.size / 1024).toFixed(1) + ' KB' 
                : (itemObj.size / (1024 * 1024)).toFixed(2) + ' MB';

            let statusBadgeHtml = '<span style="font-size: 11px; font-weight: 700; color: var(--text-muted); background: var(--bg-tertiary); padding: 3px 8px; border-radius: 12px;">Queued</span>';
            if (itemObj.status === 'converting') {
                statusBadgeHtml = '<span style="font-size: 11px; font-weight: 700; color: var(--accent); background: var(--accent-glow); padding: 3px 8px; border-radius: 12px;">Converting...</span>';
            } else if (itemObj.status === 'done') {
                statusBadgeHtml = '<span style="font-size: 11px; font-weight: 700; color: var(--success); background: var(--success-glow); padding: 3px 8px; border-radius: 12px;">✓ Done</span>';
            } else if (itemObj.status === 'error') {
                statusBadgeHtml = '<span style="font-size: 11px; font-weight: 700; color: var(--danger); background: var(--danger-glow); padding: 3px 8px; border-radius: 12px;">Failed</span>';
            }

            const availableTargets = getAvailableTargetOptions(itemObj.inputExt);

            const item = document.createElement('div');
            item.className = 'file-item';
            item.style.flexWrap = 'wrap';
            item.style.gap = '12px';

            item.innerHTML = `
                <div class="file-info" style="min-width: 200px;">
                    <span class="file-badge">${ext}</span>
                    <div>
                        <div class="file-name" title="${escapeHtml(itemObj.name)}">${escapeHtml(itemObj.name)}</div>
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                            <span class="file-size">${sizeFormatted}</span>
                            ${statusBadgeHtml}
                        </div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">
                        <span>Target:</span>
                        <select class="item-target-select" style="padding: 5px 10px; border-radius: var(--radius-sm); border: 1px solid rgba(0,0,0,0.12); font-size: 12px; background: white;">
                            ${availableTargets.map(opt => `<option value="${opt.val}" ${opt.val === itemObj.targetExt ? 'selected' : ''}>${opt.text}</option>`).join('')}
                        </select>
                    </div>

                    <button type="button" class="btn btn-outline" style="padding: 5px 10px; font-size: 12px;" data-index="${index}">
                        Remove
                    </button>
                </div>
            `;

            const itemTargetSelect = item.querySelector('.item-target-select');
            if (itemTargetSelect) {
                itemTargetSelect.addEventListener('change', (e) => {
                    itemObj.targetExt = e.target.value;
                });
            }

            const removeBtn = item.querySelector('button[data-index]');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    uploadedFiles.splice(index, 1);
                    renderFileList();
                    updateControlsState();
                });
            }

            fileList.appendChild(item);
        });
    }

    // Update Controls State & Target Options
    function updateControlsState() {
        if (uploadedFiles.length === 0) {
            controlsCard.style.display = 'none';
            return;
        }

        controlsCard.style.display = 'block';
        
        const firstFile = uploadedFiles[0];
        detectedTypeLabel.textContent = `Batch Queue (${uploadedFiles.length} ${uploadedFiles.length === 1 ? 'File' : 'Files'})`;

        // Update Global target format options based on first file
        updateTargetDropdownOptions(firstFile.inputExt);
        updateControlsVisibility();
    }

    function updateTargetDropdownOptions(ext) {
        targetFormatSelect.innerHTML = '';
        const options = getAvailableTargetOptions(ext);

        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.val;
            el.textContent = `Set All to ${opt.text}`;
            targetFormatSelect.appendChild(el);
        });
    }

    // When global target format select changes, update all items in queue
    targetFormatSelect.addEventListener('change', () => {
        const globalTarget = targetFormatSelect.value;
        uploadedFiles.forEach(item => {
            const validOptions = getAvailableTargetOptions(item.inputExt);
            if (validOptions.some(opt => opt.val === globalTarget)) {
                item.targetExt = globalTarget;
            }
        });
        renderFileList();
        updateControlsVisibility();
    });

    function updateControlsVisibility() {
        const selectedTarget = targetFormatSelect.value;
        const orientGroup = document.getElementById('orientation-group');
        const paperGroup = document.getElementById('papersize-group');

        if (selectedTarget === 'pdf') {
            orientGroup.style.display = 'block';
            paperGroup.style.display = 'block';
        } else {
            orientGroup.style.display = 'none';
            paperGroup.style.display = 'none';
        }
    }

    // Clear Files Button
    clearFilesBtn.addEventListener('click', () => {
        uploadedFiles = [];
        convertedOutputs = [];
        renderFileList();
        previewContainer.style.display = 'none';
    });

    // Start Batch Conversion Trigger
    startConvertBtn.addEventListener('click', async () => {
        if (uploadedFiles.length === 0) return;

        // Reset UI progress
        progressContainer.style.display = 'block';
        progressFill.style.width = '5%';
        statusText.style.display = 'block';
        statusText.textContent = `Initializing batch engine for ${uploadedFiles.length} file(s)...`;
        startConvertBtn.disabled = true;
        previewContainer.style.display = 'none';
        previewWrapper.innerHTML = '';
        downloadActionsHeader.innerHTML = '';
        convertedOutputs = [];

        try {
            const orientation = orientationSelect.value;
            const papersize = papersizeSelect.value;
            const watermark = watermarkInput.value.trim();

            for (let i = 0; i < uploadedFiles.length; i++) {
                const itemObj = uploadedFiles[i];
                itemObj.status = 'converting';
                renderFileList();

                const progressPct = Math.round(((i + 1) / uploadedFiles.length) * 90);
                statusText.textContent = `Processing file ${i + 1} of ${uploadedFiles.length}: ${itemObj.name}...`;
                progressFill.style.width = `${progressPct}%`;

                try {
                    await processSingleFileConversion(itemObj.file, itemObj.inputExt, itemObj.targetExt, orientation, papersize, watermark);
                    itemObj.status = 'done';
                } catch (fileErr) {
                    console.error(`Error converting ${itemObj.name}:`, fileErr);
                    itemObj.status = 'error';
                }
                renderFileList();
            }

            progressFill.style.width = '100%';
            statusText.textContent = `Batch conversion of ${uploadedFiles.length} file(s) completed successfully!`;
            
            // Record analytics event for doc conversions
            recordDocConversion(uploadedFiles.length);

            // Save history entries for dashboard preview drawer
            try {
                const docHistoryKey = 'enly_doc_history';
                const existing = JSON.parse(localStorage.getItem(docHistoryKey) || '[]');
                const newEntries = [];

                uploadedFiles.forEach(itemObj => {
                    if (itemObj.status === 'done') {
                        const entry = {
                            id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                            name: itemObj.name,
                            inputExt: itemObj.inputExt?.toUpperCase() || '?',
                            targetExt: itemObj.targetExt?.toUpperCase() || '?',
                            createdAt: new Date().toISOString()
                        };
                        existing.unshift(entry);
                        newEntries.push(entry);
                    }
                });

                // --- localStorage cache ---
                localStorage.setItem(docHistoryKey, JSON.stringify(existing.slice(0, 100)));

                // --- Firestore (cross-device, readable by admin dashboard) ---
                try {
                    const fbApp = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
                    const fbDb  = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
                    const apps  = fbApp.getApps();
                    const app   = apps.length ? fbApp.getApp() : null;
                    if (app) {
                        const db = fbDb.getFirestore(app);
                        await Promise.all(newEntries.map(entry => {
                            const ref = fbDb.doc(db, 'doc_history', entry.id);
                            return fbDb.setDoc(ref, entry);
                        }));
                    }
                } catch (fbErr) {
                    console.warn('Doc Firestore sync skipped:', fbErr);
                }

            } catch (_) {}

            // Render outputs in preview area
            renderOutputsPreview();

        } catch (err) {
            console.error(err);
            statusText.textContent = `Error during batch conversion: ${err.message || err}`;
            alert(`Batch Conversion Error: ${err.message || err}`);
        } finally {
            startConvertBtn.disabled = false;
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 1500);
        }
    });

    // Main Conversion Engine Router
    async function processSingleFileConversion(file, inputExt, targetExt, orientation, papersize, watermark) {
        const baseName = file.name.substring(0, file.name.lastIndexOf('.'));

        if (inputExt === 'pptx') {
            await convertPPTX(file, baseName, targetExt, orientation, papersize, watermark);
        } else if (inputExt === 'docx') {
            await convertDOCX(file, baseName, targetExt, orientation, papersize, watermark);
        } else if (inputExt === 'pdf') {
            await convertPDF(file, baseName, targetExt);
        } else if (['xlsx', 'xls', 'csv'].includes(inputExt)) {
            await convertSpreadsheet(file, baseName, targetExt, orientation, papersize);
        } else if (['png', 'jpg', 'jpeg', 'webp'].includes(inputExt)) {
            await convertImage(file, baseName, targetExt, orientation, papersize);
        } else if (['txt', 'md'].includes(inputExt)) {
            await convertTextOrMD(file, baseName, targetExt, orientation, papersize);
        }
    }

    // 1. PPTX Conversion Processor
    async function convertPPTX(file, baseName, targetExt, orientation, papersize, watermark) {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        // Extract slide XML files
        const slideFiles = Object.keys(zip.files).filter(fileName => fileName.startsWith('ppt/slides/slide') && fileName.endsWith('.xml'));
        
        // Sort slides numerically slide1.xml, slide2.xml, ...
        slideFiles.sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || 0);
            const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || 0);
            return numA - numB;
        });

        // Extract media images
        const mediaFiles = Object.keys(zip.files).filter(fileName => fileName.startsWith('ppt/media/'));
        const imageMap = {};
        for (const mediaPath of mediaFiles) {
            const blob = await zip.files[mediaPath].async('blob');
            const url = URL.createObjectURL(blob);
            imageMap[mediaPath.replace('ppt/media/', '')] = url;
        }

        const slidesData = [];
        for (let i = 0; i < slideFiles.length; i++) {
            const xmlText = await zip.files[slideFiles[i]].async('text');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            // Extract slide text elements
            const textNodes = xmlDoc.getElementsByTagName('a:t');
            const texts = Array.from(textNodes).map(node => node.textContent).filter(t => t.trim().length > 0);
            
            slidesData.push({
                slideNum: i + 1,
                title: texts[0] || `Slide ${i + 1}`,
                paragraphs: texts
            });
        }

        // Handle export formats
        if (targetExt === 'txt') {
            let fullText = `DOCUMENT PRESENTATION: ${baseName}\n========================================\n\n`;
            slidesData.forEach(s => {
                fullText += `--- SLIDE ${s.slideNum} ---\n${s.paragraphs.join('\n')}\n\n`;
            });
            const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_converted.txt`, type: 'text', content: fullText });

        } else if (targetExt === 'html') {
            let htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${baseName}</title><style>
                body { font-family: system-ui, sans-serif; background: #f0f2f5; padding: 40px; color: #1e293b; }
                .slide-card { background: white; border-radius: 16px; padding: 40px; margin: 0 auto 30px; max-width: 800px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); aspect-ratio: 16/9; display: flex; flex-direction: column; justify-content: center; }
                h2 { color: #d97706; font-size: 24px; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 20px; }
                p { font-size: 16px; margin-bottom: 10px; line-height: 1.6; }
            </style></head><body><h1 style="text-align:center;margin-bottom:30px;">${baseName}</h1>`;
            
            slidesData.forEach(s => {
                htmlContent += `<div class="slide-card"><h2>Slide ${s.slideNum}: ${escapeHtml(s.title)}</h2>`;
                s.paragraphs.forEach(p => {
                    htmlContent += `<p>${escapeHtml(p)}</p>`;
                });
                htmlContent += `</div>`;
            });
            htmlContent += `</body></html>`;
            
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_presentation.html`, type: 'html', content: htmlContent });

        } else {
            // PDF or PNG/JPG rendering via HTML Canvas
            const slideCanvases = [];
            for (const s of slidesData) {
                const canvas = document.createElement('canvas');
                canvas.width = 1280;
                canvas.height = 720; // 16:9 widescreen
                const ctx = canvas.getContext('2d');

                // Draw slide background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw slide border & accent header banner
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(0, 0, canvas.width, 100);

                ctx.fillStyle = '#d97706';
                ctx.fillRect(0, 96, canvas.width, 4);

                // Title
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 36px Outfit, sans-serif';
                ctx.fillText(`Slide ${s.slideNum}: ${s.title.substring(0, 45)}`, 60, 62);

                // Body content text
                ctx.fillStyle = '#0f172a';
                ctx.font = '24px Plus Jakarta Sans, sans-serif';
                
                let yOffset = 180;
                s.paragraphs.slice(1).forEach((text) => {
                    if (yOffset < 650) {
                        ctx.fillStyle = '#d97706';
                        ctx.beginPath();
                        ctx.arc(65, yOffset - 8, 6, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.fillStyle = '#1e293b';
                        ctx.fillText(text.substring(0, 75), 90, yOffset);
                        yOffset += 45;
                    }
                });

                // Draw Watermark if provided
                if (watermark) {
                    ctx.save();
                    ctx.font = 'bold 64px sans-serif';
                    ctx.fillStyle = 'rgba(217, 119, 6, 0.12)';
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(-Math.PI / 6);
                    ctx.textAlign = 'center';
                    ctx.fillText(watermark, 0, 0);
                    ctx.restore();
                }

                slideCanvases.push(canvas);
            }

            if (targetExt === 'png' || targetExt === 'jpg') {
                slideCanvases.forEach((canvas, idx) => {
                    canvas.toBlob((blob) => {
                        convertedOutputs.push({
                            blob,
                            fileName: `${baseName}_slide_${idx + 1}.${targetExt}`,
                            type: 'image',
                            canvas
                        });
                    }, `image/${targetExt === 'jpg' ? 'jpeg' : 'png'}`);
                });
            } else {
                // PDF Document via jsPDF
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'px',
                    format: [1280, 720]
                });

                slideCanvases.forEach((canvas, idx) => {
                    if (idx > 0) pdf.addPage([1280, 720], 'landscape');
                    const imgData = canvas.toDataURL('image/jpeg', 0.95);
                    pdf.addImage(imgData, 'JPEG', 0, 0, 1280, 720);
                });

                const pdfBlob = pdf.output('blob');
                convertedOutputs.push({
                    blob: pdfBlob,
                    fileName: `${baseName}_converted.pdf`,
                    type: 'pdf',
                    canvases: slideCanvases
                });
            }
        }
    }

    // 2. DOCX Conversion Processor
    async function convertDOCX(file, baseName, targetExt, orientation, papersize, watermark) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const htmlBody = result.value;

        if (targetExt === 'html') {
            const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${baseName}</title><style>
                body { font-family: 'Plus Jakarta Sans', sans-serif; line-height: 1.7; padding: 50px; max-width: 850px; margin: 0 auto; color: #1e293b; background: #fff; }
                h1, h2, h3 { color: #0f172a; font-weight: 700; margin-top: 1.5em; }
            </style></head><body>${htmlBody}</body></html>`;
            
            const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_converted.html`, type: 'html', content: fullHtml });

        } else if (targetExt === 'txt') {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlBody;
            const plainText = tempDiv.textContent || tempDiv.innerText || '';
            const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_converted.txt`, type: 'text', content: plainText });

        } else if (targetExt === 'md') {
            // Convert basic HTML to Markdown
            let md = htmlBody
                .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
                .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
                .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
                .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
                .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
                .replace(/<em>(.*?)<\/em>/gi, '*$1*')
                .replace(/<br\s*\/?>/gi, '\n');

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = md;
            const cleanMd = tempDiv.textContent || tempDiv.innerText || md;
            
            const blob = new Blob([cleanMd], { type: 'text/markdown;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_converted.md`, type: 'text', content: cleanMd });

        } else {
            // PDF conversion via html2pdf
            const container = document.createElement('div');
            container.style.padding = '40px';
            container.style.fontFamily = 'Arial, sans-serif';
            container.style.color = '#1e293b';
            container.style.lineHeight = '1.6';
            container.innerHTML = `
                <div style="border-bottom: 2px solid #d97706; padding-bottom: 12px; margin-bottom: 25px;">
                    <h1 style="margin:0; font-size: 24px; color: #0f172a;">${baseName}</h1>
                </div>
                ${watermark ? `<div style="position:fixed;top:40%;left:20%;font-size:60px;color:rgba(217,119,6,0.12);transform:rotate(-30deg);">${watermark}</div>` : ''}
                ${htmlBody}
            `;

            const opt = {
                margin: 15,
                filename: `${baseName}_converted.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: papersize === 'letter' ? 'letter' : 'a4', orientation: orientation }
            };

            const pdfWorker = html2pdf().set(opt).from(container);
            const pdfBlob = await pdfWorker.output('blob');

            convertedOutputs.push({
                blob: pdfBlob,
                fileName: `${baseName}_converted.pdf`,
                type: 'pdf',
                element: container
            });
        }
    }

    // 3. PDF Conversion Processor (to Images / TXT)
    async function convertPDF(file, baseName, targetExt) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdfDoc.numPages;

        if (targetExt === 'txt') {
            let fullText = `EXTRACTED TEXT FROM PDF: ${baseName}\n========================================\n\n`;
            for (let p = 1; p <= totalPages; p++) {
                const page = await pdfDoc.getPage(p);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += `--- PAGE ${p} ---\n${pageText}\n\n`;
            }
            const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_extracted.txt`, type: 'text', content: fullText });

        } else {
            // PDF -> PNG or JPG images
            const canvases = [];
            for (let p = 1; p <= totalPages; p++) {
                const page = await pdfDoc.getPage(p);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');

                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                canvases.push(canvas);

                await new Promise((resolve) => {
                    canvas.toBlob((blob) => {
                        convertedOutputs.push({
                            blob,
                            fileName: `${baseName}_page_${p}.${targetExt}`,
                            type: 'image',
                            canvas
                        });
                        resolve();
                    }, `image/${targetExt === 'jpg' ? 'jpeg' : 'png'}`);
                });
            }
        }
    }

    // 4. Spreadsheet Conversion Processor (XLSX / CSV)
    async function convertSpreadsheet(file, baseName, targetExt, orientation, papersize) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        if (targetExt === 'csv') {
            const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
            const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_converted.csv`, type: 'text', content: csvOutput });

        } else if (targetExt === 'html') {
            const htmlTable = XLSX.utils.sheet_to_html(worksheet);
            const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${baseName}</title><style>
                table { border-collapse: collapse; width: 100%; font-family: sans-serif; }
                td, th { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
                th { background: #f1f5f9; }
            </style></head><body><h2>${baseName} - ${firstSheetName}</h2>${htmlTable}</body></html>`;
            
            const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_sheet.html`, type: 'html', content: fullHtml });

        } else {
            // Excel -> PDF
            const htmlTable = XLSX.utils.sheet_to_html(worksheet);
            const container = document.createElement('div');
            container.style.padding = '20px';
            container.innerHTML = `
                <h2 style="font-family: sans-serif; color: #0f172a; margin-bottom: 15px;">${baseName} (${firstSheetName})</h2>
                <style>
                    table { border-collapse: collapse; width: 100%; font-family: sans-serif; font-size: 12px; }
                    td, th { border: 1px solid #cbd5e1; padding: 6px 10px; }
                    tr:nth-child(even) { background-color: #f8fafc; }
                </style>
                ${htmlTable}
            `;

            const opt = {
                margin: 10,
                filename: `${baseName}_spreadsheet.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };

            const pdfWorker = html2pdf().set(opt).from(container);
            const pdfBlob = await pdfWorker.output('blob');

            convertedOutputs.push({
                blob: pdfBlob,
                fileName: `${baseName}_spreadsheet.pdf`,
                type: 'pdf',
                element: container
            });
        }
    }

    // 5. Image Conversion Processor (PNG / JPG -> PDF)
    async function convertImage(file, baseName, targetExt, orientation, papersize) {
        if (targetExt === 'pdf') {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: orientation, unit: 'mm', format: papersize === 'letter' ? 'letter' : 'a4' });
            
            const dataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(file);
            });

            pdf.addImage(dataUrl, 'JPEG', 10, 10, 190, 0);
            const pdfBlob = pdf.output('blob');

            convertedOutputs.push({
                blob: pdfBlob,
                fileName: `${baseName}_converted.pdf`,
                type: 'pdf'
            });
        } else {
            // Image format change (PNG <-> JPG)
            const img = new Image();
            const url = URL.createObjectURL(file);
            await new Promise(resolve => {
                img.onload = resolve;
                img.src = url;
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            canvas.toBlob((blob) => {
                convertedOutputs.push({
                    blob,
                    fileName: `${baseName}_converted.${targetExt}`,
                    type: 'image',
                    canvas
                });
            }, `image/${targetExt === 'jpg' ? 'jpeg' : 'png'}`);
        }
    }

    // 6. Text or Markdown Processor
    async function convertTextOrMD(file, baseName, targetExt, orientation, papersize) {
        const text = await file.text();
        
        let htmlBody = text;
        if (file.name.endsWith('.md') && window.marked) {
            htmlBody = marked.parse(text);
        } else {
            htmlBody = `<pre style="white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
        }

        if (targetExt === 'pdf') {
            const container = document.createElement('div');
            container.style.padding = '30px';
            container.style.fontFamily = 'sans-serif';
            container.innerHTML = `<h1>${baseName}</h1><div>${htmlBody}</div>`;

            const opt = {
                margin: 15,
                filename: `${baseName}_converted.pdf`,
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: orientation }
            };

            const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
            convertedOutputs.push({ blob: pdfBlob, fileName: `${baseName}_converted.pdf`, type: 'pdf', element: container });
        } else {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            convertedOutputs.push({ blob, fileName: `${baseName}_converted.txt`, type: 'text', content: text });
        }
    }

    // Render Outputs Preview & Download Buttons
    function renderOutputsPreview() {
        if (convertedOutputs.length === 0) return;

        previewContainer.style.display = 'flex';
        previewWrapper.innerHTML = '';
        downloadActionsHeader.innerHTML = '';

        const mainBannerAction = document.getElementById('main-download-banner-action');
        if (mainBannerAction) mainBannerAction.innerHTML = '';

        // Primary Top Save/Download Banner Action
        const primarySaveBtn = document.createElement('button');
        primarySaveBtn.type = 'button';
        primarySaveBtn.className = 'btn btn-primary';
        primarySaveBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        primarySaveBtn.style.borderColor = '#059669';
        primarySaveBtn.style.color = '#ffffff';
        primarySaveBtn.style.padding = '12px 24px';
        primarySaveBtn.style.fontSize = '14px';
        primarySaveBtn.style.fontWeight = '700';
        primarySaveBtn.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.3)';

        if (convertedOutputs.length === 1) {
            const singleOut = convertedOutputs[0];
            primarySaveBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Save / Download Converted File (${escapeHtml(singleOut.fileName)})</span>
            `;
            primarySaveBtn.addEventListener('click', () => triggerDownload(singleOut.blob, singleOut.fileName));
        } else {
            primarySaveBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Save All Files Individually (${convertedOutputs.length} Files)</span>
            `;
            primarySaveBtn.addEventListener('click', () => {
                convertedOutputs.forEach((output, i) => {
                    setTimeout(() => triggerDownload(output.blob, output.fileName), i * 300);
                });
            });
        }

        if (mainBannerAction) {
            mainBannerAction.appendChild(primarySaveBtn);

            // If multiple files, add ZIP Archive Download Button
            if (convertedOutputs.length > 1) {
                const zipBtn = document.createElement('button');
                zipBtn.type = 'button';
                zipBtn.className = 'btn btn-secondary';
                zipBtn.style.padding = '12px 20px';
                zipBtn.style.fontSize = '14px';
                zipBtn.style.fontWeight = '700';
                zipBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>
                    <span>Download ZIP Archive (.zip)</span>
                `;
                zipBtn.addEventListener('click', async () => {
                    if (!window.JSZip) return;
                    const zip = new JSZip();
                    convertedOutputs.forEach((output) => {
                        zip.file(output.fileName, output.blob);
                    });
                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    triggerDownload(zipBlob, 'converted_files_bundle.zip');
                });
                mainBannerAction.appendChild(zipBtn);
            }
        }

        // Header Action Button (Duplicate for convenience)
        const headerSaveBtn = primarySaveBtn.cloneNode(true);
        headerSaveBtn.style.padding = '8px 16px';
        headerSaveBtn.style.fontSize = '13px';
        headerSaveBtn.addEventListener('click', () => {
            if (convertedOutputs.length === 1) {
                triggerDownload(convertedOutputs[0].blob, convertedOutputs[0].fileName);
            } else {
                convertedOutputs.forEach((output, i) => {
                    setTimeout(() => triggerDownload(output.blob, output.fileName), i * 300);
                });
            }
        });
        downloadActionsHeader.appendChild(headerSaveBtn);

        // Render each output file card
        convertedOutputs.forEach((out, idx) => {
            const itemBox = document.createElement('div');
            itemBox.style.width = '100%';
            itemBox.style.marginBottom = '25px';
            itemBox.style.background = '#f8fafc';
            itemBox.style.borderRadius = 'var(--radius-lg)';
            itemBox.style.padding = '20px';
            itemBox.style.border = '1px solid rgba(0, 0, 0, 0.08)';

            const headerLine = document.createElement('div');
            headerLine.style.display = 'flex';
            headerLine.style.justifyContent = 'space-between';
            headerLine.style.alignItems = 'center';
            headerLine.style.marginBottom = '15px';
            headerLine.style.paddingBottom = '12px';
            headerLine.style.borderBottom = '1px solid rgba(0, 0, 0, 0.06)';

            headerLine.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="file-badge" style="background: rgba(16, 185, 129, 0.15); color: #059669;">READY</span>
                    <strong style="font-size: 15px; color: var(--text-primary);">${escapeHtml(out.fileName)}</strong>
                </div>
            `;

            const cardSaveBtn = document.createElement('button');
            cardSaveBtn.className = 'btn btn-primary';
            cardSaveBtn.style.background = 'var(--accent)';
            cardSaveBtn.style.borderColor = 'var(--accent)';
            cardSaveBtn.style.padding = '8px 16px';
            cardSaveBtn.style.fontSize = '13px';
            cardSaveBtn.style.fontWeight = '700';
            cardSaveBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                <span>Save File</span>
            `;
            cardSaveBtn.addEventListener('click', () => triggerDownload(out.blob, out.fileName));
            headerLine.appendChild(cardSaveBtn);

            itemBox.appendChild(headerLine);

            // Preview Visual Elements
            if (out.type === 'image' && out.canvas) {
                itemBox.appendChild(out.canvas);
            } else if (out.type === 'text') {
                const textBox = document.createElement('div');
                textBox.className = 'preview-text-box';
                textBox.textContent = out.content.substring(0, 1500) + (out.content.length > 1500 ? '\n\n...[Preview Truncated]' : '');
                itemBox.appendChild(textBox);
            } else if (out.type === 'html') {
                const iframe = document.createElement('iframe');
                iframe.style.width = '100%';
                iframe.style.height = '300px';
                iframe.style.border = '1px solid #cbd5e1';
                iframe.style.borderRadius = '8px';
                iframe.srcdoc = out.content;
                itemBox.appendChild(iframe);
            } else if (out.canvases) {
                out.canvases.forEach(c => itemBox.appendChild(c));
            } else if (out.element) {
                itemBox.appendChild(out.element);
            }

            previewWrapper.appendChild(itemBox);
        });

        // Automatically trigger download for single file output & smooth scroll into view
        if (convertedOutputs.length === 1) {
            triggerDownload(convertedOutputs[0].blob, convertedOutputs[0].fileName);
        }

        previewContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Helper: Trigger Download of Blob
    function triggerDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // Helper: Escape HTML
    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Helper: Record Doc Conversion Live Stats
    function recordDocConversion(count = 1) {
        try {
            const current = parseInt(localStorage.getItem('enly_stats_doc_conversions') || '14', 10);
            const updated = current + count;
            localStorage.setItem('enly_stats_doc_conversions', updated.toString());
            window.dispatchEvent(new CustomEvent('enly_stats_updated', { detail: { docConversions: updated } }));
        } catch (e) {
            console.error("Error recording doc conversion:", e);
        }
    }
});
