# SwipeClean - Photo Management App

A beautiful React Native app that helps you organize your photos using intuitive swipe gestures.

## 🚨 Android Setup Required

**Expo Go cannot access photos on Android 13+.** You need a development build:

```bash
npm install -g @expo/cli eas-cli
eas login
eas build --platform android --profile development
```

## ✨ Features

- 📱 **Swipe to organize** - Right to keep, left to delete
- �️ **Safe deletion** - Photos stored in recoverable trash
- ↩️ **Undo support** - Reverse your last decision
- � **Progress tracking** - See photos processed and storage freed
- 🎨 **Beautiful UI** - Smooth animations and gradients

## 🚀 Quick Start

```bash
cd SwipeCleanApp
npm install
npm start
```

1. Install Expo Go on your device
2. Scan QR code to open app
3. Grant photo permissions
4. Start swiping!

## 🔧 Available Scripts

- `npm start` - Start development server
- `npm run android` - Run on Android
- `npm run build:android` - Build for production

## 🛡️ Privacy & Safety

- All photos stay on your device
- Deleted photos recoverable from trash
- Undo functionality for mistakes
- No data collection or cloud storage

## 🎯 How It Works

1. Grant photo access permissions
2. Swipe right (→) to keep photos
3. Swipe left (←) to delete photos
4. Use undo button to reverse decisions
5. Manage deleted photos in trash folder

---

Enjoy organizing your photos! 📸✨
