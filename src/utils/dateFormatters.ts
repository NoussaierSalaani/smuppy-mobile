/**
 * Date formatting utilities
 * Centralized date formatting functions for consistency across the app.
 * All functions accept Date | string for flexibility.
 */

const toDate = (input: Date | string): Date =>
  input instanceof Date ? input : new Date(input);

// ============================================
// DATE FORMATS
// ============================================

/**
 * "Monday, 15 January" — long date without year
 */
export const formatDateLong = (input: Date | string): string =>
  toDate(input).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/**
 * "15 Jan 2024" — short date with year
 */
export const formatDateShort = (input: Date | string): string =>
  toDate(input).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * "15/01/24" — compact date
 */
export const formatDateCompact = (input: Date | string): string =>
  toDate(input).toLocaleDateString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

/**
 * "15/01/2024" — DD/MM/YYYY format (manual for consistency)
 */
export const formatDDMMYYYY = (input: Date | string): string => {
  const d = toDate(input);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

/**
 * Robust DD/MM/YYYY formatter — handles Date, ISO string, YYYY-MM-DD, or passthrough DD/MM/YYYY
 */
export const formatDateForDisplay = (input: string | Date | null | undefined): string => {
  if (!input) return '';
  if (input instanceof Date) return formatDDMMYYYY(input);
  const str = String(input);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-');
    return `${day}/${month}/${year}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const [year, month, day] = str.split('T')[0].split('-');
    return `${day}/${month}/${year}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  return '';
};

/**
 * "Monday, September 15, 2024" — full date with year (en-US)
 */
export const formatFullDate = (input: Date | string): string =>
  toDate(input).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

/**
 * "Wed, Sep 15, 2024" — short weekday + short month + year
 */
export const formatFullDateShort = (input: Date | string): string =>
  toDate(input).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

// ============================================
// DATE + TIME FORMATS
// ============================================

/**
 * "Wed, Sep 15, 3:30 PM" — short date with time
 */
export const formatShortDateTime = (input: Date | string): string =>
  toDate(input).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * "Monday, 15 September, 3:30 PM" — long date with time
 */
export const formatLongDateTime = (input: Date | string): string =>
  toDate(input).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * "Today, 3:30 PM" / "Tomorrow, 3:30 PM" / fallback to formatShortDateTime
 */
export const formatDateTimeRelative = (input: Date | string): string => {
  const date = toDate(input);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) return `Today, ${timeStr}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${timeStr}`;
  return formatShortDateTime(date);
};

// ============================================
// TIME-ONLY FORMATS
// ============================================

/**
 * "14:30" — 24-hour time
 */
export const formatTime = (input: Date | string): string =>
  toDate(input).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// ============================================
// RELATIVE TIME
// ============================================

/**
 * "Just now", "5 min ago", "3h ago", "2d ago" — English relative time
 */
export const formatRelativeTime = (input: Date | string): string => {
  const diffMs = Date.now() - toDate(input).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateShort(input);
};

/**
 * "now", "3m", "3h", "3d" — compact relative time (for messages list)
 */
export const formatRelativeTimeShort = (input: Date | string): string => {
  const diffMs = Date.now() - toDate(input).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return toDate(input).toLocaleDateString();
};

/**
 * "Just now", "3m ago", "3h ago", "3d ago" — compact with "ago" suffix
 */
export const formatTimeAgo = (input: Date | string): string => {
  const diffMs = Date.now() - toDate(input).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return toDate(input).toLocaleDateString();
};

// ============================================
// FRENCH LOCALE
// ============================================

/**
 * "lundi 15 septembre 2024" — French long date
 */
export const formatLongDateFrench = (input: Date | string): string =>
  toDate(input).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/**
 * "À l'instant", "Il y a 3h", "Hier", "Il y a 3 jours" — French relative time (past only)
 */
export const formatRelativeTimeFrench = (input: Date | string): string => {
  const diffMs = Date.now() - toDate(input).getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 1) return "À l'instant";
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  return toDate(input).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

/**
 * "Aujourd'hui", "Demain", "Hier", "Il y a X jours", "Dans X jours" — French relative date (past + future)
 */
export const formatDateRelativeFrench = (input: Date | string): string => {
  const date = toDate(input);
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Demain';
  if (diffDays === -1) return 'Hier';
  if (diffDays < 0) return `Il y a ${Math.abs(diffDays)} jours`;
  if (diffDays < 7) return `Dans ${diffDays} jours`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

// ============================================
// DATE HELPERS
// ============================================

/**
 * Get day name from date
 */
export const getDayName = (input: Date | string): string =>
  toDate(input).toLocaleDateString(undefined, { weekday: 'long' });

/**
 * Check if date is today
 */
export const isToday = (input: Date | string): boolean => {
  const date = toDate(input);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

/**
 * Check if date is in the past
 */
export const isPast = (input: Date | string): boolean =>
  toDate(input) < new Date();

/**
 * Get days remaining until date
 */
export const getDaysRemaining = (input: Date | string): number => {
  const diffMs = toDate(input).getTime() - Date.now();
  return Math.ceil(diffMs / 86400000);
};
