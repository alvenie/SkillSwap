import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

// predefined list of popular skills users can choose from
const COMMON_SKILLS = [
    'Cooking',
    'Guitar',
    'Piano',
    'Singing',
    'Dancing',
    'Photography',
    'Web Development',
    'Mobile Development',
    'Graphic Design',
    'Video Editing',
    'Writing',
    'Public Speaking',
    'Yoga',
    'Fitness Training',
    'Language (Spanish)',
    'Language (French)',
    'Language (German)',
    'Painting',
    'Drawing',
    'Marketing',
    'Business Strategy',
    'Accounting',
    'Chess',
];

// screen for editing user profile information and skills
export default function EditProfileScreen() {
    // state variables
    const { user } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // profile form fields
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [skillsTeaching, setSkillsTeaching] = useState<string[]>([]);
    const [skillsLearning, setSkillsLearning] = useState<string[]>([]);

    // modal state for adding skills
    const [showSkillModal, setShowSkillModal] = useState(false);
    const [skillModalType, setSkillModalType] = useState<'teaching' | 'learning'>('teaching');
    const [customSkill, setCustomSkill] = useState('');

    // load user profile on mount
    useEffect(() => {
        loadProfile();
    }, []);

    // fetch user data from firestore
    const loadProfile = async () => {
        if (!user) return;

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));

            // populate form fields with existing data 
            if (userDoc.exists()) {
                const data = userDoc.data();
                setDisplayName(data.displayName || user.email || 'User');
                setBio(data.bio || '');
                setSkillsTeaching(data.skillsTeaching || []);
                setSkillsLearning(data.skillsLearning || []);
            } else {
                // fallback for new users
                setDisplayName(user.email || 'User');
            }
        } catch (error: any) {
            console.error('Error loading profile:', error);
            Alert.alert('Error', 'Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    // save profile changes to firestore
    const handleSaveProfile = async () => {
        if (!user) return;

        if (!displayName.trim()) {
            Alert.alert('Validation Error', 'Display name is required');
            return;
        }

        try {
            setSaving(true);

            // merge with existing data to avoid overwriting other fields
            await setDoc(
                doc(db, 'users', user.uid),
                {
                    uid: user.uid,
                    email: user.email,
                    displayName: displayName.trim(),
                    bio: bio.trim(),
                    skillsTeaching,
                    skillsLearning,
                    updatedAt: new Date().toISOString(),
                },
                { merge: true } // merge with existing document
            );

            Alert.alert('Success', 'Profile updated successfully!', [
                {
                    text: 'OK',
                    onPress: () => router.push('/(app)/profile'),
                },
            ]);
        } catch (error: any) {
            console.error('Error saving profile:', error);
            Alert.alert('Error', 'Failed to save profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // open modal to add a skill (teaching or learning)
    const openSkillModal = (type: 'teaching' | 'learning') => {
        setSkillModalType(type);
        setCustomSkill('');
        setShowSkillModal(true);
    };

    // add a skill to the appropriate list
    const addSkill = (skill: string) => {
        const trimmedSkill = skill.trim();
        if (!trimmedSkill) return;

        if (skillModalType === 'teaching') {
            // avoid duplicates
            if (!skillsTeaching.includes(trimmedSkill)) {
                setSkillsTeaching([...skillsTeaching, trimmedSkill]);
            }
        } else {
            if (!skillsLearning.includes(trimmedSkill)) {
                setSkillsLearning([...skillsLearning, trimmedSkill]);
            }
        }

        // close modal and reset input
        setShowSkillModal(false);
        setCustomSkill('');
    };

    // remove a skill from the list
    const removeSkill = (skill: string, type: 'teaching' | 'learning') => {
        if (type === 'teaching') { // remove from teaching skills
            setSkillsTeaching(skillsTeaching.filter((s) => s !== skill));
        } else { // remove from learning skills
            setSkillsLearning(skillsLearning.filter((s) => s !== skill));
        }
    };

    // show loading spinner while fetching profile
    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        // main edit profile screen
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* header with back button */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.push('/(app)/profile')} style={styles.backButton}>
                        <Text style={styles.backButtonText}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Edit Profile</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.form}>
                    {/* display name field - required */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Display Name *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Your name"
                            value={displayName}
                            onChangeText={setDisplayName}
                            placeholderTextColor="#999"
                        />
                    </View>

                    {/* bio field with character counter */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Bio</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            placeholder="Tell us about yourself..."
                            value={bio}
                            onChangeText={setBio}
                            multiline
                            numberOfLines={4}
                            placeholderTextColor="#999"
                        />
                        <Text style={styles.hint}>
                            {bio.length}/200 characters
                        </Text>
                    </View>

                    {/* skills user can teach */}
                    <View style={styles.formGroup}>
                        <View style={styles.skillsHeader}>
                            <Text style={styles.label}>Skills I Can Teach</Text>
                            <TouchableOpacity onPress={() => openSkillModal('teaching')}>
                                <Text style={styles.addSkillButton}>+ Add Skill</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.skillsContainer}>
                            {skillsTeaching.map((skill, index) => (
                                <View key={index} style={[styles.skillChip, styles.teachingChip]}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                    <TouchableOpacity
                                        onPress={() => removeSkill(skill, 'teaching')}
                                        style={styles.removeButton}
                                    >
                                        <Text style={styles.removeButtonText}>✕</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                            {skillsTeaching.length === 0 && (
                                <Text style={styles.emptyText}>No skills added yet</Text>
                            )}
                        </View>
                    </View>

                    {/* skills user wants to learn */}
                    <View style={styles.formGroup}>
                        <View style={styles.skillsHeader}>
                            <Text style={styles.label}>Skills I Want to Learn</Text>
                            <TouchableOpacity onPress={() => openSkillModal('learning')}>
                                <Text style={styles.addSkillButton}>+ Add Skill</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.skillsContainer}>
                            {skillsLearning.map((skill, index) => (
                                <View key={index} style={[styles.skillChip, styles.learningChip]}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                    <TouchableOpacity
                                        onPress={() => removeSkill(skill, 'learning')}
                                        style={styles.removeButton}
                                    >
                                        <Text style={styles.removeButtonText}>✕</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                            {skillsLearning.length === 0 && (
                                <Text style={styles.emptyText}>No learning goals yet</Text>
                            )}
                        </View>
                    </View>

                    {/* save button */}
                    <TouchableOpacity
                        style={[styles.saveButton, saving && styles.disabledButton]}
                        onPress={handleSaveProfile}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.saveButtonText}>Save Profile</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* modal for adding skills - shows common skills and custom input */}
            <Modal visible={showSkillModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {skillModalType === 'teaching'
                                    ? 'Add Teaching Skill'
                                    : 'Add Learning Goal'}
                            </Text>
                            <TouchableOpacity onPress={() => setShowSkillModal(false)}>
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalScroll}>
                            {/* custom skill input */}
                            <View style={styles.customSkillSection}>
                                <Text style={styles.modalSectionTitle}>Custom Skill</Text>
                                <View style={styles.customSkillInput}>
                                    <TextInput
                                        style={styles.customSkillTextInput}
                                        placeholder="Enter custom skill..."
                                        value={customSkill}
                                        onChangeText={setCustomSkill}
                                        placeholderTextColor="#999"
                                    />
                                    <TouchableOpacity
                                        style={styles.addCustomButton}
                                        onPress={() => addSkill(customSkill)}
                                        disabled={!customSkill.trim()}
                                    >
                                        <Text style={styles.addCustomButtonText}>Add</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* predefined common skills grid */}
                            <Text style={styles.modalSectionTitle}>Common Skills</Text>
                            <View style={styles.commonSkillsGrid}>
                                {COMMON_SKILLS.map((skill, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={styles.commonSkillButton}
                                        onPress={() => addSkill(skill)}
                                    >
                                        <Text style={styles.commonSkillText}>{skill}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// styles
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
    content: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
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
        fontSize: 24,
        color: '#666',
        fontWeight: 'bold',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    form: {
        padding: 20,
    },
    formGroup: {
        marginBottom: 24,
    },
    label: {
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
    hint: {
        fontSize: 12,
        color: '#999',
        marginTop: 4,
        textAlign: 'right',
    },
    skillsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    addSkillButton: {
        fontSize: 14,
        color: '#D97706',
        fontWeight: '600',
    },
    skillsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    skillChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 8,
        borderRadius: 16,
        marginRight: 8,
        marginBottom: 8,
    },
    teachingChip: {
        backgroundColor: '#E3F2FD',
    },
    learningChip: {
        backgroundColor: '#FFF3E0',
    },
    skillChipText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
        marginRight: 8,
    },
    removeButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeButtonText: {
        fontSize: 12,
        color: '#666',
        fontWeight: 'bold',
    },
    emptyText: {
        fontSize: 14,
        color: '#999',
        fontStyle: 'italic',
    },
    saveButton: {
        backgroundColor: '#FCD34D',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 12,
    },
    disabledButton: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    bottomSpacer: {
        height: 40,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    modalCloseText: {
        fontSize: 24,
        color: '#666',
        fontWeight: 'bold',
    },
    modalScroll: {
        padding: 20,
    },
    modalSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
        marginTop: 12,
    },
    customSkillSection: {
        marginBottom: 12,
    },
    customSkillInput: {
        flexDirection: 'row',
        gap: 8,
    },
    customSkillTextInput: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#ddd',
        color: '#333',
    },
    addCustomButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 20,
        borderRadius: 8,
        justifyContent: 'center',
    },
    addCustomButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    commonSkillsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    commonSkillButton: {
        backgroundColor: '#f5f5f5',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    commonSkillText: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
});