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

// Configuration
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

interface Conversation {
    id: string;
    participants: string[];
    participantNames: { [key: string]: string };
    lastMessage: string;
    lastMessageTime: string;
    lastMessageSender: string;
    unreadCount: { [key: string]: number };
}

export default function ChatListScreen() {
    const { user } = useAuth();
    const router = useRouter();
    
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    useFocusEffect(
        useCallback(() => {
            if (!user) return;

            // FIX: Removed 'orderBy' from the query to prevent "Missing Index" errors.
            // We will sort the results manually in the code below.
            const q = query(
                collection(db, 'conversations'),
                where('participants', 'array-contains', user.uid)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const loadedChats: Conversation[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    loadedChats.push({ 
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

                setConversations(loadedChats);
                setFilteredConversations(loadedChats);
                setLoading(false);
            }, (error) => {
                console.error("Error fetching chats:", error);
                setLoading(false);
            });

            return () => unsubscribe();
        }, [user])
    );

    // Filter logic for search bar
    const handleSearch = (text: string) => {
        setSearchText(text);
        if (!text.trim()) {
            setFilteredConversations(conversations);
            return;
        }

        const lowerText = text.toLowerCase();
        const filtered = conversations.filter(chat => {
            const otherId = chat.participants.find(id => id !== user?.uid) || '';
            const otherName = chat.participantNames?.[otherId] || 'User';
            return otherName.toLowerCase().includes(lowerText);
        });
        setFilteredConversations(filtered);
    };

    // Helper to format timestamp nicely (e.g. "10:30 AM" or "Yesterday")
    const formatTime = (isoString: string) => {
        if (!isoString) return '';
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
        const otherUserId = chat.participants.find(id => id !== user?.uid) || '';
        const otherUserName = chat.participantNames?.[otherUserId] || 'User';
        
        router.push({
            pathname: '/(app)/chat-room',
            params: {
                conversationId: chat.id,
                otherUserId: otherUserId,
                otherUserName: otherUserName
            }
        });
    };

    const renderConversationItem = ({ item }: { item: Conversation }) => {
        const otherUserId = item.participants.find(id => id !== user?.uid) || '';
        const otherUserName = item.participantNames?.[otherUserId] || 'User';
        
        // Safety check for unread count
        const unread = (item.unreadCount && item.unreadCount[user?.uid || '']) || 0;
        const isUnread = unread > 0;

        return (
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

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={COLORS.primaryBrand} />
            </SafeAreaView>
        );
    }

    return (
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