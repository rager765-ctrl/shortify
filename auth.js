// Authentication and authorization helper logic
import { auth, db, configured } from "./firebase.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    doc, 
    getDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Toast helper
export function showToast(message, type = "success") {
    let container = document.querySelector(".toast-container");
    if (!container) {
        container = document.createElement("div");
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    // Select icon based on type
    let icon = "✓";
    if (type === "error") icon = "✗";
    if (type === "warning") icon = "⚠";
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// Check if current user is admin in Firestore
export async function checkIfAdmin(uid) {
    if (uid === "EuOE2WhCGrbrQqo269ALI7M2dar1") return true;
    if (!configured || !db) return false;
    try {
        const adminRef = doc(db, "admins", uid);
        const adminSnap = await getDoc(adminRef);
        return adminSnap.exists();
    } catch (e) {
        console.error("Error checking admin status:", e);
        return false;
    }
}

// Set up page guard for admin files
export function initAuthGuard(pageType) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const isAdmin = await checkIfAdmin(user.uid);
            if (isAdmin) {
                if (pageType === "login") {
                    window.location.href = "dashboard.html";
                }
            } else {
                // User is authenticated but NOT an admin
                showToast("Access Denied: You are not registered as an administrator.", "error");
                await signOut(auth);
                if (pageType === "dashboard") {
                    window.location.href = "login.html?error=unauthorized";
                }
            }
        } else {
            // Not logged in
            if (pageType === "dashboard") {
                showToast("Please authenticate first. Redirecting to login...", "warning");
                
                // Immediately redirect to auth if they click the toggle or anything else during the glimpse
                const handleImmediateRedirect = () => {
                    window.location.href = "login.html";
                };
                document.body.addEventListener("click", handleImmediateRedirect);
                
                setTimeout(() => {
                    window.location.href = "login.html";
                }, 2500);
            }
        }
    });
}

