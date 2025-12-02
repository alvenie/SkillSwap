import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"; //For UI and styling
import MapView, { Marker, Circle, UrlTile } from "react-native-maps"; //Map component (used for OSM maps)
import Slider from "@react-native-community/slider"; //For adjustable slider to select desired radius
import * as Location from "expo-location"; //Provides GPS location access
import { db, auth } from '../../firebaseConfig';
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

export default function Index() {
    // region holds current map region, i.e., latitude, longitude, and zoom level.
    const [region, setRegion] = useState<{latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number} | null>(null);

    // search radius around the user in meters.
    const [radius, setRadius] = useState(2000);

    // errorMsg stores permission or location errors.
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // showPermissionPrompt indicates if the user needs to grant location
    const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

    // users holds all other users fetched from Firebase
    const [users, setUsers] = useState<any[]>([]);

    // Default region to satisfy MapView render requirements
    const defaultRegion = {
        latitude: 0,
        longitude: 0,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
    };

    // Fetch current user's location from Firebase
    useEffect(() => {
        (async () => {
            try {
                if (!auth.currentUser) {
                    setErrorMsg("User not logged in");
                    return;
                }

                // Fetch the user's document from Firestore
                const userDocRef = doc(db, "users", auth.currentUser.uid);
                const userSnapshot = await getDoc(userDocRef);

                if (!userSnapshot.exists()) {
                    setErrorMsg("User data not found in database");
                    return;
                }

                const userData = userSnapshot.data();
                const userLocation = userData.location;

                if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
                    // Show permission prompt if no location found
                    setShowPermissionPrompt(true);
                    return;
                }

                // Set map region using Firebase coordinates
                setRegion({
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                    latitudeDelta: 0.04,
                    longitudeDelta: 0.04,
                });
            } catch (error) {
                console.error("Error fetching user location:", error);
                setErrorMsg("Failed to load location from database");
            }
        })();
    }, []);

    // Fetch all users from Firebase once region is available
    useEffect(() => {
        if (!region) return;

        const fetchUsers = async () => {
            try {
                const usersSnapshot = await getDocs(collection(db, "users"));
                const allUsers: any[] = [];

                usersSnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    // Skip current user
                    if (data.uid === auth.currentUser?.uid) return;
                    if (!data.location || !data.location.latitude || !data.location.longitude) return;
                    allUsers.push({
                        id: data.uid,
                        name: data.displayName || data.username || "Unnamed",
                        latitude: data.location.latitude,
                        longitude: data.location.longitude,
                    });
                });

                setUsers(allUsers);
            } catch (e) {
                console.log("Error fetching users:", e);
            }
        };

        fetchUsers();
    }, [region]);

    // Haversine distance check to find nearby users within radius
    const nearbyUsers = region
        ? users.filter((u) => {
            const R = 6371e3; // earth radius in meters
            const φ1 = (region.latitude * Math.PI) / 180;
            const φ2 = (u.latitude * Math.PI) / 180;
            const Δφ = ((u.latitude - region.latitude) * Math.PI) / 180;
            const Δλ = ((u.longitude - region.longitude) * Math.PI) / 180;

            const a =
                Math.sin(Δφ / 2) ** 2 +
                Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const d = R * c;

            return d <= radius;
        })
        : [];

    return (
        <View style={styles.container}>
            {/* Always render MapView with a region (default until real location is available) */}
            <MapView
                style={styles.map}
                region={region ?? defaultRegion}
                showsUserLocation={true}
                loadingEnabled={true}
                pitchEnabled={false}
                rotateEnabled={false}
                zoomControlEnabled={true}
            >
                {/* OSM Tile Layer */}
                <UrlTile
                    urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maximumZ={19}
                    tileSize={256}
                />

                {/* Draw a circle and markers only if region exists */}
                {region && (
                    <>
                        <Circle
                            center={region}
                            radius={radius}
                            strokeColor="rgba(0,150,255,0.5)"
                            fillColor="rgba(0,150,255,0.1)"
                        />
                        {nearbyUsers.map((u) => (
                            <Marker
                                key={u.id}
                                coordinate={{ latitude: u.latitude, longitude: u.longitude }}
                                title={u.name}
                            />
                        ))}
                    </>
                )}
            </MapView>

            {/* Slider control */}
            {region && (
                <View style={styles.sliderContainer}>
                    <Text style={styles.sliderText}>
                        Radius: {(radius / 1000).toFixed(1)} km
                    </Text>
                    <Slider
                        style={{ width: "90%", height: 40 }}
                        minimumValue={500}
                        maximumValue={10000}
                        step={500}
                        value={radius}
                        onValueChange={setRadius}
                        minimumTrackTintColor="#0096FF"
                        maximumTrackTintColor="#000000"
                    />
                </View>
            )}

            {/* Permission prompt overlay */}
            {showPermissionPrompt && (
                <View style={styles.permissionOverlay}>
                    <Text style={styles.title}>Enable Location Access</Text>
                    <Text style={styles.subtitle}>
                        Skill Swap needs your location to show nearby users.
                    </Text>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={async () => {
                            try {
                                const { status } = await Location.requestForegroundPermissionsAsync();
                                if (status !== "granted") return;

                                const location = await Location.getCurrentPositionAsync({});
                                const coordsToSave = {
                                    latitude: location.coords.latitude,
                                    longitude: location.coords.longitude,
                                };

                                const uid = auth.currentUser?.uid;
                                if (uid) {
                                    await setDoc(
                                        doc(db, "users", uid),
                                        { location: coordsToSave },
                                        { merge: true }
                                    );

                                    // Update region and hide permission UI
                                    setRegion({
                                        latitude: coordsToSave.latitude,
                                        longitude: coordsToSave.longitude,
                                        latitudeDelta: 0.04,
                                        longitudeDelta: 0.04,
                                    });
                                    setShowPermissionPrompt(false);
                                }
                            } catch (e) {
                                console.log("Location error:", e);
                            }
                        }}
                    >
                        <Text style={styles.buttonText}>Grant Location Access</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.denyButton}
                        onPress={() => setShowPermissionPrompt(false)}
                    >
                        <Text style={styles.denyText}>No Thanks</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

// Styles
const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { flex: 1 },
    sliderContainer: {
        position: "absolute",
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.8)",
        paddingVertical: 8,
        borderRadius: 10,
        marginHorizontal: 16,
    },
    sliderText: {
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
    },
    permissionOverlay: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(255,255,255,0.95)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    title: { fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: 10 },
    subtitle: { fontSize: 16, color: "#555", textAlign: "center", marginBottom: 40 },
    button: { backgroundColor: "#007AFF", padding: 14, borderRadius: 8, width: "80%", marginBottom: 15 },
    buttonText: { color: "white", fontSize: 18, textAlign: "center" },
    denyButton: { padding: 12 },
    denyText: { color: "red", fontSize: 16 },
});
