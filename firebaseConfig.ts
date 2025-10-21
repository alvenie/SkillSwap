// Import the functions you need from the SDKs you need
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.GOOGLE_API,
  authDomain: "skillswap-9d20a.firebaseapp.com",
  projectId: "skillswap-9d20a",
  storageBucket: "skillswap-9d20a.firebasestorage.app",
  messagingSenderId: "578599998895",
  appId: "1:578599998895:web:2a55c185c8ded5881a8b5a",
  measurementId: "G-92W0G4EK6L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// --- AUTH SETUP (In-Memory) ---
// This initializes auth without persistence. 
// Users will be logged out when the app closes.
const auth = getAuth(app);


// --- ANALYTICS SETUP ---
// We check if analytics is supported before initializing to prevent crashes.
isSupported().then((supported) => {
  if (supported) {
    const analytics = getAnalytics(app);
  }
});

// Export the initialized auth object for use in other files
export { auth };

