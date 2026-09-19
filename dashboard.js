// Admin Dashboard controller
import { db, configured, auth, CUSTOM_DISPLAY_DOMAIN } from "./firebase.js";
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
import { getLiveAnalyticsStats } from "./analytics.js";

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

    // Setup mobile visibility settings toggles
    setupMobileVisibilityToggles();

    // Setup tab switching
    setupTabSwitching();
    
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
    let qrScans = 0;
    let activeLinks = 0;
    
    urlsData.forEach(url => {
        totalClicks += url.clicks || 0;
        qrScans += url.qrClicks || 0;
        if (url.active !== false) {
            activeLinks++;
        }
    });
    
    const liveStats = getLiveAnalyticsStats();
    
    const totalLinksEl = document.getElementById("stat-total-links");
    const totalClicksEl = document.getElementById("stat-total-clicks");
    const activeLinksEl = document.getElementById("stat-active-links");
    const qrScansEl = document.getElementById("stat-qr-scans");
    const docConversionsEl = document.getElementById("stat-doc-conversions");
    const qrGeneratedEl = document.getElementById("stat-qr-generated");
    
    if (totalLinksEl) totalLinksEl.innerText = totalLinks.toLocaleString();
    if (totalClicksEl) totalClicksEl.innerText = totalClicks.toLocaleString();
    if (activeLinksEl) activeLinksEl.innerText = activeLinks.toLocaleString();
    if (qrScansEl) qrScansEl.innerText = qrScans.toLocaleString();
    if (docConversionsEl) docConversionsEl.innerText = liveStats.docConversions.toLocaleString();
    if (qrGeneratedEl) qrGeneratedEl.innerText = liveStats.qrGenerated.toLocaleString();
}

