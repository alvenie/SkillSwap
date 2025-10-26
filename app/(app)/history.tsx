import { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

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

export default function PaymentHistoryScreen() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [history, setHistory] = useState<PaymentHistory[]>([]);

    // Reload when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            loadPaymentHistory();
        }, [])
    );

    useEffect(() => {
        loadPaymentHistory();
    }, []);

    const loadPaymentHistory = async () => {
        if (!user) {
            setLoading(false);
            return;
        }

        try {
            console.log('📥 Loading payment history for:', user.uid);

            const paymentsRef = collection(db, 'payments');
            const q = query(
                paymentsRef,
                where('userId', '==', user.uid),
                orderBy('createdAt', 'desc')
            );

            const querySnapshot = await getDocs(q);

            const payments: PaymentHistory[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                payments.push({
                    id: doc.id,
                    skillName: data.skillName,
                    amount: data.amount,
                    date: data.date,
                    status: data.status,
                    instructor: data.instructor,
                    paymentIntentId: data.paymentIntentId,
                    duration: data.duration,
                    serviceFee: data.serviceFee,
                    instructorFee: data.instructorFee,
                });
            });

            console.log('✅ Loaded', payments.length, 'payment(s)');
            setHistory(payments);
        } catch (error: any) {
            console.error('❌ Error loading history:', error);
            if (error.code === 'failed-precondition') {
                Alert.alert(
                    'Database Setup Required',
                    'Please create an index in Firestore. Check the Firebase Console for details.'
                );
            } else {
                Alert.alert('Error', 'Could not load payment history. Please try again.');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadPaymentHistory();
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed':
                return '#4CAF50';
            case 'pending':
                return '#FF9800';
            case 'cancelled':
                return '#F44336';
            case 'refunded':
                return '#9C27B0';
            default:
                return '#666';
        }
    };

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return dateString;
        }
    };

    const handleViewDetails = (payment: PaymentHistory) => {
        Alert.alert(
            'Payment Details',
            `Skill: ${payment.skillName}\n` +
            `Instructor: ${payment.instructor}\n` +
            `Duration: ${payment.duration || 'N/A'}\n\n` +
            `Instructor Fee: $${payment.instructorFee?.toFixed(2) || 'N/A'}\n` +
            `Service Fee: $${payment.serviceFee?.toFixed(2) || 'N/A'}\n` +
            `Total: $${payment.amount.toFixed(2)}\n\n` +
            `Date: ${formatDate(payment.date)}\n` +
            `Payment ID: ${payment.paymentIntentId}\n` +
            `Status: ${payment.status.toUpperCase()}`
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading payment history...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#007AFF"
                    />
                }
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Payment History</Text>
                    <Text style={styles.subtitle}>
                        {history.length} {history.length === 1 ? 'transaction' : 'transactions'}
                    </Text>
                </View>

                {history.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>📋</Text>
                        <Text style={styles.emptyText}>No payment history yet</Text>
                        <Text style={styles.emptySubtext}>
                            Your completed bookings will appear here
                        </Text>
                    </View>
                ) : (
                    history.map((payment) => (
                        <TouchableOpacity
                            key={payment.id}
                            style={styles.paymentCard}
                            onPress={() => handleViewDetails(payment)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.paymentHeader}>
                                <View style={styles.paymentInfo}>
                                    <Text style={styles.skillName}>{payment.skillName}</Text>
                                    <Text style={styles.instructorText}>with {payment.instructor}</Text>
                                </View>
                                <View
                                    style={[
                                        styles.statusBadge,
                                        { backgroundColor: getStatusColor(payment.status) + '20' },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.statusText,
                                            { color: getStatusColor(payment.status) },
                                        ]}
                                    >
                                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.paymentDetails}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>📅 Date:</Text>
                                    <Text style={styles.detailValue}>{formatDate(payment.date)}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>💳 Amount:</Text>
                                    <Text style={styles.amountText}>${payment.amount.toFixed(2)}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>🆔 Payment ID:</Text>
                                    <Text style={styles.transactionId}>
                                        {payment.paymentIntentId.substring(0, 20)}...
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.tapHintContainer}>
                                <Text style={styles.tapHint}>Tap to view full details →</Text>
                            </View>
                        </TouchableOpacity>
                    ))
                )}

                <View style={styles.bottomSpacer} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#666',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    paymentCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    paymentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    paymentInfo: {
        flex: 1,
    },
    skillName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    instructorText: {
        fontSize: 14,
        color: '#666',
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    paymentDetails: {
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        paddingTop: 16,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    detailLabel: {
        fontSize: 14,
        color: '#666',
    },
    detailValue: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    amountText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#007AFF',
    },
    transactionId: {
        fontSize: 12,
        color: '#999',
        fontFamily: 'monospace',
    },
    tapHintContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    tapHint: {
        fontSize: 12,
        color: '#007AFF',
        textAlign: 'center',
        fontStyle: 'italic',
    },
    bottomSpacer: {
        height: 20,
    },
});