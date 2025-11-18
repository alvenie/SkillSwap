import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    Timestamp,
} from 'firebase/firestore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { generateConversationId } from '../../utils/conversationUtils';
import { useStripe } from '@stripe/stripe-react-native';
import { paymentService } from '../../services/apiService';

// Message types
interface BaseMessage {
    id: string;
    senderId: string;
    senderName: string;
    timestamp: any;
    read: boolean;
    //added for meetup requests
    type?: 'text' | 'meetup';
    meetupData?: {
        accepted?: boolean;
    };
}

interface TextMessage extends BaseMessage {
    type: 'text';
    text: string;
}

interface PaymentRequestMessage extends BaseMessage {
    type: 'payment_request';
    amount: number;
    description: string;
    status: 'pending' | 'paid' | 'declined' | 'cancelled';
    paymentIntentId?: string;
}

type Message = TextMessage | PaymentRequestMessage;

export default function ChatRoomScreen() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { initPaymentSheet, presentPaymentSheet } = useStripe();

    const otherUserId = params.otherUserId as string;
    const otherUserName = params.otherUserName as string;

    // Chat state
    const [conversationId, setConversationId] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageText, setMessageText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [conversationReady, setConversationReady] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Payment request modal state
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDescription, setPaymentDescription] = useState('');
    const [sendingPaymentRequest, setSendingPaymentRequest] = useState(false);

    // Processing payment
    const [processingPayment, setProcessingPayment] = useState<string | null>(null);

    const hasShownAuthError = useRef(false);
    const hasShownParamsError = useRef(false);
    const isInitializing = useRef(false);

    // Generate conversation ID
    useEffect(() => {
        if (authLoading || !user) return;
        const paramConversationId = params.conversationId as string;
        const finalConversationId = paramConversationId || generateConversationId(user.uid, otherUserId);
        setConversationId(finalConversationId);
    }, [authLoading, user, otherUserId, params.conversationId]);

    // Validate and initialize
    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            if (!hasShownAuthError.current) {
                hasShownAuthError.current = true;
                Alert.alert('Error', 'Please login to access messages', [
                    { text: 'OK', onPress: () => router.replace('/(public)/login') }
                ]);
            }
            return;
        }

        if (!otherUserId) {
            if (!hasShownParamsError.current) {
                hasShownParamsError.current = true;
                Alert.alert('Error', 'Invalid conversation', [
                    { text: 'OK', onPress: () => {
                            if (router.canGoBack()) {
                                router.back();
                            } else {
                                router.replace('/(app)');
                            }
                        }}
                ]);
            }
            return;
        }

        if (!conversationId || isInitializing.current) return;

        initializeChat();
    }, [authLoading, user, conversationId, otherUserId]);

    // Listen to messages
    useEffect(() => {
        if (!conversationReady || !conversationId || !user) return;

        const messagesRef = collection(db, 'conversations', conversationId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
                const loadedMessages: Message[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    loadedMessages.push({
                        id: doc.id,
                        ...data,
                    } as Message);
                });

                setMessages(loadedMessages);
                setLoading(false);
                markMessagesAsRead(snapshot);

                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                }, 100);
            },
            (error) => {
                console.error('Error loading messages:', error);
                setLoading(false);
                Alert.alert('Error', 'Failed to load messages');
            }
        );

        return () => unsubscribe();
    }, [conversationReady, conversationId, user]);

    const initializeChat = async () => {
        if (!user || !conversationId || !otherUserId || isInitializing.current) return;
        isInitializing.current = true;

        try {
            const conversationRef = doc(db, 'conversations', conversationId);
            const conversationDoc = await getDoc(conversationRef);

            if (!conversationDoc.exists()) {
                const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
                const currentUserData = currentUserDoc.data();
                const currentUserName = currentUserData?.displayName || user.email || 'User';

                let otherName = otherUserName;
                if (!otherName) {
                    const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
                    const otherUserData = otherUserDoc.data();
                    otherName = otherUserData?.displayName || otherUserData?.email || 'User';
                }

                await setDoc(conversationRef, {
                    participants: [user.uid, otherUserId],
                    participantNames: {
                        [user.uid]: currentUserName,
                        [otherUserId]: otherName,
                    },
                    lastMessage: '',
                    lastMessageTime: new Date().toISOString(),
                    lastMessageSender: '',
                    unreadCount: {
                        [user.uid]: 0,
                        [otherUserId]: 0,
                    },
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
            }

            setConversationReady(true);
        } catch (error) {
            console.error('Error initializing conversation:', error);
            Alert.alert('Error', 'Failed to initialize conversation');
            setLoading(false);
        } finally {
            isInitializing.current = false;
        }
    };

    const markMessagesAsRead = async (snapshot: any) => {
        if (!user) return;

        const batch: Promise<void>[] = [];
        snapshot.forEach((doc: any) => {
            const data = doc.data();
            if (data.senderId !== user.uid && !data.read) {
                batch.push(updateDoc(doc.ref, { read: true }));
            }
        });

        if (batch.length > 0) {
            try {
                await Promise.all(batch);
                const conversationRef = doc(db, 'conversations', conversationId);
                await updateDoc(conversationRef, {
                    [`unreadCount.${user.uid}`]: 0,
                });
            } catch (error) {
                console.error('Error marking messages as read:', error);
            }
        }
    };

    // Send regular text message
    const handleSend = async () => {
        if (!messageText.trim() || !user || !conversationId || !conversationReady) return;

        const text = messageText.trim();
        setMessageText('');
        setSending(true);

        try {
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();
            const currentUserName = currentUserData?.displayName || user.email || 'User';

            const messagesRef = collection(db, 'conversations', conversationId, 'messages');

            // ✅ IMPORTANT: Include 'type' field for text messages
            await addDoc(messagesRef, {
                type: 'text',
                senderId: user.uid,
                senderName: currentUserName,
                text: text,
                timestamp: Timestamp.now(),
                read: false,
            });

            const conversationRef = doc(db, 'conversations', conversationId);
            const conversationDoc = await getDoc(conversationRef);
            const conversationData = conversationDoc.data();
            const currentUnreadCount = conversationData?.unreadCount?.[otherUserId] || 0;

            await updateDoc(conversationRef, {
                lastMessage: text,
                lastMessageTime: new Date().toISOString(),
                lastMessageSender: user.uid,
                [`unreadCount.${otherUserId}`]: currentUnreadCount + 1,
                updatedAt: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('❌ Error sending message:', error);
            console.error('❌ Error code:', error.code);
            console.error('❌ Error message:', error.message);
            Alert.alert('Error', 'Failed to send message. Please check your connection.');
        } finally {
            setSending(false);
        }
    };

    // ✅ FIXED: Send payment request with all required fields
    const sendPaymentRequest = async () => {
        if (!user || !conversationId || !conversationReady) {
            Alert.alert('Error', 'Chat not ready. Please try again.');
            return;
        }

        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Error', 'Please enter a valid amount');
            return;
        }

        if (!paymentDescription.trim()) {
            Alert.alert('Error', 'Please enter a description');
            return;
        }

        setSendingPaymentRequest(true);

        try {
            console.log('💰 Sending payment request...');

            // Get current user info
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();
            const currentUserName = currentUserData?.displayName || user.email || 'User';

            const messagesRef = collection(db, 'conversations', conversationId, 'messages');

            // ✅ CRITICAL: Create payment request with ALL required fields
            const paymentRequestData = {
                type: 'payment_request',
                senderId: user.uid,
                senderName: currentUserName,
                amount: amount,
                description: paymentDescription.trim(),
                status: 'pending',
                timestamp: Timestamp.now(),
                read: false,
            };

            console.log('📤 Payment request data:', paymentRequestData);

            await addDoc(messagesRef, paymentRequestData);

            console.log('✅ Payment request sent successfully');

            // Update conversation metadata
            const conversationRef = doc(db, 'conversations', conversationId);
            const conversationDoc = await getDoc(conversationRef);
            const conversationData = conversationDoc.data();
            const currentUnreadCount = conversationData?.unreadCount?.[otherUserId] || 0;

            await updateDoc(conversationRef, {
                lastMessage: `💰 Payment request: $${amount.toFixed(2)}`,
                lastMessageTime: new Date().toISOString(),
                lastMessageSender: user.uid,
                [`unreadCount.${otherUserId}`]: currentUnreadCount + 1,
                updatedAt: new Date().toISOString(),
            });

            // Close modal and reset
            setShowPaymentModal(false);
            setPaymentAmount('');
            setPaymentDescription('');

            Alert.alert('Success', 'Payment request sent!');
        } catch (error: any) {
            console.error('❌ Error sending payment request:', error);
            console.error('❌ Error code:', error.code);
            console.error('❌ Error message:', error.message);

            // More specific error messages
            if (error.code === 'permission-denied') {
                Alert.alert(
                    'Permission Denied',
                    'Unable to send payment request. Please make sure your Firebase rules are updated correctly.'
                );
            } else {
                Alert.alert('Error', `Failed to send payment request: ${error.message}`);
            }
        } finally {
            setSendingPaymentRequest(false);
        }
    };

    // Handle payment for a payment request
    const handlePaymentRequest = async (message: PaymentRequestMessage) => {
        if (!user) {
            Alert.alert('Error', 'Please login to make a payment');
            return;
        }

        setProcessingPayment(message.id);

        try {
            console.log('💳 Processing payment...');
            console.log('💳 Amount:', message.amount);
            console.log('💳 Description:', message.description);

            // IMPORTANT: Check if backend is reachable
            console.log('🔗 Checking backend connection...');

            // Create payment intent with proper error handling
            let paymentData;
            try {
                paymentData = await paymentService.createPaymentIntent(
                    message.amount,
                    'usd',
                    message.description,
                    undefined
                );
            } catch (apiError: any) {
                console.error('❌ API Error:', apiError);
                console.error('❌ API Error Response:', apiError.response?.data);
                console.error('❌ API Error Status:', apiError.response?.status);

                // More specific error messages
                if (apiError.code === 'ECONNABORTED' || apiError.code === 'ECONNREFUSED') {
                    Alert.alert(
                        'Connection Error',
                        'Cannot connect to the payment server. Please check:\n\n' +
                        '1. Backend server is running\n' +
                        '2. API URL is correct in apiService.ts\n' +
                        '3. Your phone and computer are on the same WiFi'
                    );
                } else if (apiError.response?.status === 400) {
                    Alert.alert(
                        'Validation Error',
                        apiError.response?.data?.message || 'Invalid payment details'
                    );
                } else if (apiError.response?.status === 401) {
                    Alert.alert(
                        'Authentication Error',
                        'Please log out and log back in'
                    );
                } else if (apiError.response?.status === 500) {
                    Alert.alert(
                        'Server Error',
                        'The payment server encountered an error. Please try again.'
                    );
                } else if (!apiError.response) {
                    Alert.alert(
                        'Network Error',
                        'Cannot reach the payment server. Please check:\n\n' +
                        '1. Your internet connection\n' +
                        '2. Backend server is running\n' +
                        '3. API_BASE_URL in apiService.ts is correct'
                    );
                } else {
                    Alert.alert(
                        'Payment Error',
                        apiError.message || 'Failed to create payment. Please try again.'
                    );
                }

                setProcessingPayment(null);
                return;
            }

            console.log('✅ Payment intent created:', paymentData.paymentIntentId);

            // Validate payment data
            if (!paymentData.clientSecret) {
                console.error('❌ No client secret received');
                Alert.alert('Error', 'Invalid payment response from server');
                setProcessingPayment(null);
                return;
            }

            // Initialize payment sheet
            console.log('💳 Initializing payment sheet...');
            const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'SkillSwap',
                paymentIntentClientSecret: paymentData.clientSecret,
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

            if (initError) {
                console.error('❌ Payment sheet init error:', initError);
                Alert.alert('Payment Setup Error', initError.message);
                setProcessingPayment(null);
                return;
            }

            console.log('✅ Payment sheet initialized');

            // Present payment sheet
            console.log('💳 Presenting payment sheet...');
            const { error: presentError } = await presentPaymentSheet();

            if (presentError) {
                if (presentError.code === 'Canceled') {
                    console.log('ℹ️ User cancelled payment');
                } else {
                    console.error('❌ Payment presentation error:', presentError);
                    Alert.alert('Payment Failed', presentError.message);
                }
                setProcessingPayment(null);
                return;
            }

            console.log('✅ Payment successful');

            // Update message status in Firestore
            try {
                const messageRef = doc(db, 'conversations', conversationId, 'messages', message.id);
                await updateDoc(messageRef, {
                    status: 'paid',
                    paymentIntentId: paymentData.paymentIntentId,
                });
                console.log('✅ Message status updated');
            } catch (updateError) {
                console.error('❌ Error updating message status:', updateError);
                // Payment succeeded but status update failed - not critical
            }

            // Save payment to history
            try {
                await addDoc(collection(db, 'payments'), {
                    userId: user.uid,
                    userEmail: user.email,
                    userName: user.displayName || user.email,
                    skillName: message.description,
                    instructor: message.senderName,
                    amount: message.amount,
                    currency: 'usd',
                    paymentIntentId: paymentData.paymentIntentId,
                    status: 'completed',
                    date: new Date().toISOString(),
                    createdAt: new Date(),
                });
                console.log('✅ Payment saved to history');
            } catch (historyError) {
                console.error('⚠️ Could not save to payment history:', historyError);
                // Not critical - payment still succeeded
            }

            Alert.alert('Success! 🎉', 'Payment completed successfully');
        } catch (error: any) {
            console.error('❌ Unexpected payment error:', error);
            Alert.alert(
                'Payment Error',
                error.message || 'An unexpected error occurred. Please try again.'
            );
        } finally {
            setProcessingPayment(null);
        }
    };

    // Decline payment request
    const handleDeclinePayment = async (messageId: string) => {
        try {
            const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
            await updateDoc(messageRef, {
                status: 'declined',
            });
            Alert.alert('Declined', 'Payment request declined');
        } catch (error) {
            console.error('Error declining payment:', error);
            Alert.alert('Error', 'Failed to decline payment request');
        }
    };

    // Cancel payment request (sender only)
    const handleCancelPayment = async (messageId: string) => {
        try {
            const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
            await updateDoc(messageRef, {
                status: 'cancelled',
            });
            Alert.alert('Cancelled', 'Payment request cancelled');
        } catch (error) {
            console.error('Error cancelling payment:', error);
            Alert.alert('Error', 'Failed to cancel payment request');
        }
    };

    // Format timestamp
    const formatTime = (timestamp: any) => {
        try {
            const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '';
        }
    };

    // Render message item
    const renderMessage = ({ item }: { item: Message }) => {
        const isMyMessage = item.senderId === user?.uid;

        if (item.type === 'payment_request') {
            const paymentMsg = item as PaymentRequestMessage;
            const isProcessing = processingPayment === item.id;

            return (
                <View style={styles.paymentMessageContainer}>
                    <View style={styles.paymentCard}>
                        <View style={styles.paymentHeader}>
                            <Text style={styles.paymentTitle}>Payment Request</Text>
                            <View
                                style={[
                                    styles.paymentStatusBadge,
                                    paymentMsg.status === 'paid' && styles.paymentStatusPaid,
                                    paymentMsg.status === 'declined' && styles.paymentStatusDeclined,
                                    paymentMsg.status === 'cancelled' && styles.paymentStatusCancelled,
                                ]}
                            >
                                <Text style={styles.paymentStatusText}>
                                    {paymentMsg.status.toUpperCase()}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.paymentAmount}>${paymentMsg.amount.toFixed(2)}</Text>
                        <Text style={styles.paymentDescription}>{paymentMsg.description}</Text>
                        <Text style={styles.paymentFrom}>
                            From: {item.senderName}
                        </Text>

                        {!isMyMessage && paymentMsg.status === 'pending' && (
                            <View style={styles.paymentActions}>
                                <TouchableOpacity
                                    style={[styles.paymentButton, styles.payButton]}
                                    onPress={() => handlePaymentRequest(paymentMsg)}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.payButtonText}>Pay Now</Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.paymentButton, styles.declineButton]}
                                    onPress={() => handleDeclinePayment(item.id)}
                                    disabled={isProcessing}
                                >
                                    <Text style={styles.declineButtonText}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {isMyMessage && paymentMsg.status === 'pending' && (
                            <TouchableOpacity
                                style={[styles.paymentButton, styles.cancelButton]}
                                onPress={() => handleCancelPayment(item.id)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel Request</Text>
                            </TouchableOpacity>
                        )}

                        <Text style={styles.paymentTime}>{formatTime(item.timestamp)}</Text>
                    </View>
                </View>
            );
        }

        // Regular text message
        const textMsg = item as TextMessage;
        return (
            <View
                style={[
                    styles.messageContainer,
                    isMyMessage ? styles.myMessageContainer : styles.theirMessageContainer,
                ]}
            >
                {!isMyMessage && (
                    <Text style={styles.senderName}>{item.senderName}</Text>
                )}
                <View
                    style={[
                        styles.messageBubble,
                        isMyMessage ? styles.myMessageBubble : styles.theirMessageBubble,
                    ]}
                >
                    <Text
                        style={[
                            styles.messageText,
                            isMyMessage ? styles.myMessageText : styles.theirMessageText,
                        ]}
                    >
                        {textMsg.text}
                    </Text>
                    <Text
                        style={[
                            styles.messageTime,
                            isMyMessage ? styles.myMessageTime : styles.theirMessageTime,
                        ]}
                    >
                        {formatTime(item.timestamp)}
                    </Text>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading messages...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Text style={styles.backButtonText}>←</Text>
                    </TouchableOpacity>
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerName}>{otherUserName || 'User'}</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Messages list */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.messagesList}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                />

                {/* ✅ UPDATED: Input area with payment button beside send button */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Type a message..."
                        placeholderTextColor="#999"
                        value={messageText}
                        onChangeText={setMessageText}
                        multiline
                    />

                    {/* Payment button */}
                    <TouchableOpacity
                        style={styles.paymentIconButton}
                        onPress={() => setShowPaymentModal(true)}
                        disabled={!conversationReady}
                    >
                        <Text style={styles.paymentIconText}>💰</Text>
                    </TouchableOpacity>

                    {/* Send button */}
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!messageText.trim() || sending || !conversationReady) && styles.sendButtonDisabled,
                        ]}
                        onPress={handleSend}
                        disabled={!messageText.trim() || sending || !conversationReady}
                    >
                        {sending ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.sendButtonText}>Send</Text>
                        )}
                    </TouchableOpacity>

                    {/* Meetup button */}
                    <TouchableOpacity
                        style={[styles.sendButton, styles.meetupButton, !conversationReady && styles.sendButtonDisabled]}
                        //onPress={handleSendMeetupRequest}
                        disabled={!conversationReady}
                    >
                        <Text style={styles.sendButtonText}>Meetup</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            {/* Payment request modal */}
            <Modal visible={showPaymentModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Request Payment</Text>
                            <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBody}>
                            <Text style={styles.modalLabel}>Amount ($)</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="0.00"
                                placeholderTextColor="#999"
                                value={paymentAmount}
                                onChangeText={setPaymentAmount}
                                keyboardType="decimal-pad"
                            />

                            <Text style={styles.modalLabel}>Description</Text>
                            <TextInput
                                style={[styles.modalInput, styles.modalTextArea]}
                                placeholder="What's this payment for?"
                                placeholderTextColor="#999"
                                value={paymentDescription}
                                onChangeText={setPaymentDescription}
                                multiline
                                numberOfLines={3}
                            />

                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalCancelButton]}
                                    onPress={() => setShowPaymentModal(false)}
                                    disabled={sendingPaymentRequest}
                                >
                                    <Text style={styles.modalCancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.modalButton,
                                        styles.modalSendButton,
                                        sendingPaymentRequest && styles.modalButtonDisabled,
                                    ]}
                                    onPress={sendPaymentRequest}
                                    disabled={sendingPaymentRequest}
                                >
                                    {sendingPaymentRequest ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={styles.modalSendButtonText}>Send Request</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButtonText: {
        fontSize: 28,
        color: '#007AFF',
        fontWeight: 'bold',
    },
    headerInfo: {
        flex: 1,
        alignItems: 'center',
    },
    headerName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    messagesList: {
        padding: 16,
        paddingBottom: 8,
    },
    messageContainer: {
        marginBottom: 12,
    },
    myMessageContainer: {
        alignItems: 'flex-end',
    },
    theirMessageContainer: {
        alignItems: 'flex-start',
    },
    messageBubble: {
        maxWidth: '75%',
        padding: 12,
        borderRadius: 16,
    },
    myMessageBubble: {
        backgroundColor: '#007AFF',
        borderBottomRightRadius: 4,
    },
    theirMessageBubble: {
        backgroundColor: '#fff',
        borderBottomLeftRadius: 4,
    },
    senderName: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
        marginBottom: 4,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 20,
    },
    myMessageText: {
        color: '#fff',
    },
    theirMessageText: {
        color: '#333',
    },
    messageTime: {
        fontSize: 11,
        marginTop: 4,
    },
    myMessageTime: {
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'right',
    },
    theirMessageTime: {
        color: '#999',
    },
    // Payment message styles
    paymentMessageContainer: {
        marginBottom: 16,
        alignItems: 'center',
    },
    paymentCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        width: '90%',
        borderWidth: 2,
        borderColor: '#007AFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    paymentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    paymentTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    paymentStatusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: '#FFF3E0',
    },
    paymentStatusPaid: {
        backgroundColor: '#E8F5E9',
    },
    paymentStatusDeclined: {
        backgroundColor: '#FFEBEE',
    },
    paymentStatusCancelled: {
        backgroundColor: '#F5F5F5',
    },
    paymentStatusText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#FF9800',
    },
    paymentAmount: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#007AFF',
        marginBottom: 8,
    },
    paymentDescription: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    paymentFrom: {
        fontSize: 12,
        color: '#999',
        marginBottom: 12,
    },
    paymentActions: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    paymentButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    payButton: {
        backgroundColor: '#4CAF50',
    },
    payButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    declineButton: {
        backgroundColor: '#f0f0f0',
    },
    declineButtonText: {
        color: '#666',
        fontWeight: '600',
        fontSize: 14,
    },
    cancelButton: {
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
    },
    cancelButtonText: {
        color: '#666',
        fontWeight: '600',
        fontSize: 14,
    },
    paymentTime: {
        fontSize: 11,
        color: '#999',
        textAlign: 'center',
    },
    // ✅ UPDATED: Input area with payment button
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginRight: 8,
        fontSize: 16,
        maxHeight: 100,
        color: '#333',
    },
    paymentIconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#4CAF50',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    paymentIconText: {
        fontSize: 20,
    },
    sendButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 70,
    },

    meetupButton: {
        backgroundColor: '#34C759', // green for meetup
        marginLeft: 8,
    },

    sendButtonDisabled: {
        backgroundColor: '#ccc',
    },
    sendButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    modalCloseText: {
        fontSize: 24,
        color: '#666',
        fontWeight: 'bold',
    },
    modalBody: {
        padding: 20,
    },
    modalLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    modalInput: {
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#ddd',
        color: '#333',
        marginBottom: 16,
    },
    modalTextArea: {
        textAlignVertical: 'top',
        minHeight: 80,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalCancelButton: {
        backgroundColor: '#f0f0f0',
    },
    modalSendButton: {
        backgroundColor: '#007AFF',
    },
    modalButtonDisabled: {
        opacity: 0.6,
    },
    modalCancelButtonText: {
        color: '#666',
        fontWeight: '600',
        fontSize: 16,
    },
    modalSendButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
});