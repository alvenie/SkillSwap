import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: '#007AFF',
                headerShown: false,
            }}>
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarLabel: 'Home',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
                }}
            />
            <Tabs.Screen
                name="browse-skills"
                options={{
                    title: 'Browse',
                    tabBarLabel: 'Browse',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎯</Text>,
                }}
            />
            <Tabs.Screen
                name="video-chat"
                options={{
                    title: 'Video Chat',
                    tabBarLabel: 'Video Chat',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📹</Text>,
                }}
            />
            <Tabs.Screen
                name="manage-skills"
                options={{
                    title: 'My Skills',
                    tabBarLabel: 'My Skills',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📚</Text>,
                }}
            />
            <Tabs.Screen name="payment" options={{ href: null }} />
            <Tabs.Screen name="history" options={{ href: null }} />
        </Tabs>
    );
}