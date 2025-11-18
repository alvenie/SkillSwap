import React from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';

// main home screen with navigation to all app features
export default function HomeScreen() {
    const { user } = useAuth();
    const router = useRouter();

    return (
        <View style={styles.container}>
            {/* header with welcome message and sign out */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Welcome!</Text>
                    {user && <Text style={styles.emailText}>{user.email}</Text>}
                </View>
            </View>

            <ScrollView style={styles.content}>
                <Text style={styles.title}>Skills Marketplace</Text>

                {/* navigation cards for main app features */}

                {/* skills section - browse and manage skills */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => router.push('/(app)/skills')}
                >
                    <Text style={styles.cardIcon}>🎯</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Skills</Text>
                        <Text style={styles.cardSubtitle}>Browse & manage skills</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                </TouchableOpacity>

                {/* messaging feature */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => router.push('/(app)/chat-list')}
                >
                    <Text style={styles.cardIcon}>💬</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Messages</Text>
                        <Text style={styles.cardSubtitle}>Chat with friends</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                </TouchableOpacity>

                {/* payment history */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => router.push('/(app)/history')}
                >
                    <Text style={styles.cardIcon}>💳</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Payment History</Text>
                        <Text style={styles.cardSubtitle}>View transactions</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                </TouchableOpacity>

                {/* video calling feature */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => router.push('/(app)/video-chat')}
                >
                    <Text style={styles.cardIcon}>📹</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Video Chat</Text>
                        <Text style={styles.cardSubtitle}>Call other users</Text>
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