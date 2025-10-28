import { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    RefreshControl,
    Modal,
    TextInput,
    Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { useRouter } from 'expo-router';

interface Skill {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    skillName: string;
    category: string;
    description: string;
    price: number;
    duration: string;
    isAvailable: boolean;
    createdAt: string;
    updatedAt: string;
}

type TabType = 'browse' | 'manage';

export default function SkillsScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>('browse');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Browse tab state
    const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
    const [filteredSkills, setFilteredSkills] = useState<Skill[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');

    // Manage tab state
    const [mySkills, setMySkills] = useState<Skill[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
    const [formData, setFormData] = useState({
        skillName: '',
        category: '',
        description: '',
        price: '',
        duration: '1 hour',
        isAvailable: true,
    });

    const CATEGORIES = ['All', 'Music', 'Technology', 'Language', 'Fitness', 'Arts', 'Business', 'Other'];
    const DURATIONS = ['30 mins', '1 hour', '1.5 hours', '2 hours', '3 hours', 'Custom'];

    useFocusEffect(
        useCallback(() => {
            loadSkills();
        }, [activeTab])
    );

    useEffect(() => {
        loadSkills();
    }, [activeTab]);

    const loadSkills = async () => {
        if (!user) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const skillsRef = collection(db, 'skills');

            if (activeTab === 'browse') {
                // Load all available skills from other users
                const q = query(skillsRef, where('isAvailable', '==', true));
                const querySnapshot = await getDocs(q);

                const skills: Skill[] = [];
                querySnapshot.forEach((doc) => {
                    if (doc.data().userId !== user.uid) {
                        skills.push({
                            id: doc.id,
                            ...doc.data(),
                        } as Skill);
                    }
                });

                setAvailableSkills(skills);
                setFilteredSkills(skills);
            } else {
                // Load user's own skills
                const q = query(skillsRef, where('userId', '==', user.uid));
                const querySnapshot = await getDocs(q);

                const skills: Skill[] = [];
                querySnapshot.forEach((doc) => {
                    skills.push({
                        id: doc.id,
                        ...doc.data(),
                    } as Skill);
                });

                setMySkills(skills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            }
        } catch (error: any) {
            console.error('Error loading skills:', error);
            Alert.alert('Error', 'Could not load skills. Please try again.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleSearch = (text: string) => {
        setSearchText(text);
        filterSkills(text, selectedCategory);
    };

    const handleCategoryFilter = (category: string) => {
        setSelectedCategory(category);
        filterSkills(searchText, category);
    };

    const filterSkills = (search: string, category: string) => {
        let filtered = availableSkills;

        if (category !== 'All') {
            filtered = filtered.filter(skill => skill.category === category);
        }

        if (search.trim()) {
            filtered = filtered.filter(skill =>
                skill.skillName.toLowerCase().includes(search.toLowerCase()) ||
                skill.description.toLowerCase().includes(search.toLowerCase()) ||
                skill.userName.toLowerCase().includes(search.toLowerCase())
            );
        }

        setFilteredSkills(filtered);
    };

    const handleBookSkill = (skill: Skill) => {
        router.push({
            pathname: '/(app)/payment',
            params: {
                skillName: skill.skillName,
                skillPrice: skill.price.toString(),
                skillDuration: skill.duration,
                instructor: skill.userName,
                instructorEmail: skill.userEmail,
            },
        });
    };

    const handleAddSkill = () => {
        setEditingSkill(null);
        setFormData({
            skillName: '',
            category: '',
            description: '',
            price: '',
            duration: '1 hour',
            isAvailable: true,
        });
        setShowModal(true);
    };

    const handleEditSkill = (skill: Skill) => {
        setEditingSkill(skill);
        setFormData({
            skillName: skill.skillName,
            category: skill.category,
            description: skill.description,
            price: skill.price.toString(),
            duration: skill.duration,
            isAvailable: skill.isAvailable,
        });
        setShowModal(true);
    };

    const handleSaveSkill = async () => {
        if (!formData.skillName || !formData.category || !formData.price) {
            Alert.alert('Validation Error', 'Please fill in all required fields');
            return;
        }

        const price = parseFloat(formData.price);
        if (isNaN(price) || price < 0) {
            Alert.alert('Validation Error', 'Please enter a valid price');
            return;
        }

        try {
            const skillData = {
                skillName: formData.skillName,
                category: formData.category,
                description: formData.description,
                price: price,
                duration: formData.duration,
                isAvailable: formData.isAvailable,
                updatedAt: new Date().toISOString(),
            };

            if (editingSkill) {
                await updateDoc(doc(db, 'skills', editingSkill.id), skillData);
                Alert.alert('Success', 'Skill updated successfully!');
            } else {
                await addDoc(collection(db, 'skills'), {
                    ...skillData,
                    userId: user?.uid,
                    userName: user?.displayName || user?.email,
                    userEmail: user?.email,
                    createdAt: new Date().toISOString(),
                });
                Alert.alert('Success', 'Skill added successfully!');
            }

            setShowModal(false);
            loadSkills();
        } catch (error: any) {
            console.error('Error saving skill:', error);
            Alert.alert('Error', 'Could not save skill. Please try again.');
        }
    };

    const handleDeleteSkill = (skillId: string, skillName: string) => {
        Alert.alert(
            'Delete Skill',
            `Are you sure you want to delete "${skillName}"? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, 'skills', skillId));
                            Alert.alert('Deleted', 'Skill removed successfully');
                            loadSkills();
                        } catch (error: any) {
                            console.error('Error deleting skill:', error);
                            Alert.alert('Error', 'Could not delete skill. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadSkills();
    };

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            Music: '#FF6B6B',
            Technology: '#4ECDC4',
            Language: '#45B7D1',
            Fitness: '#FFA07A',
            Arts: '#DDA0DD',
            Business: '#87CEEB',
            Other: '#A9A9A9',
        };
        return colors[category] || '#999';
    };

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        } catch {
            return dateString;
        }
    };

    const renderBrowseTab = () => (
        <>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchBox}
                    placeholder="Search skills or instructors..."
                    value={searchText}
                    onChangeText={handleSearch}
                    placeholderTextColor="#999"
                />
            </View>

            {/* Category Filter */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
                contentContainerStyle={styles.categoryContainer}
            >
                {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                        key={cat}
                        style={[
                            styles.categoryChip,
                            selectedCategory === cat && styles.categoryChipActive,
                        ]}
                        onPress={() => handleCategoryFilter(cat)}
                    >
                        <Text
                            style={[
                                styles.categoryChipText,
                                selectedCategory === cat && styles.categoryChipTextActive,
                            ]}
                        >
                            {cat}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Skills Grid */}
            {filteredSkills.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🔍</Text>
                    <Text style={styles.emptyText}>No skills found</Text>
                    <Text style={styles.emptySubtext}>
                        Try adjusting your search or filters
                    </Text>
                </View>
            ) : (
                <View style={styles.skillsGrid}>
                    {filteredSkills.map((skill) => (
                        <View key={skill.id} style={styles.skillCard}>
                            <View
                                style={[
                                    styles.categoryBadge,
                                    { backgroundColor: getCategoryColor(skill.category) + '20' },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.categoryBadgeText,
                                        { color: getCategoryColor(skill.category) },
                                    ]}
                                >
                                    {skill.category}
                                </Text>
                            </View>

                            <Text style={styles.skillCardTitle}>{skill.skillName}</Text>
                            <Text style={styles.instructorName}>by {skill.userName}</Text>

                            <Text style={styles.skillDescription} numberOfLines={2}>
                                {skill.description || 'No description provided'}
                            </Text>

                            <View style={styles.skillCardFooter}>
                                <View>
                                    <Text style={styles.priceLabel}>Price</Text>
                                    <Text style={styles.priceValue}>${skill.price.toFixed(2)}</Text>
                                </View>
                                <View>
                                    <Text style={styles.durationLabel}>Duration</Text>
                                    <Text style={styles.durationValue}>{skill.duration}</Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={styles.bookButton}
                                onPress={() => handleBookSkill(skill)}
                            >
                                <Text style={styles.bookButtonText}>Book Now</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}
        </>
    );

    const renderManageTab = () => (
        <>
            <View style={styles.manageHeader}>
                <Text style={styles.manageTitle}>
                    {mySkills.length} {mySkills.length === 1 ? 'skill' : 'skills'} listed
                </Text>
                <TouchableOpacity style={styles.addButton} onPress={handleAddSkill}>
                    <Text style={styles.addButtonText}>+ Add Skill</Text>
                </TouchableOpacity>
            </View>

            {mySkills.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>📚</Text>
                    <Text style={styles.emptyText}>No skills yet</Text>
                    <Text style={styles.emptySubtext}>
                        Add your first skill to start teaching others
                    </Text>
                    <TouchableOpacity style={styles.emptyButton} onPress={handleAddSkill}>
                        <Text style={styles.emptyButtonText}>Add Your First Skill</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.skillsList}>
                    {mySkills.map((skill) => (
                        <View key={skill.id} style={styles.mySkillCard}>
                            <View style={styles.mySkillHeader}>
                                <View style={styles.mySkillInfo}>
                                    <View
                                        style={[
                                            styles.categoryBadge,
                                            { backgroundColor: getCategoryColor(skill.category) + '20' },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.categoryBadgeText,
                                                { color: getCategoryColor(skill.category) },
                                            ]}
                                        >
                                            {skill.category}
                                        </Text>
                                    </View>
                                    <Text style={styles.mySkillName}>{skill.skillName}</Text>
                                    <Text style={styles.mySkillDescription} numberOfLines={2}>
                                        {skill.description || 'No description provided'}
                                    </Text>
                                </View>
                                {skill.isAvailable && <Text style={styles.activeIndicator}>🟢</Text>}
                            </View>

                            <View style={styles.mySkillDetails}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>💵 Price:</Text>
                                    <Text style={styles.priceValue}>${skill.price.toFixed(2)}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>⏱️ Duration:</Text>
                                    <Text style={styles.detailValue}>{skill.duration}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>📅 Added:</Text>
                                    <Text style={styles.detailValue}>{formatDate(skill.createdAt)}</Text>
                                </View>
                            </View>

                            <View style={styles.actionButtons}>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.editButton]}
                                    onPress={() => handleEditSkill(skill)}
                                >
                                    <Text style={styles.editButtonText}>✏️ Edit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.deleteButton]}
                                    onPress={() => handleDeleteSkill(skill.id, skill.skillName)}
                                >
                                    <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading skills...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {/* Header with Tabs */}
            <View style={styles.header}>
                <Text style={styles.title}>Skills</Text>
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'browse' && styles.tabActive]}
                        onPress={() => setActiveTab('browse')}
                    >
                        <Text style={[styles.tabText, activeTab === 'browse' && styles.tabTextActive]}>
                            Browse
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'manage' && styles.tabActive]}
                        onPress={() => setActiveTab('manage')}
                    >
                        <Text style={[styles.tabText, activeTab === 'manage' && styles.tabTextActive]}>
                            My Skills
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
                }
            >
                {activeTab === 'browse' ? renderBrowseTab() : renderManageTab()}
                <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Add/Edit Modal */}
            <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
                <SafeAreaView style={styles.modalContainer}>
                    <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setShowModal(false)}>
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                            <Text style={styles.modalTitle}>
                                {editingSkill ? 'Edit Skill' : 'Add New Skill'}
                            </Text>
                            <View style={{ width: 40 }} />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Skill Name *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g., Guitar Lessons"
                                value={formData.skillName}
                                onChangeText={(text) => setFormData({ ...formData, skillName: text })}
                                placeholderTextColor="#ccc"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Category *</Text>
                            <View style={styles.categoryModalContainer}>
                                {CATEGORIES.filter(c => c !== 'All').map((cat) => (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[
                                            styles.categoryButton,
                                            formData.category === cat && styles.categoryButtonActive,
                                        ]}
                                        onPress={() => setFormData({ ...formData, category: cat })}
                                    >
                                        <Text
                                            style={[
                                                styles.categoryButtonText,
                                                formData.category === cat && styles.categoryButtonTextActive,
                                            ]}
                                        >
                                            {cat}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Description</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Describe your skill and what students will learn..."
                                value={formData.description}
                                onChangeText={(text) => setFormData({ ...formData, description: text })}
                                multiline
                                numberOfLines={4}
                                placeholderTextColor="#ccc"
                            />
                        </View>

                        <View style={styles.formRow}>
                            <View style={[styles.formGroup, { flex: 1, marginRight: 12 }]}>
                                <Text style={styles.formLabel}>Price ($) *</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="50"
                                    value={formData.price}
                                    onChangeText={(text) => setFormData({ ...formData, price: text })}
                                    keyboardType="decimal-pad"
                                    placeholderTextColor="#ccc"
                                />
                            </View>

                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.formLabel}>Duration</Text>
                                <TouchableOpacity
                                    style={styles.durationSelect}
                                    onPress={() => {
                                        Alert.alert(
                                            'Select Duration',
                                            '',
                                            DURATIONS.map((d) => ({
                                                text: d,
                                                onPress: () => setFormData({ ...formData, duration: d }),
                                            }))
                                        );
                                    }}
                                >
                                    <Text style={styles.durationSelectText}>{formData.duration}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <View style={styles.switchRow}>
                                <Text style={styles.formLabel}>Make Available</Text>
                                <Switch
                                    value={formData.isAvailable}
                                    onValueChange={(value) => setFormData({ ...formData, isAvailable: value })}
                                    trackColor={{ false: '#ccc', true: '#81C784' }}
                                    thumbColor={formData.isAvailable ? '#4CAF50' : '#999'}
                                />
                            </View>
                        </View>

                        <View style={styles.modalButtonContainer}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setShowModal(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalButton, styles.saveButton]}
                                onPress={handleSaveSkill}
                            >
                                <Text style={styles.saveButtonText}>
                                    {editingSkill ? 'Update Skill' : 'Add Skill'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalSpacer} />
                    </ScrollView>
                </SafeAreaView>
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
        backgroundColor: '#fff',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 16,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 6,
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#007AFF',
    },
    tabText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#666',
    },
    tabTextActive: {
        color: '#fff',
    },
    content: {
        flex: 1,
    },
    searchContainer: {
        padding: 20,
        paddingBottom: 12,
    },
    searchBox: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#ddd',
        color: '#333',
    },
    categoryScroll: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    categoryContainer: {
        gap: 8,
    },
    categoryChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    categoryChipActive: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    categoryChipText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#666',
    },
    categoryChipTextActive: {
        color: '#fff',
    },
    skillsGrid: {
        paddingHorizontal: 20,
    },
    skillCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    categoryBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    categoryBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    skillCardTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    instructorName: {
        fontSize: 14,
        color: '#666',
        marginBottom: 12,
    },
    skillDescription: {
        fontSize: 14,
        color: '#999',
        lineHeight: 20,
        marginBottom: 16,
    },
    skillCardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    priceLabel: {
        fontSize: 12,
        color: '#999',
        marginBottom: 4,
    },
    priceValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#007AFF',
    },
    durationLabel: {
        fontSize: 12,
        color: '#999',
        marginBottom: 4,
        textAlign: 'right',
    },
    durationValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        textAlign: 'right',
    },
    bookButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    bookButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    manageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingBottom: 16,
    },
    manageTitle: {
        fontSize: 16,
        color: '#666',
    },
    addButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    addButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    skillsList: {
        paddingHorizontal: 20,
    },
    mySkillCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#007AFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    mySkillHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    mySkillInfo: {
        flex: 1,
    },
    mySkillName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    mySkillDescription: {
        fontSize: 13,
        color: '#999',
        lineHeight: 18,
    },
    activeIndicator: {
        fontSize: 20,
    },
    mySkillDetails: {
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        paddingTop: 12,
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    detailLabel: {
        fontSize: 13,
        color: '#666',
    },
    detailValue: {
        fontSize: 13,
        color: '#333',
        fontWeight: '500',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    editButton: {
        backgroundColor: '#E3F2FD',
    },
    editButtonText: {
        color: '#007AFF',
        fontWeight: '600',
        fontSize: 14,
    },
    deleteButton: {
        backgroundColor: '#FFEBEE',
    },
    deleteButtonText: {
        color: '#F44336',
        fontWeight: '600',
        fontSize: 14,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
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
    emptyButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    emptyButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    modalContent: {
        flex: 1,
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
    },
    modalCloseText: {
        fontSize: 28,
        color: '#666',
        fontWeight: 'bold',
    },
    formGroup: {
        marginBottom: 20,
    },
    formLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#fff',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#ddd',
        color: '#333',
    },
    textArea: {
        textAlignVertical: 'top',
        paddingTop: 12,
        minHeight: 100,
    },
    formRow: {
        flexDirection: 'row',
    },
    categoryModalContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    categoryButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: '#f0f0f0',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    categoryButtonActive: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    categoryButtonText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '500',
    },
    categoryButtonTextActive: {
        color: '#fff',
    },
    durationSelect: {
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    durationSelectText: {
        fontSize: 16,
        color: '#333',
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    modalButtonContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    cancelButtonText: {
        color: '#007AFF',
        fontSize: 16,
        fontWeight: '600',
    },
    saveButton: {
        backgroundColor: '#007AFF',
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    modalSpacer: {
        height: 20,
    },
    bottomSpacer: {
        height: 20,
    },
});