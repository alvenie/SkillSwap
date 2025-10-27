import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../../context/AuthContext';

interface Skill {
    id: string;
    skillName: string;
    category: string;
    description: string;
    price: number;
    duration: string;
    userName: string;
    userEmail: string;
    userId: string;
    isAvailable: boolean;
}

export default function BrowseSkillsScreen() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [filteredSkills, setFilteredSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const router = useRouter();
    const { user } = useAuth();

    useEffect(() => {
        fetchSkills();
    }, []);

    const fetchSkills = async () => {
        try {
            setLoading(true);
            const q = query(collection(db, 'skills'), where('isAvailable', '==', true));
            const querySnapshot = await getDocs(q);
            const skillsData: Skill[] = [];

            querySnapshot.forEach((doc) => {
                skillsData.push({
                    id: doc.id,
                    ...doc.data(),
                } as Skill);
            });

            setSkills(skillsData);
            setFilteredSkills(skillsData);
        } catch (error) {
            console.error('Error fetching skills:', error);
            Alert.alert('Error', 'Failed to load skills');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (text: string) => {
        setSearchText(text);
        if (text.trim() === '') {
            setFilteredSkills(skills);
        } else {
            const filtered = skills.filter(
                (skill) =>
                    skill.skillName.toLowerCase().includes(text.toLowerCase()) ||
                    skill.category.toLowerCase().includes(text.toLowerCase()) ||
                    skill.userName.toLowerCase().includes(text.toLowerCase())
            );
            setFilteredSkills(filtered);
        }
    };

    const handleBookNow = (skill: Skill) => {
        if (!user) {
            Alert.alert('Error', 'Please login first');
            return;
        }

        if (skill.userId === user.uid) {
            Alert.alert('Error', "You can't book your own skill");
            return;
        }

        router.push({
            pathname: '/(app)/payment',
            params: {
                skillId: skill.id,
                skillName: skill.skillName,
                price: skill.price.toString(),
                instructorName: skill.userName,
                instructorEmail: skill.userEmail,
            },
        });
    };

    const renderSkillCard = ({ item }: { item: Skill }) => (
        <View style={styles.card}>
            <View style={styles.cardContent}>
                <Text style={styles.skillName}>{item.skillName}</Text>
                <Text style={styles.instructor}>by {item.userName}</Text>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.description}>{item.description}</Text>
                <View style={styles.footer}>
                    <Text style={styles.price}>${item.price}</Text>
                    <Text style={styles.duration}>{item.duration}</Text>
                </View>
            </View>
            <TouchableOpacity
                style={styles.bookButton}
                onPress={() => handleBookNow(item)}
            >
                <Text style={styles.bookButtonText}>Book Now</Text>
            </TouchableOpacity>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#007AFF" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Browse Skills</Text>
                <TextInput
                    style={styles.searchBox}
                    placeholder="Search skills..."
                    value={searchText}
                    onChangeText={handleSearch}
                    placeholderTextColor="#999"
                />
            </View>

            {filteredSkills.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No skills found</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredSkills}
                    renderItem={renderSkillCard}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        backgroundColor: '#fff',
        padding: 20,
        paddingTop: 60,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 16,
    },
    searchBox: {
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: '#333',
    },
    list: {
        padding: 16,
        paddingBottom: 32,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
    },
    cardContent: {
        marginBottom: 12,
    },
    skillName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    instructor: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    category: {
        fontSize: 12,
        backgroundColor: '#E3F2FD',
        color: '#007AFF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    description: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    price: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#007AFF',
    },
    duration: {
        fontSize: 12,
        color: '#999',
    },
    bookButton: {
        backgroundColor: '#007AFF',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    bookButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
});