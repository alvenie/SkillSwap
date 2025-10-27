/**
 * Utility functions for conversation management
 */

/**
 * Generate a consistent conversation ID from two user IDs
 * Always returns the same ID regardless of order
 */
export const generateConversationId = (userId1: string, userId2: string): string => {
    return [userId1, userId2].sort().join('_');
};

/**
 * Extract the other user's ID from a conversation ID
 */
export const getOtherUserId = (conversationId: string, currentUserId: string): string => {
    const userIds = conversationId.split('_');
    return userIds[0] === currentUserId ? userIds[1] : userIds[0];
};