/**
 * Sentry Stubs — No-op replacements
 * Sentry has been removed to reduce bundle size.
 * These stubs keep the same API so importing files don't need changes.
 */

export const initSentry = () => {};

export const setUserContext = (_user: unknown) => {};

export const addBreadcrumb = (_message: string, _category?: string, _data?: Record<string, unknown>) => {};

export const captureException = (error: Error, _context?: Record<string, unknown>) => {
  if (__DEV__) console.warn('[Error]', error?.message || error);
};

export const captureMessage = (_message: string, _level?: string, _context?: Record<string, unknown>) => {};

export const startTransaction = (_name: string, _op?: string) => null;

export const withErrorBoundary = (component: unknown) => component;

export const createNavigationContainerRef = () => null;

export const sentryNavigationIntegration = null;

export default null;
