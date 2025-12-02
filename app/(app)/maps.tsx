import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import MapView, { Marker, UrlTile, LatLng, Callout } from "react-native-maps";
import * as Location from "expo-location";
import { db, auth } from "../../firebaseConfig";
import { query, where, doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";
import { haversineDistance } from '@/utils/haversineDistance';


export default function MapsScreen() {
    const mapRef = useRef<MapView>(null);

    const [region, setRegion] = useState<{
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    } | null>(null);

    const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
    const [users, setUsers] = useState<any[]>([]);

    // ---------------------------
    // 1) FETCH CURRENT USER LOCATION
    // ---------------------------
    useEffect(() => {
        (async () => {
            try {
                if (!auth.currentUser) return;

                const userRef = doc(db, "users", auth.currentUser.uid);
                const userSnap = await getDoc(userRef);

                if (!userSnap.exists() || !userSnap.data()?.location) {
                    setShowPermissionPrompt(true);
                    return;
                }

                const data = userSnap.data();
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
    // 2) FETCH FRIEND USERS (combine IDs + data)
    // ---------------------------
    useEffect(() => {
        if (!region || !auth.currentUser) return;

        const fetchFriendUsers = async () => {
            try {
                // 1) Get friend IDs
                const friendSnap = await getDocs(
                    query(collection(db, "friends"), where("userId", "==", auth.currentUser!.uid))
                );
                const friendIds = friendSnap.docs.map(doc => doc.data().friendId).filter(Boolean);

                // 2) Get friend user data
                const usersSnap = await getDocs(collection(db, "users"));
                const friendUsers = usersSnap.docs
                    .filter(docSnap => friendIds.includes(docSnap.id) && docSnap.id !== auth.currentUser?.uid && docSnap.data().location)
                    .map(docSnap => {
                        const data = docSnap.data();
                        return {
                            id: docSnap.id,
                            name: data.displayName || data.username || "Unnamed",
                            latitude: data.location.latitude,
                            longitude: data.location.longitude,
                            skillsTeaching: data.skillsTeaching || [],
                            skillsLearning: data.skillsLearning || [],
                        };
                    });

                setUsers(friendUsers);

                // Fit map
                if (friendUsers.length && mapRef.current) {
                    const coordinates: LatLng[] = friendUsers.map(u => ({
                        latitude: u.latitude,
                        longitude: u.longitude,
                    }));
                    coordinates.push({ latitude: region.latitude, longitude: region.longitude });

                    mapRef.current.fitToCoordinates(coordinates, {
                        edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
                        animated: true,
                    });
                }
            } catch (err) {
                console.error("Error fetching friend users:", err);
            }
        };

        fetchFriendUsers();
    }, [region]);

    // ---------------------------
    // 3) FRIEND CARD
    // ---------------------------
    const FriendCardMap = ({ friend }: { friend: any }) => {
        const displayName = friend.name || "User";

        let locationText = "Location unavailable";
        if (region && friend.latitude && friend.longitude) {
            try {
                const distance = haversineDistance(
                    { latitude: region.latitude, longitude: region.longitude },
                    { latitude: friend.latitude, longitude: friend.longitude }
                );
                locationText = `${distance.toFixed(1)} km away`;
            } catch (err) {
                locationText = "Location unavailable";
            }
        }

        return (
            <View style={styles.calloutCard}>
                <View style={styles.friendHeader}>
                    <View style={styles.leftSection}>
                        <View style={styles.avatarContainer}>
                            <View style={styles.friendAvatar}>
                                <Text style={styles.friendAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                            </View>
                        </View>

                        <View style={styles.friendInfo}>
                            <Text style={styles.friendName}>{displayName}</Text>
                            <Text style={styles.locationText}>📍 {locationText}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.skillsRow}>
                    {friend.skillsTeaching?.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Teaches:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {friend.skillsTeaching.join(", ")}
                            </Text>
                        </View>
                    )}
                    {friend.skillsLearning?.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Learns:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {friend.skillsLearning.join(", ")}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                region={region ?? { latitude: 0, longitude: 0, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
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
                    <Marker key={u.id} coordinate={{ latitude: u.latitude, longitude: u.longitude }}>
                        <Callout tooltip>
                            <FriendCardMap friend={u} />
                        </Callout>
                    </Marker>
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

// Styles remain unchanged
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
    button: { backgroundColor: '#FCD34D', padding: 14, borderRadius: 8, width: "80%", marginBottom: 15 },
    buttonText: { color: "white", fontSize: 18, textAlign: "center" },
    denyButton: { padding: 12 },
    denyText: { color: "red", fontSize: 16 },

    calloutCard: {
        width: 260,
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 4,
    },
    friendHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    leftSection: { flexDirection: "row", alignItems: "center" },
    avatarContainer: { marginRight: 10 },
    friendAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FCD34D', justifyContent: "center", alignItems: "center" },
    friendAvatarText: { color: "black", fontSize: 18, fontWeight: "bold" },
    friendInfo: { flexDirection: "column" },
    friendName: { fontSize: 16, fontWeight: "bold" },
    locationText: { fontSize: 12, color: "#444" },
    skillsRow: { marginTop: 10 },
    skillGroup: { marginBottom: 6 },
    skillLabel: { fontWeight: "600", fontSize: 12, color: "#333" },
    skillList: { fontSize: 12, color: "#555" },
});
