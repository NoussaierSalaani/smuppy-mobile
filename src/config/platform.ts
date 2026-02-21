import { Platform } from 'react-native';

export const IS_IOS = Platform.OS === 'ios';
export const IS_ANDROID = Platform.OS === 'android';
export const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? ('padding' as const) : ('height' as const);