window.addEventListener("enly_stats_updated", () => calculateStats());

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
        
        const shortUrl = `${CUSTOM_DISPLAY_DOMAIN || window.location.host}/${url.shortCode}`;
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
                        ${CUSTOM_DISPLAY_DOMAIN || window.location.host}/${code}
                    </span>
                    <button class="btn btn-secondary" onclick="window.copyToClipboard('${CUSTOM_DISPLAY_DOMAIN || window.location.host}/${code}');" style="padding: 4px 8px; font-size: 11px;">
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

            <div class="d-flex justify-between align-center" style="border-top: 1px solid var(--card-border); padding-top: 15px; gap: 15px; flex-wrap: wrap;">
                <div>
                    <div style="font-size: 12px; color: var(--text-muted);">Total Clicks</div>
                    <div style="font-size: 24px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; color: var(--primary);">
                        ${(urlData.clicks || 0).toLocaleString()}
                    </div>
                </div>
                <div>
                    <div style="font-size: 12px; color: var(--text-muted);">QR Code Scans</div>
                    <div style="font-size: 24px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; color: var(--accent);">
                        ${(urlData.qrClicks || 0).toLocaleString()}
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
    
    const shortUrl = `${CUSTOM_DISPLAY_DOMAIN || window.location.host}/${code}`;
    document.getElementById("view-short-url").innerText = shortUrl;
    document.getElementById("view-long-url").innerText = urlData.longUrl;
    document.getElementById("view-long-url").href = urlData.longUrl;
    document.getElementById("view-clicks").innerText = (urlData.clicks || 0).toLocaleString();
    
    const qrClicksEl = document.getElementById("view-qr-clicks");
    if (qrClicksEl) {
        qrClicksEl.innerText = (urlData.qrClicks || 0).toLocaleString();
    }
    
    // Download QR listener
    const downloadBtn = document.getElementById("download-qr-btn");
    // Replace listener
    const newDownloadBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
    
    newDownloadBtn.addEventListener("click", () => {
        showToast("QR code downloading is coming soon!", "info");
    });

    overlay.classList.add("active");

    // Generate QR after modal display animation finishes to ensure proper rendering context
    setTimeout(() => {
        generateQRCode("view-qrcode", `${window.location.protocol}//${shortUrl}?ref=qr`);
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
    const badgeToggle = document.getElementById("badge-page-toggle");
    const badgeLabel = document.getElementById("badge-toggle-label");

    if (toggle && label) {
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

    if (badgeToggle && badgeLabel) {
        // Load initial state for badge page
        try {
            const docRef = doc(db, "config", "features");
            const docSnap = await getDoc(docRef);
            let badgePageEnabled = true;
            if (docSnap.exists()) {
                badgePageEnabled = docSnap.data().badgePageEnabled !== false;
            }
            badgeToggle.checked = badgePageEnabled;
            badgeLabel.innerText = badgePageEnabled ? "Enabled" : "Disabled";
            badgeLabel.style.color = badgePageEnabled ? "var(--success)" : "var(--text-secondary)";
        } catch (err) {
            console.error("Error fetching badge page setting:", err);
        }

        // Bind change listener for badge page
        badgeToggle.addEventListener("change", async () => {
            const isChecked = badgeToggle.checked;
            badgeLabel.innerText = isChecked ? "Enabled" : "Disabled";
            badgeLabel.style.color = isChecked ? "var(--success)" : "var(--text-secondary)";

            try {
                const docRef = doc(db, "config", "features");
                await setDoc(docRef, { badgePageEnabled: isChecked }, { merge: true });
                showToast(isChecked ? "Event Badge page is now public!" : "Event Badge page is now hidden!");
            } catch (err) {
                console.error("Error updating badge page config:", err);
                showToast("Failed to update Event Badge page settings.", "error");
                // revert UI state
                badgeToggle.checked = !isChecked;
                badgeLabel.innerText = !isChecked ? "Enabled" : "Disabled";
                badgeLabel.style.color = !isChecked ? "var(--success)" : "var(--text-secondary)";
            }
        });
    }
}

function setupTabSwitching() {
    const tabOverview = document.getElementById("tab-overview");
    const tabMobile = document.getElementById("tab-mobile-visibility");
    const viewOverview = document.getElementById("view-overview-content");
    const viewMobile = document.getElementById("view-mobile-visibility-content");

    if (tabOverview && tabMobile && viewOverview && viewMobile) {
        tabOverview.addEventListener("click", () => {
            tabOverview.classList.add("active");
            tabOverview.style.borderBottomColor = "var(--primary)";
            tabOverview.style.color = "var(--text-primary)";
            
            tabMobile.classList.remove("active");
            tabMobile.style.borderBottomColor = "transparent";
            tabMobile.style.color = "var(--text-secondary)";
            
            viewOverview.style.display = "block";
            viewMobile.style.display = "none";
        });

        tabMobile.addEventListener("click", () => {
            tabMobile.classList.add("active");
            tabMobile.style.borderBottomColor = "var(--primary)";
            tabMobile.style.color = "var(--text-primary)";
            
            tabOverview.classList.remove("active");
            tabOverview.style.borderBottomColor = "transparent";
            tabOverview.style.color = "var(--text-secondary)";
            
            viewOverview.style.display = "none";
            viewMobile.style.display = "block";
        });
    }
}

async function setupMobileVisibilityToggles() {
    const shortenerToggle = document.getElementById("mobile-shortener-toggle");
    const shortenerLabel = document.getElementById("mobile-shortener-label");
    
    const qrToggle = document.getElementById("mobile-qr-toggle");
    const qrLabel = document.getElementById("mobile-qr-label");
    
    const badgeToggle = document.getElementById("mobile-badge-toggle");
    const badgeLabel = document.getElementById("mobile-badge-label");
    
    const aboutToggle = document.getElementById("mobile-about-toggle");
    const aboutLabel = document.getElementById("mobile-about-label");

    if (!shortenerToggle || !qrToggle || !badgeToggle || !aboutToggle) return;

    // Load initial states from config/features
    try {
        const docRef = doc(db, "config", "features");
        const docSnap = await getDoc(docRef);
        
        let shortenerVisible = false; // default hidden
        let qrVisible = true;        // default visible
        let badgeVisible = true;     // default visible
        let aboutVisible = true;     // default visible

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.shortenerMobileVisible !== undefined) shortenerVisible = data.shortenerMobileVisible;
            if (data.qrMobileVisible !== undefined) qrVisible = data.qrMobileVisible;
            if (data.badgeMobileVisible !== undefined) badgeVisible = data.badgeMobileVisible;
            if (data.aboutMobileVisible !== undefined) aboutVisible = data.aboutMobileVisible;
        }

        // Apply to UI
        const applyUI = (toggle, label, visible) => {
            toggle.checked = visible;
            label.innerText = visible ? "Visible" : "Hidden";
            label.style.color = visible ? "var(--success)" : "var(--text-secondary)";
        };

        applyUI(shortenerToggle, shortenerLabel, shortenerVisible);
        applyUI(qrToggle, qrLabel, qrVisible);
        applyUI(badgeToggle, badgeLabel, badgeVisible);
        applyUI(aboutToggle, aboutLabel, aboutVisible);

    } catch (err) {
        console.error("Error fetching mobile visibility settings:", err);
    }

    // Bind change listener
    const bindToggleListener = (toggle, label, fieldName, successMsg) => {
        toggle.addEventListener("change", async () => {
            const isChecked = toggle.checked;
            label.innerText = isChecked ? "Visible" : "Hidden";
            label.style.color = isChecked ? "var(--success)" : "var(--text-secondary)";

            try {
                const docRef = doc(db, "config", "features");
                await setDoc(docRef, { [fieldName]: isChecked }, { merge: true });
                showToast(successMsg + (isChecked ? " visible on mobile!" : " hidden on mobile!"));
            } catch (err) {
                console.error(`Error updating ${fieldName}:`, err);
                showToast("Failed to update visibility setting.", "error");
                // revert
                toggle.checked = !isChecked;
                label.innerText = !isChecked ? "Visible" : "Hidden";
                label.style.color = !isChecked ? "var(--success)" : "var(--text-secondary)";
            }
        });
    };

    bindToggleListener(shortenerToggle, shortenerLabel, "shortenerMobileVisible", "Shortener is now");
    bindToggleListener(qrToggle, qrLabel, "qrMobileVisible", "Custom QR is now");
    bindToggleListener(badgeToggle, badgeLabel, "badgeMobileVisible", "Event Badge is now");
    bindToggleListener(aboutToggle, aboutLabel, "aboutMobileVisible", "About page is now");
}

