# SwipeClean - Photo Management App

A beautiful React Native app built with Expo that helps you organize your photos using intuitive swipe gestures, similar to Tinder.

## 🚨 IMPORTANT: Media Library Access on Android

**Due to Android 13+ permission restrictions, Expo Go cannot provide full access to the media library.** To test the full functionality of this app on your Android device, you need to create a **development build**.

### Quick Solution:
```bash
# Install build tools
npm install -g @expo/cli eas-cli

# Login to your Expo account
eas login

# Create a development build for Android
eas build --platform android --profile development
```

After the build completes, you'll get a download link for an APK file that you can install directly on your Android device with full photo access!

## Features

- 🎨 **Beautiful & Colorful UI** - Gradient backgrounds and smooth animations
- 📱 **Swipe Gestures** - Swipe right to keep photos, left to delete them
- 🔒 **Permission Management** - Properly requests photo library access
- 🎲 **Random Photo Display** - Shows photos in random order for better organization
- 📊 **Progress Tracking** - See how many photos you've kept vs deleted
- ⚡ **Smooth Animations** - Powered by React Native Reanimated
- 🔄 **Reset Functionality** - Start over anytime with fresh photos

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Expo CLI (installed globally): `npm install -g @expo/cli`
- Expo Go app on your Android device (download from Google Play Store)

### Installation

1. Navigate to the project directory:
   ```bash
   cd SwipeCleanApp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

### Testing on Your Android Device

1. **Install Expo Go** on your Android device from the Google Play Store

2. **Start the development server** using `npm start`

3. **Scan the QR code** that appears in your terminal or browser with the Expo Go app

4. **Grant permissions** when prompted to access your photos

5. **Start swiping!** 
   - Swipe right (→) to keep photos
   - Swipe left (←) to delete photos

### Available Scripts

- `npm start` or `npm run dev` - Start Expo development server with cleared cache
- `npm run android` - Run on Android emulator/device
- `npm run ios` - Run on iOS simulator (requires macOS)
- `npm run web` - Run in web browser
- `npm run build:android` - Build production APK for Google Play Store
- `npm run build:dev` - Build development APK for testing
- `npm run doctor` - Check project for issues
- `npm run check` - Check dependency compatibility

## How It Works

1. **Permission Request**: The app first requests permission to access your photo library
2. **Photo Loading**: Loads up to 50 recent photos and shuffles them for random display
3. **Swipe to Decide**: 
   - Swipe right or drag significantly to the right to keep a photo
   - Swipe left or drag significantly to the left to delete a photo
4. **Visual Feedback**: Color overlays show your decision (green for keep, red for delete)
5. **Progress Tracking**: See your statistics at the top of the screen
6. **Completion**: When done, view your stats and optionally review more photos

## Technical Features

- **React Native with TypeScript** for type safety
- **Expo** for easy development and testing
- **React Native Reanimated** for smooth 60fps animations
- **React Native Gesture Handler** for responsive touch interactions
- **Expo Media Library** for photo access and management
- **Linear Gradients** for beautiful UI backgrounds

## Permissions

The app requires the following permissions:
- **Photo Library Access**: To display and manage your photos
- **Storage Access**: To delete photos when you swipe left

All permissions are requested with clear explanations of why they're needed.

## Safety Features

- **Confirmation overlays** show your decision before finalizing
- **Smooth animations** provide clear feedback
- **Reset functionality** lets you start over if needed
- **Progress tracking** keeps you informed of your decisions

## Troubleshooting

### Common Issues

1. **"ConfigError: package.json does not exist"**: Make sure you're running commands from the `SwipeCleanApp` directory:
   ```bash
   cd SwipeCleanApp && npx expo start --clear
   ```
2. **Photos not loading**: Make sure you've granted photo library permissions
3. **App crashes**: Ensure you have the latest version of Expo Go installed  
4. **Gestures not working**: Try restarting the app
5. **Swiping doesn't work**: Make sure you're using a development build, not Expo Go

### Getting Help

If you encounter any issues:
1. **Check directory**: Always run commands from `SwipeCleanApp` folder
2. Check that all dependencies are properly installed: `npx expo install --check`
3. Ensure your device has photos in the gallery
4. Verify that permissions have been granted
5. Try restarting the Expo development server: `npx expo start --clear`

## Development

### 🚨 Important: Always Navigate to Project Folder First!

```bash
# Single command to navigate and start (recommended):
cd SwipeCleanApp && npx expo start --clear

# Or step by step:
cd SwipeCleanApp
npx expo start --clear
```

**Why this matters:** The expo commands must be run from the `SwipeCleanApp` directory, not the parent `SwipeClean` directory.

### Development Commands

```bash
# Start development server with cleared cache
npx expo start --clear

# Check for TypeScript errors
npx expo-doctor

# Check dependencies compatibility
npx expo install --check
```

### To modify or extend the app:

1. The main app logic is in `App.tsx`
2. Styles are defined using StyleSheet at the bottom of the file
3. Gesture handling uses React Native Reanimated and Gesture Handler
4. Photo management uses Expo Media Library

## Building for Production

To build the app for production:

```bash
expo build:android
```

This will create an APK file you can install directly on Android devices.

---

Enjoy organizing your photos with SwipeClean! 📸✨
