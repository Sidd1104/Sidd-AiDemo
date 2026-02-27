import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Firebase configuration
const firebaseConfig = {
    apiKey: atob("QUl6YVN5Q3Q5NDl6QlppOVBtQnRzZk9RcEFXWjFtNTJpZ3laX0I4"),
    authDomain: "sharp-ai-7f0c1.firebaseapp.com",
    projectId: "sharp-ai-7f0c1",
    storageBucket: "sharp-ai-7f0c1.firebasestorage.app",
    messagingSenderId: "838564589705",
    appId: "1:838564589705:web:f0138320a4643ae7d5d658",
    measurementId: "G-QRK5SP38SR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, analytics, auth, db };