// Log in function
export async function loginAdmin(email, password) {
    if (!configured) {
        showToast("Firebase is not configured yet.", "error");
        return;
    }
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const isAdmin = await checkIfAdmin(userCredential.user.uid);
        
        if (isAdmin) {
            showToast("Successfully logged in!");
            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1000);
        } else {
            const uid = userCredential.user.uid;
            
            // Render a user-friendly modal overlay to assist with admin bootstrapping
            let authOverlay = document.getElementById("auth-denied-overlay");
            if (!authOverlay) {
                authOverlay = document.createElement("div");
                authOverlay.id = "auth-denied-overlay";
                authOverlay.className = "modal-overlay active";
                authOverlay.innerHTML = `
                    <div class="modal" style="max-width: 480px; z-index: 2000;">
                        <h2 class="modal-title" style="color: var(--danger); display: flex; align-items: center; gap: 10px;">
                            🚫 Access Denied
                        </h2>
                        <p style="margin-bottom: 15px; font-size: 14px; color: var(--text-secondary);">
                            Your account is authenticated, but is not registered in the Firestore database.
                        </p>
                        <div class="form-group">
                            <label class="form-label">Your Administrator UID:</label>
                            <input type="text" id="denied-user-uid" class="form-control" style="font-family: monospace; font-size: 13px;" readonly>
                        </div>
                        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 20px;">
                            Create a document in the <strong>admins</strong> collection on Cloud Firestore using this UID as the Document ID.
                        </p>
                        <div class="d-flex justify-between">
                            <button id="copy-uid-btn" class="btn btn-secondary">Copy UID</button>
                            <button id="close-denied-btn" class="btn btn-primary">Okay</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(authOverlay);
                
                document.getElementById("copy-uid-btn").addEventListener("click", () => {
                    const uidInput = document.getElementById("denied-user-uid");
                    uidInput.select();
                    navigator.clipboard.writeText(uidInput.value);
                    showToast("UID copied to clipboard!");
                });
                
                document.getElementById("close-denied-btn").addEventListener("click", () => {
                    authOverlay.classList.remove("active");
                });
            }
            
            document.getElementById("denied-user-uid").value = uid;
            authOverlay.classList.add("active");
            
            showToast("Access Denied: Not registered as administrator.", "error");
            await signOut(auth);
        }
    } catch (error) {
        console.error("Login error:", error);
        showToast("Access Denied", "error");
    }
}

// Log out function
export async function logoutAdmin() {
    if (!configured) return;
    try {
        await signOut(auth);
        showToast("Logged out successfully.");
        setTimeout(() => {
            window.location.href = "index.html";
        }, 1000);
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Failed to log out.", "error");
    }
}

// Dynamic Firebase Setup Overlay UI
export function showConfigOverlay() {
    // Avoid double rendering
    if (document.getElementById("config-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "config-overlay";
    overlay.className = "modal-overlay active";
    overlay.innerHTML = `
        <div class="modal" style="max-width: 550px;">
            <h2 class="modal-title" style="color: var(--warning); display: flex; align-items: center; gap: 10px;">
                ⚙️ Setup Firebase Configuration
            </h2>
            <p style="margin-bottom: 15px; font-size: 14px; color: var(--text-secondary);">
                To run this URL shortener, please paste your Firebase Web App credentials below. You can find this in your Firebase Console under Project Settings > General > Web Apps.
            </p>
            
            <div class="form-group">
                <label class="form-label">Firebase Config JSON or Object</label>
                <textarea id="config-json-input" class="form-control" rows="8" placeholder='{\n  "apiKey": "AIzaSy...",\n  "authDomain": "...",\n  "projectId": "...",\n  "storageBucket": "...",\n  "messagingSenderId": "...",\n  "appId": "..."\n}' style="font-family: monospace; font-size: 13px;"></textarea>
            </div>
            
            <div class="d-flex justify-between align-center" style="margin-top: 20px;">
                <span style="font-size: 12px; color: var(--text-muted);">
                    Config will be saved locally in your browser.
                </span>
                <button id="save-config-btn" class="btn btn-primary">Save Configuration</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);

    document.getElementById("save-config-btn").addEventListener("click", () => {
        const inputVal = document.getElementById("config-json-input").value.trim();
        if (!inputVal) {
            alert("Please paste a valid JSON configuration!");
            return;
        }

        try {
            // Clean up code snippets if the user copied standard config code
            let cleanedJSON = inputVal;
            if (inputVal.includes("const firebaseConfig =")) {
                cleanedJSON = inputVal.split("const firebaseConfig =")[1].split(";")[0].trim();
            }
            
            // Support JS-like objects (unquoted keys) by parsing gently or using evaluation
            // For safety, we can attempt standard JSON parse, and fallback to regex-based JSON parser
            let configObj;
            try {
                configObj = JSON.parse(cleanedJSON);
            } catch {
                // Fallback parsing for common JS object formats
                const jsonString = cleanedJSON
                    .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Quote unquoted keys
                    .replace(/'/g, '"') // Replace single quotes with double
                    .replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas
                configObj = JSON.parse(jsonString);
            }

            if (configObj.apiKey && configObj.projectId) {
                localStorage.setItem("firebase_config", JSON.stringify(configObj));
                alert("Configuration saved successfully! Reloading page...");
                window.location.reload();
            } else {
                alert("Invalid Firebase config. Ensure it includes apiKey and projectId.");
            }
        } catch (err) {
            console.error("Config parse error:", err);
            alert("Error parsing config. Make sure it's valid JSON format (keys and values in double quotes).");
        }
    });
}

// Real-time listener for Event Badge and Page visibility controls
if (configured && db) {
    try {
        let badgePageEnabled = true;
        let currentUserIsAdmin = false;
        
        let shortenerMobileVisible = false; // default false
        let qrMobileVisible = true;        // default true
        let badgeMobileVisible = true;     // default true
        let aboutMobileVisible = true;     // default true

        const evaluatePageVisibility = () => {
            // 1. Update all Event Badge links in the navbars/headers (nav-link only)
            const badgeLinks = document.querySelectorAll('a.nav-link[href="badge-generator.html"]');
            badgeLinks.forEach(link => {
                if (badgePageEnabled || currentUserIsAdmin) {
                    link.classList.remove("badge-link-hidden");
                    if (badgeMobileVisible) {
                        link.classList.remove("mobile-hidden");
                    } else {
                        link.classList.add("mobile-hidden");
                    }
                } else {
                    link.classList.add("badge-link-hidden");
                }
            });

            // 2. Update Shortener links (nav-link only to avoid hiding the logo or return buttons)
            const shortenerLinks = document.querySelectorAll('a.nav-link[href="index.html"]');
            shortenerLinks.forEach(link => {
                if (shortenerMobileVisible) {
                    link.classList.remove("mobile-hidden");
                } else {
                    link.classList.add("mobile-hidden");
                }
            });

            // 3. Update Custom QR links (nav-link only)
            const qrLinks = document.querySelectorAll('a.nav-link[href="qr-generator.html"]');
            qrLinks.forEach(link => {
                if (qrMobileVisible) {
                    link.classList.remove("mobile-hidden");
                } else {
                    link.classList.add("mobile-hidden");
                }
            });

            // 4. Update About links (nav-link only)
            const aboutLinks = document.querySelectorAll('a.nav-link[href="about.html"]');
            aboutLinks.forEach(link => {
                if (aboutMobileVisible) {
                    link.classList.remove("mobile-hidden");
                } else {
                    link.classList.add("mobile-hidden");
                }
            });
            
            // 5. If we are on the badge-generator page itself, handle deactivated state
            if (window.location.pathname.includes("badge-generator")) {
                let overlay = document.getElementById("badge-deactivated-overlay");
                const shouldHideContent = !badgePageEnabled && !currentUserIsAdmin;

                if (shouldHideContent) {
                    // Page is deactivated. Show overlay if not already shown
                    if (!overlay) {
                        overlay = document.createElement("div");
                        overlay.id = "badge-deactivated-overlay";
                        overlay.style.position = "fixed";
                        overlay.style.top = "0";
                        overlay.style.left = "0";
                        overlay.style.right = "0";
                        overlay.style.bottom = "0";
                        overlay.style.background = "rgba(11, 15, 25, 0.9)";
                        overlay.style.backdropFilter = "blur(16px)";
                        overlay.style.webkitBackdropFilter = "blur(16px)";
                        overlay.style.display = "flex";
                        overlay.style.alignItems = "center";
                        overlay.style.justifyContent = "center";
                        overlay.style.zIndex = "99999";
                        overlay.style.padding = "20px";
                        overlay.style.animation = "fadeIn 0.3s ease-out forwards";
                        
                        overlay.innerHTML = `
                            <div class="card" style="max-width: 480px; width: 100%; text-align: center; padding: 40px 30px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border: 1px solid var(--card-border); background: var(--bg-secondary);">
                                <div style="width: 64px; height: 64px; background: rgba(239, 68, 68, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; color: var(--danger);">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                    </svg>
                                </div>
                                <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 12px; color: var(--text-primary); font-family: 'Outfit', sans-serif;">
                                    Feature Deactivated
                                </h2>
                                <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 25px;">
                                    The Event Badge Creator page has been temporarily deactivated by the system administrator. Please check back later.
                                </p>
                                <a href="index.html" class="btn btn-primary" style="display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; text-decoration: none; font-weight: 600; border-radius: var(--radius-md);">
                                    Return to Homepage
                                </a>
                            </div>
                        `;
                        document.body.appendChild(overlay);
                        
                        // Disable interactions in page background
                        document.body.style.overflow = "hidden";
                    }
                } else {
                    // Page is enabled or user is admin. Remove overlay if it exists
                    if (overlay) {
                        overlay.remove();
                        document.body.style.overflow = "";
                    }
                }
            }
        };

        // Listen for Firebase auth state changes to dynamically check admin access
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserIsAdmin = await checkIfAdmin(user.uid);
            } else {
                currentUserIsAdmin = false;
            }
            evaluatePageVisibility();
        });

        // Listen for Firestore config updates
        const featuresDocRef = doc(db, "config", "features");
        onSnapshot(featuresDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                badgePageEnabled = data.badgePageEnabled !== false;
                shortenerMobileVisible = data.shortenerMobileVisible === true;
                qrMobileVisible = data.qrMobileVisible !== false;
                badgeMobileVisible = data.badgeMobileVisible !== false;
                aboutMobileVisible = data.aboutMobileVisible !== false;
            } else {
                badgePageEnabled = true;
                shortenerMobileVisible = false;
                qrMobileVisible = true;
                badgeMobileVisible = true;
                aboutMobileVisible = true;
            }
            evaluatePageVisibility();
        }, (error) => {
            console.error("Error listening to features config:", error);
        });

    } catch (e) {
        console.error("Failed to initialize feature config listener:", e);
    }
}
