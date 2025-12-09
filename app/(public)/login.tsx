import { Link } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../firebaseConfig';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard Yellow
    primaryBrandText: '#1F2937', // Dark Gray
    background: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    inputBg: '#F9FAFB',
    border: '#E5E7EB',
};

// Login Screen Component
export default function Login() {
    // State Variables
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Handle Login Logic
    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password.');
            return;
        }

        setLoading(true);

        try {
            // 1. Authenticate
            const userCredential = await signInWithEmailAndPassword(auth, email, password); // Firebase Auth sign-in

            // 2. Update/Create User Document
            const userRef = doc(db, 'users', userCredential.user.uid);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                // if userDoc doesn't exist, create it
                await setDoc(userRef, {
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    displayName: userCredential.user.email?.split('@')[0] || 'User',
                    status: 'online',
                    lastSeen: new Date().toISOString(),
                    friendCount: 0,
                    skillsTeaching: [],
                    skillsLearning: [],
                    averageRating: 0,    // ADDED FOR REVIEWS
                    reviewCount: 0,      // ADDED FOR REVIEWS
                    createdAt: new Date().toISOString(),
                });
            } else { // else update the status and lastSeen
                const updateData: any = {
                    status: 'online',
                    lastSeen: new Date().toISOString(),
                };

                // Backwards compatibility check
                if (userDoc.data().friendCount === undefined) {
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
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.content}>

                    {/* Logo Section */}
                    <View style={styles.headerContainer}>
                        <Image
                            source={require('../../assets/images/SkillSwap.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.appName}>SkillSwap</Text>
                        <Text style={styles.subtitle}>Welcome back!</Text>
                    </View>

                    {/* Form Section */}
                    <View style={styles.formContainer}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Email</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="name@example.com"
                                placeholderTextColor={COLORS.textSecondary}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Password</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your password"
                                placeholderTextColor={COLORS.textSecondary}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                            />
                        </View>

                        <TouchableOpacity
                            style={styles.loginButton}
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color={COLORS.primaryBrandText} />
                            ) : (
                                <Text style={styles.loginButtonText}>Login</Text>
                            )}
                        </TouchableOpacity>

                        <View style={styles.footer}>
                            <Text style={styles.footerText}>Don't have an account? </Text>
                            <Link href="/(public)/signup" asChild>
                                <TouchableOpacity>
                                    <Text style={styles.linkText}>Sign up</Text>
                                </TouchableOpacity>
                            </Link>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// Styles
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    headerContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logo: {
        width: 80,
        height: 80,
        marginBottom: 16,
    },
    appName: {
        fontSize: 28,
        fontWeight: '800',
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    formContainer: {
        width: '100%',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: COLORS.inputBg,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    loginButton: {
        backgroundColor: COLORS.primaryBrand,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 10,
        marginBottom: 24,
        shadowColor: COLORS.primaryBrand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    loginButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerText: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    linkText: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
});