// ─── CLOUD STORAGE STAT CARD + VAULT PREVIEW DRAWER ─────────────────────────

let _cloudFiles = [];       // cache fetched from Firestore
let _cvdFilter  = "all";    // active filter in drawer

/** Fetch cloud_shares from Firestore and populate the stat card. */
async function loadCloudStorageStats() {
    if (!configured || !db) {
        const el = document.getElementById("stat-cloud-files");
        const sz = document.getElementById("stat-cloud-size");
        if (el) el.innerText = "N/A";
        if (sz) sz.innerText = "Firebase not configured";
        return;
    }
    try {
        const { collection: fsCol, getDocs: fsGet } = await import(
            "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"
        );
        const snap = await fsGet(fsCol(db, "cloud_shares"));
        _cloudFiles = [];
        let totalBytes = 0;
        snap.forEach(d => {
            const data = d.data();
            _cloudFiles.push(data);
            totalBytes += data.size || 0;
        });

        const count = _cloudFiles.length;
        const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);

        const el = document.getElementById("stat-cloud-files");
        const sz = document.getElementById("stat-cloud-size");
        if (el) el.innerText = count.toLocaleString();
        if (sz) sz.innerText = `${usedMB} MB used`;
    } catch (e) {
        console.warn("Cloud storage stat fetch error:", e);
        const el = document.getElementById("stat-cloud-files");
        if (el) el.innerText = "–";
    }
}

// Call on dashboard init
document.addEventListener("DOMContentLoaded", () => {
    loadCloudStorageStats();
});

/** Open the slide-up vault preview drawer. */
window.openCloudVaultDrawer = async function () {
    const overlay = document.getElementById("cloud-vault-drawer-overlay");
    const drawer  = document.getElementById("cloud-vault-drawer");
    if (!overlay || !drawer) return;

    overlay.style.display = "flex";
    requestAnimationFrame(() => requestAnimationFrame(() => {
        drawer.style.transform = "translateY(0)";
    }));
    document.body.style.overflow = "hidden";

    // Refresh files if cache is empty
    if (_cloudFiles.length === 0) await loadCloudStorageStats();

    _cvdFilter = "all";
    // Reset filter tab active state
    ["all","images","docx","videos"].forEach(f => {
        document.getElementById(`cvd-filter-${f}`)?.classList.toggle("active", f === "all");
    });

    renderCloudDrawerGrid();
};

/** Close the slide-up vault preview drawer. */
window.closeCloudVaultDrawer = function () {
    const overlay = document.getElementById("cloud-vault-drawer-overlay");
    const drawer  = document.getElementById("cloud-vault-drawer");
    if (!drawer) return;
    drawer.style.transform = "translateY(100%)";
    setTimeout(() => {
        if (overlay) overlay.style.display = "none";
        document.body.style.overflow = "";
    }, 360);
};

