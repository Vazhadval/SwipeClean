import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  Dimensions,
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

/**
 * THEME COLORS - Update all app colors here!
 * 
 * To change the app's theme:
 * 1. Update gradient colors for background
 * 2. Update accent color for buttons and highlights
 * 3. Update text colors for readability
 * 4. Update UI element colors as needed
 * 
 * All colors throughout the app will automatically update!
 */
const THEME_COLORS = {
  // Main gradient colors (dark navy to deep blue)
  gradient: ['#1a1a2e', '#16213e', '#0f3460'] as const,
  
  // Accent colors
  accent: '#00ffd0', // Bright teal for buttons and highlights
  
  // Text colors
  primaryText: '#ffffff',
  secondaryText: '#e0e0e0',
  
  // UI elements
  cardBackground: '#ffffff',
  overlayBackground: 'rgba(0, 0, 0, 0.8)',
  
  // Swipe gesture colors
  keepColor: 'rgba(76, 217, 100, 0.9)', // Green for keep
  deleteColor: 'rgba(255, 59, 48, 0.9)', // Red for delete
  
  // Shadow and transparency
  shadowColor: '#000',
  textShadow: 'rgba(0, 0, 0, 0.3)',
  buttonOverlay: 'rgba(255, 255, 255, 0.2)',
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Responsive breakpoints
const isSmallScreen = screenHeight < 700;
const isVerySmallScreen = screenHeight < 600;

interface Photo {
  id: string;
  uri: string;
  filename: string;
}

interface TrashedPhoto extends Photo {
  trashedAt: number;
  trashPath: string;
  originalId: string;
  size: number; // File size in bytes
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Preparing...');
  const [storageFreed, setStorageFreed] = useState(0); // MB freed this session
  const [photosProcessed, setPhotosProcessed] = useState(0); // Total photos reviewed
  const [trashedPhotos, setTrashedPhotos] = useState<TrashedPhoto[]>([]);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showConfirmEmptyModal, setShowConfirmEmptyModal] = useState(false);
  
  // New state for batch loading
  const [totalPhotosFound, setTotalPhotosFound] = useState(0);
  const [photosLoadedSoFar, setPhotosLoadedSoFar] = useState(0);
  const [isLoadingInBackground, setIsLoadingInBackground] = useState(false);
  
  // Undo functionality state
  const [canUndo, setCanUndo] = useState(false);
  const [previousPhoto, setPreviousPhoto] = useState<Photo | null>(null);
  const [previousAction, setPreviousAction] = useState<'keep' | 'delete' | null>(null);

  const TRASH_DIR = `${FileSystem.documentDirectory}trash/`;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);

  // Animation values for loading dots
  const dot1Opacity = useSharedValue(0.5);
  const dot2Opacity = useSharedValue(0.5);
  const dot3Opacity = useSharedValue(0.5);
  const dot1Scale = useSharedValue(1);
  const dot2Scale = useSharedValue(1);
  const dot3Scale = useSharedValue(1);

  // Fisher-Yates shuffle algorithm for truly random distribution
  const shuffleArray = (array: Photo[]): Photo[] => {
    const shuffled = [...array]; // Create a copy
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  useEffect(() => {
    requestPermissionAndLoadPhotos();
    createTrashDirectory();
    loadTrashedPhotos();
  }, []);

  // Smart preloading: Check if we need to load more photos when user is running low
  useEffect(() => {
    const PRELOAD_THRESHOLD = 20; // Start loading more when 20 photos left
    const photosRemaining = photos.length - currentPhotoIndex;
    
    if (photosRemaining <= PRELOAD_THRESHOLD && 
        photosLoadedSoFar < totalPhotosFound && 
        !isLoadingInBackground && 
        totalPhotosFound > 0) {
      console.log(`Preloading: ${photosRemaining} photos remaining, loading more...`);
      loadNextBatch();
    }
  }, [currentPhotoIndex, photos.length, photosLoadedSoFar, totalPhotosFound, isLoadingInBackground]);

  // Animate loading dots
  useEffect(() => {
    if (loading) {
      const animateDots = () => {
        // Animate dot 1
        dot1Opacity.value = withTiming(1, { duration: 600 }, () => {
          dot1Opacity.value = withTiming(0.3, { duration: 600 });
        });
        dot1Scale.value = withTiming(1.2, { duration: 600 }, () => {
          dot1Scale.value = withTiming(0.8, { duration: 600 });
        });

        // Animate dot 2 with delay
        setTimeout(() => {
          dot2Opacity.value = withTiming(1, { duration: 600 }, () => {
            dot2Opacity.value = withTiming(0.3, { duration: 600 });
          });
          dot2Scale.value = withTiming(1.2, { duration: 600 }, () => {
            dot2Scale.value = withTiming(0.8, { duration: 600 });
          });
        }, 200);

        // Animate dot 3 with delay
        setTimeout(() => {
          dot3Opacity.value = withTiming(1, { duration: 600 }, () => {
            dot3Opacity.value = withTiming(0.3, { duration: 600 });
          });
          dot3Scale.value = withTiming(1.2, { duration: 600 }, () => {
            dot3Scale.value = withTiming(0.8, { duration: 600 });
          });
        }, 400);
      };

      animateDots();
      const interval = setInterval(animateDots, 1200);
      return () => clearInterval(interval);
    }
  }, [loading]);

  // Animated styles for dots (always declared, but only used when loading)
  const dot1AnimatedStyle = useAnimatedStyle(() => ({
    opacity: dot1Opacity.value,
    transform: [{ scale: dot1Scale.value }]
  }));

  const dot2AnimatedStyle = useAnimatedStyle(() => ({
    opacity: dot2Opacity.value,
    transform: [{ scale: dot2Scale.value }]
  }));

  const dot3AnimatedStyle = useAnimatedStyle(() => ({
    opacity: dot3Opacity.value,
    transform: [{ scale: dot3Scale.value }]
  }));

  const requestPermissionAndLoadPhotos = async () => {
    try {
      // Android 16 Fix: Check current permission status first
      const currentPermission = await MediaLibrary.getPermissionsAsync();
      
      // If we already have granted permissions, skip the request and proceed directly
      if (currentPermission.status === 'granted') {
        setHasPermission(true);
        
        // Add small delay before loading photos to ensure smooth transition
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadPhotos();
        
        if (currentPermission.accessPrivileges === 'limited') {
          Alert.alert(
            'Limited Access',
            'You have granted limited photo access. For best experience, consider allowing full access in Settings.',
            [{ text: 'OK' }]
          );
        }
        return; // Exit early since we already have permissions
      }
      
      // Only request permissions if we don't already have them
      const { status, accessPrivileges } = await MediaLibrary.requestPermissionsAsync(false); // false = read and write
      
      if (status === 'granted') {
        setHasPermission(true);
        await loadPhotos();
        
        // Show info about delete permissions
        if (accessPrivileges === 'limited') {
          Alert.alert(
            'Limited Access',
            'You have granted limited photo access. For best experience, consider allowing full access in Settings.',
            [{ text: 'OK' }]
          );
        }
      } else {
        Alert.alert(
          'Permission Required',
          'This app needs full access to your photos to organize and delete them. Please grant permission in the next dialog.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Grant Permission', onPress: () => MediaLibrary.requestPermissionsAsync(false) }
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request permissions');
    } finally {
      setLoading(false);
    }
  };

  const loadPhotos = async () => {
    try {
      setLoadingProgress(5);
      setLoadingMessage('Preparing photo scanner...');
      await new Promise(resolve => setTimeout(resolve, 200));

      setLoadingProgress(15);
      setLoadingMessage('Scanning photo library...');
      await new Promise(resolve => setTimeout(resolve, 300));

      // First, get the total count of photos
      const initialMedia = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
      });

      const totalCount = initialMedia.totalCount;
      setTotalPhotosFound(totalCount);

      setLoadingProgress(25);
      setLoadingMessage(`Found ${totalCount} photos`);
      await new Promise(resolve => setTimeout(resolve, 400));

      // Load first batch immediately (50 photos or all if less)
      const INITIAL_BATCH_SIZE = 50;
      const initialBatchSize = Math.min(INITIAL_BATCH_SIZE, totalCount);
      
      setLoadingProgress(35);
      setLoadingMessage(`Loading first ${initialBatchSize} photos...`);
      await new Promise(resolve => setTimeout(resolve, 300));

      const firstBatch = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: initialBatchSize,
        sortBy: 'creationTime',
      });

      setLoadingProgress(60);
      setLoadingMessage('Processing initial photos...');
      await new Promise(resolve => setTimeout(resolve, 300));

      const initialPhotos: Photo[] = firstBatch.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename,
      }));

      setLoadingProgress(80);
      setLoadingMessage('Shuffling photos...');
      await new Promise(resolve => setTimeout(resolve, 250));

      const shuffledInitial = shuffleArray(initialPhotos);
      setPhotos(shuffledInitial);
      setPhotosLoadedSoFar(initialBatchSize);
      
      setLoadingProgress(100);
      setLoadingMessage('Ready to swipe!');
      
      // Delay before hiding loader and starting background loading
      setTimeout(() => {
        setLoading(false);
        // Start loading remaining photos in background if there are more
        if (totalCount > INITIAL_BATCH_SIZE) {
          loadRemainingPhotosInBackground(INITIAL_BATCH_SIZE, totalCount);
        }
      }, 400);
      
    } catch (error) {
      console.error('Error loading photos:', error);
      Alert.alert('Error', 'Failed to load photos');
      setLoading(false);
    }
  };

  const loadRemainingPhotosInBackground = async (alreadyLoaded: number, totalCount: number) => {
    try {
      setIsLoadingInBackground(true);
      const BATCH_SIZE = 50; // Smaller batches for more frequent progress updates
      let currentOffset = alreadyLoaded;
      
      while (currentOffset < totalCount) {
        const remainingCount = totalCount - currentOffset;
        const batchSize = Math.min(BATCH_SIZE, remainingCount);
        
        const batch = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: batchSize,
          after: currentOffset.toString(),
          sortBy: 'creationTime',
        });

        const batchPhotos: Photo[] = batch.assets.map((asset) => ({
          id: asset.id,
          uri: asset.uri,
          filename: asset.filename,
        }));

        // Add batch to existing photos and update progress immediately
        setPhotos(prevPhotos => [...prevPhotos, ...batchPhotos]);
        setPhotosLoadedSoFar(prev => prev + batchSize);
        
        currentOffset += batchSize;
        
        // Shorter delay for more responsive progress updates
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      
      // Shuffle the entire photos array when all loading is complete
      setPhotos(prevPhotos => shuffleArray(prevPhotos));
      
      setIsLoadingInBackground(false);
    } catch (error) {
      console.error('Error loading remaining photos:', error);
      setIsLoadingInBackground(false);
    }
  };

  const loadNextBatch = async () => {
    if (isLoadingInBackground || photosLoadedSoFar >= totalPhotosFound) return;
    
    try {
      setIsLoadingInBackground(true);
      const BATCH_SIZE = 50; // Smaller batches for responsive preloading and progress updates
      const remainingCount = totalPhotosFound - photosLoadedSoFar;
      const batchSize = Math.min(BATCH_SIZE, remainingCount);
      
      const batch = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: batchSize,
        after: photosLoadedSoFar.toString(),
        sortBy: 'creationTime',
      });

      const batchPhotos: Photo[] = batch.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename,
      }));

      const shuffledBatch = shuffleArray(batchPhotos);

      // Add shuffled batch to existing photos and update progress immediately
      setPhotos(prevPhotos => [...prevPhotos, ...shuffledBatch]);
      setPhotosLoadedSoFar(prev => prev + batchSize);
      
      setIsLoadingInBackground(false);
    } catch (error) {
      console.error('Error loading next batch:', error);
      setIsLoadingInBackground(false);
    }
  };

  const handleSwipeComplete = (direction: 'left' | 'right') => {
    if (currentPhotoIndex >= photos.length) return;

    const currentPhoto = photos[currentPhotoIndex];

    // Store previous photo and action for undo functionality
    setPreviousPhoto(currentPhoto);
    setPreviousAction(direction === 'left' ? 'delete' : 'keep');
    setCanUndo(true);

    if (direction === 'left') {
      // Delete photo
      deletePhoto(currentPhoto);
      // Storage will be updated in deletePhoto function
    } else {
      // Keep photo - no storage impact
    }

    // Update photos processed counter (both kept and deleted)
    setPhotosProcessed(prev => prev + 1);

    // Move to next photo
    setCurrentPhotoIndex(prev => prev + 1);
    
    // Reset animation values
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotate.value = withSpring(0);
    scale.value = withSpring(1);
  };

  const handleUndo = () => {
    if (!canUndo || !previousPhoto || !previousAction || currentPhotoIndex === 0) return;

    // If the previous action was delete, we need to restore the photo from trash
    if (previousAction === 'delete') {
      // Find the trashed photo to get its size
      const trashedPhoto = trashedPhotos.find(tp => tp.originalId === previousPhoto.id);
      
      // Restore photo from trash (move back to original location)
      restorePhotoFromTrash(previousPhoto);
      
      // Reduce storage freed amount since we're restoring the photo
      if (trashedPhoto && trashedPhoto.size) {
        setStorageFreed(prev => Math.max(0, prev - trashedPhoto.size));
      }
    }

    // Go back to previous photo
    setCurrentPhotoIndex(prev => prev - 1);
    setPhotosProcessed(prev => Math.max(0, prev - 1));
    
    // Reset undo state
    setCanUndo(false);
    setPreviousPhoto(null);
    setPreviousAction(null);
    
    // Reset animation values
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotate.value = withSpring(0);
    scale.value = withSpring(1);
  };

  const deletePhoto = async (photo: Photo) => {
    try {
      // Validate photo object
      if (!photo || !photo.id || !photo.filename) {
        throw new Error('Invalid photo object');
      }

      // Move to app's trash folder (no confirmation dialog)
      const timestamp = Date.now();
      const trashFileName = `${timestamp}_${photo.filename}`;
      const trashPath = `${TRASH_DIR}${trashFileName}`;
      
      // Get asset info to get the local URI
      const assetInfo = await MediaLibrary.getAssetInfoAsync(photo.id);
      
      if (assetInfo && (assetInfo.localUri || assetInfo.uri)) {
        const sourceUri = assetInfo.localUri || assetInfo.uri;
        
        // Copy photo to trash folder
        await FileSystem.copyAsync({
          from: sourceUri,
          to: trashPath
        });
        
        // Get file size for tracking
        const fileInfo = await FileSystem.getInfoAsync(trashPath, { size: true });
        const fileSize = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;
        
        // Update storage freed counter (convert bytes to MB)
        const sizeInMB = fileSize / (1024 * 1024);
        setStorageFreed(prev => prev + sizeInMB);
        
        // Create trashed photo metadata
        const trashedPhoto: TrashedPhoto = {
          ...photo,
          trashedAt: timestamp,
          trashPath: trashPath,
          originalId: photo.id,
          uri: trashPath,
          size: fileSize // Store file size in bytes
        };
        
        // Add to trashed photos
        setTrashedPhotos(prev => [...prev, trashedPhoto]);
        
        // Save trashed photos metadata to persistent storage
        await saveTrashedPhotosMetadata([...trashedPhotos, trashedPhoto]);
        
        // NOTE: We don't delete from MediaLibrary to avoid confirmation dialog
        // The photo remains in the gallery but is marked as "deleted" in our app
      } else {
        throw new Error(`Could not access photo file: assetInfo is ${assetInfo ? 'missing localUri/uri' : 'null'}`);
      }
    } catch (error) {
      console.error('Error moving photo to trash:', error);
      Alert.alert('Error', 'Failed to move photo to trash');
    }
  };

  const createTrashDirectory = async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(TRASH_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(TRASH_DIR, { intermediates: true });
      }
    } catch (error) {
      console.error('Error creating trash directory:', error);
    }
  };

  const loadTrashedPhotos = async () => {
    try {
      const metadataPath = `${FileSystem.documentDirectory}trash_metadata.json`;
      const metadataInfo = await FileSystem.getInfoAsync(metadataPath);
      
      if (metadataInfo.exists) {
        const metadataContent = await FileSystem.readAsStringAsync(metadataPath);
        const metadata = JSON.parse(metadataContent) as TrashedPhoto[];
        
        // Verify files still exist and filter out missing ones
        const validTrashedPhotos = [];
        for (const trashedPhoto of metadata) {
          const fileInfo = await FileSystem.getInfoAsync(trashedPhoto.trashPath);
          if (fileInfo.exists) {
            validTrashedPhotos.push(trashedPhoto);
          }
        }
        
        setTrashedPhotos(validTrashedPhotos);
        
        // Update metadata if any files were removed
        if (validTrashedPhotos.length !== metadata.length) {
          await saveTrashedPhotosMetadata(validTrashedPhotos);
        }
      }
    } catch (error) {
      console.error('Error loading trashed photos:', error);
    }
  };

  const saveTrashedPhotosMetadata = async (photos: TrashedPhoto[]) => {
    try {
      const metadataPath = `${FileSystem.documentDirectory}trash_metadata.json`;
      await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(photos));
    } catch (error) {
      console.error('Error saving trashed photos metadata:', error);
    }
  };

  const restorePhoto = async (trashedPhoto: TrashedPhoto) => {
    try {
      // Just remove from trash folder - the original photo is still in media library
      await FileSystem.deleteAsync(trashedPhoto.trashPath);
      
      // Remove from trashed photos list
      const updatedTrashedPhotos = trashedPhotos.filter(tp => tp.trashedAt !== trashedPhoto.trashedAt);
      setTrashedPhotos(updatedTrashedPhotos);
      await saveTrashedPhotosMetadata(updatedTrashedPhotos);
      
      // Note: No need to create asset back in media library since we never actually deleted it
      // The photo will appear again in the next photo load from MediaLibrary.getAssetsAsync
      
    } catch (error) {
      console.error('Error restoring photo:', error);
      Alert.alert('Error', 'Failed to restore photo');
    }
  };

  const restorePhotoFromTrash = async (photo: Photo) => {
    try {
      // Find the trashed photo by id
      const trashedPhoto = trashedPhotos.find(tp => tp.originalId === photo.id);
      if (trashedPhoto) {
        await restorePhoto(trashedPhoto);
      }
    } catch (error) {
      console.error('Error restoring photo from trash:', error);
    }
  };

  const emptyTrash = async () => {
    setShowConfirmEmptyModal(true);
  };

  const confirmEmptyTrash = async () => {
    setShowConfirmEmptyModal(false);
    try {
      const sizeInMB = getTotalTrashSize();
      
      // Get all original photo IDs for deletion from device
      const originalPhotoIds = trashedPhotos
        .map(photo => photo.originalId)
        .filter(id => id); // Filter out any undefined IDs
      
      let successCount = 0;
      let failedCount = 0;
      
      if (originalPhotoIds.length > 0) {
        try {
          // Actually delete photos from device gallery
          await MediaLibrary.deleteAssetsAsync(originalPhotoIds);
          successCount = originalPhotoIds.length;
        } catch (error) {
          console.error('Some photos failed to delete from device:', error);
          failedCount = originalPhotoIds.length;
        }
      }
      
      // Always clean up app's trash folder
      await FileSystem.deleteAsync(TRASH_DIR, { idempotent: true });
      await createTrashDirectory();
      
      // Clear metadata
      setTrashedPhotos([]);
      await saveTrashedPhotosMetadata([]);
      
      // Show appropriate success/error message
      setTimeout(() => {
        if (failedCount === 0) {
          Alert.alert(
            'Success! 🎉',
            `${sizeInMB} MB was cleared from your device`,
            [{ text: 'Great!', style: 'default' }]
          );
        } else {
          Alert.alert(
            'Partial Success ⚠️',
            `Cleaned app trash, but ${failedCount} photos couldn't be deleted from device (may be protected)`,
            [{ text: 'OK', style: 'default' }]
          );
        }
      }, 300);
      
    } catch (error) {
      console.error('Error emptying trash:', error);
      Alert.alert('Error', 'Failed to empty trash completely');
    }
  };

  // Calculate total trash size in MB
  const getTotalTrashSize = () => {
    const totalBytes = trashedPhotos.reduce((sum, photo) => sum + (photo.size || 0), 0);
    return (totalBytes / (1024 * 1024)).toFixed(2); // Convert to MB
  };

  const resetCards = () => {
    setCurrentPhotoIndex(0);
    setStorageFreed(0);
    setPhotosProcessed(0);
    setPhotosLoadedSoFar(0);
    setTotalPhotosFound(0);
    setIsLoadingInBackground(false);
    setCanUndo(false);
    setPreviousPhoto(null);
    setPreviousAction(null);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotate.value = withSpring(0);
    scale.value = withSpring(1);
    loadPhotos();
  };

  const sharePhoto = async (photo: Photo) => {
    try {
      // Check if sharing is available on this device
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'This device does not support sharing');
        return;
      }

      // Get the asset info to access the local URI
      const assetInfo = await MediaLibrary.getAssetInfoAsync(photo.id);
      
      if (assetInfo && (assetInfo.localUri || assetInfo.uri)) {
        const sourceUri = assetInfo.localUri || assetInfo.uri;
        
        // Share the photo directly using the URI
        await Sharing.shareAsync(sourceUri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Share Photo',
        });
      } else {
        Alert.alert('Error', 'Unable to access photo for sharing');
      }
    } catch (error) {
      console.error('Error sharing photo:', error);
      Alert.alert('Error', 'Failed to share photo');
    }
  };

  const gestureHandler = Gesture.Pan()
    .onBegin(() => {
      scale.value = withSpring(0.95);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      rotate.value = event.translationX * 0.1;
    })
    .onFinalize((event) => {
      const shouldSwipe = Math.abs(event.translationX) > screenWidth * 0.2; // Reduced threshold
      
      if (shouldSwipe) {
        const direction = event.translationX > 0 ? 'right' : 'left';
        
        translateX.value = withTiming(
          direction === 'right' ? screenWidth * 1.5 : -screenWidth * 1.5,
          { duration: 300 }
        );
        translateY.value = withTiming(event.translationY + (Math.random() - 0.5) * 200, { duration: 300 });
        rotate.value = withTiming(direction === 'right' ? 30 : -30, { duration: 300 });
        
        runOnJS(handleSwipeComplete)(direction);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        rotate.value = withSpring(0);
        scale.value = withSpring(1);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  const overlayStyle = useAnimatedStyle(() => {
    const opacity = Math.abs(translateX.value) / (screenWidth * 0.5);
    return {
      opacity: Math.min(opacity, 0.8),
    };
  });

  const keepOverlayStyle = useAnimatedStyle(() => {
    const opacity = translateX.value > 0 ? Math.abs(translateX.value) / (screenWidth * 0.5) : 0;
    return {
      opacity: Math.min(opacity, 0.8),
    };
  });

  const deleteOverlayStyle = useAnimatedStyle(() => {
    const opacity = translateX.value < 0 ? Math.abs(translateX.value) / (screenWidth * 0.5) : 0;
    return {
      opacity: Math.min(opacity, 0.8),
    };
  });

  if (loading) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <LinearGradient
          colors={THEME_COLORS.gradient}
          style={styles.container}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.loadingContainer}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <Image 
                  source={require('./assets/logo.png')} 
                  style={styles.logoImage}
                  resizeMode="contain"
                />
                <Text style={styles.appName}>SwipeClean</Text>
              </View>

              {/* Progress Container */}
              <View style={styles.progressContainer}>
                <Text style={styles.loadingMessage}>{loadingMessage}</Text>
                
                {/* Progress Bar Background */}
                <View style={styles.progressBarBackground}>
                  {/* Progress Bar Fill */}
                  <Animated.View 
                    style={[
                      styles.progressBarFill,
                      { width: `${loadingProgress}%` }
                    ]}
                  />
                </View>

                {/* Progress Percentage */}
                <Text style={styles.progressText}>{loadingProgress}%</Text>
              </View>

              {/* Loading Animation Dots */}
              <View style={styles.dotsContainer}>
                <Animated.View style={[styles.dot, dot1AnimatedStyle]} />
                <Animated.View style={[styles.dot, dot2AnimatedStyle]} />
                <Animated.View style={[styles.dot, dot3AnimatedStyle]} />
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </GestureHandlerRootView>
    );
  }

  if (!hasPermission) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <LinearGradient
          colors={THEME_COLORS.gradient}
          style={styles.container}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.permissionContainer}>
              <Text style={styles.permissionTitle}>Photo Access Required</Text>
              <Text style={styles.permissionText}>
                SwipeClean needs access to your photos to help you organize them.
              </Text>
              <TouchableOpacity style={styles.permissionButton} onPress={requestPermissionAndLoadPhotos}>
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </GestureHandlerRootView>
    );
  }

  if (currentPhotoIndex >= photos.length) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <LinearGradient
          colors={THEME_COLORS.gradient}
          style={styles.container}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <Image 
                  source={require('./assets/logo-transparent.png')} 
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
              </View>
            </View>
            <View style={styles.completedContainer}>
              <Text style={styles.completedTitle}>All Done! 🎉</Text>
              <Text style={styles.completedText}>
                Great job organizing your photos! You've made real progress cleaning up your device.
              </Text>
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{storageFreed.toFixed(1)}</Text>
                  <Text style={styles.statLabel}>MB Freed</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{photosProcessed}</Text>
                  <Text style={styles.statLabel}>Reviewed</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.resetButton} onPress={resetCards}>
                <Text style={styles.resetButtonText}>Review More Photos</Text>
              </TouchableOpacity>
            </View>

            {/* Floating Action Button for Trash */}
            <TouchableOpacity style={styles.fabButton} onPress={() => setShowTrashModal(true)}>
              <LinearGradient
                colors={['#16213e', '#0f3460']} // Subset of theme gradient
                style={styles.fabGradient}
              >
                <Text style={styles.fabIcon}>🗑️</Text>
                {trashedPhotos.length > 0 && (
                  <View style={styles.fabBadge}>
                    <Text style={styles.fabBadgeText}>{trashedPhotos.length}</Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Undo Button - also available on completed screen */}
            {canUndo && (
              <TouchableOpacity style={styles.undoButton} onPress={handleUndo}>
                <LinearGradient
                  colors={['#16213e', '#0f3460']}
                  style={styles.undoGradient}
                >
                  <Text style={styles.undoIcon}>↶</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Trash Modal */}
            <Modal
              visible={showTrashModal}
              animationType="slide"
              presentationStyle="pageSheet"
            >
              <SafeAreaView style={styles.modalContainer}>
                <LinearGradient
                  colors={THEME_COLORS.gradient}
                  style={styles.modalGradient}
                >
                  <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={() => setShowTrashModal(false)}>
                      <Text style={styles.closeButton}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>
                      Trash ({trashedPhotos.length})
                      {trashedPhotos.length > 0 && (
                        <Text style={styles.trashSizeText}> • {getTotalTrashSize()} MB</Text>
                      )}
                    </Text>
                    <View style={{ width: 24 }} />
                  </View>
                  
                  {trashedPhotos.length === 0 ? (
                    <View style={styles.emptyTrashContainer}>
                      <Text style={styles.emptyTrashText}>🗑️</Text>
                      <Text style={styles.emptyTrashMessage}>Trash is empty</Text>
                    </View>
                  ) : (
                    <ScrollView style={styles.trashGrid} contentContainerStyle={styles.trashGridContent}>
                      {trashedPhotos.map((photo) => (
                        <View key={photo.trashedAt} style={styles.trashItem}>
                          <Image source={{ uri: photo.uri }} style={styles.trashPhoto} />
                          <View style={styles.trashActions}>
                            <TouchableOpacity
                              style={styles.restoreButton}
                              onPress={() => restorePhoto(photo)}
                            >
                              <Text style={styles.restoreButtonText}>Restore</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.trashDate}>
                            {new Date(photo.trashedAt).toLocaleDateString()}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  
                  {/* Bottom Empty Button */}
                  {trashedPhotos.length > 0 && (
                    <View style={styles.emptyButtonContainer}>
                      <TouchableOpacity style={styles.emptyButton} onPress={emptyTrash}>
                        <Text style={styles.emptyButtonText}>🗑️ Empty ({getTotalTrashSize()} MB)</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </LinearGradient>
              </SafeAreaView>
            </Modal>
          </SafeAreaView>
        </LinearGradient>
      </GestureHandlerRootView>
    );
  }

  const currentPhoto = photos[currentPhotoIndex];

  return (
    <GestureHandlerRootView style={styles.container}>
      <LinearGradient
        colors={THEME_COLORS.gradient}
        style={styles.container}
      >
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Image 
              source={require('./assets/logo-transparent.png')} 
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>
          
          {/* Background Loading Indicator */}
          {!loading && totalPhotosFound > photos.length && (
            <View style={styles.backgroundLoadingContainer}>
              <Text style={styles.backgroundLoadingText}>
                {isLoadingInBackground ? '📸 Loading more...' : '⏳ Ready to load more...'} {photos.length}/{totalPhotosFound} photos ready
              </Text>
              <View style={styles.backgroundProgressBar}>
                <View 
                  style={[
                    styles.backgroundProgressFill, 
                    { width: `${(photos.length / totalPhotosFound) * 100}%` }
                  ]} 
                />
              </View>
            </View>
          )}
          
          <View style={styles.stats}>
            <View style={styles.statBadgeFreed}>
              <Text style={styles.statBadgeText}>Freed: {storageFreed.toFixed(1)} MB</Text>
            </View>
            <View style={styles.statBadgeReviewed}>
              <Text style={styles.statBadgeText}>Reviewed: {photosProcessed}</Text>
            </View>
          </View>
        </View>

        {/* Card Stack */}
        <View style={styles.cardStack}>
          {photos.slice(currentPhotoIndex, currentPhotoIndex + 2).map((photo, index) => {
            if (index === 0) {
              return (
                <GestureDetector key={photo.id} gesture={gestureHandler}>
                  <Animated.View style={[styles.cardContainer, animatedStyle]}>
                    <View style={styles.card}>
                      <Image source={{ uri: photo.uri }} style={styles.photo} />
                      
                      {/* Share Button - Top Right */}
                      <TouchableOpacity 
                        style={styles.shareButton} 
                        onPress={() => sharePhoto(photo)}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={['#1a1a2e', '#16213e']} // Use app's gradient colors
                          style={styles.shareButtonGradient}
                        >
                          <Ionicons 
                            name="share-outline" 
                            size={22} 
                            color="rgba(76, 217, 100, 1)" 
                          />
                        </LinearGradient>
                      </TouchableOpacity>
                      
                      {/* Keep Overlay */}
                      <Animated.View style={[styles.overlay, styles.keepOverlay, keepOverlayStyle]} pointerEvents="none">
                        <Text style={styles.overlayText}>KEEP</Text>
                      </Animated.View>
                      
                      {/* Delete Overlay */}
                      <Animated.View style={[styles.overlay, styles.deleteOverlay, deleteOverlayStyle]} pointerEvents="none">
                        <Text style={styles.overlayText}>DELETE</Text>
                      </Animated.View>
                    </View>
                  </Animated.View>
                </GestureDetector>
              );
            } else {
              return (
                <View key={photo.id} style={[styles.cardContainer, styles.nextCard]}>
                  <View style={styles.card}>
                    <Image source={{ uri: photo.uri }} style={styles.photo} />
                  </View>
                </View>
              );
            }
          })}
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionText}>
            Swipe ← to delete • Swipe → to keep
          </Text>
        </View>

        {/* Floating Action Button for Trash */}
        <TouchableOpacity style={styles.fabButton} onPress={() => setShowTrashModal(true)}>
          <LinearGradient
            colors={['#16213e', '#0f3460']} // Subset of theme gradient
            style={styles.fabGradient}
          >
            <Text style={styles.fabIcon}>🗑️</Text>
            {trashedPhotos.length > 0 && (
              <View style={styles.fabBadge}>
                <Text style={styles.fabBadgeText}>{trashedPhotos.length}</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Undo Button - opposite side of trash button */}
        {canUndo && (
          <TouchableOpacity style={styles.undoButton} onPress={handleUndo}>
            <LinearGradient
              colors={['#16213e', '#0f3460']} // Same gradient as trash button
              style={styles.undoGradient}
            >
              <Text style={styles.undoIcon}>↶</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Trash Modal */}
        <Modal
          visible={showTrashModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            setShowTrashModal(false);
          }}
        >
          <SafeAreaView style={styles.modalContainer}>
            <LinearGradient
              colors={THEME_COLORS.gradient}
              style={styles.modalGradient}
            >
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowTrashModal(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Trash ({trashedPhotos.length})</Text>
                <View style={{ width: 24 }} />
              </View>
              
              {trashedPhotos.length === 0 ? (
                <View style={styles.emptyTrashContainer}>
                  <Text style={styles.emptyTrashText}>🗑️</Text>
                  <Text style={styles.emptyTrashMessage}>Trash is empty</Text>
                </View>
              ) : (
                <ScrollView style={styles.trashGrid} contentContainerStyle={styles.trashGridContent}>
                  {trashedPhotos.map((photo) => (
                    <View key={photo.trashedAt} style={styles.trashItem}>
                      <Image source={{ uri: photo.uri }} style={styles.trashPhoto} />
                      <View style={styles.trashActions}>
                        <TouchableOpacity
                          style={styles.restoreButton}
                          onPress={() => restorePhoto(photo)}
                        >
                          <Text style={styles.restoreButtonText}>Restore</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.trashDate}>
                        {new Date(photo.trashedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              
              {/* Bottom Empty Button */}
              {trashedPhotos.length > 0 && (
                <View style={styles.emptyButtonContainer}>
                  <TouchableOpacity style={styles.emptyButton} onPress={emptyTrash}>
                    <Text style={styles.emptyButtonText}>🗑️ Empty ({getTotalTrashSize()} MB)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </LinearGradient>
          </SafeAreaView>
        </Modal>

        {/* Beautiful Confirmation Modal for Empty Trash */}
        <Modal
          visible={showConfirmEmptyModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowConfirmEmptyModal(false)}
        >
          <View style={styles.confirmModalOverlay}>
            <View style={styles.confirmModalContainer}>
              <LinearGradient
                colors={THEME_COLORS.gradient}
                style={styles.confirmModalGradient}
              >
                <Text style={styles.confirmModalIcon}>✨</Text>
                <Text style={styles.confirmModalTitle}>Clean Up Space?</Text>
                
                <View style={styles.confirmModalStorageInfo}>
                  <Text style={styles.confirmModalStorageText}>Ready to free up</Text>
                  <Text style={styles.confirmModalStorageAmount}>{getTotalTrashSize()} MB</Text>
                  <Text style={styles.confirmModalStorageText}>by removing {trashedPhotos.length} photos</Text>
                </View>
                <Text style={styles.confirmModalWarning}>
                  This will help keep your gallery organized and save storage space.
                </Text>
                
                <View style={styles.confirmModalButtons}>
                  <TouchableOpacity
                    style={styles.confirmModalCancelButton}
                    onPress={() => setShowConfirmEmptyModal(false)}
                  >
                    <Text style={styles.confirmModalCancelText}>Keep Photos</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.confirmModalDeleteButton}
                    onPress={confirmEmptyTrash}
                  >
                    <Text style={styles.confirmModalDeleteText}>Clean Up</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    flex: 1,
  },
  headerLogo: {
    height: 44,
    width: 165,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
  },
  statBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statBadgeFreed: {
    backgroundColor: 'rgba(76, 217, 100, 0.3)', // Light green background
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(76, 217, 100, 0.6)',
  },
  statBadgeReviewed: {
    backgroundColor: 'rgba(52, 152, 219, 0.3)', // Light blue background
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(52, 152, 219, 0.6)',
  },
  statBadgeText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  cardStack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  cardContainer: {
    position: 'absolute',
    width: screenWidth - 40,
    height: screenHeight * 0.6,
    zIndex: 1,
  },
  nextCard: {
    transform: [{ scale: 0.95 }],
    opacity: 0.3,
    zIndex: -1,
  },
  card: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keepOverlay: {
    backgroundColor: THEME_COLORS.keepColor,
  },
  deleteOverlay: {
    backgroundColor: THEME_COLORS.deleteColor,
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: THEME_COLORS.primaryText,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  instructions: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    alignItems: 'center',
  },
  instructionText: {
    color: '#FFEB3B', // Slightly lighter golden yellow
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    marginTop: screenHeight * 0.4,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  permissionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: 'white',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME_COLORS.accent,
  },
  completedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: isSmallScreen ? 30 : 40,
    paddingBottom: isSmallScreen ? 140 : 120, // More padding on smaller screens to prevent overlap
    paddingTop: isSmallScreen ? 20 : 0, // Add top padding on small screens for better balance
  },
  completedTitle: {
    fontSize: isVerySmallScreen ? 22 : isSmallScreen ? 26 : 28, // Responsive font sizes
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: isSmallScreen ? 10 : 15, // Reduced margin on small screens
  },
  completedText: {
    fontSize: isVerySmallScreen ? 14 : 16, // Smaller font on very small screens
    color: 'white',
    textAlign: 'center',
    marginBottom: isSmallScreen ? 20 : 30, // Reduced margin on small screens
    lineHeight: isVerySmallScreen ? 20 : 22, // Adjusted line height
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: isSmallScreen ? 20 : 30, // Even smaller gap on small screens
    marginBottom: isSmallScreen ? 20 : 30, // Reduced margin on small screens
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: isVerySmallScreen ? 32 : isSmallScreen ? 38 : 42, // Responsive font sizes
    fontWeight: 'bold',
    color: 'white',
  },
  statLabel: {
    fontSize: 16,
    color: 'white',
    marginTop: 5,
  },
  resetButton: {
    backgroundColor: 'white',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME_COLORS.accent,
  },
  // Header styles
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  // Background loading indicator styles
  backgroundLoadingContainer: {
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  backgroundLoadingText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '500',
  },
  backgroundProgressBar: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  backgroundProgressFill: {
    height: '100%',
    backgroundColor: THEME_COLORS.accent,
    borderRadius: 2,
  },
  // Floating Action Button styles
  fabButton: {
    position: 'absolute',
    bottom: isSmallScreen ? 20 : 30,
    right: 20,
    width: isVerySmallScreen ? 50 : 60,
    height: isVerySmallScreen ? 50 : 60,
    borderRadius: isVerySmallScreen ? 25 : 30,
    borderWidth: 2,
    borderColor: THEME_COLORS.accent, // Bright teal border
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden', // Ensure gradient stays within border radius
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: isVerySmallScreen ? 25 : 30,
  },
  fabIcon: {
    fontSize: isVerySmallScreen ? 20 : 24,
    color: THEME_COLORS.accent, // Bright teal trash icon
  },
  fabBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF4444',
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME_COLORS.accent, // Match the teal border
  },
  fabBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Undo Button styles (positioned opposite to trash button)
  undoButton: {
    position: 'absolute',
    bottom: isSmallScreen ? 20 : 30,
    left: 20, // Opposite side of trash button
    width: isVerySmallScreen ? 50 : 60,
    height: isVerySmallScreen ? 50 : 60,
    borderRadius: isVerySmallScreen ? 25 : 30,
    borderWidth: 2,
    borderColor: THEME_COLORS.accent, // Same teal border
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  undoGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: isVerySmallScreen ? 25 : 30,
  },
  undoIcon: {
    fontSize: isVerySmallScreen ? 22 : 28,
    color: THEME_COLORS.accent, // Bright teal undo icon
    fontWeight: 'bold',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalGradient: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
  },
  closeButton: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  trashSizeText: {
    fontSize: 16,
    fontWeight: 'normal',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  emptyTrashButton: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  emptyTrashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTrashText: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTrashMessage: {
    fontSize: 18,
    color: 'white',
    fontWeight: '500',
  },
  trashGrid: {
    flex: 1,
    paddingHorizontal: 20,
  },
  trashGridContent: {
    paddingBottom: 20,
  },
  trashItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginBottom: 15,
    overflow: 'hidden',
  },
  trashPhoto: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  trashActions: {
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  restoreButton: {
    backgroundColor: 'rgba(22, 33, 62, 0.8)', // Semi-transparent theme color
    borderWidth: 2,
    borderColor: THEME_COLORS.accent, // Bright teal border like FAB
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  restoreButtonText: {
    color: THEME_COLORS.accent, // Bright teal text to match border
    fontWeight: '600',
    fontSize: 14,
  },
  trashDate: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 10,
  },
  // Empty button styles
  emptyButtonContainer: {
    padding: 20,
    paddingTop: 10,
  },
  emptyButton: {
    backgroundColor: 'rgba(22, 33, 62, 0.8)', // Same as restore button
    borderWidth: 2,
    borderColor: '#FF6B6B', // Red border - clear delete action but not scary
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  emptyButtonText: {
    color: '#FF6B6B', // Red text to match border
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Loading screen styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoImage: {
    width: 120,
    height: 120,
    marginBottom: 20,
    borderRadius: 30,
    shadowColor: 'rgba(255, 255, 255, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: 80,
    marginBottom: 10,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 40,
  },
  loadingMessage: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
    opacity: 0.9,
  },
  loadingHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 15,
    fontStyle: 'italic',
  },
  progressBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 4,
    shadowColor: 'white',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  progressText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    opacity: 0.8,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'white',
    marginHorizontal: 6,
    opacity: 0.5,
  },
  // Confirmation Modal Styles
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalContainer: {
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  confirmModalGradient: {
    padding: 30,
    alignItems: 'center',
  },
  confirmModalIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  confirmModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmModalSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmModalWarning: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  confirmModalStorageInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  confirmModalStorageText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 4,
  },
  confirmModalStorageAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: THEME_COLORS.accent,
    textAlign: 'center',
    marginVertical: 8,
    textShadowColor: 'rgba(0, 255, 208, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmModalCancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  confirmModalCancelText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  confirmModalDeleteButton: {
    flex: 1,
    backgroundColor: THEME_COLORS.accent,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 0,
    shadowColor: THEME_COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  confirmModalDeleteText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Share Button Styles
  shareButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  shareButtonGradient: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(76, 217, 100, 0.6)', // Green border to match icon
    shadowColor: 'rgba(76, 217, 100, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  shareButtonIcon: {
    fontSize: 22,
    color: 'rgba(76, 217, 100, 1)', // Green color like keep functionality
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
