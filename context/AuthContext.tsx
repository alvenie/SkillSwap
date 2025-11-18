import { signOut as firebaseSignOut, onAuthStateChanged, User } from 'firebase/auth';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { auth } from '../firebaseConfig'; // Import auth object

// Define the shape of the context data
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>; 
}

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create the provider component
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user); // Set the user (will be null if logged out)
      setIsLoading(false); // Done loading
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Wrapper function
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // The onAuthStateChanged listener above will automatically handle setting user to null
    } catch (error){
      console.error("Error signing out: ", error);
      throw error;
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

// Create a custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};