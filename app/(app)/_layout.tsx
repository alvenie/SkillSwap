import { Tabs } from 'expo-router';

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: '#007AFF',
                headerShown: false,
            }}>
            <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
            <Tabs.Screen name="browse-skills" options={{ title: 'Browse', tabBarLabel: 'Browse' }} />
            <Tabs.Screen name="manage-skills" options={{ title: 'My Skills', tabBarLabel: 'My Skills' }} />
            <Tabs.Screen name="payment" options={{ href: null }} />
            <Tabs.Screen name="history" options={{ href: null }} />
        </Tabs>
    );
}