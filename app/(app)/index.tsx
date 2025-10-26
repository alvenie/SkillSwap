import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { Alert, StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../firebaseConfig';

interface Skill {
    id: number;
    name: string;
    price: number;
    duration: string;
    instructor: string;
    category: string;
}

const SKILLS_DATA: Skill[] = [
    {
        id: 1,
        name: 'Guitar Lessons',
        price: 50,
        duration: '1 hour',
        instructor: 'John Doe',
        category: 'Music',
    },
    {
        id: 2,
        name: 'Piano Lessons',
        price: 60,
        duration: '1 hour',
        instructor: 'Jane Smith',
        category: 'Music',
    },
    {
        id: 3,
        name: 'Coding Tutor - Python',
        price: 75,
        duration: '1 hour',
        instructor: 'Mike Johnson',
        category: 'Technology',
    },
    {
        id: 4,
        name: 'Spanish Classes',
        price: 40,
        duration: '1 hour',
        instructor: 'Maria Garcia',
        category: 'Language',
    },
    {
        id: 5,
        name: 'Yoga Session',
        price: 30,
        duration: '1 hour',
        instructor: 'Sarah Williams',
        category: 'Fitness',
    },
    {
        id: 6,
        name: 'Photography Course',
        price: 80,
        duration: '2 hours',
        instructor: 'David Brown',
        category: 'Arts',
    },
];

export default function HomeScreen() {
    const { user } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await signOut(auth);
                    } catch (error: any) {
                        Alert.alert('Sign Out Failed', error.message);
                    }
                },
            },
        ]);
    };

    const handleBookSkill = (skill: Skill) => {
        router.push({
            pathname: '/payment',
            params: {
                skillName: skill.name,
                skillPrice: skill.price.toString(),
                skillDuration: skill.duration,
                instructor: skill.instructor,
            },
        } as any);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Welcome back!</Text>
                    {user && <Text style={styles.emailText}>{user.email}</Text>}
                </View>
                <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.title}>Available Skills</Text>
                <Text style={styles.subtitle}>Book a session and learn something new</Text>

                {/* Payment History Card - Now under the header */}
                <TouchableOpacity
                    style={styles.paymentHistoryCard}
                    onPress={() => router.push('/(app)/history')}
                    activeOpacity={0.7}
                >
                    <View style={styles.paymentHistoryIcon}>
                        <Text style={styles.paymentHistoryIconText}>💳</Text>
                    </View>
                    <View style={styles.paymentHistoryContent}>
                        <Text style={styles.paymentHistoryTitle}>Payment History</Text>
                        <Text style={styles.paymentHistorySubtitle}>View your transactions</Text>
                    </View>
                    <Text style={styles.paymentHistoryArrow}>→</Text>
                </TouchableOpacity>

                {/* Skills List */}
                {SKILLS_DATA.map((skill) => (
                    <TouchableOpacity
                        key={skill.id}
                        style={styles.skillCard}
                        onPress={() => handleBookSkill(skill)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.skillHeader}>
                            <View style={styles.categoryBadge}>
                                <Text style={styles.categoryText}>{skill.category}</Text>
                            </View>
                        </View>

                        <Text style={styles.skillName}>{skill.name}</Text>
                        <Text style={styles.instructorText}>with {skill.instructor}</Text>

                        <View style={styles.skillFooter}>
                            <View style={styles.durationContainer}>
                                <Text style={styles.durationIcon}>⏱️</Text>
                                <Text style={styles.durationText}>{skill.duration}</Text>
                            </View>
                            <View style={styles.priceContainer}>
                                <Text style={styles.priceText}>${skill.price}</Text>
                                <Text style={styles.bookNowText}>Book Now →</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                ))}

                <View style={styles.bottomSpacer} />
            </ScrollView>
        </View>
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
        paddingTop: 60,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    welcomeText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
    },
    emailText: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    signOutButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#ff3b30',
        borderRadius: 8,
    },
    signOutText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    content: {
        flex: 1,
        padding: 20,
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
        marginBottom: 20,
    },
    // Payment History Card Styles
    paymentHistoryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#007AFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
    paymentHistoryIcon: {
        width: 50,
        height: 50,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    paymentHistoryIconText: {
        fontSize: 28,
    },
    paymentHistoryContent: {
        flex: 1,
    },
    paymentHistoryTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    paymentHistorySubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    paymentHistoryArrow: {
        fontSize: 24,
        color: '#fff',
        fontWeight: 'bold',
    },
    skillCard: {
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
    skillHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    categoryBadge: {
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    categoryText: {
        color: '#1976D2',
        fontSize: 12,
        fontWeight: '600',
    },
    skillName: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginBottom: 6,
    },
    instructorText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
    },
    skillFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    durationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    durationIcon: {
        fontSize: 16,
        marginRight: 6,
    },
    durationText: {
        fontSize: 14,
        color: '#666',
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    priceText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#007AFF',
    },
    bookNowText: {
        fontSize: 14,
        color: '#007AFF',
        fontWeight: '600',
    },
    bottomSpacer: {
        height: 20,
    },
});
