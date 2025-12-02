import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StarRatingProps {
    rating: number;
    reviewCount?: number;
    size?: 'small' | 'medium' | 'large';
    showCount?: boolean;
}

export default function StarRating({
                                       rating,
                                       reviewCount = 0,
                                       size = 'medium',
                                       showCount = true
                                   }: StarRatingProps) {
    const sizes = {
        small: 12,
        medium: 16,
        large: 20,
    };

    const fontSize = sizes[size];
    const textSize = size === 'small' ? 11 : size === 'medium' ? 13 : 15;

    const renderStars = () => {
        const stars = [];
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;

        for (let i = 1; i <= 5; i++) {
            if (i <= fullStars) {
                stars.push(
                    <Text key={i} style={[styles.star, { fontSize, color: '#FCD34D' }]}>
                        ★
                    </Text>
                );
            } else if (i === fullStars + 1 && hasHalfStar) {
                stars.push(
                    <View key={i} style={styles.halfStarContainer}>
                        <Text style={[styles.star, { fontSize, color: '#E5E7EB' }]}>★</Text>
                        <Text style={[styles.halfStar, { fontSize, color: '#FCD34D' }]}>★</Text>
                    </View>
                );
            } else {
                stars.push(
                    <Text key={i} style={[styles.star, { fontSize, color: '#E5E7EB' }]}>
                        ★
                    </Text>
                );
            }
        }

        return stars;
    };

    if (reviewCount === 0 && rating === 0) {
        return (
            <View style={styles.container}>
                <Text style={[styles.noRating, { fontSize: textSize }]}>No reviews yet</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.starsContainer}>
                {renderStars()}
            </View>
            {showCount && reviewCount > 0 && (
                <Text style={[styles.ratingText, { fontSize: textSize }]}>
                    {rating.toFixed(1)} ({reviewCount})
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    starsContainer: {
        flexDirection: 'row',
        gap: 2,
    },
    star: {
        lineHeight: 20,
    },
    halfStarContainer: {
        position: 'relative',
        overflow: 'hidden',
    },
    halfStar: {
        position: 'absolute',
        left: 0,
        width: '50%',
        overflow: 'hidden',
    },
    ratingText: {
        color: '#6B7280',
        fontWeight: '500',
    },
    noRating: {
        color: '#9CA3AF',
        fontStyle: 'italic',
    },
});