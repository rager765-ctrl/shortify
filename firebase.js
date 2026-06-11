// Firebase initialization and helper functions using modular SDK
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Default configuration with placeholders
const defaultFirebaseConfig = {
    apiKey: "AIzaSyAxM00SZhcWeeh4U9vmFsmSic31MEY25bQ",
    authDomain: "bit-x-f05fa.firebaseapp.com",
    projectId: "bit-x-f05fa",
    storageBucket: "bit-x-f05fa.firebasestorage.app",
    messagingSenderId: "139240716740",
    appId: "1:139240716740:web:756cbc7fe02c7863e1cc91",
    measurementId: "G-XDL7LWKFFR"
};


// Function to check if configuration is customized
function isConfigured(config) {
    return config && 
           config.apiKey && 
           config.apiKey !== "YOUR_API_KEY" && 
           config.projectId && 
           config.projectId !== "YOUR_PROJECT_ID";
}

let activeConfig = { ...defaultFirebaseConfig };
let configured = false;

// If hardcoded config is valid, prioritize it
if (isConfigured(defaultFirebaseConfig)) {
    configured = true;
} else {
    // Check localStorage for runtime configuration first
    const savedConfig = localStorage.getItem("firebase_config");
    if (savedConfig) {
        try {
            const parsed = JSON.parse(savedConfig);
            if (isConfigured(parsed)) {
                activeConfig = parsed;
                configured = true;
            }
        } catch (e) {
            console.error("Error parsing saved Firebase config:", e);
        }
    }
}

// Expose configuration status to the UI
window.firebaseConfigured = configured;

let app;
let auth;
let db;

if (configured) {
    try {
        app = getApps().length === 0 ? initializeApp(activeConfig) : getApp();
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        window.firebaseConfigured = false;
    }
}

export { app, auth, db, configured, activeConfig };

// CUSTOM DISPLAY DOMAIN CONFIGURATION
// To hide your Vercel URL, set this to your custom domain (e.g. "enly.li").
// When set, the system will generate, copy, and link to this domain.
// Note: You must add this custom domain to your Vercel project settings so it points to your app.
// If set to null, the app will dynamically fall back to the current browser domain (window.location.host).
export const CUSTOM_DISPLAY_DOMAIN = null;


// Helper to save dynamic configuration via the UI setup wizard
export function saveFirebaseConfig(newConfig) {
    if (isConfigured(newConfig)) {
        localStorage.setItem("firebase_config", JSON.stringify(newConfig));
        return true;
    }
    return false;
}

export function clearFirebaseConfig() {
    localStorage.removeItem("firebase_config");
    window.location.reload();
}
