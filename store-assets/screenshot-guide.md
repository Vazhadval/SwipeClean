# SwipeClean - Screenshot Guide

## Required Screenshots for Google Play Store
**Need 2-8 screenshots, recommended 5-6 for best presentation**

### Screenshot Specifications
- **Format**: PNG or JPG
- **Size**: 1080x1920px (portrait) or 1920x1080px (landscape)
- **Aspect Ratio**: 16:9 or 9:16
- **Content**: Show actual app functionality

### Screenshots to Take

#### 1. **Main Interface** (Primary screenshot)
**What to show:**
- Photo card with your logo or sample image
- Swipe indicators (left/right arrows)
- Blue gradient background
- Header with app title and trash button
- Keep/Delete counters

**How to capture:**
- Open app with photos loaded
- Make sure first photo is presentable
- Capture the main swiping interface

#### 2. **Trash Functionality** 
**What to show:**
- Trash modal open
- Grid of deleted photos
- Restore buttons visible
- Empty trash option
- Blue gradient background

**How to capture:**
- Delete a few photos first
- Tap the trash button
- Capture the trash modal with photos

#### 3. **Permission Request**
**What to show:**
- Clean permission dialog
- SwipeClean branding
- Clear explanation of why permissions needed

**How to capture:**
- Uninstall and reinstall app
- Capture the permission request screen

#### 4. **Organizing in Action**
**What to show:**
- Photo being swiped (mid-animation if possible)
- Swipe indicators active
- Keep/Delete overlays visible

**How to capture:**
- Start swiping a photo
- Capture during swipe animation

#### 5. **Completion Screen**
**What to show:**
- Statistics (X photos kept, Y deleted)
- Reset button
- Success messaging
- Blue gradient background

**How to capture:**
- Organize all photos
- Capture the completion screen

#### 6. **Before/After** (Optional bonus)
**What to show:**
- Gallery view before and after organization
- Storage space freed
- Cleaner photo library

## Taking Screenshots

### Method 1: Android Device
1. Open SwipeClean app
2. Navigate to the screen you want to capture
3. Press **Volume Down + Power** simultaneously
4. Screenshots saved to Gallery/Photos

### Method 2: Android Emulator
1. Run app in Android Studio emulator
2. Use emulator's screenshot button
3. Or press **Ctrl + S** in emulator

### Method 3: ADB (for perfect sizing)
```bash
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png
```

## Screenshot Checklist
- [ ] All screenshots are 1080x1920px or 1920x1080px
- [ ] Blue gradient theme visible
- [ ] SwipeClean branding clear
- [ ] No personal photos visible (use sample images)
- [ ] UI elements clearly visible
- [ ] High quality (no blur/compression)
- [ ] Consistent app version across all screenshots

## File Naming Convention
- `01_main_interface.png`
- `02_trash_functionality.png`
- `03_permission_request.png`
- `04_organizing_action.png`
- `05_completion_screen.png`
- `06_before_after.png` (optional)

## Upload to Google Play
1. Go to Google Play Console
2. Navigate to App content > Store listing > Graphics
3. Upload each screenshot in order
4. Add captions (optional but recommended)

**Note**: First screenshot is most important as it appears in search results!
