import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard Yellow
    primaryBrandText: '#1F2937',
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    lightGray: '#F9FAFB',
    accentGreen: '#10B981',
    accentRed: '#EF4444',
};

// Payment History Item Interface
interface PaymentHistory {
    id: string;
    skillName: string;
    amount: number;
    date: string;
    status: string;
    instructor: string;
    paymentIntentId: string;
    duration?: string;
    serviceFee?: number;
    instructorFee?: number;
}

// Payment History Screen
export default function PaymentHistoryScreen() {
    // State & Hooks
    const { user } = useAuth();
    const router = useRouter();

    // Local State
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [history, setHistory] = useState<PaymentHistory[]>([]); // Payment history data

    // Load payment history on focus
    useFocusEffect( 
        useCallback(() => { // useCallback to memoize(Memoization helps to avoid unnecessary re-creations of the function on each render.) the function.
            loadPaymentHistory();
        }, [])
    );

    // Load Payment History from Firestore
    const loadPaymentHistory = async () => {
        if (!user) return;
        try {
            // Indicate loading state
            setLoading(true);
            const q = query(
                collection(db, 'payments'),
                where('userId', '==', user.uid),
                orderBy('date', 'desc')
            );
            // Fetch data
            const querySnapshot = await getDocs(q);
            const historyData: PaymentHistory[] = [];
            // Process documents
            querySnapshot.forEach((doc) => {
                historyData.push({ id: doc.id, ...doc.data() } as PaymentHistory); // Type assertion to PaymentHistory interface
            });
            setHistory(historyData); // Update state with fetched data
        } catch (error) {
            console.error('Error loading history:', error);
            Alert.alert('Error', 'Failed to load payment history');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Handle pull-to-refresh
    const onRefresh = () => {
        setRefreshing(true);
        loadPaymentHistory(); // Reload payment history
    };

    // Helper: Format Date
    const formatDate = (isoString: string) => {
        const date = new Date(isoString); // Convert ISO string to Date object
        return date.toLocaleDateString(undefined, { // Use user's locale for formatting
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    // Helper: Status Color
    const getStatusColor = (status: string) => { // Determine colors based on payment status
        switch (status.toLowerCase()) {
            case 'completed': return { bg: '#D1FAE5', text: '#065F46' }; // Green
            case 'pending': return { bg: '#FEF3C7', text: '#92400E' }; // Yellow
            case 'failed': return { bg: '#FEE2E2', text: '#991B1B' }; // Red
            default: return { bg: '#F3F4F6', text: '#374151' }; // Gray
        }
    };

    // Show loading indicator while fetching data
    if (loading && !refreshing) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primaryBrand} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        // Main Container
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.push('/(app)/profile')} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Payment History</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Payment History List */}
            <ScrollView
                style={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primaryBrand} />}
                contentContainerStyle={styles.listContent}
            >
                {/* Empty State */}
                {history.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="receipt-outline" size={64} color={COLORS.border} />
                        <Text style={styles.emptyText}>No payments yet</Text>
                        <Text style={styles.emptySubText}>Transactions will appear here.</Text>
                    </View>
                ) : ( // if there is payment history, render each payment card
                    history.map((item) => {
                        const statusStyle = getStatusColor(item.status);
                        return (
                            <View key={item.id} style={styles.card}>
                                {/* Top Row: Skill & Status */}
                                <View style={styles.row}>
                                    <View style={styles.iconBox}>
                                        <Ionicons name="school-outline" size={24} color={COLORS.primaryBrandText} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.skillName}>{item.skillName}</Text>
                                        <Text style={styles.dateText}>{formatDate(item.date)}</Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                                        <Text style={[styles.statusText, { color: statusStyle.text }]}>
                                            {item.status.toUpperCase()}
                                        </Text>
                                    </View>
                                </View>

                                {/* Divider */}
                                <View style={styles.divider} />

                                {/* Details */}
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Instructor</Text>
                                    <Text style={styles.detailValue}>{item.instructor}</Text>
                                </View>
                                
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Amount</Text>
                                    <Text style={styles.amountText}>${item.amount.toFixed(2)}</Text>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// Styles
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.lightGray,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: COLORS.background,
        borderBottomWidth: 1,
        borderColor: COLORS.border,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    content: {
        flex: 1,
    },
    listContent: {
        padding: 20,
        paddingBottom: 40,
    },
    // Card Styles
    card: {
        backgroundColor: COLORS.cardBackground,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    skillName: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 2,
    },
    dateText: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '800',
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.lightGray,
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    detailLabel: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    amountText: {
        fontSize: 18,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    // Empty State
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginTop: 16,
    },
    emptySubText: {
        color: COLORS.textSecondary,
        marginTop: 4,
    },
});