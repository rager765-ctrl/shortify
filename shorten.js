// URL Shortening and QR Code generation logic
import { db, configured } from "./firebase.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast } from "./auth.js";

// Helper to validate URLs
export function isValidUrl(string) {
    try {
        // Simple regex fallback + URL constructor check
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        // If it doesn't have a protocol, test if it looks like a domain + path
        const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+(\/.*)?$/;
        return domainPattern.test(string);
    }
}

// Generate a random short code
export function generateRandomCode(length = 5) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Core function to create a short link
export async function createShortLink(longUrl, customAlias = null) {
    if (!configured) {
        showToast("Firebase is not configured.", "error");
        throw new Error("Firebase not configured");
    }

    // Standardize URL: prepend https:// if it has no protocol
    let finalLongUrl = longUrl.trim();
    if (!/^https?:\/\//i.test(finalLongUrl)) {
        finalLongUrl = "https://" + finalLongUrl;
    }

    if (!isValidUrl(finalLongUrl)) {
        showToast("Please enter a valid URL.", "error");
        throw new Error("Invalid URL");
    }

    let shortCode = customAlias ? customAlias.trim() : "";
    
    if (shortCode) {
        // Validate custom alias format (alphanumeric, dashes, underscores only)
        const aliasPattern = /^[a-zA-Z0-9-_]+$/;
        if (!aliasPattern.test(shortCode)) {
            showToast("Alias can only contain letters, numbers, dashes, and underscores.", "error");
            throw new Error("Invalid alias format");
        }
        
        // Prevent using reserved page names as alias
        const reserved = ["index", "dashboard", "login", "css", "js", "assets"];
        if (reserved.includes(shortCode.toLowerCase())) {
            showToast("This alias is a reserved word. Choose another one.", "error");
            throw new Error("Reserved alias");
        }
        
        // Check if custom alias already exists in Firestore
        const docRef = doc(db, "urls", shortCode);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            showToast("This custom alias is already in use.", "error");
            throw new Error("Alias already in use");
        }
    } else {
        // Generate a random code and ensure it is unique
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 10) {
            shortCode = generateRandomCode(5);
            const docRef = doc(db, "urls", shortCode);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                isUnique = true;
            }
            attempts++;
        }
        
        if (!isUnique) {
            showToast("Failed to generate unique short code. Try again.", "error");
            throw new Error("Unique code generation failed");
        }
    }

    // Save to Firestore
    try {
        const urlRef = doc(db, "urls", shortCode);
        await setDoc(urlRef, {
            shortCode: shortCode,
            longUrl: finalLongUrl,
            clicks: 0,
            active: true,
            createdAt: serverTimestamp()
        });
        
        return {
            shortCode,
            longUrl: finalLongUrl
        };
    } catch (e) {
        console.error("Error creating short link in Firestore:", e);
        showToast("Error creating short link. Check security rules or connection.", "error");
        throw e;
    }
}

// Generate QR Code on the DOM element
export function generateQRCode(elementId, text) {
    const container = document.getElementById(elementId);
    container.innerHTML = ""; // Clear previous
    
    // Instantiate QRCode library (loaded via CDN)
    try {
        if (typeof QRCode !== "undefined") {
            new QRCode(container, {
                text: text,
                width: 180,
                height: 180,
                colorDark: "#0b0f19",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            container.innerHTML = `<span style="color: var(--danger); font-size:12px;">QR Library not loaded</span>`;
        }
    } catch (err) {
        console.error("Error generating QR Code:", err);
        container.innerHTML = `<span style="color: var(--danger); font-size:12px;">QR Error</span>`;
    }
}
