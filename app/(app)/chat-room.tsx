import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    Timestamp,
    updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScheduleMeetingModal from '../../components/ScheduleMeetingModal';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { paymentService } from '../../services/apiService';
import { generateConversationId } from '../../utils/conversationUtils';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard Yellow
    primaryBrandText: '#1F2937',
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    bubbleSelf: '#FCD34D',
    bubbleOther: '#F3F4F6',
    inputBg: '#F9FAFB',
    accentGreen: '#10B981',
    accentRed: '#EF4444',
    lightGray: '#F9FAFB',
};

// Interfaces
interface BaseMessage {
    id: string;
    senderId: string;
    senderName: string;
    timestamp: any;
    read: boolean;
    type?: 'text' | 'meetup' | 'payment_request';
    meetupData?: {
        accepted?: boolean;
    };
}

// Specific message types 
interface TextMessage extends BaseMessage {
    type: 'text';
    text: string;
}

// Payment Request Message interface
interface PaymentRequestMessage extends BaseMessage {
    type: 'payment_request';
    amount: number;
    description: string;
    status: 'pending' | 'paid' | 'declined' | 'cancelled';
    paymentIntentId?: string;
}

// Union type for all message types
type Message = TextMessage | PaymentRequestMessage;

// Main Chat Room Screen
export default function ChatRoomScreen() {
    // Hooks & State
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { initPaymentSheet, presentPaymentSheet } = useStripe(); // Stripe Hooks

    const otherUserId = params.otherUserId as string;
    // Initial fallback, but we will fetch the real one
    const [headerTitle, setHeaderTitle] = useState(params.otherUserName as string || 'Chat');

    // Chat state
    const [conversationId, setConversationId] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageText, setMessageText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [conversationReady, setConversationReady] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Modals State
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // Payment Form State
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDescription, setPaymentDescription] = useState('');
    const [sendingPaymentRequest, setSendingPaymentRequest] = useState(false);
    const [processingPayment, setProcessingPayment] = useState<string | null>(null);

    // Meetup modal state
    const [showMeetupModal, setShowMeetupModal] = useState(false);

    const isInitializing = useRef(false);

    // Initialize Conversation ID & Fetch Fresh Header Name
    useEffect(() => {
        if (authLoading || !user) return;
        
        // Generate ID
        const paramConversationId = params.conversationId as string;
        const finalConversationId = paramConversationId || generateConversationId(user.uid, otherUserId);
        setConversationId(finalConversationId);

        // Fetch Fresh Other User Name (Fixes stale title issue)
        const fetchOtherProfile = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', otherUserId));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    const freshName = data.displayName || data.email || 'User';
                    setHeaderTitle(freshName);
                }
            } catch (error) {
                console.log("Could not fetch other user profile");
            }
        };
        fetchOtherProfile();

    }, [authLoading, user, otherUserId, params.conversationId]); // useEffect dependencies

    // Initialize Chat Document
    useEffect(() => {
        // Safety checks 
        if (!user || !conversationId || !otherUserId || isInitializing.current) return;
        
        // Initialize conversation document if it doesn't exist
        const init = async () => {
            isInitializing.current = true;
            try {
                const conversationRef = doc(db, 'conversations', conversationId);
                const conversationDoc = await getDoc(conversationRef);

                if (!conversationDoc.exists()) {
                    const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
                    const currentUserName = currentUserDoc.data()?.displayName || user.email || 'User';
                    
                    // We already fetched this for the header, but needed here for DB
                    let nameToUse = headerTitle; 
                    if (nameToUse === 'Chat' || !nameToUse) {
                         const otherDoc = await getDoc(doc(db, 'users', otherUserId));
                         nameToUse = otherDoc.data()?.displayName || 'User';
                    }

                    // Create the conversation document
                    await setDoc(conversationRef, {
                        participants: [user.uid, otherUserId],
                        participantNames: {
                            [user.uid]: currentUserName,
                            [otherUserId]: nameToUse,
                        },
                        lastMessage: '',
                        lastMessageTime: new Date().toISOString(),
                        lastMessageSender: '',
                        unreadCount: { [user.uid]: 0, [otherUserId]: 0 },
                        createdAt: new Date().toISOString(),
                    });
                }
                // Mark conversation as ready
                setConversationReady(true);
            } catch (e) {
                console.error(e);
            } finally {
                isInitializing.current = false;
            }
        };
        init();
    }, [user, conversationId, otherUserId]); // component changes when these change

    // Listen for Messages
    useEffect(() => {
        if (!conversationReady || !conversationId) return;

        // Set up Firestore listener for messages
        const q = query(
            collection(db, 'conversations', conversationId, 'messages'),
            orderBy('timestamp', 'asc')
        );

        // Real-time updates for messages
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ // Map Firestore docs to Message objects
                id: doc.id,
                ...doc.data()
            } as Message));
            // Update state with new messages
            setMessages(msgs);
            setLoading(false);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });

        // Cleanup listener on unmount
        return () => unsubscribe();
    }, [conversationReady, conversationId]); // component changes when these change

    // Actions

    // Clean up empty chats when backing out
    const handleBackPress = async () => {
        // If no messages, delete the conversation
        if (messages.length === 0 && conversationId) {
            try {
                // If no messages exist, remove the empty conversation document
                await deleteDoc(doc(db, 'conversations', conversationId));
                console.log('Cleaned up empty conversation');
            } catch (error) {
                console.error('Error cleaning up empty conversation:', error);
            }
        }
        router.replace('/(app)/chat-list'); // Navigate back to chat list
    };

    // Send Text Message
    const sendMessage = async () => {
        if (!messageText.trim() || !user) return;
        setSending(true);
        try {
            // Fetch fresh display name to update the chat record
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();
            const currentUserName = currentUserData?.displayName || user.email || 'User'; // Fallback to email if no name for legacy users

            const messagesRef = collection(db, 'conversations', conversationId, 'messages'); // Reference to messages subcollection

            // Add new message document
            await addDoc(messagesRef, {
                type: 'text',
                senderId: user.uid,
                senderName: currentUserName, // Use FRESH name
                text: messageText.trim(),
                timestamp: Timestamp.now(),
                read: false
            });
            
            // Update participantNames map so Chat List updates for everyone
            await updateDoc(doc(db, 'conversations', conversationId), {
                lastMessage: messageText.trim(),
                lastMessageTime: new Date().toISOString(),
                lastMessageSender: user.uid,
                [`participantNames.${user.uid}`]: currentUserName 
            });
            
            setMessageText('');
        } catch (error: any) {
            console.error('Error sending message:', error);
            Alert.alert('Error', 'Failed to send message.');
        } finally {
            setSending(false);
        }
    };

    // Send Payment Request
    const sendPaymentRequest = async () => {
        // Validate inputs
        const amount = parseFloat(paymentAmount);
        if (!amount || isNaN(amount) || !paymentDescription) {
            return Alert.alert('Missing fields', 'Please enter a valid amount and description.');
        }

        // Send payment request message
        setSendingPaymentRequest(true);
        try {
            // Fetch fresh name here too
            if (!user?.uid) throw new Error('User not authenticated');
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();
            const currentUserName = currentUserData?.displayName || user?.email || 'User'; // Fallback to email if no name

            const messagesRef = collection(db, 'conversations', conversationId, 'messages'); // Messages subcollection

            // Add payment request message
            await addDoc(messagesRef, {
                type: 'payment_request',
                senderId: user!.uid,
                senderName: currentUserName,
                amount: amount,
                description: paymentDescription,
                status: 'pending',
                timestamp: Timestamp.now(),
                read: false,
            });

            // Update conversation last message
            await updateDoc(doc(db, 'conversations', conversationId), {
                lastMessage: `Payment request: $${amount.toFixed(2)}`,
                lastMessageTime: new Date().toISOString(),
                lastMessageSender: user!.uid,
                [`participantNames.${user?.uid}`]: currentUserName 
            });

            // Close modal and reset form
            setShowPaymentModal(false);
            setPaymentAmount('');
            setPaymentDescription('');
            Alert.alert('Success', 'Payment request sent!');
        } catch (error: any) {
            console.error('Error sending payment request:', error);
            Alert.alert('Error', `Failed: ${error.message}`);
        } finally {
            setSendingPaymentRequest(false);
        }
    };

    // Handle Payment Processing
    const handlePayment = async (message: PaymentRequestMessage) => {
        // Prevent double processing
        setProcessingPayment(message.id);
        try {
            // Create Payment Intent via backend
            const paymentData = await paymentService.createPaymentIntent(
                message.amount,
                'usd',
                message.description,
                undefined
            );

            // Initialize Stripe Payment Sheet
            const clientSecret = paymentData?.clientSecret;
            if (!clientSecret) throw new Error("Invalid payment response");

            const { error: initError } = await initPaymentSheet({
                // Configure appearance and merchant details
                merchantDisplayName: 'SkillSwap',
                paymentIntentClientSecret: clientSecret,
                appearance: { colors: { primary: COLORS.primaryBrand } }
            });

            if (initError) throw new Error(initError.message);

            // Present Payment Sheet to user
            const { error: presentError } = await presentPaymentSheet();
            if (presentError) {
                if (presentError.code === 'Canceled') console.log('User cancelled payment');
                else Alert.alert('Payment Failed', presentError.message);
                return;
            }

            // Payment Successful
            await updateDoc(doc(db, 'conversations', conversationId, 'messages', message.id), {
                status: 'paid',
                paymentIntentId: paymentData.paymentIntentId,
            });

            // Log Payment History
            await addDoc(collection(db, 'payments'), {
                userId: user!.uid,
                userEmail: user!.email,
                userName: user!.displayName || user!.email,
                skillName: message.description,
                instructor: message.senderName,
                amount: message.amount,
                currency: 'usd',
                paymentIntentId: paymentData.paymentIntentId,
                status: 'completed',
                date: new Date().toISOString(),
                createdAt: new Date(),
            });

            Alert.alert('Success!', 'Payment completed successfully');
        } catch (error: any) {
            console.error('Payment Error:', error);
            Alert.alert('Payment Error', error.message);
        } finally {
            setProcessingPayment(null);
        }
    };

    // Meetup Modal Handlers
    const handleOpenMeetupModal = () => {
        if (!conversationReady) {
            Alert.alert('Error', 'Chat not ready. Please try again.');
            return;
        }
        setShowMeetupModal(true);
    };

    // Close Meetup Modal
    const handleCloseMeetupModal = () => {
        setShowMeetupModal(false);
    };

    // Render Message Item
    const renderMessage = ({ item }: { item: Message }) => {
        // Determine if the message is sent by the current user 
        const isSelf = item.senderId === user?.uid;
        const time = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

        // Render Payment Request Message if applicable
        if (item.type === 'payment_request') {
            const pm = item as PaymentRequestMessage;
            return (
                // Payment Request Card
                <View style={[styles.row, isSelf ? styles.rowRight : styles.rowLeft]}>
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={styles.iconBadge}><Text>💰</Text></View>
                            <Text style={styles.cardTitle}>Payment Request</Text>
                            <View style={[styles.statusBadge, pm.status === 'paid' ? styles.bgGreen : styles.bgYellow]}>
                                <Text style={styles.statusText}>{pm.status.toUpperCase()}</Text>
                            </View>
                        </View>
                        <Text style={styles.amountText}>${pm.amount.toFixed(2)}</Text>
                        <Text style={styles.descText}>{pm.description}</Text>
                        
                        {/* Payment Action Button */}
                        {!isSelf && pm.status === 'pending' && (
                            <TouchableOpacity 
                                style={styles.actionButton}
                                onPress={() => handlePayment(pm)}
                                disabled={!!processingPayment}
                            >
                                {processingPayment === item.id ? <ActivityIndicator color={COLORS.primaryBrandText}/> : <Text style={styles.btnText}>Pay Now</Text>}
                            </TouchableOpacity>
                        )}
                        <Text style={styles.timeText}>{time}</Text>
                    </View>
                </View>
            );
        }

        return (
            // Regular Text Message Bubble
            <View style={[styles.row, isSelf ? styles.rowRight : styles.rowLeft]}>
                <View style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubbleOther]}>
                    <Text style={[styles.msgText, isSelf ? {color: COLORS.primaryBrandText} : {color: COLORS.textPrimary}]}>
                        {(item as TextMessage).text}
                    </Text>
                    <Text style={styles.timeText}>{time}</Text>
                </View>
            </View>
        );
    };

    return (
        // Main Container with Safe Area
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <KeyboardAvoidingView 
                style={{ flex: 1 }} 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBackPress} style={styles.iconBtn}>
                        <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    {/* Uses dynamic headerTitle instead of static param */}
                    <Text style={styles.headerTitle}>{headerTitle}</Text>
                    
                    <TouchableOpacity 
                        style={styles.iconBtn}
                        onPress={handleOpenMeetupModal}
                        disabled={!conversationReady}
                    >
                        <Ionicons name="calendar-outline" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                </View>

                {/* Messages List */}
                {loading ? (
                    <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primaryBrand} /></View>
                ) : ( // If loading complete, show message list
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.list}
                    />
                )}

                {/* Input area */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Type a message..."
                        value={messageText}
                        onChangeText={setMessageText}
                        multiline
                    />

                    {/* Payment Request Button */}
                    <TouchableOpacity
                        style={styles.paymentIconButton}
                        onPress={() => setShowPaymentModal(true)}
                        disabled={!conversationReady}
                    >
                        <Ionicons name="cash-outline" size={24} color="#FFFFFF" />
                    </TouchableOpacity>

                    {/* Send Message Button */}
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!messageText.trim() || sending || !conversationReady) && styles.sendButtonDisabled,
                        ]}
                        onPress={sendMessage}
                        disabled={!messageText.trim() || sending || !conversationReady}
                    >
                        {sending ? (
                            <ActivityIndicator color={COLORS.primaryBrandText} size="small" />
                        ) : ( // If not sending, show send icon
                            <Ionicons name="send" size={20} color={COLORS.primaryBrandText} />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            {/* Payment Modal */}
            <Modal visible={showPaymentModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Request Payment</Text>
                        <TextInput 
                            style={styles.modalInput} 
                            placeholder="Amount (0.00)" 
                            placeholderTextColor={COLORS.textSecondary}
                            keyboardType="decimal-pad"
                            value={paymentAmount}
                            onChangeText={setPaymentAmount}
                        />
                        <TextInput 
                            style={[styles.modalInput, {height: 80}]} 
                            placeholder="Description" 
                            placeholderTextColor={COLORS.textSecondary}
                            multiline
                            value={paymentDescription}
                            onChangeText={setPaymentDescription}
                        />
                        {/* Payment Modal cancel and confirm buttons */}
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setShowPaymentModal(false)} style={styles.modalBtnCancel}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={sendPaymentRequest} style={styles.modalBtnConfirm}>
                                {sendingPaymentRequest ? <ActivityIndicator color="#000"/> : <Text style={styles.btnText}>Send</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Schedule Meetup Modal */}
            <ScheduleMeetingModal
                visible={showMeetupModal}
                onClose={handleCloseMeetupModal}
                currentUserId={user?.uid || ''}
                otherUserId={otherUserId}
                otherUserName={headerTitle}
            />
        </SafeAreaView>
    );
}

