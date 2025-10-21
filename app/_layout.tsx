import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native'; // Or a custom splash screen
import { AuthProvider, useAuth } from '../context/AuthContext';

// This component handles the redirection logic
const RootLayoutNav = () => {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Wait for auth state to load
    if (isLoading) {
      return;
    }

    const inAppGroup = segments[0] === '(app)';

    if (user && !inAppGroup) {
      // User is logged in but not in the (app) group, redirect to home
      router.replace('/(app)');
    } else if (!user && inAppGroup) {
      // User is not logged in but is in the (app) group, redirect to login
      router.replace('/(public)/login');
    }
  }, [user, isLoading, segments]);

  // Show a loading screen or null while auth is checking
  if (isLoading) {
    // You can return a custom loading/splash screen here
    return <View />;
  }

  // Render the correct layout (public or app)
  return (
    <Stack>
      {/* Your protected app screens */}
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
      
      {/* Your public auth screens */}
      <Stack.Screen name="(public)" options={{ headerShown: false }} />
      
      {/* Your modal screen */}
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack>
  );
};

// This is the main root layout
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}