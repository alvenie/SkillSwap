// ==========================================
// LOGIN SCREEN COMPONENT
// ==========================================
// This is the authentication entry point for existing users.
// Handles Firebase email/password login and automatically updates
// user presence status in Firestore upon successful login.

import { Link } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../firebaseConfig';

export default function Login() {
    // ==========================================
    // STATE MANAGEMENT
    // ==========================================

    // User input fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Loading state - prevents multiple login attempts while processing
    const [loading, setLoading] = useState(false);

    // ==========================================
    // FUNCTION: Handle Login Process
    // ==========================================
    /**
     * CRITICAL: Main authentication flow
     *
     * This function does three important things:
     * 1. Authenticates user with Firebase Auth
     * 2. Creates or updates user document in Firestore
     * 3. Sets user status to 'online' for real-time presence
     *
     * The user document management is crucial for the video chat feature
     * to work properly - it ensures all users have the required fields
     * for presence tracking and friend management.
     */
    const handleLogin = async () => {
        // Basic validation - ensure both fields are filled
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password.');
            return;
        }

        setLoading(true);

        try {
            // STEP 1: Authenticate with Firebase Auth
            // This returns user credentials if login is successful
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            // STEP 2: IMPORTANT - Manage user document in Firestore
            // We need to ensure the user has a proper document with all required fields
            const userRef = doc(db, 'users', userCredential.user.uid);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                // CRITICAL: First-time login or missing user document
                // Create a complete user document with all required fields
                // This ensures compatibility with other features (video chat, friends, etc.)
                await setDoc(userRef, {
                    uid: userCredential.user.uid,                    // Firebase user ID
                    email: userCredential.user.email,                // User's email
                    displayName: userCredential.user.email || 'User', // Default display name
                    status: 'online',                                // Set as online immediately
                    lastSeen: new Date().toISOString(),             // Current timestamp
                    friendCount: 0,                                  // Initialize friend counter
                    skillsTeaching: [],                              // Empty skills array
                    skillsLearning: [],                              // Empty skills array
                    createdAt: new Date().toISOString(),            // Account creation time
                });
            } else {
                // IMPORTANT: User document exists - update status and ensure all fields present
                // We use merge: true to only update specific fields without overwriting the entire document
                const updateData: any = {
                    status: 'online',                    // Mark user as online
                    lastSeen: new Date().toISOString(), // Update last activity timestamp
                };

                // IMPORTANT: Backwards compatibility check
                // Add friendCount field if it doesn't exist (for users created before this field was added)
                // This prevents errors in components that expect this field to exist
                const userData = userDoc.data();
                if (userData.friendCount === undefined) {
                    updateData.friendCount = 0;
                }

                // Merge update - only changes specified fields
                await setDoc(userRef, updateData, { merge: true });
            }

            // Success! The AuthContext will detect the auth state change
            // and automatically navigate the user to the main app

        } catch (error: any) {
            // Handle login errors (wrong password, user not found, network issues, etc.)
            Alert.alert('Login Failed', error.message);
        } finally {
            // Always reset loading state, whether success or failure
            setLoading(false);
        }
    };

    // ==========================================
    // RENDER: Login Form UI
    // ==========================================
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                {/* Welcome header */}
                <Text style={styles.title}>Welcome!</Text>

                {/* Email input field */}
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"          // Prevent auto-capitalization for emails
                    keyboardType="email-address"   // Show email keyboard on mobile
                />

                {/* Password input field */}
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry                // Hide password characters
                />

                {/* Login button - disabled during loading to prevent double submission */}
                <Button
                    title={loading ? 'Logging in...' : 'Login'}
                    onPress={handleLogin}
                    disabled={loading}
                />

                {/* Link to signup screen for new users */}
                <Link href="/(public)/signup" style={styles.link}>
                    Create an account
                </Link>
            </View>
        </SafeAreaView>
    );
}

// ==========================================
// STYLES
// ==========================================
// Simple, clean styling for the login form
// Centered layout with standard form elements
const styles = StyleSheet.create({
    // Main container - fills entire screen
    container: {
        flex: 1,
    },

    // Content wrapper - centers form vertically
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 16,
    },

    // Welcome title
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 24,
    },

    // Input field styling (email and password)
    input: {
        height: 40,
        borderColor: 'gray',
        borderWidth: 1,
        borderRadius: 8,
        marginBottom: 12,
        paddingHorizontal: 8,
    },

    // Signup link styling
    link: {
        marginTop: 16,
        textAlign: 'center',
        color: 'blue',
    },
});