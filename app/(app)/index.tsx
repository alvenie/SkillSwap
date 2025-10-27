import React from 'react';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { Alert, StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../firebaseConfig';

export default function HomeScreen() {
    const { user } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        Alert.alert('Sign Out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await signOut(auth);
                    } catch (error: any) {
                        Alert.alert('Error', error.message);
                    }
                },
            },
        ]);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Welcome!</Text>
                    {user && <Text style={styles.emailText}>{user.email}</Text>}
                </View>
                <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
                <Text style={styles.title}>Skills Marketplace</Text>

                {/* Payment History */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => router.push('./history')}
                >
                    <Text style={styles.cardIcon}>💳</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Payment History</Text>
                        <Text style={styles.cardSubtitle}>View transactions</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                </TouchableOpacity>

                {/* My Skills */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => router.push('./manage-skills')}
                >
                    <Text style={styles.cardIcon}>📚</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>My Skills</Text>
                        <Text style={styles.cardSubtitle}>Add & manage</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                </TouchableOpacity>

                {/* Browse Skills */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => router.push('./browse-skills')}
                >
                    <Text style={styles.cardIcon}>🎯</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Browse Skills</Text>
                        <Text style={styles.cardSubtitle}>Book lessons</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: 60,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    welcomeText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
    },
    emailText: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    signOutButton: {
        backgroundColor: '#ff3b30',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    signOutText: {
        color: '#fff',
        fontWeight: '600',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 20,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
    },
    cardIcon: {
        fontSize: 32,
        marginRight: 16,
    },
    cardText: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    cardSubtitle: {
        fontSize: 14,
        color: '#666',
    },
    arrow: {
        fontSize: 20,
        color: '#007AFF',
        fontWeight: 'bold',
    },
});