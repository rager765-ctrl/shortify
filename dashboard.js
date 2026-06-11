// Admin Dashboard controller
import { db, configured, auth } from "./firebase.js";
import { 
    collection, 
    onSnapshot, 
    query, 
    orderBy, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    where,
    limit,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast, logoutAdmin } from "./auth.js";
import { generateQRCode } from "./shorten.js";

let urlsData = [];
let selectedUrlCode = null;
let clicksUnsubscribe = null;

// Initialize Dashboard
export function initDashboard() {
    if (!configured) return;
    
    // Set up logout button
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logoutAdmin);
    }
    
    // Setup system registration settings toggle
    setupSettingsToggle();
    
    // Load Stats and URL list in real-time
    setupRealtimeListeners();
    
    // Setup event listeners for modals and searching
    setupDashboardEvents();
}

function setupRealtimeListeners() {
    // 1. Listen to URLs collection (queried without ordering to prevent Firestore index errors)
    const urlsQuery = query(collection(db, "urls"));
    onSnapshot(urlsQuery, (snapshot) => {
        urlsData = [];
        snapshot.forEach((doc) => {
            urlsData.push(doc.data());
        });
        
        // Sort by createdAt descending in memory
        urlsData.sort((a, b) => {
            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
            return timeB - timeA;
        });
        
        // Render table
        renderUrlsTable();
        // Recalculate stats cards
        calculateStats();
        // If a URL is currently selected in analytics, update it
        if (selectedUrlCode) {
            showAnalytics(selectedUrlCode);
        }
    }, (error) => {
        console.error("Error reading URLs:", error);
        showToast("Error loading dashboard data. Check Firestore rules.", "error");
        
        const tableBody = document.getElementById("urls-table-body");
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center" style="color: var(--danger); padding: 40px 0; line-height: 1.6;">
                        ⚠️ <strong>Database Access Error</strong><br>
                        Please ensure you have published the relaxed security rules in your Firebase Console.<br>
                        <span style="color: var(--text-muted); font-size: 12px; font-family: monospace; display: block; margin-top: 10px;">
                            ${error.message || error}
                        </span>
                    </td>
                </tr>
            `;
        }
    });
    
    // 2. Listen to Today's Clicks (clicks created since start of today)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayClicksQuery = query(
        collection(db, "clicks"), 
        where("timestamp", ">=", startOfDay)
    );
    
    onSnapshot(todayClicksQuery, (snapshot) => {
        const todayClicksCount = snapshot.size;
        const todayClicksEl = document.getElementById("stat-today-clicks");
        if (todayClicksEl) {
            todayClicksEl.innerText = todayClicksCount.toLocaleString();
        }
    }, (error) => {
        console.error("Error reading today's clicks:", error);
    });
}

function calculateStats() {
    const totalLinks = urlsData.length;
    let totalClicks = 0;
    let activeLinks = 0;
    
    urlsData.forEach(url => {
        totalClicks += url.clicks || 0;
        if (url.active !== false) {
            activeLinks++;
        }
    });
    
    const totalLinksEl = document.getElementById("stat-total-links");
    const totalClicksEl = document.getElementById("stat-total-clicks");
    const activeLinksEl = document.getElementById("stat-active-links");
    
    if (totalLinksEl) totalLinksEl.innerText = totalLinks.toLocaleString();
    if (totalClicksEl) totalClicksEl.innerText = totalClicks.toLocaleString();
    if (activeLinksEl) activeLinksEl.innerText = activeLinks.toLocaleString();
}

function renderUrlsTable(filterQuery = "") {
    const tableBody = document.getElementById("urls-table-body");
    if (!tableBody) return;
    
    tableBody.innerHTML = "";
    
    const filtered = urlsData.filter(url => {
        const queryLower = filterQuery.toLowerCase();
        return url.shortCode.toLowerCase().includes(queryLower) || 
               url.longUrl.toLowerCase().includes(queryLower);
    });
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center" style="color: var(--text-muted); padding: 40px 0;">
                    No short URLs found. Click "Create Short URL" to get started!
                </td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(url => {
        const tr = document.createElement("tr");
        tr.className = selectedUrlCode === url.shortCode ? "selected-row" : "";
        tr.style.cursor = "pointer";
        
        // Format created date
        let createdStr = "Unknown";
        if (url.createdAt) {
            const date = url.createdAt.toDate ? url.createdAt.toDate() : new Date(url.createdAt);
            createdStr = formatTimeAgo(date);
        }
        
        const shortUrl = `${window.location.host}/#${url.shortCode}`;
        const activeBadge = url.active !== false 
            ? `<span class="badge badge-success">Active</span>`
            : `<span class="badge badge-danger">Disabled</span>`;
            
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--primary); font-family: 'Space Grotesk', sans-serif;">
                /${url.shortCode}
            </td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary);" title="${url.longUrl}">
                ${url.longUrl}
            </td>
            <td style="font-weight: 600;">${(url.clicks || 0).toLocaleString()}</td>
            <td>${activeBadge}</td>
            <td class="action-buttons" onclick="event.stopPropagation()">
                <button class="btn btn-secondary btn-view-action" data-code="${url.shortCode}" title="View Details" style="padding: 6px 12px; font-size: 12px;">
                    👁
                </button>
                <button class="btn btn-secondary btn-edit-action" data-code="${url.shortCode}" title="Edit URL" style="padding: 6px 12px; font-size: 12px;">
                    ✏️
                </button>
                <button class="btn btn-secondary btn-toggle-action" data-code="${url.shortCode}" title="${url.active !== false ? 'Disable' : 'Enable'}" style="padding: 6px 12px; font-size: 12px;">
                    ${url.active !== false ? '⏸' : '▶'}
                </button>
                <button class="btn btn-danger btn-delete-action" data-code="${url.shortCode}" title="Delete URL" style="padding: 6px 12px; font-size: 12px;">
                    🗑
                </button>
            </td>
        `;
        
        // clicking row opens analytics panel
        tr.addEventListener("click", () => {
            selectUrlForAnalytics(url.shortCode);
        });
        
        tableBody.appendChild(tr);
    });
    
    // Bind Action buttons
    document.querySelectorAll(".btn-view-action").forEach(btn => {
        btn.addEventListener("click", (e) => {
            openViewModal(e.target.dataset.code);
        });
    });
    
    document.querySelectorAll(".btn-edit-action").forEach(btn => {
        btn.addEventListener("click", (e) => {
            openEditModal(e.target.dataset.code);
        });
    });
    
    document.querySelectorAll(".btn-toggle-action").forEach(btn => {
        btn.addEventListener("click", (e) => {
            toggleUrlActive(e.target.dataset.code);
        });
    });
    
    document.querySelectorAll(".btn-delete-action").forEach(btn => {
        btn.addEventListener("click", (e) => {
            confirmDeleteUrl(e.target.dataset.code);
        });
    });
}

function selectUrlForAnalytics(code) {
    selectedUrlCode = code;
    
    // Highlight active row in table
    const rows = document.querySelectorAll("#urls-table-body tr");
    const filtered = urlsData.filter(url => url.shortCode === code);
    
    renderUrlsTable(document.getElementById("search-input").value);
    showAnalytics(code);
}

async function showAnalytics(code) {
    const urlData = urlsData.find(u => u.shortCode === code);
    if (!urlData) return;
    
    const panel = document.getElementById("analytics-container");
    if (!panel) return;
    
    // Build analytics UI
    panel.innerHTML = `
        <div class="card analytics-panel">
            <div class="d-flex justify-between align-center">
                <h3 style="font-size: 18px;">Analytics</h3>
                <span class="badge badge-info">/${code}</span>
            </div>
            
            <div style="background: var(--bg-tertiary); padding: 15px; border-radius: var(--radius-md); border: 1px solid var(--card-border);">
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Short Link</div>
                <div class="d-flex justify-between align-center">
                    <span style="font-family: 'Space Grotesk', sans-serif; font-weight: 600; color: var(--accent); font-size: 15px;">
                        ${window.location.host}/#${code}
                    </span>
                    <button class="btn btn-secondary" onclick="window.copyToClipboard('${window.location.host}/#${code}');" style="padding: 4px 8px; font-size: 11px;">
                        Copy
                    </button>
                </div>
            </div>

            <div>
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Original Destination</div>
                <div style="word-break: break-all; font-size: 13px; color: var(--text-secondary); max-height: 60px; overflow-y: auto;">
                    ${urlData.longUrl}
                </div>
            </div>

            <div class="d-flex justify-between" style="border-top: 1px solid var(--card-border); padding-top: 15px;">
                <div>
                    <div style="font-size: 12px; color: var(--text-muted);">Total Clicks</div>
                    <div style="font-size: 24px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; color: var(--primary);">
                        ${(urlData.clicks || 0).toLocaleString()}
                    </div>
                </div>
                <div>
                    <div style="font-size: 12px; color: var(--text-muted);">Status</div>
                    <div style="margin-top: 4px;">
                        ${urlData.active !== false 
                            ? '<span class="badge badge-success">Active</span>' 
                            : '<span class="badge badge-danger">Disabled</span>'}
                    </div>
                </div>
            </div>

            <div style="border-top: 1px solid var(--card-border); padding-top: 15px;">
                <h4 style="font-size: 14px; margin-bottom: 10px;">Recent Clicks</h4>
                <div id="recent-clicks-loader" class="text-center" style="padding: 10px 0;">
                    <div class="spinner" style="margin: 0 auto;"></div>
                </div>
                <div id="recent-clicks-list" class="recent-clicks-list" style="display: none;"></div>
            </div>
        </div>
    `;
    
    // Load click logs
    try {
        const clicksRef = collection(db, "clicks");
        const q = query(clicksRef, where("shortCode", "==", code), limit(50));
        const querySnapshot = await getDocs(q);
        
        let clicks = [];
        querySnapshot.forEach(doc => {
            clicks.push(doc.data());
        });
        
        // Sort by timestamp desc in Javascript to avoid index requirement
        clicks.sort((a, b) => {
            const timeA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime()) : 0;
            const timeB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime()) : 0;
            return timeB - timeA;
        });
        
        const loader = document.getElementById("recent-clicks-loader");
        const listEl = document.getElementById("recent-clicks-list");
        
        if (loader) loader.style.display = "none";
        if (listEl) {
            listEl.style.display = "flex";
            listEl.innerHTML = "";
            
            if (clicks.length === 0) {
                listEl.innerHTML = `
                    <div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px 0;">
                        No click logs recorded yet.
                    </div>
                `;
                return;
            }
            
            // Render first 10
            clicks.slice(0, 10).forEach(click => {
                const item = document.createElement("div");
                item.className = "click-item";
                
                let timeStr = "Just now";
                if (click.timestamp) {
                    const date = click.timestamp.toDate ? click.timestamp.toDate() : new Date(click.timestamp);
                    timeStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                
                item.innerHTML = `
                    <div class="click-time">${timeStr}</div>
                    <div class="click-ip">${click.ipHash || "anonymous"}</div>
                `;
                listEl.appendChild(item);
            });
        }
    } catch (err) {
        console.error("Error loading click analytics:", err);
        const loader = document.getElementById("recent-clicks-loader");
        if (loader) loader.innerHTML = `<span style="color: var(--danger); font-size:12px;">Error loading logs</span>`;
    }
}

// Action Handlers
function openViewModal(code) {
    const urlData = urlsData.find(u => u.shortCode === code);
    if (!urlData) return;
    
    const modal = document.getElementById("view-modal");
    const overlay = document.getElementById("modal-overlay-view");
    
    document.getElementById("view-modal-title").innerText = `/${code} Details`;
    
    const shortUrl = `${window.location.host}/#${code}`;
    document.getElementById("view-short-url").innerText = shortUrl;
    document.getElementById("view-long-url").innerText = urlData.longUrl;
    document.getElementById("view-long-url").href = urlData.longUrl;
    document.getElementById("view-clicks").innerText = (urlData.clicks || 0).toLocaleString();
    
    // Download QR listener
    const downloadBtn = document.getElementById("download-qr-btn");
    // Replace listener
    const newDownloadBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
    
    newDownloadBtn.addEventListener("click", () => {
        const qrImg = document.querySelector("#view-qrcode img");
        if (qrImg) {
            try {
                const base64Data = qrImg.src;
                const parts = base64Data.split(';base64,');
                const contentType = parts[0].split(':')[1];
                const raw = window.atob(parts[1]);
                const rawLength = raw.length;
                const uInt8Array = new Uint8Array(rawLength);
                for (let i = 0; i < rawLength; ++i) {
                    uInt8Array[i] = raw.charCodeAt(i);
                }
                const blob = new Blob([uInt8Array], { type: contentType });
                const blobUrl = URL.createObjectURL(blob);

                const link = document.createElement("a");
                link.href = blobUrl;
                link.download = `qr_${code}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
            } catch (err) {
                console.error("Error downloading QR:", err);
                const link = document.createElement("a");
                link.href = qrImg.src;
                link.download = `qr_${code}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } else {
            showToast("QR code image not loaded yet.", "warning");
        }
    });

    overlay.classList.add("active");

    // Generate QR after modal display animation finishes to ensure proper rendering context
    setTimeout(() => {
        generateQRCode("view-qrcode", `${window.location.protocol}//${shortUrl}`);
    }, 50);
}

function openEditModal(code) {
    const urlData = urlsData.find(u => u.shortCode === code);
    if (!urlData) return;
    
    const overlay = document.getElementById("modal-overlay-edit");
    document.getElementById("edit-short-code").value = code;
    document.getElementById("edit-long-url").value = urlData.longUrl;
    document.getElementById("edit-active-toggle").checked = urlData.active !== false;
    
    overlay.classList.add("active");
}

async function toggleUrlActive(code) {
    const urlData = urlsData.find(u => u.shortCode === code);
    if (!urlData) return;
    
    try {
        const docRef = doc(db, "urls", code);
        const nextState = urlData.active === false;
        await updateDoc(docRef, {
            active: nextState
        });
        showToast(nextState ? `/${code} Enabled` : `/${code} Disabled`);
    } catch (err) {
        console.error("Error toggling active state:", err);
        showToast("Failed to update link status.", "error");
    }
}

async function confirmDeleteUrl(code) {
    if (confirm(`Are you sure you want to delete /${code}? This will remove the short link entirely.`)) {
        try {
            const docRef = doc(db, "urls", code);
            await deleteDoc(docRef);
            showToast(`/${code} Deleted`);
            if (selectedUrlCode === code) {
                selectedUrlCode = null;
                const panel = document.getElementById("analytics-container");
                if (panel) {
                    panel.innerHTML = `
                        <div class="card analytics-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                            </svg>
                            <p>Select a link to view click analytics</p>
                        </div>
                    `;
                }
            }
        } catch (err) {
            console.error("Error deleting URL:", err);
            showToast("Failed to delete link.", "error");
        }
    }
}

async function confirmDeleteAllUrls() {
    if (urlsData.length === 0) {
        showToast("No links to delete.", "info");
        return;
    }

    if (confirm(`WARNING: Are you absolutely sure you want to delete ALL ${urlsData.length} short links and all click history? This action is permanent and cannot be undone.`)) {
        const confirmText = prompt("Type 'DELETE ALL' to confirm this destructive action:");
        if (confirmText !== "DELETE ALL") {
            showToast("Action cancelled. Confirmation text did not match.", "warning");
            return;
        }

        try {
            showToast("Deleting all links...", "info");
            
            // 1. Delete all URL documents
            const deletePromises = urlsData.map(url => deleteDoc(doc(db, "urls", url.shortCode)));
            await Promise.all(deletePromises);
            
            // 2. Fetch and delete all clicks
            const clicksSnapshot = await getDocs(collection(db, "clicks"));
            const deleteClickPromises = [];
            clicksSnapshot.forEach(clickDoc => {
                deleteClickPromises.push(deleteDoc(doc(db, "clicks", clickDoc.id)));
            });
            await Promise.all(deleteClickPromises);
            
            showToast("All short links and click logs successfully deleted.");
            
            // Clear selected analytics
            selectedUrlCode = null;
            const panel = document.getElementById("analytics-container");
            if (panel) {
                panel.innerHTML = `
                    <div class="card analytics-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                        </svg>
                        <p style="margin-top: 10px;">Select a link to view click analytics</p>
                    </div>
                `;
            }
        } catch (err) {
            console.error("Error deleting all links:", err);
            showToast("Failed to delete all links.", "error");
        }
    }
}

function setupDashboardEvents() {
    // Search input
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            renderUrlsTable(e.target.value);
        });
    }

    // Delete All button
    const deleteAllBtn = document.getElementById("delete-all-btn");
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener("click", () => {
            confirmDeleteAllUrls();
        });
    }
    
    // Close modals
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.remove("active");
            }
        });
    });
    
    document.querySelectorAll(".modal-close").forEach(btn => {
        btn.addEventListener("click", () => {
            btn.closest(".modal-overlay").classList.remove("active");
        });
    });
    
    // Edit Form Save
    const editForm = document.getElementById("edit-url-form");
    if (editForm) {
        editForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const code = document.getElementById("edit-short-code").value;
            const newLongUrl = document.getElementById("edit-long-url").value.trim();
            const activeState = document.getElementById("edit-active-toggle").checked;
            
            if (!newLongUrl) {
                showToast("Please enter a destination URL", "warning");
                return;
            }
            
            try {
                const docRef = doc(db, "urls", code);
                await updateDoc(docRef, {
                    longUrl: newLongUrl,
                    active: activeState
                });
                showToast(`/${code} updated successfully`);
                document.getElementById("modal-overlay-edit").classList.remove("active");
            } catch (err) {
                console.error("Error updating URL:", err);
                showToast("Failed to update URL.", "error");
            }
        });
    }
    
    // Copy button inside details modal
    const copyDetailsBtn = document.getElementById("view-copy-btn");
    if (copyDetailsBtn) {
        copyDetailsBtn.addEventListener("click", () => {
            const shortUrl = document.getElementById("view-short-url").innerText;
            window.copyToClipboard(shortUrl);
        });
    }
}

