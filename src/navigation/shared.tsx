import React, { ComponentType } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import { ScreenSkeleton } from '../components/skeleton';

// Visible fallback — shows shimmer skeleton matching typical screen layout
const LazyFallback = () => <ScreenSkeleton />;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React.lazy requires ComponentType<any> for dynamic imports
export function lazyScreen(importFn: () => Promise<{ default: ComponentType<any> }>) {
  const Lazy = React.lazy(importFn);
  return (props: Record<string, unknown>) => (
    <ErrorBoundary name="LazyScreen" minimal>
      <React.Suspense fallback={<LazyFallback />}>
        <Lazy {...props} />
      </React.Suspense>
    </ErrorBoundary>
  );
}

// Type helper to cast screen components for React Navigation compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React Navigation requires ComponentType<any> for screen components with diverse prop shapes
export const asScreen = <T,>(component: T): ComponentType<any> => component as ComponentType<any>;

export const screenWithBackSwipe = { gestureEnabled: true, gestureDirection: 'horizontal' as const };
