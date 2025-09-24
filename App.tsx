import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  FlatList,
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

interface LikedPhoto extends Photo {
  likedAt: number;
  originalId: string;
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
  const [likedPhotos, setLikedPhotos] = useState<LikedPhoto[]>([]);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [showConfirmEmptyModal, setShowConfirmEmptyModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<LikedPhoto | null>(null);
  
  // Like animation state
  const [likeAnimations, setLikeAnimations] = useState<Array<{ id: string; x: number; y: number }>>([]);
  
  // Trash modal pagination state
  const [displayedTrashPhotos, setDisplayedTrashPhotos] = useState<TrashedPhoto[]>([]);
  const [trashPage, setTrashPage] = useState(0);
  const [isLoadingMoreTrash, setIsLoadingMoreTrash] = useState(false);
  
  // New state for batch loading
  const [totalPhotosFound, setTotalPhotosFound] = useState(0);
  const [photosLoadedSoFar, setPhotosLoadedSoFar] = useState(0);
  const [isLoadingInBackground, setIsLoadingInBackground] = useState(false);
  
  // Undo functionality state
  const [canUndo, setCanUndo] = useState(false);
  const [previousPhoto, setPreviousPhoto] = useState<Photo | null>(null);
  const [previousAction, setPreviousAction] = useState<'keep' | 'delete' | null>(null);

  const TRASH_DIR = `${FileSystem.documentDirectory}trash/`;
  
  // Pagination constants
  const TRASH_PHOTOS_PER_PAGE = 5; // Load 5 photos at a time for better performance

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

  // Like animation values (only opacity for floating hearts)
  const likeOpacity = useSharedValue(1);

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
    loadLikedPhotos();
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

      const allInitialPhotos: Photo[] = firstBatch.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename,
      }));

      // Filter out photos that are already in trash
      const trashedPhotoIds = new Set(trashedPhotos.map(tp => tp.originalId));
      const initialPhotos = allInitialPhotos.filter(photo => !trashedPhotoIds.has(photo.id));

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

        const allBatchPhotos: Photo[] = batch.assets.map((asset) => ({
          id: asset.id,
          uri: asset.uri,
          filename: asset.filename,
        }));

        // Filter out photos that are already in trash
        const trashedPhotoIds = new Set(trashedPhotos.map(tp => tp.originalId));
        const batchPhotos = allBatchPhotos.filter(photo => !trashedPhotoIds.has(photo.id));

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

      const allBatchPhotos: Photo[] = batch.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename,
      }));

      // Filter out photos that are already in trash
      const trashedPhotoIds = new Set(trashedPhotos.map(tp => tp.originalId));
      const batchPhotos = allBatchPhotos.filter(photo => !trashedPhotoIds.has(photo.id));

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

      // Check if photo is already in trash
      const isAlreadyTrashed = trashedPhotos.some(tp => tp.originalId === photo.id);
      if (isAlreadyTrashed) {
        console.log('Photo is already in trash, skipping...');
        return;
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
          originalId: photo.id || `photo-${timestamp}`, // Ensure originalId is never empty
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
        
        // Verify files still exist and filter out missing ones, also deduplicate by originalId
        const validTrashedPhotos = [];
        const seenIds = new Set<string>();
        
        for (const trashedPhoto of metadata) {
          // Skip items without valid originalId
          if (!trashedPhoto.originalId || typeof trashedPhoto.originalId !== 'string') {
            console.warn('Skipping trash item with invalid originalId:', trashedPhoto);
            continue;
          }
          
          // Skip duplicates (keep the first occurrence)
          if (seenIds.has(trashedPhoto.originalId)) {
            console.warn('Skipping duplicate trash item:', trashedPhoto.originalId);
            continue;
          }
          
          const fileInfo = await FileSystem.getInfoAsync(trashedPhoto.trashPath);
          if (fileInfo.exists) {
            validTrashedPhotos.push(trashedPhoto);
            seenIds.add(trashedPhoto.originalId);
          } else {
            console.warn('Skipping trash item with missing file:', trashedPhoto.trashPath);
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
      // Check if the file exists before trying to delete it
      const fileInfo = await FileSystem.getInfoAsync(trashedPhoto.trashPath);
      if (fileInfo.exists) {
        // Remove from trash folder - the original photo is still in media library
        await FileSystem.deleteAsync(trashedPhoto.trashPath);
      }
      
      // Remove from trashed photos list
      const updatedTrashedPhotos = trashedPhotos.filter(tp => tp.trashedAt !== trashedPhoto.trashedAt);
      setTrashedPhotos(updatedTrashedPhotos);
      await saveTrashedPhotosMetadata(updatedTrashedPhotos);
      
      // The useEffect will handle updating displayedTrashPhotos when trashedPhotos changes
      
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

  const restoreAllPhotos = async () => {
    try {
      const totalPhotos = trashedPhotos.length;
      
      if (totalPhotos === 0) {
        Alert.alert('Info', 'No photos to restore');
        return;
      }

      // Show confirmation dialog
      Alert.alert(
        'Restore All Photos',
        `Are you sure you want to restore all ${totalPhotos} photos from trash?`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Restore All',
            style: 'default',
            onPress: async () => {
              // Create a copy of the array to avoid mutation during iteration
              const photosToRestore = [...trashedPhotos];
              let restoredCount = 0;
              let failedCount = 0;

              for (const photo of photosToRestore) {
                try {
                  // Just remove from trash folder - the original photo is still in media library
                  await FileSystem.deleteAsync(photo.trashPath);
                  restoredCount++;
                } catch (error) {
                  console.error(`Failed to restore photo ${photo.originalId}:`, error);
                  failedCount++;
                }
              }

              // Clear all trashed photos after restoration
              setTrashedPhotos([]);
              setDisplayedTrashPhotos([]);
              await saveTrashedPhotosMetadata([]);

              // Close the trash modal since it's now empty
              setShowTrashModal(false);

              // Show result
              if (failedCount === 0) {
                Alert.alert(
                  'Success! 🎉',
                  `All ${restoredCount} photos have been restored`,
                  [{ text: 'Great!', style: 'default' }]
                );
              } else {
                Alert.alert(
                  'Partially Restored ⚠️',
                  `${restoredCount} photos restored successfully, ${failedCount} failed`,
                  [{ text: 'OK', style: 'default' }]
                );
              }
            }
          }
        ]
      );
      
    } catch (error) {
      console.error('Error restoring all photos:', error);
      Alert.alert('Error', 'Failed to restore all photos');
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

  // Clean up trash data to remove any duplicates or invalid entries
  const cleanupTrashData = (photos: TrashedPhoto[]): TrashedPhoto[] => {
    const seen = new Set<string>();
    const cleaned: TrashedPhoto[] = [];
    
    for (const photo of photos) {
      // Ensure photo has valid originalId
      if (!photo.originalId || typeof photo.originalId !== 'string') {
        console.warn('Removing trash item with invalid originalId:', photo);
        continue;
      }
      
      // Skip duplicates
      if (seen.has(photo.originalId)) {
        console.warn('Removing duplicate trash item:', photo.originalId);
        continue;
      }
      
      seen.add(photo.originalId);
      cleaned.push(photo);
    }
    
    return cleaned;
  };

  // Trash pagination helpers
  const initializeTrashPagination = () => {
    setTrashPage(0);
    setIsLoadingMoreTrash(false);
    
    // Clean up data before pagination
    const cleanedPhotos = cleanupTrashData(trashedPhotos);
    if (cleanedPhotos.length !== trashedPhotos.length) {
      console.log(`Cleaned up ${trashedPhotos.length - cleanedPhotos.length} duplicate/invalid trash items`);
      setTrashedPhotos(cleanedPhotos);
      saveTrashedPhotosMetadata(cleanedPhotos);
    }
    
    const initialPhotos = cleanedPhotos.slice(0, TRASH_PHOTOS_PER_PAGE);
    setDisplayedTrashPhotos(initialPhotos);
  };

  const loadMoreTrashPhotos = () => {
    if (isLoadingMoreTrash) return;
    
    const nextPage = trashPage + 1;
    const startIndex = nextPage * TRASH_PHOTOS_PER_PAGE;
    const endIndex = startIndex + TRASH_PHOTOS_PER_PAGE;
    
    if (startIndex >= trashedPhotos.length) return;
    
    setIsLoadingMoreTrash(true);
    
    const nextBatch = trashedPhotos.slice(startIndex, endIndex);
    setDisplayedTrashPhotos(prev => [...prev, ...nextBatch]);
    
    setTrashPage(nextPage);
    setIsLoadingMoreTrash(false);
  };

  // Update displayed photos when trashedPhotos changes
  useEffect(() => {
    if (showTrashModal) {
      // Small delay to ensure state updates are complete
      const timer = setTimeout(() => {
        initializeTrashPagination();
      }, 10);
      
      return () => clearTimeout(timer);
    }
  }, [trashedPhotos, showTrashModal]);

  // Memoized render function for trash items to improve performance
  const renderTrashItem = useCallback(({ item: photo }: { item: TrashedPhoto }) => (
    <View style={styles.trashItem}>
      <Image 
        source={{ uri: photo.uri }} 
        style={styles.trashPhoto}
        resizeMode="cover"
        loadingIndicatorSource={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' }}
      />
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
  ), [restorePhoto]);

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

  // Liked photos functions
  const isPhotoLiked = (photoId: string): boolean => {
    return likedPhotos.some(likedPhoto => likedPhoto.originalId === photoId);
  };

  // Like animation function
  const triggerLikeAnimation = () => {
    // Calculate heart button position using actual screen dimensions
    const cardWidth = screenWidth - 40; // Card takes full screen width minus 40px margin
    const cardHeight = screenHeight * 0.6; // Card height
    const heartButtonSize = 52; // Heart button is 52x52px
    
    // Heart button is positioned at bottom: 16, right: 16 within the card
    const heartButtonCenterX = cardWidth - 16 - (heartButtonSize / 2); // Right edge minus margin minus half button
    const heartButtonCenterY = cardHeight - 16 - (heartButtonSize / 2); // Bottom edge minus margin minus half button
    
    // Create floating hearts from the heart button center
    const hearts = [];
    for (let i = 0; i < 20; i++) {
      hearts.push({
        id: Math.random().toString(),
        x: heartButtonCenterX, // Heart button center X
        y: heartButtonCenterY, // Heart button center Y
      });
    }
    setLikeAnimations(hearts);

    // Clear animations after they finish (1.5x faster)
    setTimeout(() => {
      setLikeAnimations([]);
    }, 1667); // 2500 / 1.5 = 1667
  };

  const toggleLikePhoto = async (photo: Photo) => {
    try {
      const isCurrentlyLiked = isPhotoLiked(photo.id);
      
      if (isCurrentlyLiked) {
        // Unlike the photo
        const updatedLikedPhotos = likedPhotos.filter(lp => lp.originalId !== photo.id);
        setLikedPhotos(updatedLikedPhotos);
        await saveLikedPhotosMetadata(updatedLikedPhotos);
      } else {
        // Like the photo
        triggerLikeAnimation(); // Trigger cute animation!
        const likedPhoto: LikedPhoto = {
          ...photo,
          originalId: photo.id,
          likedAt: Date.now(),
        };
        const updatedLikedPhotos = [...likedPhotos, likedPhoto];
        setLikedPhotos(updatedLikedPhotos);
        await saveLikedPhotosMetadata(updatedLikedPhotos);
      }
    } catch (error) {
      console.error('Error toggling like photo:', error);
      Alert.alert('Error', 'Failed to update favorite');
    }
  };

  const saveLikedPhotosMetadata = async (photos: LikedPhoto[]) => {
    try {
      const metadataPath = `${FileSystem.documentDirectory}liked_metadata.json`;
      await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(photos));
    } catch (error) {
      console.error('Error saving liked photos metadata:', error);
    }
  };

  const openPhotoPreview = (photo: LikedPhoto) => {
    setPreviewPhoto(photo);
    setShowPreviewModal(true);
  };

  const sharePreviewPhoto = async (photo: LikedPhoto) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(photo.uri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Share photo',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error('Error sharing preview photo:', error);
      Alert.alert('Error', 'Failed to share photo');
    }
  };

  const loadLikedPhotos = async () => {
    try {
      const metadataPath = `${FileSystem.documentDirectory}liked_metadata.json`;
      const fileInfo = await FileSystem.getInfoAsync(metadataPath);
      
      if (fileInfo.exists) {
        const data = await FileSystem.readAsStringAsync(metadataPath);
        const metadata = JSON.parse(data) as LikedPhoto[];
        setLikedPhotos(metadata);
      }
    } catch (error) {
      console.error('Error loading liked photos:', error);
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

  // Floating Hearts Component
  const FloatingHeart = ({ x, y }: { x: number; y: number }) => {
    const translateY = useSharedValue(0);
    const translateX = useSharedValue(0);
    const opacity = useSharedValue(1);
    const scale = useSharedValue(0);

    React.useEffect(() => {
      // Start with small scale and pop in immediately
      scale.value = 0;
      scale.value = withSpring(1, { damping: 12, stiffness: 400 });
      
      // Calculate movement towards photo center using actual screen dimensions
      const cardWidth = screenWidth - 40;
      const cardHeight = screenHeight * 0.6;
      const photoCenterX = cardWidth / 2; // Center X of the photo
      const photoCenterY = (cardHeight - 100) / 2; // Center Y of the photo (accounting for button space)
      
      // Calculate direction from heart button to photo center with increased randomness for more spread
      const targetX = photoCenterX - x + (Math.random() - 0.5) * 120; // Increased spread
      const targetY = photoCenterY - y + (Math.random() - 0.5) * 120; // Increased spread
      
      // Start movement immediately with varied speeds for organic feel
      const animationDuration = 1067 + Math.random() * 267; // Varied animation duration
      translateX.value = withTiming(targetX, { duration: animationDuration });
      translateY.value = withTiming(targetY, { duration: animationDuration });
      
      // Fade out animation starts after movement begins
      setTimeout(() => {
        opacity.value = withTiming(0, { duration: 400 });
      }, 933);

      // Clean up after animation completes
      const timer = setTimeout(() => {
        setLikeAnimations(prev => prev.filter(heart => heart.x !== x || heart.y !== y));
      }, 1667);

      return () => clearTimeout(timer);
    }, [x, y]);

    const animatedStyle = useAnimatedStyle(() => ({
      position: 'absolute',
      left: x,
      top: y,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    }));

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8A95', '#A8E6CF'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    return (
      <Animated.View style={animatedStyle}>
        <Ionicons name="heart" size={16} color={randomColor} />
      </Animated.View>
    );
  };

  // Heart button animation style (removed scaling)
  const heartButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      // No animation on the button itself
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
                    {trashedPhotos.length > 0 ? (
                      <TouchableOpacity onPress={restoreAllPhotos} style={styles.restoreAllButton}>
                        <Text style={styles.restoreAllButtonText}>↶</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ width: 24 }} />
                    )}
                  </View>
                  
                  {trashedPhotos.length === 0 ? (
                    <View style={styles.emptyTrashContainer}>
                      <Text style={styles.emptyTrashText}>🗑️</Text>
                      <Text style={styles.emptyTrashMessage}>Trash is empty</Text>
                    </View>
                  ) : (
                    <FlatList
                      key="trash-flatlist-single-column"
                      data={displayedTrashPhotos}
                      keyExtractor={(item, index) => `trash-${item.originalId}-${item.trashedAt}-${index}`}
                      style={styles.trashGrid}
                      contentContainerStyle={styles.trashGridContent}
                      onEndReached={loadMoreTrashPhotos}
                      onEndReachedThreshold={0.5}
                      removeClippedSubviews={true}
                      maxToRenderPerBatch={3}
                      windowSize={5}
                      initialNumToRender={5}
                      renderItem={renderTrashItem}
                      ListFooterComponent={() => 
                        isLoadingMoreTrash ? (
                          <View style={styles.loadingMoreContainer}>
                            <Text style={styles.loadingMoreText}>Loading more photos...</Text>
                          </View>
                        ) : null
                      }
                    />
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
                      
                      {/* Heart Button - Bottom Right */}
                      <Animated.View style={heartButtonAnimatedStyle}>
                        <TouchableOpacity 
                          style={styles.heartButton} 
                          onPress={() => toggleLikePhoto(photo)}
                          activeOpacity={0.7}
                        >
                          <LinearGradient
                            colors={['#1a1a2e', '#16213e']} // Use app's gradient colors
                            style={styles.heartButtonGradient}
                          >
                            <Ionicons 
                              name={isPhotoLiked(photo.id) ? "heart" : "heart-outline"} 
                              size={22} 
                              color={isPhotoLiked(photo.id) ? "rgba(255, 69, 69, 1)" : "rgba(255, 69, 69, 0.7)"} 
                            />
                          </LinearGradient>
                        </TouchableOpacity>
                      </Animated.View>

                      {/* Floating Hearts Animation */}
                      {likeAnimations.map((heart) => (
                        <FloatingHeart key={heart.id} x={heart.x} y={heart.y} />
                      ))}
                      
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

        {/* Favorites Button */}
        <TouchableOpacity 
          style={styles.favoritesButton}
          onPress={() => setShowFavoritesModal(true)}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.05)']}
            style={styles.favoritesButtonGradient}
          >
            <Ionicons name="heart" size={20} color="#ff6b6b" />
            <Text style={styles.favoritesButtonText}>Favourites ({likedPhotos.length})</Text>
          </LinearGradient>
        </TouchableOpacity>

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
                <Text style={styles.modalTitle}>
                  Trash ({trashedPhotos.length})
                  {trashedPhotos.length > 0 && (
                    <Text style={styles.trashSizeText}> • {getTotalTrashSize()} MB</Text>
                  )}
                </Text>
                {trashedPhotos.length > 0 ? (
                  <TouchableOpacity onPress={restoreAllPhotos} style={styles.restoreAllButton}>
                    <Text style={styles.restoreAllButtonText}>↶</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 24 }} />
                )}
              </View>
              
              {trashedPhotos.length === 0 ? (
                <View style={styles.emptyTrashContainer}>
                  <Text style={styles.emptyTrashText}>🗑️</Text>
                  <Text style={styles.emptyTrashMessage}>Trash is empty</Text>
                </View>
              ) : (
                <FlatList
                  key="trash-flatlist-single-column-2"
                  data={displayedTrashPhotos}
                  keyExtractor={(item, index) => `trash-${item.originalId}-${item.trashedAt}-${index}`}
                  style={styles.trashGrid}
                  contentContainerStyle={styles.trashGridContent}
                  onEndReached={loadMoreTrashPhotos}
                  onEndReachedThreshold={0.5}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={3}
                  windowSize={5}
                  initialNumToRender={5}
                  renderItem={renderTrashItem}
                  ListFooterComponent={() => 
                    isLoadingMoreTrash ? (
                      <View style={styles.loadingMoreContainer}>
                        <Text style={styles.loadingMoreText}>Loading more photos...</Text>
                      </View>
                    ) : null
                  }
                />
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

        {/* Favorites Modal */}
        <Modal
          visible={showFavoritesModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowFavoritesModal(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <LinearGradient
              colors={THEME_COLORS.gradient}
              style={styles.modalGradient}
            >
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowFavoritesModal(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  Favorite Photos ❤️ ({likedPhotos.length})
                </Text>
                <TouchableOpacity onPress={() => setShowFavoritesModal(false)}>
                  <Text style={styles.doneButton}>Done</Text>
                </TouchableOpacity>
              </View>
              
              {likedPhotos.length === 0 ? (
                <View style={styles.emptyTrashContainer}>
                  <Text style={styles.emptyTrashText}>❤️</Text>
                  <Text style={styles.emptyTrashMessage}>No favorite photos yet</Text>
                  <Text style={styles.emptyTrashSubMessage}>Tap the heart icon on photos you love!</Text>
                </View>
              ) : (
                <FlatList
                  data={[...likedPhotos].sort((a, b) => b.likedAt - a.likedAt)}
                  keyExtractor={(item, index) => `liked-${item.originalId}-${index}`}
                  numColumns={2}
                  columnWrapperStyle={styles.trashRow}
                  style={styles.trashGrid}
                  contentContainerStyle={styles.trashGridContent}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: photo }: { item: LikedPhoto }) => (
                    <View style={styles.trashItem}>
                      <TouchableOpacity onPress={() => openPhotoPreview(photo)} activeOpacity={0.8}>
                        <Image source={{ uri: photo.uri }} style={styles.trashPhoto} />
                      </TouchableOpacity>
                      
                      {/* Share Button - Top Right Corner */}
                      <TouchableOpacity
                        style={styles.overlayShareButton}
                        onPress={() => sharePreviewPhoto(photo)}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#1a1a2e', '#16213e']}
                          style={styles.overlayShareButtonGradient}
                        >
                          <Ionicons name="share-outline" size={18} color="rgba(76, 217, 100, 1)" />
                        </LinearGradient>
                      </TouchableOpacity>
                      
                      {/* Remove Button - Bottom Right Corner */}
                      <TouchableOpacity
                        style={styles.overlayRemoveButtonBottom}
                        onPress={() => toggleLikePhoto(photo)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={18} color="rgba(255, 69, 69, 0.7)" />
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )}
            </LinearGradient>
          </SafeAreaView>
        </Modal>

        {/* Photo Preview Modal */}
        <Modal
          visible={showPreviewModal}
          animationType="fade"
          presentationStyle="overFullScreen"
          onRequestClose={() => setShowPreviewModal(false)}
        >
          <View style={styles.previewModalContainer}>
            <LinearGradient
              colors={THEME_COLORS.gradient}
              style={styles.previewModalGradient}
            >
              {/* Close Button */}
              <TouchableOpacity
                style={styles.previewCloseButton}
                onPress={() => setShowPreviewModal(false)}
              >
                <Text style={styles.previewCloseText}>✕</Text>
              </TouchableOpacity>

              {/* Photo */}
              {previewPhoto && (
                <View style={styles.previewPhotoContainer}>
                  <Image source={{ uri: previewPhoto.uri }} style={styles.previewPhoto} />
                  
                  {/* Share Button - Top Right */}
                  <TouchableOpacity 
                    style={styles.previewShareButton} 
                    onPress={() => sharePreviewPhoto(previewPhoto)}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={['#1a1a2e', '#16213e']}
                      style={styles.previewShareButtonGradient}
                    >
                      <Ionicons 
                        name="share-outline" 
                        size={24} 
                        color="rgba(76, 217, 100, 1)" 
                      />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </LinearGradient>
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
    marginTop: -20, // Move up slightly to make room for favorites button
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
  doneButton: {
    fontSize: 16,
    color: THEME_COLORS.accent,
    fontWeight: '600',
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
  emptyTrashSubMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '400',
    marginTop: 8,
    textAlign: 'center',
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
    flex: 1,
    marginHorizontal: 5,
    maxWidth: '45%', // Ensure 2 columns fit properly
  },
  trashPhoto: {
    width: '100%',
    height: 260, // Bigger photos for better visibility
    resizeMode: 'contain', // Show full photo
  },
  trashRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  overlayRemoveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  overlayShareButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  overlayShareButtonGradient: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(76, 217, 100, 0.6)', // Green border to match icon
  },
  overlayRemoveButtonBottom: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(22, 33, 62, 0.9)', // Using our gradient color (dark navy)
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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
  // Heart Button Styles
  heartButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  heartButtonGradient: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 69, 69, 0.6)', // Red border to match heart
    shadowColor: 'rgba(255, 69, 69, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  // Trash Modal Lazy Loading Styles
  loadingMoreContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMoreText: {
    color: THEME_COLORS.secondaryText,
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.8,
  },
  // Restore All Button Styles
  restoreAllButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 255, 208, 0.15)',
    borderWidth: 1,
    borderColor: THEME_COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: THEME_COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  restoreAllButtonText: {
    fontSize: 18,
    color: THEME_COLORS.accent,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // Favorites Button Styles (below photo container)
  favoritesButton: {
    alignSelf: 'center',
    marginVertical: 15,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.4)',
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
    overflow: 'hidden',
  },
  favoritesButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  favoritesButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  // Photo Preview Modal Styles
  previewModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  previewModalGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  previewPhotoContainer: {
    width: '90%',
    height: '80%',
    position: 'relative',
  },
  previewPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    resizeMode: 'contain',
  },
  previewShareButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 2,
    borderColor: 'rgba(76, 217, 100, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  previewShareButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
