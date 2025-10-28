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

interface Message {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: any;
    read: boolean;
}

export default function ChatRoomScreen() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const params = useLocalSearchParams();

    const otherUserId = params.otherUserId as string;
    const otherUserName = params.otherUserName as string;

    // State for conversationId
    const [conversationId, setConversationId] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageText, setMessageText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [conversationReady, setConversationReady] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // ✅ FIX: Add refs to prevent multiple alerts
    const hasShownAuthError = useRef(false);
    const hasShownParamsError = useRef(false);
    const isInitializing = useRef(false);

    // Set up conversationId when user is available
    useEffect(() => {
        if (authLoading || !user) return;

        const paramConversationId = params.conversationId as string;
        const finalConversationId = paramConversationId || generateConversationId(user.uid, otherUserId);

        console.log('🔑 Setting conversation ID:', finalConversationId);
        setConversationId(finalConversationId);
    }, [authLoading, user, otherUserId, params.conversationId]);

    useEffect(() => {
        // Wait for auth to load
        if (authLoading) {
            console.log('⏳ Waiting for auth to load...');
            return;
        }

        // Check if user is authenticated - only show error once
        if (!user) {
            if (!hasShownAuthError.current) {
                hasShownAuthError.current = true;
                console.error('❌ User not authenticated');
                Alert.alert('Error', 'Please login to access messages', [
                    { text: 'OK', onPress: () => router.replace('/(public)/login') }
                ]);
            }
            return;
        }

        // Validate required params - only show error once
        if (!otherUserId) {
            if (!hasShownParamsError.current) {
                hasShownParamsError.current = true;
                console.error('❌ Missing otherUserId');
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

        // Wait for conversationId to be set
        if (!conversationId) {
            console.log('⏳ Waiting for conversation ID...');
            return;
        }

        // ✅ FIX: Prevent multiple initializations
        if (isInitializing.current) {
            console.log('⏳ Already initializing...');
            return;
        }

        console.log('💬 Setting up chat room');
        console.log('   Conversation ID:', conversationId);
        console.log('   Current User:', user.uid);
        console.log('   Other User:', otherUserId);

        // Initialize conversation first, then set up listener
        initializeChat();
    }, [authLoading, user, conversationId, otherUserId]);

    useEffect(() => {
        // Only set up message listener after conversation is ready
        if (!conversationReady || !conversationId || !user) return;

        console.log('📡 Setting up message listener...');

        // Set up real-time message listener
        const messagesRef = collection(db, 'conversations', conversationId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const loadedMessages: Message[] = [];
                snapshot.forEach((doc) => {
                    loadedMessages.push({
                        id: doc.id,
                        ...doc.data(),
                    } as Message);
                });

                console.log('📨 Loaded', loadedMessages.length, 'messages');
                setMessages(loadedMessages);
                setLoading(false);

                // Mark messages as read
                markMessagesAsRead(snapshot);

                // Scroll to bottom
                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                }, 100);
            },
            (error) => {
                console.error('❌ Error loading messages:', error);
                setLoading(false);
                Alert.alert('Error', 'Failed to load messages. Please check your permissions.');
            }
        );

        return () => unsubscribe();
    }, [conversationReady, conversationId, user]);

    const initializeChat = async () => {
        if (!user || !conversationId || !otherUserId || isInitializing.current) return;

        // ✅ FIX: Mark as initializing
        isInitializing.current = true;

        try {
            console.log('🔍 Verifying/Creating conversation...');
            const conversationRef = doc(db, 'conversations', conversationId);
            const conversationDoc = await getDoc(conversationRef);

            if (!conversationDoc.exists()) {
                console.log('🆕 Creating new conversation...');

                // Get current user's name
                const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
                const currentUserData = currentUserDoc.data();
                const currentUserName = currentUserData?.displayName || user.email || 'User';

                // Get other user's name if not provided
                let otherName = otherUserName;
                if (!otherName) {
                    const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
                    const otherUserData = otherUserDoc.data();
                    otherName = otherUserData?.displayName || otherUserData?.email || 'User';
                }

                // Create conversation with all required fields
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

                console.log('✅ Conversation created successfully');
            } else {
                console.log('✅ Conversation already exists');

                // Ensure both users are participants (fix for existing conversations)
                const data = conversationDoc.data();
                const participants = data?.participants || [];

                if (!participants.includes(user.uid) || !participants.includes(otherUserId)) {
                    console.log('🔧 Fixing participant list...');

                    // Get user names
                    const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
                    const currentUserData = currentUserDoc.data();
                    const currentUserName = currentUserData?.displayName || user.email || 'User';

                    const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
                    const otherUserData = otherUserDoc.data();
                    const otherName = otherUserData?.displayName || otherUserData?.email || 'User';

                    await updateDoc(conversationRef, {
                        participants: [user.uid, otherUserId],
                        participantNames: {
                            [user.uid]: currentUserName,
                            [otherUserId]: otherName,
                        },
                        updatedAt: new Date().toISOString(),
                    });

                    console.log('✅ Participant list fixed');
                }
            }

            // Mark conversation as ready
            setConversationReady(true);
        } catch (error) {
            console.error('❌ Error initializing conversation:', error);
            Alert.alert('Error', 'Failed to initialize conversation. Please check Firestore permissions.');
            setLoading(false);
        } finally {
            // ✅ FIX: Reset initializing flag
            isInitializing.current = false;
        }
    };

    const markMessagesAsRead = async (snapshot: any) => {
        if (!user) return;

        const batch: Promise<void>[] = [];

        snapshot.forEach((doc: any) => {
            const data = doc.data();
            if (data.senderId !== user.uid && !data.read) {
                batch.push(
                    updateDoc(doc.ref, { read: true })
                );
            }
        });

        if (batch.length > 0) {
            try {
                await Promise.all(batch);

                // Update unread count in conversation
                const conversationRef = doc(db, 'conversations', conversationId);
                await updateDoc(conversationRef, {
                    [`unreadCount.${user.uid}`]: 0,
                });
            } catch (error) {
                console.error('⚠️ Error marking messages as read:', error);
            }
        }
    };

    const handleSend = async () => {
        if (!messageText.trim() || !user || !conversationId || !conversationReady) return;

        const text = messageText.trim();
        setMessageText('');
        setSending(true);

        try {
            console.log('📤 Sending message:', text);

            // Get current user's name
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();
            const currentUserName = currentUserData?.displayName || user.email || 'User';

            // Add message with all required fields
            const messagesRef = collection(db, 'conversations', conversationId, 'messages');
            await addDoc(messagesRef, {
                senderId: user.uid,
                senderName: currentUserName,
                text: text,
                timestamp: Timestamp.now(),
                read: false,
            });

            // Update conversation with last message
            const conversationRef = doc(db, 'conversations', conversationId);

            // Get current unread count for other user
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

            console.log('✅ Message sent successfully');
        } catch (error) {
            console.error('❌ Error sending message:', error);
            Alert.alert('Error', 'Failed to send message. Please check your permissions.');
            setMessageText(text); // Restore message
        } finally {
            setSending(false);
        }
    };

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '';

        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const diffHours = Math.floor(diff / 3600000);

            if (diffHours < 24) {
                return date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                });
            } else {
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                });
            }
        } catch {
            return '';
        }
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isMyMessage = item.senderId === user?.uid;

        return (
            <View
                style={[
                    styles.messageContainer,
                    isMyMessage ? styles.myMessageContainer : styles.theirMessageContainer,
                ]}
            >
                <View
                    style={[
                        styles.messageBubble,
                        isMyMessage ? styles.myMessageBubble : styles.theirMessageBubble,
                    ]}
                >
                    {!isMyMessage && (
                        <Text style={styles.senderName}>{item.senderName}</Text>
                    )}
                    <Text
                        style={[
                            styles.messageText,
                            isMyMessage ? styles.myMessageText : styles.theirMessageText,
                        ]}
                    >
                        {item.text}
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
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Text style={styles.backButtonText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{otherUserName || 'Chat'}</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading chat...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{otherUserName || 'Chat'}</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                {messages.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>💬</Text>
                        <Text style={styles.emptyText}>No messages yet</Text>
                        <Text style={styles.emptySubtext}>
                            Start the conversation with {otherUserName}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.messagesList}
                        onContentSizeChange={() =>
                            flatListRef.current?.scrollToEnd({ animated: true })
                        }
                    />
                )}

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Type a message..."
                        value={messageText}
                        onChangeText={setMessageText}
                        multiline
                        maxLength={1000}
                        placeholderTextColor="#999"
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!messageText.trim() || sending || !conversationReady) && styles.sendButtonDisabled,
                        ]}
                        onPress={handleSend}
                        disabled={!messageText.trim() || sending || !conversationReady}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.sendButtonText}>Send</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
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
        padding: 16,
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
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
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
    keyboardView: {
        flex: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
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
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
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
    sendButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 70,
    },
    sendButtonDisabled: {
        backgroundColor: '#ccc',
    },
    sendButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
});