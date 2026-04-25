/**
 * Firebase Configuration Module
 * @module firebase
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration (from environment variables or fallbacks for CI/CD)
export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB-_EMg5Xx8OkkWYhH4gSOt09ejK2kmLrg",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "todo-181b6.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "todo-181b6",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "todo-181b6.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "19269727022",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:19269727022:web:3bccbb2e85d7fdffd140bf",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-SWWK62RZLM"
};

// Validate required config in development
if (import.meta.env.DEV) {
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missing = required.filter(key => !firebaseConfig[key]);
    if (missing.length > 0) {
        console.warn(`⚠️ Firebase config missing: ${missing.join(', ')}. Check your .env file.`);
    }
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with Persistent Cache for Read Optimization
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

// Initialize Auth
export const auth = getAuth(app);

// Initialize Analytics & Performance Monitoring
export const analytics = getAnalytics(app);

import { getPerformance } from 'firebase/performance';
export const perf = getPerformance(app);

// Export app instance
export default app;
