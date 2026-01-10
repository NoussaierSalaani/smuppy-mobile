import { useEffect, useState, useCallback } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { View } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';

// Empêche le splash natif de se cacher automatiquement
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          // WorkSans
          'WorkSans-Regular': require('./assets/fonts/WorkSans-Regular.ttf'),
          'WorkSans-Medium': require('./assets/fonts/WorkSans-Medium.ttf'),
          'WorkSans-SemiBold': require('./assets/fonts/WorkSans-SemiBold.ttf'),
          'WorkSans-Bold': require('./assets/fonts/WorkSans-Bold.ttf'),
          'WorkSans-ExtraBold': require('./assets/fonts/WorkSans-ExtraBold.ttf'),
          
          // Poppins
          'Poppins-Regular': require('./assets/fonts/Poppins-Regular.ttf'),
          'Poppins-Medium': require('./assets/fonts/Poppins-Medium.ttf'),
          'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
          'Poppins-Bold': require('./assets/fonts/Poppins-Bold.ttf'),
          'Poppins-ExtraBold': require('./assets/fonts/Poppins-ExtraBold.ttf'),
        });
        setFontsLoaded(true);
      } catch (error) {
        console.log('Error loading fonts:', error);
        setFontsLoaded(true); // Continue même si erreur
      }
    }

    loadFonts();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null; // Attend que les fonts soient chargées
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <AppNavigator />
    </View>
  );
}