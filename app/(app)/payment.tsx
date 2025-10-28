import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import { useAuth } from '../../context/AuthContext';
import { paymentService } from '../../services/apiService';
import { db } from '../../firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

export default function PaymentScreen() {
    // Getting all the skill details passed from the previous screen
    const params = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const { initPaymentSheet, presentPaymentSheet } = useStripe();

    const [loading, setLoading] = useState(false);

    // Parse the booking details - using defaults in case something's missing
    const skillName = (params.skillName as string) || 'Skill Session';
    const skillPrice = parseFloat((params.skillPrice as string) || '50');
    const skillDuration = (params.skillDuration as string) || '1 hour';
    const instructor = (params.instructor as string) || 'Instructor';

    // Calculate the total - we charge 5% platform fee
    const serviceFee = skillPrice * 0.05;
    const totalAmount = skillPrice + serviceFee;

    // This is where all the payment magic happens
    const handleCreatePayment = async () => {
        // Make sure user is logged in first
        if (!user) {
            Alert.alert('Error', 'You must be logged in to make a payment');
            return;
        }

        setLoading(true);
        console.log('\n🚀 ========== PAYMENT FLOW START ==========');

        try {
            // STEP 1: Create a Stripe customer (optional but good for record keeping)
            let customerId: string | undefined;
            try {
                console.log('👤 Step 1: Creating customer...');
                const customer = await paymentService.createCustomer(
                    user.email || '',
                    user.displayName || user.email || 'User',
                    { firebaseUid: user.uid }
                );
                customerId = customer.customerId || customer.CustomerId;
                console.log('✅ Customer ID:', customerId);
            } catch (error: any) {
                // If customer creation fails, that's okay - we can still process payment
                console.log('⚠️ Customer creation skipped:', error.message);
            }

            // STEP 2: Create the payment intent on our backend
            // This is the most important part - it generates the secret we need for Stripe
            console.log('\n💳 Step 2: Creating payment intent...');
            console.log('   Amount:', totalAmount);
            console.log('   Currency: usd');

            const paymentData = await paymentService.createPaymentIntent(
                totalAmount,
                'usd',
                `${skillName} - ${skillDuration}`,
                customerId
            );

            console.log('\n📦 Payment Intent Response:');
            console.log('   Payment Intent ID:', paymentData.paymentIntentId);
            console.log('   Client Secret (length):', paymentData.clientSecret?.length);
            console.log('   Client Secret (starts with):', paymentData.clientSecret?.substring(0, 10));

            // Validate we got everything we need from the backend
            if (!paymentData.clientSecret) {
                console.error('❌ ERROR: No client secret!');
                Alert.alert('Error', 'Server did not return a payment secret');
                setLoading(false);
                return;
            }

            if (!paymentData.paymentIntentId) {
                console.error('❌ ERROR: No payment intent ID!');
                Alert.alert('Error', 'Server did not return a payment ID');
                setLoading(false);
                return;
            }

            // Double-check the client secret format - should start with "pi_"
            if (!paymentData.clientSecret.startsWith('pi_')) {
                console.error('❌ ERROR: Invalid client secret format!');
                console.error('   Expected to start with "pi_", got:', paymentData.clientSecret.substring(0, 10));
                Alert.alert('Error', 'Invalid payment secret format');
                setLoading(false);
                return;
            }

            console.log('✅ Payment intent validated');

            // STEP 3: Set up the Stripe payment sheet
            console.log('\n🔧 Step 3: Initializing Stripe Payment Sheet...');

            const initResult = await initPaymentSheet({
                merchantDisplayName: 'SkillSwap',
                paymentIntentClientSecret: paymentData.clientSecret,
                // Pre-fill user info to make checkout faster
                defaultBillingDetails: {
                    name: user.displayName || user.email || 'User',
                    email: user.email || '',
                },
                appearance: {
                    colors: {
                        primary: '#007AFF',
                    },
                },
            });

            if (initResult.error) {
                console.error('❌ Payment Sheet Init Error:');
                console.error('   Code:', initResult.error.code);
                console.error('   Message:', initResult.error.message);
                Alert.alert('Error', `Cannot initialize payment: ${initResult.error.message}`);
                setLoading(false);
                return;
            }

            console.log('✅ Payment sheet initialized successfully');
            setLoading(false);

            // STEP 4: Show the payment sheet to the user
            console.log('\n📱 Step 4: Presenting payment sheet...');

            const presentResult = await presentPaymentSheet();

            // Handle what happens after user interacts with payment sheet
            if (presentResult.error) {
                if (presentResult.error.code === 'Canceled') {
                    // User just backed out - no big deal
                    console.log('ℹ️ User cancelled payment');
                    Alert.alert('Cancelled', 'Payment was cancelled');
                } else {
                    // Something went wrong with the payment
                    console.error('❌ Payment Error:');
                    console.error('   Code:', presentResult.error.code);
                    console.error('   Message:', presentResult.error.message);
                    Alert.alert('Payment Failed', presentResult.error.message);
                }
            } else {
                // Success! Payment went through 🎉
                console.log('🎉 ========== PAYMENT SUCCESS ==========\n');

                // STEP 5: Save the payment to our database for record keeping
                try {
                    console.log('💾 Saving payment to history...');
                    await addDoc(collection(db, 'payments'), {
                        userId: user.uid,
                        userEmail: user.email,
                        userName: user.displayName || user.email,
                        skillName: skillName,
                        instructor: instructor,
                        amount: totalAmount,
                        currency: 'usd',
                        paymentIntentId: paymentData.paymentIntentId,
                        status: 'completed',
                        date: new Date().toISOString(),
                        duration: skillDuration,
                        serviceFee: serviceFee,
                        instructorFee: skillPrice,
                        createdAt: new Date(),
                    });
                    console.log('✅ Payment saved to history');
                } catch (error: any) {
                    // If saving fails, just log it - payment already succeeded so user is good
                    console.error('⚠️ Could not save payment to history:', error);
                }

                // Show success message with options to view history or go home
                Alert.alert(
                    'Payment Successful! 🎉',
                    `Booking confirmed!\n\nSkill: ${skillName}\nInstructor: ${instructor}\nAmount: $${totalAmount.toFixed(2)}\n\nPayment ID: ${paymentData.paymentIntentId.substring(0, 20)}...`,
                    [
                        {
                            text: 'View History',
                            onPress: () => router.push('/history'),
                        },
                        {
                            text: 'Done',
                            onPress: () => router.replace('/'),
                        },
                    ]
                );
            }
        } catch (error: any) {
            // Catch any unexpected errors and show to user
            console.error('\n❌ ========== PAYMENT ERROR ==========');
            console.error('Error:', error);
            console.error('Message:', error.message);
            console.error('Response:', error.response?.data);
            console.error('==========================================\n');

            Alert.alert(
                'Error',
                error.response?.data?.message || error.message || 'Payment failed. Please try again.'
            );
        } finally {
            // Always turn off loading spinner
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Confirm Booking</Text>
                    <Text style={styles.subtitle}>Review your payment details</Text>
                </View>

                {/* Booking details card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Booking Details</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Skill:</Text>
                        <Text style={styles.value}>{skillName}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Instructor:</Text>
                        <Text style={styles.value}>{instructor}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Duration:</Text>
                        <Text style={styles.value}>{skillDuration}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Instructor Fee:</Text>
                        <Text style={styles.value}>${skillPrice.toFixed(2)}</Text>
                    </View>
                </View>

                {/* Payment breakdown card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Payment Summary</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Subtotal:</Text>
                        <Text style={styles.value}>${skillPrice.toFixed(2)}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Service Fee (5%):</Text>
                        <Text style={styles.value}>${serviceFee.toFixed(2)}</Text>
                    </View>
                    {/* Total amount - most important number */}
                    <View style={[styles.row, styles.totalRow]}>
                        <Text style={styles.totalLabel}>Total:</Text>
                        <Text style={styles.totalValue}>${totalAmount.toFixed(2)}</Text>
                    </View>
                </View>

                {/* Trust badges */}
                <View style={styles.infoCard}>
                    <Text style={styles.infoText}>💳 Secure payment via Stripe</Text>
                    <Text style={styles.infoText}>🔒 Encrypted & safe</Text>
                    <Text style={styles.infoText}>✅ Refund within 24 hours</Text>
                </View>

                {/* Test card info - remove this in production! */}
                <View style={styles.testCardInfo}>
                    <Text style={styles.testCardTitle}>🧪 Test Card (Development)</Text>
                    <Text style={styles.testCardText}>Card: 4242 4242 4242 4242</Text>
                    <Text style={styles.testCardText}>Expiry: 12/25 | CVC: 123 | ZIP: 12345</Text>
                </View>
            </ScrollView>

            {/* Action buttons at the bottom */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={() => router.back()}
                    disabled={loading}
                >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>

                {/* Main payment button - shows spinner when processing */}
                <TouchableOpacity
                    style={[styles.button, styles.primaryButton, loading && styles.disabledButton]}
                    onPress={handleCreatePayment}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.primaryButtonText}>
                            Pay ${totalAmount.toFixed(2)}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
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
    // White cards with subtle shadow
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    label: {
        fontSize: 16,
        color: '#666',
    },
    value: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500',
        textAlign: 'right',
        flex: 1,
        marginLeft: 16,
    },
    // Separates the total from other rows
    totalRow: {
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        marginTop: 8,
        paddingTop: 16,
    },
    totalLabel: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    // Big blue total - this is what they're paying
    totalValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#007AFF',
    },
    infoCard: {
        backgroundColor: '#E3F2FD',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    infoText: {
        fontSize: 14,
        color: '#1976D2',
        marginBottom: 8,
    },
    // Orange warning card for test mode
    testCardInfo: {
        backgroundColor: '#FFF3E0',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#FFB74D',
    },
    testCardTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#F57C00',
        marginBottom: 8,
    },
    testCardText: {
        fontSize: 13,
        color: '#E65100',
        fontFamily: 'monospace',
        marginBottom: 4,
    },
    footer: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    button: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButton: {
        backgroundColor: '#007AFF',
    },
    secondaryButton: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    disabledButton: {
        opacity: 0.6,
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    secondaryButtonText: {
        color: '#007AFF',
        fontSize: 18,
        fontWeight: '600',
    },
});