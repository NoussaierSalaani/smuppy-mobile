/**
 * i18n Configuration - Smuppy Multi-Language
 * Languages: EN (source), FR, ES, PT-BR, AR (RTL)
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import all locales
import en from './locales/en';
import fr from './locales/fr';
import es from './locales/es';
import ptBR from './locales/pt-BR';
import ar from './locales/ar';

export const LANGUAGES = {
  en: { name: 'English', flag: '🇺🇸', isRTL: false },
  fr: { name: 'Français', flag: '🇫🇷', isRTL: false },
  es: { name: 'Español', flag: '🇪🇸', isRTL: false },
  'pt-BR': { name: 'Português (BR)', flag: '🇧🇷', isRTL: false },
  ar: { name: 'العربية', flag: '🇸🇦', isRTL: true },
};

export type LanguageCode = keyof typeof LANGUAGES;

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  'pt-BR': { translation: ptBR },
  ar: { translation: ar },
};

// AsyncStorage key
const LANGUAGE_KEY = '@smuppy:language';

/**
 * Initialize i18n
 */
export const initI18n = async () => {
  // Get saved language or use device locale
  let savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
  
  if (!savedLanguage) {
    // Detect from device
    const locales = Localization.getLocales();
    const deviceLocale = locales[0]?.languageCode || 'en';
    savedLanguage = Object.keys(LANGUAGES).includes(deviceLocale) 
      ? deviceLocale 
      : 'en';
  }

  // Handle RTL
  const isRTL = LANGUAGES[savedLanguage as LanguageCode]?.isRTL || false;
  if (isRTL !== I18nManager.isRTL) {
    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'en',
    
    // CRITICAL: disable separators so colons in keys are treated as literals
    nsSeparator: false,
    keySeparator: false,
    
    interpolation: {
      escapeValue: false,
    },
    
    react: {
      useSuspense: false,
    },
    
    // Pluralization
    pluralSeparator: '_',
    
    // Debug in dev
    debug: __DEV__,
  });

  return i18n;
};

/**
 * Change language with persistence
 */
export const changeLanguage = async (lang: LanguageCode) => {
  const isRTL = LANGUAGES[lang].isRTL;
  
  // Save preference
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  
  // Change language
  await i18n.changeLanguage(lang);
  
  // Handle RTL switch (requires app reload)
  if (isRTL !== I18nManager.isRTL) {
    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);
    // Note: App reload needed for full RTL switch
    return true; // Indicates reload needed
  }
  
  return false;
};

/**
 * Get current language info
 */
export const getCurrentLanguage = () => {
  const lang = i18n.language as LanguageCode;
  return LANGUAGES[lang] || LANGUAGES.en;
};

/**
 * Check if RTL
 */
export const isRTL = () => {
  return LANGUAGES[i18n.language as LanguageCode]?.isRTL || false;
};

export default i18n;
