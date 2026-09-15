/**
 * Enly Cloud Storage & QR File Sharing Engine
 * Robust Cross-Device & Cross-Tab Sharing with IndexedDB + LocalStorage Cloud Cache + Firebase Firestore Sync
 */

import { auth, db, configured } from "./firebase.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

(function () {
    const MAX_QUOTA_BYTES = 100 * 1024 * 1024; // 100 MB free quota limit
    const DB_NAME = "EnlyCloudVaultDB";
    const DB_VERSION = 1;
    const STORE_NAME = "cloud_files";

    let dbInstance = null;
    let storedFiles = [];
    let currentFilter = "all";
    let activeShareFile = null;
    let modalOpenTimestamp = 0;

    // --- INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", async () => {
        await initIndexedDB();
        initUploaderHandlers();
        initFilterAndSearchHandlers();
        initModalHandlers();
        initFileGridDelegation();
        await loadAndRenderVault();
        await checkURLShareParams();
    });

    // --- INDEXEDDB STORAGE ENGINE ---
    function initIndexedDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const idb = e.target.result;
                if (!idb.objectStoreNames.contains(STORE_NAME)) {
                    idb.createObjectStore(STORE_NAME, { keyPath: "id" });
                }
            };

            request.onsuccess = (e) => {
                dbInstance = e.target.result;
                resolve(dbInstance);
            };

            request.onerror = (e) => {
                console.error("IndexedDB Open Error:", e);
                resolve(null);
            };
        });
    }

    async function saveFileToDB(fileRecord) {
        // 1. Save to IndexedDB
        if (dbInstance) {
            try {
                const tx = dbInstance.transaction(STORE_NAME, "readwrite");
                const store = tx.objectStore(STORE_NAME);
                store.put(fileRecord);
            } catch (e) {
                console.error("IndexedDB Save Error:", e);
            }
        }

        // 2. Save to LocalStorage Cloud Share Cache
        try {
            localStorage.setItem(`enly_shared_file_${fileRecord.id}`, JSON.stringify(fileRecord));
        } catch (e) {
            console.warn("LocalStorage quota notice:", e);
        }

        // 3. Sync to Firebase Firestore if configured
        if (configured && db) {
            try {
                const docRef = doc(db, "cloud_shares", fileRecord.id);
                await setDoc(docRef, {
                    id: fileRecord.id,
                    name: fileRecord.name,
                    size: fileRecord.size,
                    type: fileRecord.type,
                    category: fileRecord.category,
                    dataUrl: fileRecord.dataUrl,
                    createdAt: fileRecord.createdAt,
                    downloads: 0
                });
            } catch (e) {
                console.warn("Firebase Cloud Sync Notice:", e);
            }
        }
        return true;
    }

    function getAllFilesFromDB() {
        return new Promise((resolve) => {
            if (!dbInstance) return resolve([]);
            const tx = dbInstance.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async function getFileByIdFromDB(id) {
        if (dbInstance) {
            const file = await new Promise((res) => {
                const tx = dbInstance.transaction(STORE_NAME, "readonly");
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(id);
                req.onsuccess = () => res(req.result || null);
                req.onerror = () => res(null);
            });
            if (file) return file;
        }

        const cached = localStorage.getItem(`enly_shared_file_${id}`);
        if (cached) {
            try { return JSON.parse(cached); } catch (e) {}
        }

        if (configured && db) {
            try {
                const docRef = doc(db, "cloud_shares", id);
                const snap = await getDoc(docRef);
                if (snap.exists()) return snap.data();
            } catch (e) {
                console.warn("Firestore fetch error:", e);
            }
        }

        return null;
    }

    function deleteFileFromDB(id) {
        return new Promise((resolve) => {
            localStorage.removeItem(`enly_shared_file_${id}`);
            if (!dbInstance) return resolve(false);
            const tx = dbInstance.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    }

    function clearDB() {
        return new Promise((resolve) => {
            Object.keys(localStorage).forEach(k => {
                if (k.startsWith("enly_shared_file_")) localStorage.removeItem(k);
            });
            if (!dbInstance) return resolve(false);
            const tx = dbInstance.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    }

    // --- UPLOADER & FILE HANDLERS ---
    function initUploaderHandlers() {
        const dropzone = document.getElementById("file-dropzone");
        const fileInput = document.getElementById("cloud-file-input");
        const btnBrowse = document.getElementById("btn-browse-cloud-file");

        if (!dropzone || !fileInput) return;

        btnBrowse.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                processUploadedFiles(Array.from(e.target.files));
            }
        });

        ['dragenter', 'dragover'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                dropzone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                dropzone.classList.remove('drag-over');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt.files && dt.files.length > 0) {
                processUploadedFiles(Array.from(dt.files));
            }
        });
    }

    async function processUploadedFiles(files) {
        let currentTotalBytes = storedFiles.reduce((acc, f) => acc + f.size, 0);

        for (const file of files) {
            if (file.size > 25 * 1024 * 1024) {
                alert(`File "${file.name}" exceeds the 25MB individual file limit.`);
                continue;
            }

            if (currentTotalBytes + file.size > MAX_QUOTA_BYTES) {
                alert(`Storage Quota Exceeded! Storing "${file.name}" would exceed your 100 MB free quota limit.`);
                break;
            }

            const category = getFileCategory(file.name, file.type);
            const id = "fl_" + Math.random().toString(36).substring(2, 10);
            const dataUrl = await readFileAsDataURL(file);

            const fileRecord = {
                id: id,
                name: file.name,
                size: file.size,
                type: file.type || "application/octet-stream",
                category: category,
                dataUrl: dataUrl,
                createdAt: new Date().toISOString(),
                downloads: 0
            };

            await saveFileToDB(fileRecord);
            currentTotalBytes += file.size;
        }

        await loadAndRenderVault();
    }

    function getFileCategory(filename, mimeType) {
        const ext = (filename || "").split('.').pop().toLowerCase();
        if (ext === 'docx' || ext === 'doc' || (mimeType && mimeType.includes('wordprocessingml'))) return 'docx';
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext) || (mimeType && mimeType.startsWith('image/'))) return 'images';
        if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext) || (mimeType && mimeType.startsWith('video/'))) return 'videos';
        return 'other';
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    // --- VAULT RENDER & FILTER HANDLERS ---
    async function loadAndRenderVault() {
        storedFiles = await getAllFilesFromDB();
        updateStorageQuotaMeter();
        renderFileGrid();
    }

    function updateStorageQuotaMeter() {
        const totalBytes = storedFiles.reduce((acc, f) => acc + f.size, 0);
        const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);
        const percent = Math.min(100, Math.round((totalBytes / MAX_QUOTA_BYTES) * 100));

        const quotaText = document.getElementById("storage-quota-text");
        const fillBar = document.getElementById("storage-meter-fill");
        const fileCountText = document.getElementById("storage-file-count");

        if (quotaText) quotaText.textContent = `${usedMB} MB / 100.0 MB`;
        if (fillBar) fillBar.style.width = `${Math.max(2, percent)}%`;
        if (fileCountText) fileCountText.textContent = `${storedFiles.length} file${storedFiles.length === 1 ? '' : 's'} stored`;
    }

    function initFilterAndSearchHandlers() {
        const filters = [
            { btn: 'filter-all', cat: 'all' },
            { btn: 'filter-docx', cat: 'docx' },
            { btn: 'filter-images', cat: 'images' },
            { btn: 'filter-videos', cat: 'videos' }
        ];

        filters.forEach(f => {
            const btn = document.getElementById(f.btn);
            if (!btn) return;
            btn.addEventListener('click', () => {
                filters.forEach(x => document.getElementById(x.btn)?.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = f.cat;
                renderFileGrid();
            });
        });

        const searchInput = document.getElementById('search-files-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => renderFileGrid());
        }

        const btnClear = document.getElementById('btn-clear-all-vault');
        if (btnClear) {
            btnClear.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete all stored files from your cloud vault?')) {
                    await clearDB();
                    await loadAndRenderVault();
                }
            });
        }
    }

    function renderFileGrid() {
        const container = document.getElementById("file-grid-container");
        const emptyState = document.getElementById("empty-vault-state");
        const searchQuery = (document.getElementById("search-files-input")?.value || "").toLowerCase().trim();

        if (!container) return;

        let list = storedFiles;

        if (currentFilter !== "all") {
            list = list.filter(f => f.category === currentFilter);
        }

        if (searchQuery) {
            list = list.filter(f => f.name.toLowerCase().includes(searchQuery));
        }

        if (list.length === 0) {
            container.innerHTML = "";
            if (emptyState) emptyState.style.display = "block";
            return;
        }

        if (emptyState) emptyState.style.display = "none";
        container.innerHTML = "";

        list.forEach(file => {
            const card = document.createElement("div");
            card.className = "file-card animate-fade";

            const formattedSize = formatBytes(file.size);
            const dateStr = new Date(file.createdAt).toLocaleDateString();

            let previewHTML = "";
            if (file.category === 'images' || (file.type && file.type.startsWith('image/'))) {
                previewHTML = `<img src="${file.dataUrl}" alt="${file.name}" loading="lazy">`;
            } else if (file.category === 'videos' || (file.type && file.type.startsWith('video/'))) {
                previewHTML = `<video src="${file.dataUrl}#t=0.5" preload="metadata"></video>`;
            } else if (file.category === 'docx') {
                previewHTML = `<div style="text-align: center; color: #1d4ed8;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg><div style="font-size: 11px; font-weight: 700; margin-top: 4px;">DOCX DOCUMENT</div></div>`;
            } else {
                previewHTML = `<div style="text-align: center; color: var(--text-secondary);"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg><div style="font-size: 11px; font-weight: 700; margin-top: 4px;">FILE</div></div>`;
            }

            const badgeClass = file.category === 'docx' ? 'badge-docx' : file.category === 'images' ? 'badge-image' : file.category === 'videos' ? 'badge-video' : 'badge-other';

            card.innerHTML = `
                <div class="file-preview-box">
                    ${previewHTML}
                </div>

                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; margin-bottom: 4px;">
                        <span class="file-type-badge ${badgeClass}">${file.category}</span>
                        <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">${dateStr}</span>
                    </div>
                    <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${file.name}">
                        ${file.name}
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; margin-top: 2px;">
                        ${formattedSize}
                    </div>
                </div>

                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-primary btn-share" data-id="${file.id}" style="flex: 1; padding: 8px 12px; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; position: relative; z-index: 2;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        <span style="pointer-events:none; font-weight: 700;">Share QR</span>
                    </button>
                    <button class="btn btn-secondary btn-download" data-id="${file.id}" style="padding: 8px 10px; font-size: 12px; cursor: pointer; position: relative; z-index: 2;" title="Download File">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                    <button class="btn btn-secondary btn-delete" data-id="${file.id}" style="padding: 8px 10px; font-size: 12px; color: var(--danger); cursor: pointer; position: relative; z-index: 2;" title="Delete File">
                        &times;
                    </button>
                </div>
            `;

            container.appendChild(card);
        });
    }

    // Reliable Global Event Delegation for File Grid Action Buttons
    function initFileGridDelegation() {
        const container = document.getElementById("file-grid-container");
        if (!container) return;

        container.addEventListener("click", async (e) => {
            const shareBtn = e.target.closest(".btn-share");
            if (shareBtn) {
                e.preventDefault();
                e.stopPropagation();
                const id = shareBtn.getAttribute("data-id");
                let file = storedFiles.find(f => f.id === id) || await getFileByIdFromDB(id);
                if (file) {
                    openShareModal(file);
                }
                return;
            }

            const downloadBtn = e.target.closest(".btn-download");
            if (downloadBtn) {
                e.preventDefault();
                e.stopPropagation();
                const id = downloadBtn.getAttribute("data-id");
                let file = storedFiles.find(f => f.id === id) || await getFileByIdFromDB(id);
                if (file) triggerFileDownload(file);
                return;
            }

            const deleteBtn = e.target.closest(".btn-delete");
            if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                const id = deleteBtn.getAttribute("data-id");
                if (confirm("Delete this file from your cloud vault?")) {
                    await deleteFileFromDB(id);
                    await loadAndRenderVault();
                }
                return;
            }
        });
    }

    // --- SHARE MODAL & SCANNABLE QR CODE HANDLER ---
    function initModalHandlers() {
        const modalOverlay = document.getElementById("share-modal-overlay");
        const modalCard = document.querySelector("#share-modal-overlay .modal-card");
        const btnClose = document.getElementById("btn-close-share-modal");
        const btnCopy = document.getElementById("btn-copy-share-url");
        const btnDownloadQR = document.getElementById("btn-download-share-qr");

        if (btnClose) {
            btnClose.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeShareModal();
            });
        }

        if (modalCard) {
            modalCard.addEventListener("click", (e) => e.stopPropagation());
        }

        if (modalOverlay) {
            modalOverlay.addEventListener("click", (e) => {
                if (Date.now() - modalOpenTimestamp < 350) return;
                if (e.target === modalOverlay) closeShareModal();
            });
        }

        if (btnCopy) {
            btnCopy.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const urlInput = document.getElementById("share-url-input");
                if (urlInput) {
                    urlInput.select();
                    navigator.clipboard.writeText(urlInput.value);
                    btnCopy.textContent = "Copied!";
                    setTimeout(() => { btnCopy.textContent = "Copy Link"; }, 2000);
                }
            });
        }

        if (btnDownloadQR) {
            btnDownloadQR.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const qrImg = document.querySelector("#share-qrcode img") || document.querySelector("#share-qrcode canvas");
                if (qrImg) {
                    const src = qrImg.src || (qrImg.toDataURL ? qrImg.toDataURL("image/png") : null);
                    if (src) {
                        const a = document.createElement("a");
                        a.href = src;
                        a.download = `enly_qr_share_${Date.now()}.png`;
                        a.click();
                    }
                }
            });
        }
    }

    function openShareModal(file) {
        if (!file) return;
        modalOpenTimestamp = Date.now();
        activeShareFile = file;

        const modalOverlay = document.getElementById("share-modal-overlay");
        const filenameEl = document.getElementById("share-modal-filename");
        const urlInput = document.getElementById("share-url-input");
        const qrContainer = document.getElementById("share-qrcode");

        if (!modalOverlay || !urlInput || !qrContainer) return;

        // Force all overlay styles inline — bypasses any CSS class conflicts
        Object.assign(modalOverlay.style, {
            display: "flex",
            position: "fixed",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            background: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: "99999",
            padding: "20px",
            boxSizing: "border-box"
        });

        // Lock body scroll
        document.body.style.overflow = "hidden";

        filenameEl.textContent = file.name;

        // Generate Share URL (points to cloud-storage.html?file=ID)
        let basePath = window.location.pathname;
        if (!basePath.includes("cloud-storage.html")) {
            basePath = basePath.substring(0, basePath.lastIndexOf('/')) + "/cloud-storage.html";
        }
        const shareURL = `${window.location.origin}${basePath}?file=${file.id}`;
        urlInput.value = shareURL;

        // Clear existing QR Code & render new scannable QR Code
        qrContainer.innerHTML = "";
        try {
            if (typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, {
                    text: shareURL,
                    width: 180,
                    height: 180,
                    colorDark: "#0f172a",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            } else {
                renderFallbackQR(qrContainer, shareURL);
            }
        } catch (err) {
            console.warn("QRCode JS Render Warning, using fallback:", err);
            renderFallbackQR(qrContainer, shareURL);
        }
    }

    function renderFallbackQR(container, text) {
        container.innerHTML = "";
        const img = document.createElement("img");
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
        img.alt = "Scannable Share QR Code";
        img.style.width = "180px";
        img.style.height = "180px";
        img.style.display = "block";
        img.style.margin = "0 auto";
        container.appendChild(img);
    }

    function closeShareModal() {
        const modalOverlay = document.getElementById("share-modal-overlay");
        if (modalOverlay) {
            modalOverlay.style.display = "none";
            modalOverlay.style.position = "";
        }
        // Restore body scroll
        document.body.style.overflow = "";
    }

    // --- PUBLIC RECIPIENT SHARE VIEW HANDLER ---
    async function checkURLShareParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const fileId = urlParams.get("file") || urlParams.get("share");

        if (!fileId) return;

        const publicView = document.getElementById("public-share-view");
        const storageView = document.getElementById("storage-workspace-view");

        if (!publicView || !storageView) return;

        const file = await getFileByIdFromDB(fileId);

        if (!file) {
            publicView.style.display = "block";
            storageView.style.display = "none";
            document.getElementById("public-file-title").textContent = "Shared File Not Found";
            document.getElementById("public-file-meta").textContent = "The requested cloud document may have been deleted or expired.";
            document.getElementById("public-preview-container").innerHTML = `<p style="color: var(--danger);">Unable to locate document in cloud storage vault.</p>`;
            return;
        }

        storageView.style.display = "none";
        publicView.style.display = "block";

        document.getElementById("public-file-title").textContent = file.name;
        document.getElementById("public-file-meta").textContent = `Size: ${formatBytes(file.size)} • Uploaded ${new Date(file.createdAt).toLocaleDateString()}`;

        const previewContainer = document.getElementById("public-preview-container");
        previewContainer.innerHTML = "";

        const isImg = file.category === 'images' || (file.type && file.type.startsWith('image/'));
        const isVid = file.category === 'videos' || (file.type && file.type.startsWith('video/'));

        if (isImg) {
            previewContainer.innerHTML = `<img src="${file.dataUrl}" alt="${file.name}" style="max-width: 100%; max-height: 440px; border-radius: 8px; object-fit: contain;">`;
        } else if (isVid) {
            previewContainer.innerHTML = `<video src="${file.dataUrl}" controls autoplay style="max-width: 100%; max-height: 400px; border-radius: 8px;"></video>`;
        } else if (file.category === 'docx') {
            previewContainer.innerHTML = `<div id="docx-html-preview" style="width: 100%; background: #ffffff; padding: 20px; border-radius: 8px; font-family: serif; color: #000; text-align: left; overflow-y: auto;">Loading DOCX document preview...</div>`;
            renderDocxHTML(file.dataUrl);
        } else {
            previewContainer.innerHTML = `<div style="text-align: center; padding: 20px;"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg><p style="margin-top: 10px; font-weight: 600;">Document Ready for Download</p></div>`;
        }

        const btnPublicDownload = document.getElementById("btn-public-download");
        if (btnPublicDownload) {
            btnPublicDownload.onclick = () => triggerFileDownload(file);
        }
    }

    async function renderDocxHTML(dataUrl) {
        const previewEl = document.getElementById("docx-html-preview");
        if (!previewEl || !window.mammoth) return;

        try {
            const base64Data = dataUrl.split(',')[1];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
            previewEl.innerHTML = result.value || "<p>DOCX converted successfully.</p>";
        } catch (e) {
            console.error("Mammoth DOCX Error:", e);
            previewEl.innerHTML = `<p style="color: var(--text-muted);">DOCX document preview ready. Click Download to open full document.</p>`;
        }
    }

    function triggerFileDownload(file) {
        const a = document.createElement("a");
        a.href = file.dataUrl;
        a.download = file.name;
        a.click();
    }

    function formatBytes(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    // Expose helpers
    window.saveToEnlyCloudVault = saveFileToDB;
    window.openEnlyCloudShareModal = openShareModal;

})();
