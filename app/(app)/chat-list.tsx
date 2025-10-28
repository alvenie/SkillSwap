import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import {
    collection,
    query,
    where,
    onSnapshot,
    orderBy,
    doc,
    getDoc,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';

// base conversation structure from firebase
interface Conversation {
    id: string;
    participants: string[];
    participantNames: { [userId: string]: string };
    lastMessage: string;
    lastMessageTime: string;
    lastMessageSender: string;
    unreadCount: { [userId: string]: number };
}

// extended version with computed fields for display
interface ConversationDisplay extends Conversation {
    otherUserName: string;
    otherUserId: string;
    otherUserInitial: string;
}

// main chat list screen - shows all conversations
export default function ChatListScreen() {
    const { user } = useAuth();
    const router = useRouter();

    const [conversations, setConversations] = useState<ConversationDisplay[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // set up real-time listener for conversations
    useEffect(() => {
        if (!user) return;

        console.log('📱 Setting up chat listener for user:', user.uid);

        const conversationsRef = collection(db, 'conversations');
        // get all conversations where current user is a participant, sorted by most recent
        const q = query(
            conversationsRef,
            where('participants', 'array-contains', user.uid),
            orderBy('lastMessageTime', 'desc')
        );

        // real-time listener that updates whenever conversations change
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const chats: ConversationDisplay[] = [];

                snapshot.forEach((docSnap) => {
                    const data = docSnap.data();

                    // figure out who the other person in the conversation is
                    const otherUserId = data.participants?.find(
                        (userId: string) => userId !== user.uid
                    ) || '';

                    const otherUserName = data.participantNames?.[otherUserId] || 'User';

                    // add computed display fields
                    chats.push({
                        id: docSnap.id,
                        ...data,
                        otherUserId,
                        otherUserName,
                        otherUserInitial: otherUserName.charAt(0).toUpperCase(),
                    } as ConversationDisplay);
                });

                console.log('💬 Loaded', chats.length, 'conversations');
                setConversations(chats);
                setLoading(false);
                setRefreshing(false);
            },
            (error) => {
                // console.error('Error loading conversations:', error);
                setLoading(false);
                setRefreshing(false);
            }
        );

        // cleanup listener on unmount
        return () => unsubscribe();
    }, [user]);

    // navigate to individual chat room
    const handleOpenChat = (conversation: ConversationDisplay) => {
        router.push({
            pathname: '/(app)/chat-room',
            params: {
                conversationId: conversation.id,
                otherUserId: conversation.otherUserId,
                otherUserName: conversation.otherUserName,
            },
        });
    };

    // format timestamp to relative time (e.g., "5m", "2h", "3d")
    const formatTime = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const diffMinutes = Math.floor(diff / 60000);
            const diffHours = Math.floor(diff / 3600000);
            const diffDays = Math.floor(diff / 86400000);

            if (diffMinutes < 1) return 'Just now';
            if (diffMinutes < 60) return `${diffMinutes}m`;
            if (diffHours < 24) return `${diffHours}h`;
            if (diffDays < 7) return `${diffDays}d`;

            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
            return '';
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        // the real-time listener will automatically refresh the data
    };

    // render individual conversation card
    const renderConversation = ({ item }: { item: ConversationDisplay }) => {
        const unreadCount = item.unreadCount?.[user?.uid || ''] || 0;
        const isUnread = unreadCount > 0;

        return (
            <TouchableOpacity
                style={styles.conversationCard}
                onPress={() => handleOpenChat(item)}
                activeOpacity={0.7}
            >
                {/* user avatar with initial */}
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.otherUserInitial}</Text>
                </View>

                <View style={styles.conversationInfo}>
                    {/* name and time */}
                    <View style={styles.conversationHeader}>
                        <Text style={[styles.userName, isUnread && styles.unreadText]}>
                            {item.otherUserName}
                        </Text>
                        <Text style={styles.time}>{formatTime(item.lastMessageTime)}</Text>
                    </View>

                    {/* last message preview and unread badge */}
                    <View style={styles.conversationFooter}>
                        <Text
                            style={[styles.lastMessage, isUnread && styles.unreadText]}
                            numberOfLines={1}
                        >
                            {item.lastMessageSender === user?.uid ? 'You: ' : ''}
                            {item.lastMessage || 'No messages yet'}
                        </Text>
                        {isUnread && (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadBadgeText}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // show loading state while fetching conversations
    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Messages</Text>
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading conversations...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {/* header with title and new chat button */}
            <View style={styles.header}>
                <Text style={styles.title}>Messages</Text>
                <TouchableOpacity
                    style={styles.newChatButton}
                    onPress={() => router.push('/friends-list')}
                >
                    <Text style={styles.newChatButtonText}>✏️</Text>
                </TouchableOpacity>
            </View>

            {/* show empty state or conversation list */}
            {conversations.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>💬</Text>
                    <Text style={styles.emptyText}>No conversations yet</Text>
                    <Text style={styles.emptySubtext}>
                        Start chatting with your friends!
                    </Text>
                    <TouchableOpacity
                        style={styles.findFriendsButton}
                        onPress={() => router.push('/friends-list')}
                    >
                        <Text style={styles.findFriendsButtonText}>View Friends</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    renderItem={renderConversation}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#007AFF"
                        />
                    }
                />
            )}
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
        padding: 20,
        paddingTop: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
    },
    newChatButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    newChatButtonText: {
        fontSize: 20,
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
    list: {
        padding: 16,
    },
    conversationCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
    },
    conversationInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    conversationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    unreadText: {
        fontWeight: 'bold',
    },
    time: {
        fontSize: 12,
        color: '#999',
        marginLeft: 8,
    },
    conversationFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    lastMessage: {
        fontSize: 14,
        color: '#666',
        flex: 1,
    },
    unreadBadge: {
        backgroundColor: '#007AFF',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    unreadBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
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
        marginBottom: 24,
    },
    findFriendsButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    findFriendsButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
});