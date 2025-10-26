// Import the functions you need from the SDKs you need
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBrNqcVV1KbMNrtbqZayFZWYy67TRzviPw",
    authDomain: "skillswap-87d7f.firebaseapp.com",
    projectId: "skillswap-87d7f",
    storageBucket: "skillswap-87d7f.firebasestorage.app",
    messagingSenderId: "674145243703",
    appId: "1:674145243703:web:25fce2c41873ac8d5b25b2",
    measurementId: "G-ZR1E4402HK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// --- AUTH SETUP (In-Memory) ---
// This initializes auth without persistence. 
// Users will be logged out when the app closes.
const auth = getAuth(app);
const db = getFirestore(app);


// --- ANALYTICS SETUP ---
// We check if analytics is supported before initializing to prevent crashes.
isSupported().then((supported) => {
  if (supported) {
    const analytics = getAnalytics(app);
  }
});

// Export the initialized auth object for use in other files
export { auth,db };

