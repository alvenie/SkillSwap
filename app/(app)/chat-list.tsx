import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard yellow
    primaryBrandText: '#1F2937', 
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    accentGreen: '#10B981',
    unreadBadge: '#EF4444', // Red for unread messages
    lightGray: '#F9FAFB',
};

// Define conversation type
interface Conversation {
    id: string;
    participants: string[];
    participantNames: { [key: string]: string };
    lastMessage: string;
    lastMessageTime: string;
    lastMessageSender: string;
    unreadCount: { [key: string]: number };
}

// Main Chat List Screen
export default function ChatListScreen() {
    // Hooks and State
    const { user } = useAuth();
    const router = useRouter();
    
    // State for conversations and loading
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    // Fetch conversations on focus (and when user changes)
    useFocusEffect(
        useCallback(() => {
            if (!user) return;

            // We will sort the results manually in the code below.
            const q = query(
                collection(db, 'conversations'),
                where('participants', 'array-contains', user.uid)
            );

            // Real-time listener for conversations
            const unsubscribe = onSnapshot(q, (snapshot) => {
                // Load conversations from snapshot
                const loadedChats: Conversation[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    loadedChats.push({ // pull data into Conversation type
                        id: doc.id, 
                        ...data 
                    } as Conversation);
                });

                // Client-side sorting: Newest messages first
                loadedChats.sort((a, b) => {
                    const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                    const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                    return timeB - timeA;
                });

                // Update state with loaded conversations
                setConversations(loadedChats);
                setFilteredConversations(loadedChats);
                setLoading(false);
            }, (error) => {
                console.error("Error fetching chats:", error);
                setLoading(false);
            });

            // Cleanup subscription on unmount
            return () => unsubscribe();
        }, [user])
    );

    // Filter logic for search bar
    const handleSearch = (text: string) => {
        // Update search text state
        setSearchText(text);
        if (!text.trim()) {
            // If search is empty, show all conversations
            setFilteredConversations(conversations);
            return;
        }

        // Filter conversations based on participant names
        const lowerText = text.toLowerCase();
        const filtered = conversations.filter(chat => {
            const otherId = chat.participants.find(id => id !== user?.uid) || ''; // Get the other participant's ID
            const otherName = chat.participantNames?.[otherId] || 'User'; // Fallback to 'User' if name not found
            return otherName.toLowerCase().includes(lowerText); // 
        });
        setFilteredConversations(filtered); // Update filtered list
    };

    // Helper to format timestamp nicely (e.g. "10:30 AM" or "Yesterday")
    const formatTime = (isoString: string) => {
        if (!isoString) return ''; // An isoString refers to a date in ISO 8601 format.
        const date = new Date(isoString);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        
        if (isToday) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    };

    // Navigation to specific chat room
    const openChat = (chat: Conversation) => {
        const otherUserId = chat.participants.find(id => id !== user?.uid) || ''; // Get the other participant's ID
        const otherUserName = chat.participantNames?.[otherUserId] || 'User'; // Fallback to 'User' if name not found
        
        // Navigate to chat room with params
        router.push({
            pathname: '/(app)/chat-room', // Path to chat room screen
            params: {
                conversationId: chat.id, // Pass conversation ID
                otherUserId: otherUserId, // Pass other user's ID
                otherUserName: otherUserName // Pass other user's name
            }
        });
    };

    // Render each conversation item
    const renderConversationItem = ({ item }: { item: Conversation }) => {
        const otherUserId = item.participants.find(id => id !== user?.uid) || ''; // Get the other participant's ID
        const otherUserName = item.participantNames?.[otherUserId] || 'User'; // Fallback to 'User' if name not found
        
        // Safety check for unread count
        const unread = (item.unreadCount && item.unreadCount[user?.uid || '']) || 0;
        const isUnread = unread > 0;

        return (
            // Conversation Card
            <TouchableOpacity 
                style={[styles.card, isUnread && styles.cardUnread]} 
                onPress={() => openChat(item)}
            >
                {/* Avatar */}
                <View style={styles.avatarContainer}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {otherUserName.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                </View>

                {/* Chat Info */}
                <View style={styles.cardInfo}>
                    <View style={styles.topRow}>
                        <Text style={[styles.userName, isUnread && styles.userNameUnread]} numberOfLines={1}>
                            {otherUserName}
                        </Text>
                        <Text style={[styles.timeText, isUnread && styles.timeTextUnread]}>
                            {formatTime(item.lastMessageTime)}
                        </Text>
                    </View>
                    
                    <View style={styles.bottomRow}>
                        <Text style={[styles.lastMessage, isUnread && styles.lastMessageUnread]} numberOfLines={1}>
                            {item.lastMessageSender === user?.uid ? 'You: ' : ''}{item.lastMessage || 'No messages yet'}
                        </Text>
                        {isUnread && (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadText}>{unread}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // Show loading indicator
    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={COLORS.primaryBrand} />
            </SafeAreaView>
        );
    }

    return (
        // Main Container
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Messages</Text>
            </View>

            <View style={styles.searchSection}>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.input}
                        placeholder="Search chats..."
                        value={searchText}
                        onChangeText={handleSearch}
                        placeholderTextColor={COLORS.textSecondary}
                    />
                </View>
            </View>

            {/* Conversation List */}
            <FlatList
                data={filteredConversations}
                renderItem={renderConversationItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {}} tintColor={COLORS.primaryBrand} />}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Ionicons name="chatbubbles-outline" size={48} color={COLORS.border} />
                        <Text style={styles.emptyText}>No conversations yet.</Text>
                        <Text style={styles.emptySubText}>Find a skill and connect with someone!</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

// Styles
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 10,
        backgroundColor: COLORS.background,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    searchSection: {
        paddingHorizontal: 20,
        marginBottom: 10,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.lightGray,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    listContent: {
        padding: 20,
    },
    // CARD STYLES
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.cardBackground,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        // Soft Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    cardUnread: {
        borderColor: COLORS.primaryBrand,
        backgroundColor: '#FFFDF5', // Very light yellow tint for unread
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
    cardInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    userNameUnread: {
        fontWeight: '800',
        color: '#000',
    },
    timeText: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    timeTextUnread: {
        color: COLORS.primaryBrandText,
        fontWeight: '600',
    },
    bottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    lastMessage: {
        flex: 1,
        fontSize: 14,
        color: COLORS.textSecondary,
        marginRight: 8,
    },
    lastMessageUnread: {
        color: COLORS.textPrimary,
        fontWeight: '500',
    },
    unreadBadge: {
        backgroundColor: COLORS.unreadBadge,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    unreadText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
        opacity: 0.6,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginTop: 12,
    },
    emptySubText: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 4,
    },
});