import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from '../../firebaseConfig';

export default function PermissionPage() {

    //Track if location fetching is in progress
    const [loading, setLoading] = useState(true);

    //coords stores the current geolocation
    const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

    //Store any error messages
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Ask permission on mount once, (empty dependency array)
    useEffect(() => {
        (async () => {
            try {
                //Permission request
                const { status } = await Location.requestForegroundPermissionsAsync();
                //if denied, error message
                if (status !== "granted") {
                    setErrorMsg("Permission denied.");
                    setLoading(false);
                    return;
                }

                //If permission granted, fetch geolocation
                const location = await Location.getCurrentPositionAsync({});
                //Save in coords
                setCoords({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                });
            } catch (e) {
                console.log("Location error:", e);
                setErrorMsg("Failed to get location.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Save location to Firebase
    const saveLocation = async (coordsToSave: any) => {
        //Retrieve current authenticated user's uid.
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        await setDoc(doc(db, "users", uid), {
            location: coordsToSave,
            //merge true ensures no other fields are overwritten
        }, { merge: true });

        router.replace("/"); // Navigate to app home after saving
    };

    const handleGrant = () => saveLocation(coords);
    const handleDeny = () => saveLocation(null);

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" />
                <Text style={{ marginTop: 10 }}>{errorMsg || "Checking location permission..."}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Enable Location Access</Text>
            <Text style={styles.subtitle}>
                Skill Swap needs your location to show nearby users.
            </Text>

            <TouchableOpacity style={styles.button} onPress={handleGrant}>
                <Text style={styles.buttonText}>Grant Location Access</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.denyButton} onPress={handleDeny}>
                <Text style={styles.denyText}>No Thanks</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
    title: { fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: 10 },
    subtitle: { fontSize: 16, color: "#555", textAlign: "center", marginBottom: 40 },
    button: { backgroundColor: "#007AFF", padding: 14, borderRadius: 8, width: "80%", marginBottom: 15 },
    buttonText: { color: "white", fontSize: 18, textAlign: "center" },
    denyButton: { padding: 12 },
    denyText: { color: "red", fontSize: 16 },
});
