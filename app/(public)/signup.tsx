// SignUp Screen - handles new user registration
// Creates Firebase Auth account and initializes Firestore user document

import { Link } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../firebaseConfig';

export default function SignUp() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    /**
     * IMPORTANT: Creates new user account and initializes their Firestore profile
     *
     * Two-step process:
     * 1. Create Firebase Auth account (for authentication)
     * 2. Create Firestore document (for user data & presence tracking)
     *
     * All fields are initialized here to prevent undefined errors in other components
     */
    const handleSignUp = async () => {
        // Basic validation
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password.');
            return;
        }

        setLoading(true);
        try {
            // Create Firebase authentication account
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            // CRITICAL: Create user document with all required fields
            // This is essential for video chat, friends, and skills features to work
            await setDoc(doc(db, 'users', userCredential.user.uid), {
                uid: userCredential.user.uid,
                email: userCredential.user.email,
                displayName: userCredential.user.email || 'User',
                status: 'online',                        // Set as online immediately
                lastSeen: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                friendCount: 0,                          // Initialize for friend tracking
                skillsTeaching: [],                      // Empty skills arrays
                skillsLearning: [],
            });

            Alert.alert('Success', 'Account created successfully!');
        } catch (error: any) {
            // Handle errors (email already exists, weak password, etc.)
            Alert.alert('Sign Up Failed', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Create Account</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <Button
                    title={loading ? 'Creating Account...' : 'Sign Up'}
                    onPress={handleSignUp}
                    disabled={loading}
                />

                <Link href="/(public)/login" style={styles.link}>
                    Go to Login
                </Link>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 24,
    },
    input: {
        height: 40,
        borderColor: 'gray',
        borderWidth: 1,
        borderRadius: 8,
        marginBottom: 12,
        paddingHorizontal: 8,
    },
    link: {
        marginTop: 16,
        textAlign: 'center',
        color: 'blue',
    },
});