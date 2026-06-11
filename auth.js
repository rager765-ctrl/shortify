// Authentication and authorization helper logic
import { auth, db, configured } from "./firebase.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    doc, 
    getDoc 
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
                window.location.href = "login.html";
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
