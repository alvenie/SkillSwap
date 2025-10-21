import { signOut } from 'firebase/auth';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../firebaseConfig';

export default function HomeScreen() {
  const { user } = useAuth(); // Get user info if needed

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // Sign-out successful.
      // The AuthContext listener will update,
      // and the root layout will redirect to login.
    } catch (error: any) {
      Alert.alert('Sign Out Failed', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home Screen</Text>
      {user && <Text style={styles.subtitle}>Welcome, {user.email}!</Text>}
      <Button title="Sign Out" onPress={handleSignOut} color="red" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: 'gray',
    marginBottom: 24,
  },
});