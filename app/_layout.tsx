// Root Layout - handles app-wide navigation and provider setup
// Implements protected routes based on authentication status

import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';

// Stripe configuration for payment processing
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51SMUvw0PYyjZRDce0rzXOYfn5tZrhBIowfgMr96Or2xGJeEwjOJGWhZQMrNYfcJusbSrpGqECHTVngSC09I6lr4Q00nqd3k0Hu';

function RootLayoutNav() {
    const { user, isLoading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    /**
     * IMPORTANT: Protected route logic
     * Automatically redirects users based on authentication status:
     * - Logged in users → app screens
     * - Logged out users → login screen
     *
     * This prevents accessing protected screens without authentication
     */
    useEffect(() => {
        // Wait for auth state to be determined
        if (isLoading) return;

        // Check if user is currently in the app group (protected routes)
        const inAppGroup = segments[0] === '(app)';

        if (user && !inAppGroup) {
            // User is logged in but on public screen → redirect to app
            router.replace('/(app)');
        } else if (!user && inAppGroup) {
            // User is logged out but on protected screen → redirect to login
            router.replace('/(public)/login');
        }
    }, [user, isLoading, segments]);

    // Show loading screen while checking authentication status
    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
                <ActivityIndicator size="large" color="#007AFF" />
            </View>
        );
    }

    // Define app navigation structure
    return (
        <Stack>
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
            <Stack.Screen name="(public)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
    );
}

/**
 * Main app entry point
 * Wraps the app with required providers:
 * - AuthProvider: Manages authentication state
 * - StripeProvider: Enables payment processing
 */
export default function RootLayout() {
    return (
        <AuthProvider>
            <StripeProvider
                publishableKey={STRIPE_PUBLISHABLE_KEY}
                merchantIdentifier="merchant.com.skillswap"
            >
                <RootLayoutNav />
            </StripeProvider>
        </AuthProvider>
    );
}