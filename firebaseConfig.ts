import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";



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

// Initialize Auth (this is fine without AsyncStorage for web)
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Analytics
isSupported().then((supported) => {
    if (supported) {
        const analytics = getAnalytics(app);
    }
});

// Export the initialized auth and db objects for use in other files
export { auth, db };