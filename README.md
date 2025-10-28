# SkillSwap Mobile App - Setup Guide

## Quick Start Instructions

Follow these steps in order to get the app running:

---

## Step 1: Start the Backend Server First ⚠️

**IMPORTANT:** The backend server must be running before starting the mobile app.

1. Navigate to your backend project folder
2. Start the backend server (usually with `dotnet run` or similar)
3. Note the server's IP address and port (e.g., `http://192.168.4.60:5205`)
4. Keep the backend server running

---

## Step 2: Update API Configuration

Open the API service file and update the backend URL:

**File:** `services/apiService.ts`

```typescript
// Change this line to match your backend server
const API_BASE_URL = 'http://YOUR_IP_ADDRESS:YOUR_PORT/api';

// Example:
const API_BASE_URL = 'http://192.168.4.60:5205/api';
```

**Finding Your IP Address:**
- **Windows:** Open Command Prompt → Type `ipconfig` → Look for "IPv4 Address"
- **Mac:** System Settings → Network → Your connection → Look for IP address
- **Linux:** Terminal → Type `ifconfig` or `ip addr`

---

## Step 3: Install Dependencies

Install all required npm packages:

```bash
npm install
```

### Required Dependencies

The app uses these main dependencies:

**Core:**
- `expo` - Expo framework
- `expo-router` - Navigation
- `react-native` - Mobile framework
- `typescript` - Type safety

**Firebase:**
- `firebase` - Firebase SDK
- Authentication and Firestore database

**Payment:**
- `@stripe/stripe-react-native` - Stripe payment processing
- `axios` - HTTP client for API calls

**UI Components:**
- `react-native-safe-area-context` - Safe area handling
- `expo-status-bar` - Status bar management

**Video (if applicable):**
- `react-native-agora` - Video calling (if used)

All dependencies are listed in `package.json` and will be installed with `npm install`.

---

## Step 4: Start Expo Go

### Option A: Using Expo Go App (Recommended for Development)

1. **Install Expo Go on your phone:**
    - iOS: Download from App Store
    - Android: Download from Google Play Store

2. **Start the development server:**
   ```bash
   npx expo start
   ```

3. **Connect your phone:**
    - **iPhone:** Open Camera app → Scan the QR code
    - **Android:** Open Expo Go app → Scan the QR code

4. **Make sure your phone and computer are on the same WiFi network!**

### Option B: Using Emulator/Simulator

**For Android Emulator:**
```bash
npx expo start --android
```

**For iOS Simulator (Mac only):**
```bash
npx expo start --ios
```

---

## Troubleshooting

### "Network request failed" or "Cannot connect to backend"

✅ **Solutions:**
1. Make sure backend server is running (Step 1)
2. Check API_BASE_URL is correct (Step 2)
3. Ensure phone and computer are on same WiFi network
4. Try using your computer's IP address instead of `localhost`
5. Check if firewall is blocking the connection

### "Module not found" errors

✅ **Solution:**
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npx expo start --clear
```

### App crashes or won't load

✅ **Solution:**
```bash
# Reset Expo cache
npx expo start --clear
```

### Stripe payment errors

✅ **Solutions:**
1. Verify Stripe publishable key in `app/_layout.tsx`
2. Check backend has correct Stripe secret key
3. Ensure payment API endpoints are working

---

## Environment Requirements

- **Node.js:** 16.x or higher
- **npm:** 8.x or higher
- **Expo CLI:** Installed globally or via npx
- **Mobile Device:** iPhone or Android with Expo Go installed
    - OR Android Emulator / iOS Simulator

---

---

## Firebase Setup (If Not Already Configured)

If Firebase is not set up:

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication and Firestore
3. Get your Firebase config
4. Update `firebaseConfig.ts` with your credentials

---

## Support

If you encounter issues:

1. Check that backend is running (Step 1)
2. Verify API URL configuration (Step 2)
3. Ensure all dependencies are installed (Step 3)
4. Make sure devices are on same network
5. Check console logs for specific error messages

---

## Quick Command Reference

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Start with specific platform
npx expo start --android
npx expo start --ios

# Clear cache
npx expo start --clear

# Check for issues
npx expo doctor
```

---

**Ready to go!** 🚀