/** Filter cloud drawer by category. */
window.filterCloudDrawer = function (cat) {
    _cvdFilter = cat;
    ["all","images","docx","videos"].forEach(f => {
        document.getElementById(`cvd-filter-${f}`)?.classList.toggle("active", f === cat);
    });
    renderCloudDrawerGrid();
};

function formatBytesLocal(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024, sizes = ["B","KB","MB","GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function renderCloudDrawerGrid() {
    const grid   = document.getElementById("cloud-drawer-grid");
    const empty  = document.getElementById("cloud-drawer-empty");
    const meta   = document.getElementById("cloud-drawer-meta");
    if (!grid) return;

    const list = _cvdFilter === "all"
        ? _cloudFiles
        : _cloudFiles.filter(f => f.category === _cvdFilter);

    const totalBytes = _cloudFiles.reduce((a, f) => a + (f.size || 0), 0);
    if (meta) meta.textContent = `${_cloudFiles.length} file${_cloudFiles.length !== 1 ? "s" : ""} • ${formatBytesLocal(totalBytes)} used`;

    if (list.length === 0) {
        grid.style.display = "none";
        if (empty) { empty.style.display = "flex"; }
        return;
    }
    grid.style.display = "grid";
    if (empty) empty.style.display = "none";
    grid.innerHTML = "";

    list.forEach(file => {
        const card = document.createElement("div");
        card.style.cssText = "background:var(--bg-tertiary);border-radius:14px;overflow:hidden;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;border:1px solid var(--card-border);";
        card.title = "Tap to preview";

        card.addEventListener("mouseenter", () => { card.style.transform = "translateY(-3px)"; card.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; });
        card.addEventListener("mouseleave", () => { card.style.transform = ""; card.style.boxShadow = ""; });

        // Thumbnail
        let thumbHtml = "";
        if (file.dataUrl && (file.category === "images" || (file.type && file.type.startsWith("image/")))) {
            thumbHtml = `<img src="${file.dataUrl}" alt="${file.name}" style="width:100%;height:110px;object-fit:cover;display:block;">`;
        } else if (file.category === "videos" || (file.type && file.type.startsWith("video/"))) {
            thumbHtml = `<div style="width:100%;height:110px;background:rgba(99,102,241,0.08);display:flex;align-items:center;justify-content:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`;
        } else if (file.category === "docx") {
            thumbHtml = `<div style="width:100%;height:110px;background:rgba(29,78,216,0.06);display:flex;align-items:center;justify-content:center;"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="1.8"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg></div>`;
        } else {
            thumbHtml = `<div style="width:100%;height:110px;background:rgba(0,0,0,0.04);display:flex;align-items:center;justify-content:center;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></div>`;
        }

        card.innerHTML = `
            ${thumbHtml}
            <div style="padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${file.name}">${file.name}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${formatBytesLocal(file.size)} • ${file.category}</div>
            </div>`;

        card.addEventListener("click", () => openCvdPreview(file));
        grid.appendChild(card);
    });
}

let _cvdActiveFile = null;

/** Open full preview modal for a cloud file. */
window.openCvdPreview = function (file) {
    _cvdActiveFile = file;
    const overlay  = document.getElementById("cvd-preview-overlay");
    const title    = document.getElementById("cvd-preview-title");
    const metaEl   = document.getElementById("cvd-preview-meta");
    const body     = document.getElementById("cvd-preview-body");
    const shareLink= document.getElementById("cvd-open-share-link");
    const dlBtn    = document.getElementById("cvd-download-btn");

    if (!overlay || !body) return;

    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";

    if (title) title.textContent = file.name;
    if (metaEl) metaEl.textContent = `${formatBytesLocal(file.size)} • ${file.type || file.category} • Uploaded ${new Date(file.createdAt).toLocaleDateString()}`;

    // Share link
    const shareUrl = `${window.location.origin}/cloud-storage.html?file=${file.id}`;
    if (shareLink) shareLink.href = shareUrl;

    // Download button
    if (dlBtn) {
        dlBtn.onclick = () => {
            if (!file.dataUrl) return alert("Binary not stored in Firestore for this file.");
            const a = document.createElement("a");
            a.href = file.dataUrl;
            a.download = file.name;
            a.click();
        };
    }

    // Render preview
    body.innerHTML = "";
    const isImg = file.category === "images" || (file.type && file.type.startsWith("image/"));
    const isVid = file.category === "videos" || (file.type && file.type.startsWith("video/"));

    if (isImg && file.dataUrl) {
        const img = document.createElement("img");
        img.src = file.dataUrl;
        img.alt = file.name;
        img.style.cssText = "max-width:100%;max-height:55vh;border-radius:10px;object-fit:contain;display:block;margin:0 auto;";
        body.appendChild(img);
    } else if (isVid && file.dataUrl) {
        const vid = document.createElement("video");
        vid.src = file.dataUrl;
        vid.controls = true;
        vid.playsInline = true;
        vid.style.cssText = "max-width:100%;max-height:55vh;border-radius:10px;display:block;margin:0 auto;";
        body.appendChild(vid);
    } else if (file.category === "docx" && file.dataUrl) {
        body.innerHTML = `<div id="cvd-docx-html" style="width:100%;background:#fff;padding:20px;border-radius:8px;font-family:serif;color:#111;text-align:left;overflow-y:auto;max-height:50vh;">Loading document...</div>`;
        if (window.mammoth) {
            const base64 = file.dataUrl.split(",")[1];
            const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
                .then(r => { document.getElementById("cvd-docx-html").innerHTML = r.value || "<p>Document loaded.</p>"; })
                .catch(() => { document.getElementById("cvd-docx-html").innerHTML = "<p>Preview unavailable.</p>"; });
        } else {
            document.getElementById("cvd-docx-html").innerHTML = "<p>DOCX preview library not loaded.</p>";
        }
    } else {
        body.innerHTML = `<div style="text-align:center;padding:32px 20px;">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" style="margin-bottom:12px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            <p style="font-weight:700;font-size:15px;margin-bottom:4px;">${file.name}</p>
            <p style="color:var(--text-secondary);font-size:13px;">${file.dataUrl ? "Preview not available for this file type." : "Binary not available in Firestore — file was too large to sync."}</p>
        </div>`;
    }
};

/** Close the full preview modal. */
window.closeCvdPreview = function () {
    const overlay = document.getElementById("cvd-preview-overlay");
    if (overlay) overlay.style.display = "none";
    document.body.style.overflow = "";
    // Pause any playing video
    const vid = document.querySelector("#cvd-preview-body video");
    if (vid) vid.pause();
};

// ─── QR CODE HISTORY DRAWER ──────────────────────────────────────────────────

/**
 * Fetch up to `limitCount` docs from a Firestore history collection,
 * ordered by createdAt descending. Uses the already-initialised `db` from
 * the top-level dashboard.js import. Rejects if db is not available.
 */
async function _fetchHistoryFromFirestore(collectionName, limitCount = 100) {
    if (!configured || !db) throw new Error("Firebase not configured");
    const { collection: fsCol, getDocs: fsGet, query: fsQuery,
            orderBy: fsOrderBy, limit: fsLimit } =
        await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    const q = fsQuery(
        fsCol(db, collectionName),
        fsOrderBy("createdAt", "desc"),
        fsLimit(limitCount)
    );
    const snap = await fsGet(q);
    const items = [];
    snap.forEach(d => items.push(d.data()));
    return items;
}


function _openDrawer(overlayId, drawerId) {
    const overlay = document.getElementById(overlayId);
    const drawer  = document.getElementById(drawerId);
    if (!overlay || !drawer) return;
    overlay.style.display = "flex";
    requestAnimationFrame(() => requestAnimationFrame(() => {
        drawer.style.transform = "translateY(0)";
    }));
    document.body.style.overflow = "hidden";
}

function _closeDrawer(overlayId, drawerId) {
    const overlay = document.getElementById(overlayId);
    const drawer  = document.getElementById(drawerId);
    if (!drawer) return;
    drawer.style.transform = "translateY(100%)";
    setTimeout(() => {
        if (overlay) overlay.style.display = "none";
        document.body.style.overflow = "";
    }, 360);
}

window.openQrHistoryDrawer = function () {
    _openDrawer("qr-history-drawer-overlay", "qr-history-drawer");
    renderQrHistoryGrid();
};
window.closeQrHistoryDrawer = function () {
    _closeDrawer("qr-history-drawer-overlay", "qr-history-drawer");
};

function renderQrHistoryGrid() {
    const grid  = document.getElementById("qr-history-grid");
    const empty = document.getElementById("qr-history-empty");
    const meta  = document.getElementById("qr-drawer-meta");
    if (!grid) return;

    // Show spinner while loading
    grid.style.display = "grid";
    if (empty) empty.style.display = "none";
    grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>`;

    _fetchHistoryFromFirestore('qr_history', 100)
        .then(items => _renderQrGrid(items, grid, empty, meta))
        .catch(() => {
            // Fallback to localStorage if Firestore fails / not configured
            const items = JSON.parse(localStorage.getItem("enly_qr_history") || "[]");
            _renderQrGrid(items, grid, empty, meta);
        });
}

function _renderQrGrid(items, grid, empty, meta) {
    if (meta) meta.textContent = `${items.length} QR code${items.length !== 1 ? "s" : ""} generated`;

    if (items.length === 0) {
        grid.style.display = "none";
        if (empty) empty.style.display = "flex";
        return;
    }
    grid.style.display = "grid";
    if (empty) empty.style.display = "none";
    grid.innerHTML = "";

    items.forEach(item => {
        const card = document.createElement("div");
        card.style.cssText = "background:var(--bg-tertiary);border-radius:14px;overflow:hidden;border:1px solid var(--card-border);transition:transform 0.15s,box-shadow 0.15s;";
        card.addEventListener("mouseenter", () => { card.style.transform = "translateY(-3px)"; card.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; });
        card.addEventListener("mouseleave", () => { card.style.transform = ""; card.style.boxShadow = ""; });

        const thumbHtml = item.thumbDataUrl
            ? `<img src="${item.thumbDataUrl}" alt="QR Preview" style="width:100%;height:110px;object-fit:contain;display:block;background:#fff;padding:8px;box-sizing:border-box;">`
            : `<div style="width:100%;height:110px;background:rgba(245,158,11,0.08);display:flex;align-items:center;justify-content:center;">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
               </div>`;

        const date = new Date(item.createdAt).toLocaleDateString();
        const shortText = item.dataText && item.dataText.length > 28 ? item.dataText.slice(0, 25) + "…" : (item.dataText || item.filename);

        card.innerHTML = `
            ${thumbHtml}
            <div style="padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.dataText || ''}">${shortText}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${item.format} • ${date}</div>
            </div>`;
        grid.appendChild(card);
    });
}

// ─── DOC CONVERSION HISTORY DRAWER ───────────────────────────────────────────

window.openDocHistoryDrawer = function () {
    _openDrawer("doc-history-drawer-overlay", "doc-history-drawer");
    renderDocHistoryList();
};
window.closeDocHistoryDrawer = function () {
    _closeDrawer("doc-history-drawer-overlay", "doc-history-drawer");
};

function renderDocHistoryList() {
    const list  = document.getElementById("doc-history-list");
    const empty = document.getElementById("doc-history-empty");
    const meta  = document.getElementById("doc-drawer-meta");
    if (!list) return;

    // Show spinner while loading
    list.style.display = "flex";
    if (empty) empty.style.display = "none";
    list.innerHTML = `<div style="display:flex;justify-content:center;padding:40px;width:100%;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>`;

    _fetchHistoryFromFirestore('doc_history', 100)
        .then(items => _renderDocList(items, list, empty, meta))
        .catch(() => {
            const items = JSON.parse(localStorage.getItem("enly_doc_history") || "[]");
            _renderDocList(items, list, empty, meta);
        });
}

function _renderDocList(items, list, empty, meta) {
    if (meta) meta.textContent = `${items.length} conversion${items.length !== 1 ? "s" : ""} recorded`;

    if (items.length === 0) {
        list.style.display = "none";
        if (empty) empty.style.display = "flex";
        return;
    }
    list.style.display = "flex";
    if (empty) empty.style.display = "none";
    list.innerHTML = "";

    items.forEach(item => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--bg-tertiary);border-radius:12px;border:1px solid var(--card-border);transition:background 0.15s;";
        row.addEventListener("mouseenter", () => { row.style.background = "rgba(16,185,129,0.06)"; });
        row.addEventListener("mouseleave", () => { row.style.background = "var(--bg-tertiary)"; });

        const date = new Date(item.createdAt).toLocaleString();
        const baseName = item.name.replace(/\.[^.]+$/, "");

        row.innerHTML = `
            <div style="width:40px;height:40px;background:rgba(16,185,129,0.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.name}">${baseName}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${item.inputExt} → ${item.targetExt}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:10px;font-weight:700;color:#10b981;background:rgba(16,185,129,0.1);padding:3px 8px;border-radius:100px;">${item.targetExt}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${date}</div>
            </div>`;
        list.appendChild(row);
    });
}