// Styles
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: COLORS.background 
    },
    center: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    header: {
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: 16, 
        borderBottomWidth: 1, 
        borderColor: COLORS.border,
        backgroundColor: COLORS.background,
    },
    iconBtn: { 
        padding: 4 
    },
    headerTitle: { 
        fontSize: 18, 
        fontWeight: 'bold', 
        color: COLORS.textPrimary 
    },
    list: { 
        padding: 16, 
        paddingBottom: 20 
    },
    row: { 
        marginBottom: 12, 
        width: '100%' 
    },
    rowLeft: { 
        alignItems: 'flex-start' 
    },
    rowRight: { 
        alignItems: 'flex-end' 
    },
    bubble: { 
        padding: 12, 
        borderRadius: 20, 
        maxWidth: '80%' 
    },
    bubbleSelf: { 
        backgroundColor: COLORS.bubbleSelf, 
        borderBottomRightRadius: 4 
    },
    bubbleOther: { 
        backgroundColor: COLORS.bubbleOther, 
        borderBottomLeftRadius: 4 
    },
    msgText: { 
        fontSize: 16 
    },
    timeText: { 
        fontSize: 10, 
        color: COLORS.textSecondary, 
        alignSelf: 'flex-end', 
        marginTop: 4 
    },
    card: {
        backgroundColor: COLORS.cardBackground, 
        width: 260, 
        padding: 16, 
        borderRadius: 16,
        borderWidth: 1, 
        borderColor: COLORS.border, 
        shadowColor: '#000', 
        shadowOpacity: 0.05, 
        shadowOffset: {width:0,height:2}, 
        elevation: 2
    },
    cardHeader: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        marginBottom: 12 
    },
    iconBadge: { 
        backgroundColor: '#FFF7ED', 
        padding: 6, 
        borderRadius: 20, 
        marginRight: 8 
    },
    cardTitle: { 
        fontWeight: 'bold', 
        flex: 1, 
        color: COLORS.textPrimary 
    },
    statusBadge: { 
        paddingHorizontal: 8, 
        paddingVertical: 2, 
        borderRadius: 8 
    },
    bgGreen: { 
        backgroundColor: '#D1FAE5' 
    },
    bgYellow: { 
        backgroundColor: '#FEF3C7' 
    },
    statusText: { 
        fontSize: 10, 
        fontWeight: 'bold' 
    },
    amountText: { 
        fontSize: 24, 
        fontWeight: 'bold', 
        marginBottom: 4, 
        color: COLORS.textPrimary 
    },
    descText: { 
        color: COLORS.textSecondary, 
        marginBottom: 12 
    },
    actionButton: { 
        backgroundColor: COLORS.primaryBrand, 
        padding: 10, borderRadius: 8, 
        alignItems: 'center', 
        marginTop: 8 
    },
    btnText: { 
        fontWeight: 'bold', 
        color: COLORS.primaryBrandText 
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        alignItems: 'center', 
    },
    textInput: { 
        flex: 1, 
        backgroundColor: COLORS.inputBg, 
        borderRadius: 20, 
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginRight: 8,
        maxHeight: 100,
        color: COLORS.textPrimary,
    },
    paymentIconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.accentGreen,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    sendButton: {
        backgroundColor: COLORS.primaryBrand,
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#E5E7EB',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
    },
    modalTitle: { 
        fontSize: 20, 
        fontWeight: 'bold', 
        marginBottom: 20, 
        textAlign: 'center',
        color: COLORS.textPrimary,
    },
    modalInput: { 
        borderWidth: 1, 
        borderColor: COLORS.border, 
        borderRadius: 10,
        padding: 12, 
        marginBottom: 12,
        color: COLORS.textPrimary,
    },
    modalActions: { 
        flexDirection: 'row', 
    },
    modalBtnCancel: { 
        flex: 1, 
        padding: 14, 
        backgroundColor: COLORS.lightGray, 
        borderRadius: 10, 
        alignItems: 'center', 
        marginRight: 8 
    },
    modalBtnConfirm: { 
        flex: 1, 
        padding: 14, 
        backgroundColor: COLORS.primaryBrand, 
        borderRadius: 10, 
        alignItems: 'center', 
        marginLeft: 8 
    },
    modalBtnText: { 
        color: COLORS.textSecondary, 
        fontWeight: 'bold' 
    },
});