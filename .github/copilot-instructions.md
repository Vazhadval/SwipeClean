<!-- SwipeClean React Native Project Instructions -->

## Project Overview
SwipeClean is a React Native Android application for photo management with swipe gestures similar to Tinder. Users can swipe left to delete photos and right to keep them.

## Development Progress
- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements - React Native Android app for photo management
- [x] Scaffold the Project - Created Expo React Native project with TypeScript
- [x] Customize the Project - Implemented full SwipeClean functionality
- [x] Install Required Extensions - Not needed for Expo projects
- [x] Compile the Project - Dependencies installed successfully
- [ ] Create and Run Task
- [ ] Launch the Project
- [x] Ensure Documentation is Complete - README.md created with full instructions

## Production Build Instructions
When user says "publish it", execute the following commands:

### Step 1: Update Version Numbers
1. Check current version in `SwipeCleanApp/app.json`
2. Increment version number using semantic versioning (e.g., 1.0.1 → 1.0.2)
3. Update the "version" field in `app.json`
4. EAS will automatically handle versionCode increment

### Step 2: Build Production APK
1. Navigate to SwipeCleanApp directory: `cd SwipeCleanApp`
2. Build production APK: `eas build --platform android --profile production`

### Version Management Rules:
- **Patch updates** (bug fixes): 1.0.1 → 1.0.2
- **Minor updates** (new features): 1.0.2 → 1.1.0  
- **Major updates** (breaking changes): 1.1.0 → 2.0.0
- Google Play Store requires unique version strings for each upload
- versionCode is automatically incremented by EAS

This will create a production-ready Android build using Expo Application Services (EAS) with properly incremented version numbers.

## Key Features
- Photo access permissions
- Swipe gestures (left = delete, right = keep)
- Beautiful and colorful UI
- Random photo display
- Android device testing capability
- Batch photo loading with background updates (50 photos initial, 50 photos per batch)
- Smart preloading and real-time progress indicators
- Trash recovery system with storage size tracking
- Smooth animations and responsive UI

## Tech Stack
- React Native with Expo
- TypeScript
- React Native Reanimated
- React Native Gesture Handler
- Expo Media Library
- Expo Linear Gradient
