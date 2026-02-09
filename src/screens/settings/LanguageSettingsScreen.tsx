import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { changeLanguage, LANGUAGES, type LanguageCode } from '../../i18n/config';

interface LanguageSettingsScreenProps {
  navigation: {
    goBack: () => void;
  };
}

const LanguageSettingsScreen = ({ navigation }: LanguageSettingsScreenProps) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [changing, setChanging] = useState(false);

  const currentLanguage = i18n.language as LanguageCode;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleLanguageChange = useCallback(async (lang: LanguageCode) => {
    if (lang === currentLanguage) {
      navigation.goBack();
      return;
    }

    setChanging(true);
    try {
      const needsReload = await changeLanguage(lang);
      
      if (needsReload) {
        Alert.alert(
          t('settings:language:reloadRequired'),
          t('settings:language:reloadMessage'),
          [
            {
              text: t('settings:language:reloadNow'),
              onPress: () => {
                // In a real app, you might want to reload the app here
                // For now, we'll just go back
                navigation.goBack();
              },
            },
            {
              text: t('settings:language:later'),
              style: 'cancel',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        navigation.goBack();
      }
    } catch (error) {
      if (__DEV__) console.warn('Language change error:', error);
    } finally {
      setChanging(false);
    }
  }, [currentLanguage, navigation, t]);

  const languageEntries = Object.entries(LANGUAGES) as [LanguageCode, { name: string; flag: string; isRTL: boolean }][];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings:language:title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>{t('settings:language:selectLanguage')}</Text>
        
        <View style={styles.languageList}>
          {languageEntries.map(([code, lang], index) => (
            <TouchableOpacity
              key={code}
              style={[
                styles.languageItem,
                index === 0 && styles.languageItemFirst,
                index === languageEntries.length - 1 && styles.languageItemLast,
                currentLanguage === code && styles.languageItemActive,
              ]}
              onPress={() => handleLanguageChange(code)}
              disabled={changing}
              activeOpacity={0.7}
            >
              <Text style={styles.languageFlag}>{lang.flag}</Text>
              <View style={styles.languageInfo}>
                <Text style={[
                  styles.languageName,
                  currentLanguage === code && styles.languageNameActive,
                ]}>
                  {lang.name}
                </Text>
                {lang.isRTL && (
                  <Text style={styles.languageRTL}>RTL</Text>
                )}
              </View>
              {currentLanguage === code && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.note}>
          {t('settings:language:current')}: {LANGUAGES[currentLanguage]?.name || 'English'}
        </Text>
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.dark,
  },
  headerRight: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  languageList: {
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  languageItemFirst: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  languageItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  languageItemActive: {
    backgroundColor: colors.primaryLight + '20',
  },
  languageFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  languageInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageName: {
    fontSize: 16,
    color: colors.dark,
  },
  languageNameActive: {
    fontWeight: '600',
    color: colors.primary,
  },
  languageRTL: {
    fontSize: 11,
    color: colors.gray,
    marginLeft: 8,
    backgroundColor: colors.grayBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  note: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 16,
    marginHorizontal: 16,
    textAlign: 'center',
  },
});

export default LanguageSettingsScreen;
