import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { addDoc, collection, doc, updateDoc, getDoc, increment } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface ReviewModalProps {
    visible: boolean;
    onClose: () => void;
    meetingId: string;
    reviewerId: string;
    reviewerName: string;
    revieweeId: string;
    revieweeName: string;
}

const COLORS = {
    primaryBrand: '#FCD34D',
    primaryBrandText: '#1F2937',
    background: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    starActive: '#FCD34D',
    starInactive: '#E5E7EB',
};

export default function ReviewModal({
                                        visible,
                                        onClose,
                                        meetingId,
                                        reviewerId,
                                        reviewerName,
                                        revieweeId,
                                        revieweeName,
                                    }: ReviewModalProps) {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmitReview = async () => {
        if (rating === 0) {
            Alert.alert('Rating Required', 'Please select a star rating');
            return;
        }

        try {
            setLoading(true);

            // Create review document
            await addDoc(collection(db, 'reviews'), {
                meetingId,
                reviewerId,
                reviewerName,
                revieweeId,
                revieweeName,
                rating,
                comment: comment.trim(),
                createdAt: new Date().toISOString(),
            });

            // Update reviewee's rating statistics
            const userRef = doc(db, 'users', revieweeId);
            const userDoc = await getDoc(userRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                const currentRating = userData.averageRating || 0;
                const currentCount = userData.reviewCount || 0;

                // Calculate new average
                const newCount = currentCount + 1;
                const newAverage = ((currentRating * currentCount) + rating) / newCount;

                await updateDoc(userRef, {
                    averageRating: newAverage,
                    reviewCount: newCount,
                });
            }

            Alert.alert('Success', 'Thank you for your review!');
            resetForm();
            onClose();
        } catch (error) {
            console.error('Error submitting review:', error);
            Alert.alert('Error', 'Failed to submit review. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setRating(0);
        setComment('');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const renderStars = () => {
        return (
            <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                        key={star}
                        onPress={() => setRating(star)}
                        style={styles.starButton}
                    >
                        <Text
                            style={[
                                styles.star,
                                star <= rating ? styles.starFilled : styles.starEmpty,
                            ]}
                        >
                            ★
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Rate Your Experience</Text>
                        <TouchableOpacity onPress={handleClose}>
                            <Text style={styles.closeButton}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Reviewee Info */}
                    <View style={styles.infoBox}>
                        <Text style={styles.infoLabel}>How was your session with:</Text>
                        <Text style={styles.revieweeName}>{revieweeName}</Text>
                    </View>

                    {/* Star Rating */}
                    <View style={styles.ratingSection}>
                        <Text style={styles.label}>Your Rating *</Text>
                        {renderStars()}
                        {rating > 0 && (
                            <Text style={styles.ratingText}>
                                {rating} {rating === 1 ? 'star' : 'stars'}
                            </Text>
                        )}
                    </View>

                    {/* Comment */}
                    <View style={styles.commentSection}>
                        <Text style={styles.label}>Your Review (Optional)</Text>
                        <TextInput
                            style={styles.commentInput}
                            placeholder="Share your experience..."
                            value={comment}
                            onChangeText={setComment}
                            multiline
                            numberOfLines={4}
                            maxLength={500}
                            placeholderTextColor={COLORS.textSecondary}
                        />
                        <Text style={styles.characterCount}>{comment.length}/500</Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={handleClose}
                            disabled={loading}
                        >
                            <Text style={styles.cancelButtonText}>Skip</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.submitButton, loading && styles.disabledButton]}
                            onPress={handleSubmitReview}
                            disabled={loading || rating === 0}
                        >
                            {loading ? (
                                <ActivityIndicator color={COLORS.primaryBrandText} />
                            ) : (
                                <Text style={styles.submitButtonText}>Submit Review</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: COLORS.background,
        borderRadius: 20,
        padding: 24,
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    closeButton: {
        fontSize: 28,
        color: COLORS.textSecondary,
        fontWeight: '300',
    },
    infoBox: {
        backgroundColor: '#FFF9E6',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    infoLabel: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginBottom: 4,
    },
    revieweeName: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    ratingSection: {
        marginBottom: 24,
        alignItems: 'center',
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: 12,
    },
    starsContainer: {
        flexDirection: 'row',
        gap: 8,
        marginVertical: 8,
    },
    starButton: {
        padding: 4,
    },
    star: {
        fontSize: 40,
    },
    starFilled: {
        color: COLORS.starActive,
    },
    starEmpty: {
        color: COLORS.starInactive,
    },
    ratingText: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 8,
    },
    commentSection: {
        marginBottom: 24,
    },
    commentInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        color: COLORS.textPrimary,
        textAlignVertical: 'top',
        minHeight: 100,
    },
    characterCount: {
        fontSize: 12,
        color: COLORS.textSecondary,
        textAlign: 'right',
        marginTop: 4,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#F3F4F6',
    },
    submitButton: {
        backgroundColor: COLORS.primaryBrand,
    },
    disabledButton: {
        opacity: 0.6,
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    submitButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.primaryBrandText,
    },
});