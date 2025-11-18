import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native"; //For UI and styling
import MapView, { Marker, Circle, UrlTile } from "react-native-maps"; //Map component (used for OSM maps)
import * as Location from "expo-location"; //Provides GPS location access in expo apps
import Slider from "@react-native-community/slider"; //For adjustable slider to select desired radius

export default function Index() {
    const [region, setRegion] = useState<any>(null); //region holds current map region, i.e., latitude, longitude, and zoom level.
    const [radius, setRadius] = useState(2000); //search radius around the user in meters.
    const [errorMsg, setErrorMsg] = useState<string | null>(null); //errorMsg stores permission or location errors.

    // Mock dataset: Hardcoded users for demo
    const [users] = useState([
        { id: 1, name: "Sri", latitudeOffset: 0.01, longitudeOffset: 0.01 },
        { id: 2, name: "Alvin", latitudeOffset: -0.01, longitudeOffset: 0.02 },
        { id: 3, name: "Junoh", latitudeOffset: 0.02, longitudeOffset: -0.01 },
    ]);

    useEffect(() => {
        (async () => {
            //Ask user for location permission
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") { //if denied, setErrorMsg holds the error message
                setErrorMsg("Permission to access location was denied");
                return;
            }

            //if granted, setRegion as the user's latitude + longitude
            const location = await Location.getCurrentPositionAsync({});
            setRegion({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.04,
                longitudeDelta: 0.04,
            });
        })();
    }, []);
    //latitudeDelta and longitudeDelta define the zoom level (the smaller, the more zoomed in).
    //empty dependency array means this code will run just once. If we don't use useEffect,
    //then the code above would run every re-render.

    if (!region) {
        //Wait on rendering until User's location is obtained. If not, then show loading screen.
        return (
            <View style={styles.loadingContainer}>
                <Text>{errorMsg || "Loading location..."}</Text>
            </View>
        );
    }

    // Haversine distance check
    //Computes distance between users using the Haversine formula.
    //.filter loops over all elements "u" of the array "users".
    const nearbyUsers = users.filter((u) => {
        const R = 6371e3; //earth radius in meters
        const φ1 = (region.latitude * Math.PI) / 180; //Convert lat and lon differences into radians.
        const φ2 = ((region.latitude + u.latitudeOffset) * Math.PI) / 180;
        const Δφ = (u.latitudeOffset * Math.PI) / 180;
        const Δλ = (u.longitudeOffset * Math.PI) / 180;
        const a =
            Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; //compute the shortest difference over Earth's surface.
        return d <= radius; //Returns users within the circle of radius.
    });

    //styling and layout
    return (
        <View style={styles.container}>
            <MapView
                style={styles.map}
                region={region}
                showsUserLocation={true}
                loadingEnabled={true}
                pitchEnabled={false}
                rotateEnabled={false}
                zoomControlEnabled={true}
            >
                {/*
          OSM Tile Layer
          Instead of using Google Maps API, we use OpenStreetMap (OSM) tiles here.
          The UrlTile component fetches map images directly from OSM's public tile servers.
          No API key or billing is required.
        */}
                <UrlTile
                    urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maximumZ={19}
                    tileSize={256}
                />

                {/* Draw a circle representing the user's search radius */}
                <Circle
                    center={region}
                    radius={radius}
                    strokeColor="rgba(0,150,255,0.5)"
                    fillColor="rgba(0,150,255,0.1)"
                />

                {/* Place markers for all nearby users */}
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

            {/* Slider control for changing the search radius dynamically */}
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
        </View>
    );
}

//stylesheet for consistent layout and readability
const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
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
});
