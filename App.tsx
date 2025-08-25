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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface Photo {
  id: string;
  uri: string;
  filename: string;
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keptCount, setKeptCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    requestPermissionAndLoadPhotos();
  }, []);

  const requestPermissionAndLoadPhotos = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      
      if (status === 'granted') {
        setHasPermission(true);
        await loadPhotos();
      } else {
        Alert.alert(
          'Permission Required',
          'This app needs access to your photos to work properly.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => MediaLibrary.requestPermissionsAsync() }
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
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 50,
        sortBy: 'creationTime',
      });

      const photoData: Photo[] = media.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename,
      }));

      // Shuffle photos for random display
      const shuffledPhotos = photoData.sort(() => Math.random() - 0.5);
      setPhotos(shuffledPhotos);
    } catch (error) {
      console.error('Error loading photos:', error);
      Alert.alert('Error', 'Failed to load photos');
    }
  };

  const handleSwipeComplete = (direction: 'left' | 'right') => {
    console.log('handleSwipeComplete called with direction:', direction);
    if (currentPhotoIndex >= photos.length) return;

    const currentPhoto = photos[currentPhotoIndex];
    console.log('Processing photo:', currentPhoto.filename);

    if (direction === 'left') {
      // Delete photo
      console.log('Deleting photo:', currentPhoto.filename);
      deletePhoto(currentPhoto);
      setDeletedCount(prev => prev + 1);
    } else {
      // Keep photo
      console.log('Keeping photo:', currentPhoto.filename);
      setKeptCount(prev => prev + 1);
    }

    // Move to next photo
    setCurrentPhotoIndex(prev => prev + 1);
    
    // Reset animation values
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotate.value = withSpring(0);
    scale.value = withSpring(1);
  };

  const deletePhoto = async (photo: Photo) => {
    try {
      await MediaLibrary.deleteAssetsAsync([photo.id]);
    } catch (error) {
      console.error('Error deleting photo:', error);
      Alert.alert('Error', 'Failed to delete photo');
    }
  };

  const resetCards = () => {
    setCurrentPhotoIndex(0);
    setKeptCount(0);
    setDeletedCount(0);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotate.value = withSpring(0);
    scale.value = withSpring(1);
    loadPhotos();
  };

  const gestureHandler = useAnimatedGestureHandler({
    onStart: () => {
      console.log('Gesture started');
      scale.value = withSpring(0.95);
    },
    onActive: (event: any) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      rotate.value = event.translationX * 0.1;
    },
    onEnd: (event: any) => {
      console.log('Gesture ended with translationX:', event.translationX);
      const shouldSwipe = Math.abs(event.translationX) > screenWidth * 0.2; // Reduced threshold
      
      if (shouldSwipe) {
        const direction = event.translationX > 0 ? 'right' : 'left';
        console.log('Swiping:', direction);
        
        translateX.value = withTiming(
          direction === 'right' ? screenWidth * 1.5 : -screenWidth * 1.5,
          { duration: 300 }
        );
        translateY.value = withTiming(event.translationY + (Math.random() - 0.5) * 200, { duration: 300 });
        rotate.value = withTiming(direction === 'right' ? 30 : -30, { duration: 300 });
        
        runOnJS(handleSwipeComplete)(direction);
      } else {
        console.log('Returning to center');
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        rotate.value = withSpring(0);
        scale.value = withSpring(1);
      }
    },
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
          colors={['#FF6B9D', '#C44569', '#F8B500']}
          style={styles.container}
        >
          <SafeAreaView style={styles.safeArea}>
            <Text style={styles.loadingText}>Loading your photos...</Text>
          </SafeAreaView>
        </LinearGradient>
      </GestureHandlerRootView>
    );
  }

  if (!hasPermission) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <LinearGradient
          colors={['#FF6B9D', '#C44569', '#F8B500']}
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
          colors={['#FF6B9D', '#C44569', '#F8B500']}
          style={styles.container}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.completedContainer}>
              <Text style={styles.completedTitle}>All Done! 🎉</Text>
              <Text style={styles.completedText}>
                You've reviewed all your photos!
              </Text>
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{keptCount}</Text>
                  <Text style={styles.statLabel}>Kept</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{deletedCount}</Text>
                  <Text style={styles.statLabel}>Deleted</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.resetButton} onPress={resetCards}>
                <Text style={styles.resetButtonText}>Review More Photos</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </GestureHandlerRootView>
    );
  }

  const currentPhoto = photos[currentPhotoIndex];

  return (
    <GestureHandlerRootView style={styles.container}>
      <LinearGradient
        colors={['#FF6B9D', '#C44569', '#F8B500']}
        style={styles.container}
      >
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>SwipeClean</Text>
          <View style={styles.stats}>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeText}>Kept: {keptCount}</Text>
            </View>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeText}>Deleted: {deletedCount}</Text>
            </View>
          </View>
        </View>

        {/* Card Stack */}
        <View style={styles.cardStack}>
          {photos.slice(currentPhotoIndex, currentPhotoIndex + 2).map((photo, index) => {
            if (index === 0) {
              return (
                <PanGestureHandler key={photo.id} onGestureEvent={gestureHandler}>
                  <Animated.View style={[styles.cardContainer, animatedStyle]}>
                    <View style={styles.card}>
                      <Image source={{ uri: photo.uri }} style={styles.photo} />
                      
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
                </PanGestureHandler>
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
            Swipe right to keep • Swipe left to delete
          </Text>
        </View>
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
    textAlign: 'center',
    marginBottom: 15,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
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
    backgroundColor: 'rgba(76, 217, 100, 0.9)',
  },
  deleteOverlay: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
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
    color: 'white',
    fontSize: 16,
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
    color: '#FF6B9D',
  },
  completedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  completedTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
  },
  completedText: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    marginBottom: 40,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginBottom: 40,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 48,
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
    color: '#FF6B9D',
  },
});
