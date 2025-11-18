import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, Circle, UrlTile } from "react-native-maps";
import * as Location from "expo-location";
import Slider from "@react-native-community/slider";

export default function MapsScreen() {
    const [region, setRegion] = useState<any>(null);
    const [radius, setRadius] = useState(2000);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Hardcoded user demo data
    const [users] = useState([
        { id: 1, name: "Sri", latitudeOffset: 0.01, longitudeOffset: 0.01 },
        { id: 2, name: "Alvin", latitudeOffset: -0.01, longitudeOffset: 0.02 },
        { id: 3, name: "Junoh", latitudeOffset: 0.02, longitudeOffset: -0.01 },
    ]);

    // Get user location on mount
    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== "granted") {
                setErrorMsg("Permission to access location was denied");
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            setRegion({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.04,
                longitudeDelta: 0.04,
            });
        })();
    }, []);

    // Filter nearby users using Haversine distance
    const nearbyUsers = region
        ? users.filter((u) => isWithinRadius(region, u, radius))
        : [];

    // Show loading state until region loads
    if (!region) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Maps</Text>
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>
                        {errorMsg || "Loading location..."}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={["bottom"]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Maps</Text>
            </View>

            {/* Map */}
            <View style={styles.mapContainer}>
                <MapView
                    style={styles.map}
                    region={region}
                    showsUserLocation={true}
                    loadingEnabled={true}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    zoomControlEnabled={true}
                >
                    {/* OSM Layer */}
                    <UrlTile
                        urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maximumZ={19}
                        tileSize={256}
                    />

                    {/* Radius circle */}
                    <Circle
                        center={region}
                        radius={radius}
                        strokeColor="rgba(0,150,255,0.5)"
                        fillColor="rgba(0,150,255,0.1)"
                    />

                    {/* Markers */}
                    {nearbyUsers.map((u) => (
                        <Marker
                            key={u.id}
                            coordinate={{
                                latitude: region.latitude + u.latitudeOffset,
                                longitude: region.longitude + u.longitudeOffset,
                            }}
                            title={u.name}
                        />
                    ))}
                </MapView>
            </View>

            {/* Radius Slider */}
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
        </SafeAreaView>
    );
}

/* ------------------ HELPERS ------------------ */

function isWithinRadius(region: any, user: any, radius: number) {
    const R = 6371e3; // Earth radius meters
    const φ1 = (region.latitude * Math.PI) / 180;
    const φ2 = ((region.latitude + user.latitudeOffset) * Math.PI) / 180;
    const Δφ = (user.latitudeOffset * Math.PI) / 180;
    const Δλ = (user.longitudeOffset * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;

    return d <= radius;
}

/* ------------------ STYLES ------------------ */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f5f5f5",
    },

    /* Header */
    header: {
        flexDirection: "row",
        alignItems: "center",
        padding: 20,
        paddingTop: 10,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#e0e0e0",
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
        color: "#333",
    },

    /* Loading */
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: "#666",
    },

    /* Map */
    mapContainer: {
        flex: 1,
    },
    map: {
        flex: 1,
    },

    /* Slider */
    sliderContainer: {
        position: "absolute",
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.85)",
        paddingVertical: 10,
        borderRadius: 10,
        marginHorizontal: 16,
    },
    sliderText: {
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
    },
});
