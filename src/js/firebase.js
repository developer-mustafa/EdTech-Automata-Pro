/**
 * Firebase Configuration Module
 * @module firebase
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase configuration (from environment variables or fallbacks for CI/CD)
export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
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

// Lazy-load Analytics & Performance Monitoring
export let analytics = null;
export let perf = null;

if (typeof window !== 'undefined') {
    Promise.all([
        import('firebase/analytics'),
        import('firebase/performance')
    ]).then(([{ getAnalytics }, { getPerformance }]) => {
        analytics = getAnalytics(app);
        perf = getPerformance(app);
    }).catch(err => console.warn('Non-critical: Firebase Analytics/Performance failed to load', err));
}

// Export app instance
export default app;
