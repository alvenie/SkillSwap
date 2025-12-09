import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard yellow
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    sectionBg: '#FAFAFA', // Slightly distinct background for horizontal sections
};

// A larger master list to ensure randomization feels fresh
const ALL_SKILLS_DATA = [
    { id: 1, icon: '🎸', label: 'Guitar', category: 'creative' },
    { id: 2, icon: '💻', label: 'Coding', category: 'tech' },
    { id: 3, icon: '🍳', label: 'Cooking', category: 'lifestyle' },
    { id: 4, icon: '🇨🇳', label: 'Chinese', category: 'language' },
    { id: 5, icon: '🇪🇸', label: 'Spanish', category: 'language' },
    { id: 6, icon: '🇩🇪', label: 'German', category: 'language' },
    { id: 7, icon: '📷', label: 'Photo', category: 'creative' },
    { id: 8, icon: '🧘', label: 'Yoga', category: 'lifestyle' },
    { id: 9, icon: '🎨', label: 'Painting', category: 'creative' },
    { id: 10, icon: '🎾', label: 'Tennis', category: 'sports' },
    { id: 11, icon: '♟️', label: 'Chess', category: 'strategy' },
    { id: 12, icon: '🎹', label: 'Piano', category: 'creative' },
    { id: 13, icon: '📐', label: 'Math', category: 'tech' },
    { id: 14, icon: '💾', label: 'Data', category: 'tech' },
    { id: 15, icon: '🧶', label: 'Knitting', category: 'creative' },
];

// Main Home Screen
export default function HomeScreen() {
    // Hooks & State
    const { user } = useAuth();
    const router = useRouter();
    const windowWidth = Dimensions.get('window').width; // For responsive card sizing

    // State for the randomized "Today's" list
    const [todaysPicks, setTodaysPicks] = useState<any[]>([]);

    // Calculate card width for the Grid (3 columns)
    const cardGap = 12;
    const padding = 20;
    const cardWidth3Col = (windowWidth - (padding * 2) - (cardGap * 2)) / 3;

    // Randomize logic on mount
    useEffect(() => {
        const shuffled = [...ALL_SKILLS_DATA].sort(() => 0.5 - Math.random());
        setTodaysPicks(shuffled.slice(0, 6)); // Pick top 6
    }, []);

    // Filter data for specific category sections
    const creativeSkills = ALL_SKILLS_DATA.filter(s => s.category === 'creative');
    const techSkills = ALL_SKILLS_DATA.filter(s => s.category === 'tech' || s.category === 'language');
    // Just a mix for trending
    const trendingSkills = [...ALL_SKILLS_DATA].reverse().slice(0, 5); 

    // Handler: Navigate to Skill Search with pre-filled skill
    const handleSkillPress = (skillLabel: string) => {
        router.push({
            pathname: '/(app)/skills',
            params: { skill: skillLabel }
        });
    };

    // Render Components
    const renderGridCard = (item: any) => (
        // Grid Card for Today's Suggestions
        <TouchableOpacity 
            key={item.id} 
            style={[styles.gridCard, { width: cardWidth3Col }]}
            onPress={() => handleSkillPress(item.label)}
        >
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <Text style={styles.cardLabel} numberOfLines={1}>{item.label}</Text>
        </TouchableOpacity>
    );

    // Horizontal Card for Category Sections
    const renderHorizontalCard = (item: any) => (
        // Horizontal Scroll Card
        <TouchableOpacity 
            key={item.id} 
            style={styles.horizontalCard}
            onPress={() => handleSkillPress(item.label)}
        >
            <View style={styles.horizontalIconContainer}>
                <Text style={styles.horizontalIcon}>{item.icon}</Text>
            </View>
            <View>
                <Text style={styles.horizontalLabel}>{item.label}</Text>
                <Text style={styles.horizontalSubLabel}>Tap to view</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        // Main Container
        <View style={styles.mainContainer}>
            <View style={styles.header}>
                {/* Logo Section */}
                <View style={styles.logoContainer}>
                    <Image 
                        source={require('../../assets/images/SkillSwap.png')} 
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <Text style={styles.appName}>SkillSwap</Text>
                </View>

                {/* Settings Button */}
                <TouchableOpacity 
                    style={styles.settingsButton} 
                    onPress={() => router.push('/(app)/settings')}
                >
                    <Ionicons name="settings-sharp" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            <ScrollView 
                style={styles.scrollContainer} 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Today's Random Suggestions (Grid) */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Today’s suggestion</Text>
                        <Text style={styles.sectionSubtitle}>Picked just for you</Text>
                    </View>
                    <View style={styles.gridContainer}>
                        {todaysPicks.map(renderGridCard)}
                    </View>
                </View>

                {/* Trending Now (Horizontal Scroll) */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>🔥 Trending Now</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollContent}>
                        {trendingSkills.map(renderHorizontalCard)}
                    </ScrollView>
                </View>

                {/* Creative Corner (Horizontal Scroll) */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>🎨 Creative Corner</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollContent}>
                        {creativeSkills.map(renderHorizontalCard)}
                    </ScrollView>
                </View>

                {/* Tech & Career (Horizontal Scroll) */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>💻 Tech & Career</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollContent}>
                        {techSkills.map(renderHorizontalCard)}
                    </ScrollView>
                </View>

            </ScrollView>
        </View>
    );
}

// Styles
const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    // Header Styles
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60, // Adjust for status bar
        paddingBottom: 20,
        backgroundColor: COLORS.background,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    logo: {
        width: 38,
        height: 38,
    },
    appName: {
        fontSize: 22,
        fontWeight: '800', // Extra bold for brand name
        color: COLORS.textPrimary,
        letterSpacing: -0.5,
    },
    settingsButton: {
        padding: 8,
        backgroundColor: '#F3F4F6', // Subtle circle background
        borderRadius: 20,
    },

    // Scroll Styles
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },

    // Section Styles
    sectionContainer: {
        marginBottom: 32,
    },
    sectionHeader: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 2,
    },

    // Grid Styles (Today's Suggestions)
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        paddingHorizontal: 20,
    },
    gridCard: {
        aspectRatio: 1,
        backgroundColor: COLORS.cardBackground,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
        // Aesthetic shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    cardIcon: {
        fontSize: 32,
        marginBottom: 8,
    },
    cardLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },

    // Horizontal Scroll Styles (Categories)
    horizontalScrollContent: {
        paddingHorizontal: 20,
        gap: 12,
    },
    horizontalCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB', // Slightly grey bg for contrast
        padding: 12,
        paddingRight: 20,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        marginRight: 4,
    },
    horizontalIconContainer: {
        width: 44,
        height: 44,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    horizontalIcon: {
        fontSize: 24,
    },
    horizontalLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    horizontalSubLabel: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
});