// Time formatting helper
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) {
        const days = Math.floor(interval);
        if (days === 1) return "Yesterday";
        return days + " days ago";
    }
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    if (seconds < 10) return "Just now";
    return Math.floor(seconds) + " seconds ago";
}

// Expose copy to clipboard helper globally
window.copyToClipboard = function(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showToast("Copied to clipboard!"))
            .catch(() => fallbackCopyText(text));
    } else {
        fallbackCopyText(text);
    }
};

function fallbackCopyText(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast("Copied to clipboard!");
    } catch (err) {
        console.error("Fallback copy failed:", err);
        showToast("Failed to copy link", "error");
    }
    document.body.removeChild(textArea);
}

// System configuration listeners and controllers
async function setupSettingsToggle() {
    const toggle = document.getElementById("admin-signup-toggle");
    const label = document.getElementById("signup-toggle-label");
    if (!toggle || !label) return;

    // Load initial state
    try {
        const docRef = doc(db, "config", "registration");
        const docSnap = await getDoc(docRef);
        let signupEnabled = true;
        if (docSnap.exists()) {
            signupEnabled = docSnap.data().signupEnabled !== false;
        }
        toggle.checked = signupEnabled;
        label.innerText = signupEnabled ? "Enabled" : "Disabled";
        label.style.color = signupEnabled ? "var(--success)" : "var(--text-secondary)";
    } catch (err) {
        console.error("Error fetching signup setting:", err);
    }

    // Bind change listener
    toggle.addEventListener("change", async () => {
        const isChecked = toggle.checked;
        label.innerText = isChecked ? "Enabled" : "Disabled";
        label.style.color = isChecked ? "var(--success)" : "var(--text-secondary)";

        try {
            const docRef = doc(db, "config", "registration");
            await setDoc(docRef, { signupEnabled: isChecked });
            showToast(isChecked ? "Admin registration enabled!" : "Admin registration disabled!");
        } catch (err) {
            console.error("Error updating signup config:", err);
            showToast("Failed to update registration settings.", "error");
            // revert UI state
            toggle.checked = !isChecked;
            label.innerText = !isChecked ? "Enabled" : "Disabled";
            label.style.color = !isChecked ? "var(--success)" : "var(--text-secondary)";
        }
    });
}
