import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import MapView, { Marker, UrlTile, LatLng } from "react-native-maps";
import * as Location from "expo-location";
import { db, auth } from "../../firebaseConfig";
import { query, where, doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";

export default function MapsScreen() {
    const mapRef = useRef<MapView>(null);

    const [region, setRegion] = useState<{
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    } | null>(null);

    const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
    const [friendIds, setFriendIds] = useState<string[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    const defaultRegion = {
        latitude: 0,
        longitude: 0,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
    };

    // ---------------------------
    // 1) FETCH CURRENT USER LOCATION
    // ---------------------------
    useEffect(() => {
        (async () => {
            try {
                if (!auth.currentUser) return;

                const userRef = doc(db, "users", auth.currentUser.uid);
                const userSnap = await getDoc(userRef);
                if (!userSnap.exists()) {
                    setShowPermissionPrompt(true);
                    return;
                }

                const data = userSnap.data();
                if (!data.location) {
                    setShowPermissionPrompt(true);
                    return;
                }

                setRegion({
                    latitude: data.location.latitude,
                    longitude: data.location.longitude,
                    latitudeDelta: 0.04,
                    longitudeDelta: 0.04,
                });
            } catch (err) {
                console.error("Error loading location:", err);
            }
        })();
    }, []);

    // ---------------------------
    // 2) FETCH FRIEND LIST
    // ---------------------------
    useEffect(() => {
        if (!auth.currentUser) return;

        const fetchFriends = async () => {
            try {
                const q = query(
                    collection(db, "friends"),
                    where("userId", "==", auth.currentUser!.uid)
                );

                const snapshot = await getDocs(q);
                const fIds: string[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.friendId) fIds.push(data.friendId);
                });

                setFriendIds(fIds);
            } catch (error) {
                console.log("Error fetching friends:", error);
            }
        };

        fetchFriends();
    }, []);

    // ---------------------------
    // 3) FETCH FRIEND USERS
    // ---------------------------
    useEffect(() => {
        if (!region) return;

        const fetchUsers = async () => {
            try {
                const snapshot = await getDocs(collection(db, "users"));
                const friendUsers: any[] = [];

                snapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const uid = docSnap.id;
                    if (uid === auth.currentUser?.uid) return;
                    if (!friendIds.includes(uid)) return;
                    if (!data.location) return;

                    friendUsers.push({
                        id: uid,
                        name: data.displayName || data.username || "Unnamed",
                        latitude: data.location.latitude,
                        longitude: data.location.longitude,
                    });
                });

                setUsers(friendUsers);

                // ---------------------------
                // FIT MAP TO FRIENDS
                // ---------------------------
                if (friendUsers.length && mapRef.current) {
                    const coordinates: LatLng[] = friendUsers.map(u => ({
                        latitude: u.latitude,
                        longitude: u.longitude,
                    }));

                    // Include current user
                    if (region) coordinates.push({ latitude: region.latitude, longitude: region.longitude });

                    mapRef.current.fitToCoordinates(coordinates, {
                        edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
                        animated: true,
                    });
                }
            } catch (err) {
                console.error("Error fetching users:", err);
            }
        };

        fetchUsers();
    }, [region, friendIds]);

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                region={region ?? defaultRegion}
                showsUserLocation={true}
                loadingEnabled={true}
                pitchEnabled={false}
                rotateEnabled={false}
            >
                <UrlTile
                    urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maximumZ={19}
                    tileSize={256}
                />

                {users.map(u => (
                    <Marker
                        key={u.id}
                        coordinate={{ latitude: u.latitude, longitude: u.longitude }}
                        title={u.name}
                    />
                ))}
            </MapView>

            {showPermissionPrompt && (
                <View style={styles.permissionOverlay}>
                    <Text style={styles.title}>Enable Location Access</Text>
                    <Text style={styles.subtitle}>
                        SkillSwap needs your location to show friends.
                    </Text>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={async () => {
                            const { status } = await Location.requestForegroundPermissionsAsync();
                            if (status !== "granted") return;

                            const location = await Location.getCurrentPositionAsync({});
                            const coords = {
                                latitude: location.coords.latitude,
                                longitude: location.coords.longitude,
                            };

                            await setDoc(doc(db, "users", auth.currentUser!.uid), { location: coords }, { merge: true });
                            setRegion({ ...coords, latitudeDelta: 0.04, longitudeDelta: 0.04 });
                            setShowPermissionPrompt(false);
                        }}
                    >
                        <Text style={styles.buttonText}>Grant Location Access</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.denyButton} onPress={() => setShowPermissionPrompt(false)}>
                        <Text style={styles.denyText}>No Thanks</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { flex: 1 },
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
    title: { fontSize: 28, fontWeight: "bold", marginBottom: 10 },
    subtitle: { fontSize: 16, color: "#555", marginBottom: 40, textAlign: "center" },
    button: { backgroundColor: "#007AFF", padding: 14, borderRadius: 8, width: "80%", marginBottom: 15 },
    buttonText: { color: "white", fontSize: 18, textAlign: "center" },
    denyButton: { padding: 12 },
    denyText: { color: "red", fontSize: 16 },
});
