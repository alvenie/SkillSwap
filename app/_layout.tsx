import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';

// Your Stripe Publishable Key from Stripe Dashboard
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51SMUvw0PYyjZRDce0rzXOYfn5tZrhBIowfgMr96Or2xGJeEwjOJGWhZQMrNYfcJusbSrpGqECHTVngSC09I6lr4Q00nqd3k0Hu';

function RootLayoutNav() {
    const { user, isLoading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;

        const inAppGroup = segments[0] === '(app)';

        if (user && !inAppGroup) {
            router.replace('/(app)');
        } else if (!user && inAppGroup) {
            router.replace('/(public)/login');
        }
    }, [user, isLoading, segments]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
                <ActivityIndicator size="large" color="#007AFF" />
            </View>
        );
    }

    return (
        <Stack>
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
            <Stack.Screen name="(public)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <AuthProvider>
            <StripeProvider
                publishableKey={STRIPE_PUBLISHABLE_KEY}
                merchantIdentifier="merchant.com.skillswap" // Optional for Apple Pay
            >
                <RootLayoutNav />
            </StripeProvider>
        </AuthProvider>
    );
}