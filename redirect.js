// Redirection handler logic for short codes
import { db, configured } from "./firebase.js";
import { 
    doc, 
    getDoc, 
    updateDoc, 
    increment, 
    collection, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast } from "./auth.js";

// Helper to hash IP address for security & analytics privacy
async function getIPHash() {
    try {
        const response = await fetch("https://api.ipify.org?format=json");
        if (!response.ok) throw new Error("IP fetch failed");
        const data = await response.json();
        const ip = data.ip || "unknown";
        
        // Simple hash calculation
        let hash = 0;
        for (let i = 0; i < ip.length; i++) {
            const char = ip.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    } catch (e) {
        console.warn("Could not retrieve IP address for hashing:", e);
        return "anonymous_" + Math.random().toString(36).substring(2, 8);
    }
}

// Main check function to see if we should redirect
export async function checkRedirect() {
    // 1. Determine if a short code is present
    // Check hash first (e.g. #H3Nb09 or #/H3Nb09)
    let hashCode = window.location.hash.replace(/^#\/?/, "").trim();
    if (hashCode.includes("?")) {
        hashCode = hashCode.split("?")[0];
    }
    
    const path = window.location.pathname.replace(/^\/|\/$/g, "");
    
    // Check url search params for c=... or code=...
    const urlParams = new URLSearchParams(window.location.search);
    const queryCode = urlParams.get("c") || urlParams.get("code");
    
    const reservedPaths = ["index.html", "dashboard.html", "login.html", "signup.html", "css", "js", "assets"];
    const isStaticFile = path.includes(".") || reservedPaths.some(p => path.startsWith(p));
    
    const shortCode = hashCode || queryCode || (path && !isStaticFile ? path : null);
    
    if (!shortCode) {
        // No redirect needed, display the normal shorten interface
        return false;
    }
    
    // Show redirect loading screen
    document.getElementById("shortener-interface").style.display = "none";
    const redirectLoading = document.getElementById("redirect-loading");
    redirectLoading.style.display = "flex";
    document.getElementById("redirect-code-display").innerText = shortCode;
    
    if (!configured) {
        document.getElementById("redirect-status-message").innerHTML = 
            `Firebase is not configured yet. Set up the config in the <a href="login.html" style="color: var(--primary);">Admin Login</a> first.`;
        return true;
    }
    
    try {
        // 2. Query Firestore for this shortCode
        const docRef = doc(db, "urls", shortCode);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Extract target URL and domain for link preview details
            let targetUrl = data.longUrl;
            if (!/^https?:\/\//i.test(targetUrl)) {
                targetUrl = "https://" + targetUrl;
            }
            let domain = "";
            try {
                domain = new URL(targetUrl).hostname;
            } catch (e) {
                domain = targetUrl;
            }

            // Update page header info & metadata preview on redirect
            document.title = `Redirecting to ${domain} | Enly`;
            
            const metaDesc = document.getElementById("meta-description");
            if (metaDesc) metaDesc.setAttribute("content", `Redirecting you to ${targetUrl}.`);
            
            const ogTitle = document.getElementById("og-title");
            if (ogTitle) ogTitle.setAttribute("content", `Redirecting to ${domain}`);
            
            const ogDesc = document.getElementById("og-description");
            if (ogDesc) ogDesc.setAttribute("content", `Shortened URL redirection to ${targetUrl} via Enly.`);
            
            // Check if active
            if (data.active !== false) {
                document.getElementById("redirect-status-message").innerText = "Redirecting you now...";
                
                // Fetch IP hash for click logs
                const ipHash = await getIPHash();
                
                // 3. Record click in clicks collection
                const clickRef = collection(db, "clicks");
                await addDoc(clickRef, {
                    shortCode: shortCode,
                    timestamp: serverTimestamp(),
                    ipHash: ipHash
                });
                
                // 4. Increment clicks count in the URL document
                await updateDoc(docRef, {
                    clicks: increment(1)
                });
                
                // 5. Navigate to original long URL
                window.location.replace(targetUrl);
            } else {
                document.getElementById("redirect-status-message").innerHTML = 
                    `<span style="color: var(--danger);">This short link has been disabled by the administrator.</span><br><br><a href="index.html" class="btn btn-secondary mt-4">Go to Shortener</a>`;
            }
        } else {
            // Short code not found
            document.getElementById("redirect-status-message").innerHTML = 
                `<span style="color: var(--danger);">The short link <strong>${shortCode}</strong> could not be found.</span><br><br><a href="index.html" class="btn btn-secondary mt-4">Go to Shortener</a>`;
        }
    } catch (error) {
        console.error("Redirection error:", error);
        document.getElementById("redirect-status-message").innerHTML = 
            `<span style="color: var(--danger);">An error occurred during redirection.</span><br><br><a href="index.html" class="btn btn-secondary mt-4">Go to Shortener</a>`;
    }
    
    return true;
}
