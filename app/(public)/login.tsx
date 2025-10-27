import { Link } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../firebaseConfig';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password.');
            return;
        }
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            // ✅ UPDATE USER STATUS TO ONLINE AND ENSURE friendCount EXISTS
            const userRef = doc(db, 'users', userCredential.user.uid);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                // If user document doesn't exist, create it
                await setDoc(userRef, {
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    displayName: userCredential.user.email || 'User',
                    status: 'online',
                    lastSeen: new Date().toISOString(),
                    friendCount: 0,
                    skillsTeaching: [],
                    skillsLearning: [],
                    createdAt: new Date().toISOString(),
                });
            } else {
                // Update existing user document
                const updateData: any = {
                    status: 'online',
                    lastSeen: new Date().toISOString(),
                };

                // Add friendCount if it doesn't exist
                const userData = userDoc.data();
                if (userData.friendCount === undefined) {
                    updateData.friendCount = 0;
                }

                await setDoc(userRef, updateData, { merge: true });
            }

        } catch (error: any) {
            Alert.alert('Login Failed', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Welcome!</Text>
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
                    title={loading ? 'Logging in...' : 'Login'}
                    onPress={handleLogin}
                    disabled={loading}
                />
                <Link href="/(public)/signup" style={styles.link}>
                    Create an account
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