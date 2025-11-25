import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    addDoc,
    collection,
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
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { paymentService } from '../../services/apiService';
import { generateConversationId } from '../../utils/conversationUtils';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard Yellow
    primaryBrandText: '#1F2937', // Dark Gray text for contrast
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

// --- Interfaces ---
interface BaseMessage {
    id: string;
    senderId: string;
    senderName: string;
    timestamp: any;
    read: boolean;
    type?: 'text' | 'payment_request';
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

    // Modals State (Only Payment Modal remains)
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // Payment Form State
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDescription, setPaymentDescription] = useState('');
    const [sendingPaymentRequest, setSendingPaymentRequest] = useState(false);
    const [processingPayment, setProcessingPayment] = useState<string | null>(null);

    const isInitializing = useRef(false);

    // 1. Initialize Conversation ID
    useEffect(() => {
        if (authLoading || !user) return;
        const paramConversationId = params.conversationId as string;
        const finalConversationId = paramConversationId || generateConversationId(user.uid, otherUserId);
        setConversationId(finalConversationId);
    }, [authLoading, user, otherUserId, params.conversationId]);

    // 2. Initialize Chat Document
    useEffect(() => {
        if (!user || !conversationId || !otherUserId || isInitializing.current) return;
        
        const init = async () => {
            isInitializing.current = true;
            try {
                const conversationRef = doc(db, 'conversations', conversationId);
                const conversationDoc = await getDoc(conversationRef);

                if (!conversationDoc.exists()) {
                    const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
                    const currentUserName = currentUserDoc.data()?.displayName || user.email || 'User';
                    
                    let nameToUse = otherUserName || 'User';
                    if (!otherUserName) {
                         const otherDoc = await getDoc(doc(db, 'users', otherUserId));
                         nameToUse = otherDoc.data()?.displayName || 'User';
                    }

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
                setConversationReady(true);
            } catch (e) {
                console.error(e);
            } finally {
                isInitializing.current = false;
            }
        };
        init();
    }, [user, conversationId, otherUserId]);

    // 3. Listen for Messages
    useEffect(() => {
        if (!conversationReady || !conversationId) return;

        const q = query(
            collection(db, 'conversations', conversationId, 'messages'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Message));
            setMessages(msgs);
            setLoading(false);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });

        return () => unsubscribe();
    }, [conversationReady, conversationId]);

    // --- Actions ---

    const sendMessage = async () => {
        if (!messageText.trim() || !user) return;
        setSending(true);
        try {
            await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
                type: 'text',
                senderId: user.uid,
                senderName: user.email, 
                text: messageText.trim(),
                timestamp: Timestamp.now(),
                read: false
            });
            
            await updateDoc(doc(db, 'conversations', conversationId), {
                lastMessage: messageText.trim(),
                lastMessageTime: new Date().toISOString(),
                lastMessageSender: user.uid
            });
            setMessageText('');
        } catch (e) {
            Alert.alert('Error', 'Failed to send');
        } finally {
            setSending(false);
        }
    };

    const sendPaymentRequest = async () => {
        if (!paymentAmount || !paymentDescription) return Alert.alert('Missing fields');
        setSendingPaymentRequest(true);
        try {
            const amount = parseFloat(paymentAmount);
            await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
                type: 'payment_request',
                senderId: user!.uid,
                senderName: user!.email,
                amount: amount,
                description: paymentDescription,
                status: 'pending',
                timestamp: Timestamp.now(),
                read: false
            });
            await updateDoc(doc(db, 'conversations', conversationId), {
                lastMessage: `💰 Payment Request: $${amount}`,
                lastMessageTime: new Date().toISOString(),
                lastMessageSender: user!.uid
            });
            setShowPaymentModal(false);
            setPaymentAmount('');
            setPaymentDescription('');
        } catch (e) {
            Alert.alert('Error', 'Failed to send request');
        } finally {
            setSendingPaymentRequest(false);
        }
    };

    const handlePayment = async (message: PaymentRequestMessage) => {
        setProcessingPayment(message.id);
        try {
            const { clientSecret, paymentIntentId } = await paymentService.createPaymentIntent(message.amount, 'usd');
            
            const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'SkillSwap',
                paymentIntentClientSecret: clientSecret,
                appearance: { colors: { primary: COLORS.primaryBrand } }
            });
            if (initError) throw new Error(initError.message);

            const { error: presentError } = await presentPaymentSheet();
            if (presentError) throw new Error(presentError.message);

            await updateDoc(doc(db, 'conversations', conversationId, 'messages', message.id), {
                status: 'paid',
                paymentIntentId: paymentIntentId
            });
            Alert.alert('Success', 'Payment Completed!');
        } catch (e: any) {
            if (e.message !== 'Canceled') Alert.alert('Payment Failed', e.message);
        } finally {
            setProcessingPayment(null);
        }
    };

    // --- Render ---

    const renderMessage = ({ item }: { item: Message }) => {
        const isSelf = item.senderId === user?.uid;
        const time = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

        if (item.type === 'payment_request') {
            const pm = item as PaymentRequestMessage;
            return (
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

        // Text Message
        return (
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
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{otherUserName || 'Chat'}</Text>
                
                {/* Meetup Button */}
                <TouchableOpacity style={styles.iconBtn}>
                    <Ionicons name="calendar-outline" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primaryBrand} /></View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                />
            )}

            {/* Input */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
                <View style={styles.inputBar}>
                    <TouchableOpacity onPress={() => setShowPaymentModal(true)} style={styles.attachBtn}>
                        <Ionicons name="wallet-outline" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Type a message..."
                        value={messageText}
                        onChangeText={setMessageText}
                        multiline
                    />
                    <TouchableOpacity onPress={sendMessage} disabled={!messageText.trim()} style={styles.sendBtn}>
                        <Ionicons name="send" size={20} color={COLORS.primaryBrandText} />
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
                            keyboardType="decimal-pad"
                            value={paymentAmount}
                            onChangeText={setPaymentAmount}
                        />
                        <TextInput 
                            style={[styles.modalInput, {height: 80}]} 
                            placeholder="Description" 
                            multiline
                            value={paymentDescription}
                            onChangeText={setPaymentDescription}
                        />
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
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: 
        COLORS.background 
    },
    center: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    // Header
    header: {
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: 16, 
        borderBottomWidth: 1, 
        borderColor: COLORS.border
    },
    iconBtn: { 
        padding: 4 
    },
    headerTitle: { 
        fontSize: 18, 
        fontWeight: 'bold', 
        color: COLORS.textPrimary 
    },
    // List
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
    // Bubbles
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
    // Cards (Payment/Meetup)
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
    acceptedBadge: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center', 
        backgroundColor: '#ECFDF5', 
        padding: 8, 
        borderRadius: 8, 
        marginTop: 8 
    },
    acceptedText: { 
        color: COLORS.accentGreen, 
        fontWeight: 'bold', 
        marginLeft: 4 
    },
    pendingText: { 
        fontStyle: 'italic', 
        color: COLORS.textSecondary, 
        textAlign: 'center', 
        marginTop: 8 
    },
    // Input
    inputBar: { 
        flexDirection: 'row', 
        padding: 12, 
        borderTopWidth: 1, 
        borderColor: COLORS.border, 
        alignItems: 'flex-end' 
    },
    attachBtn: { 
        padding: 10 
    },
    textInput: { 
        flex: 1, 
        backgroundColor: COLORS.inputBg, 
        borderRadius: 20, 
        padding: 10, 
        marginHorizontal: 8, 
        maxHeight: 100 
    },
    sendBtn: { 
        backgroundColor: COLORS.primaryBrand, 
        width: 40, 
        height: 40, 
        borderRadius: 20, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    // Modal
    modalOverlay: { 
        flex: 1, 
        backgroundColor: 'rgba(0,0,0,0.5)', 
        justifyContent: 'center', 
        padding: 20 
    },
    modalContent: { 
        backgroundColor: '#fff', 
        borderRadius: 20, 
        padding: 20 
    },
    modalTitle: { 
        fontSize: 20, 
        fontWeight: 'bold', 
        marginBottom: 20, 
        textAlign: 'center' 
    },
    modalInput: { 
        borderWidth: 1, 
        borderColor: COLORS.border, 
        borderRadius: 10,
        padding: 12, 
        marginBottom: 12 
    },
    modalActions: { 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        marginTop: 10 
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