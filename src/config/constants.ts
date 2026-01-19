// Shared constants for the app

// Social networks for profile links
export const SOCIAL_NETWORKS = [
  { id: 'instagram', icon: 'logo-instagram', label: 'Instagram', color: '#E4405F' },
  { id: 'tiktok', icon: 'logo-tiktok', label: 'TikTok', color: '#000000' },
  { id: 'youtube', icon: 'logo-youtube', label: 'YouTube', color: '#FF0000' },
  { id: 'twitter', icon: 'logo-twitter', label: 'X / Twitter', color: '#1DA1F2' },
  { id: 'facebook', icon: 'logo-facebook', label: 'Facebook', color: '#1877F2' },
  { id: 'snapchat', icon: 'logo-snapchat', label: 'Snapchat', color: '#FFFC00' },
  { id: 'linkedin', icon: 'logo-linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { id: 'pinterest', icon: 'logo-pinterest', label: 'Pinterest', color: '#E60023' },
] as const;

export type SocialNetworkId = typeof SOCIAL_NETWORKS[number]['id'];

// Common country codes for phone prefix
export const COUNTRY_CODES = [
  { code: '+1', country: 'US/CA', flag: '🇺🇸' },
  { code: '+33', country: 'FR', flag: '🇫🇷' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+49', country: 'DE', flag: '🇩🇪' },
  { code: '+34', country: 'ES', flag: '🇪🇸' },
  { code: '+39', country: 'IT', flag: '🇮🇹' },
  { code: '+32', country: 'BE', flag: '🇧🇪' },
  { code: '+41', country: 'CH', flag: '🇨🇭' },
  { code: '+212', country: 'MA', flag: '🇲🇦' },
  { code: '+216', country: 'TN', flag: '🇹🇳' },
  { code: '+213', country: 'DZ', flag: '🇩🇿' },
] as const;

export type CountryCode = typeof COUNTRY_CODES[number];
