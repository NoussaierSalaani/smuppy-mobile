import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../config/theme';
import { captureException, addBreadcrumb } from '../lib/sentry';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

interface ErrorBoundaryProps {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
  minimal?: boolean;
  title?: string;
  message?: string;
  showReportButton?: boolean;
  colors?: ThemeColors;
  isDark?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  eventId: string | null;
}

/**
 * Error Boundary component to catch and handle React errors gracefully.
 * Prevents the entire app from crashing when a component throws an error.
 * Now integrated with Sentry for error tracking.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Store error info for display
    this.setState({ errorInfo });

    // Log to console in development
    if (__DEV__) console.warn('ErrorBoundary caught an error:', error, errorInfo);

    // Add breadcrumb for context
    addBreadcrumb('Error caught by ErrorBoundary', 'error', {
      componentStack: errorInfo?.componentStack,
    });

    // Report to Sentry
    captureException(error, {
      componentStack: errorInfo?.componentStack,
      boundary: this.props.name || 'Unknown',
    });
  }

  handleRetry = () => {
    addBreadcrumb('User clicked retry after error', 'user');
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  handleReportFeedback = () => {
    // Could open a feedback modal or link to support
    addBreadcrumb('User wants to report feedback', 'user');
    // TODO: Integrate with feedback system (e.g., open support link)
  };

  render() {
    const { colors: propColors, isDark: _isDark } = this.props;
    const colors = propColors || { background: '#FFFFFF', dark: '#0a252f', gray: '#6b7280', error: '#EF4444', errorLight: '#FEE2E2', primary: '#0EBF8A', white: '#FFFFFF' } as ThemeColors;
    const styles = createStyles(colors, _isDark || false);

    if (this.state.hasError) {
      // Custom fallback UI from props
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Minimal fallback for nested boundaries
      if (this.props.minimal) {
        return (
          <View style={styles.minimalContainer}>
            <Text style={styles.minimalText}>Something went wrong</Text>
            <TouchableOpacity onPress={this.handleRetry}>
              <Text style={styles.minimalRetry}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // Full fallback UI
      return (
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons name="warning-outline" size={48} color={colors?.error || '#EF4444'} />
          </View>

          <Text style={styles.title}>
            {this.props.title || 'Something went wrong'}
          </Text>

          <Text style={styles.message}>
            {this.props.message || 'An unexpected error occurred. Please try again.'}
          </Text>

          {/* Show error details in development */}
          {__DEV__ && this.state.error && (
            <View style={styles.errorDetails}>
              <Text style={styles.errorText}>
                {this.state.error.toString()}
              </Text>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={this.handleRetry}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>

            {this.props.showReportButton && (
              <TouchableOpacity
                style={styles.reportButton}
                onPress={this.handleReportFeedback}
                activeOpacity={0.8}
              >
                <Text style={styles.reportText}>Report Issue</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
      backgroundColor: colors.background,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.errorLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    title: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: 20,
      color: colors.dark,
      textAlign: 'center',
    },
    message: {
      fontFamily: 'Poppins-Regular',
      fontSize: 14,
      color: colors.gray,
      marginTop: SPACING.sm,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: SPACING.lg,
    },
    errorDetails: {
      marginTop: SPACING.lg,
      padding: SPACING.md,
      backgroundColor: colors.errorLight,
      borderRadius: 8,
      maxWidth: '100%',
    },
    errorText: {
      fontFamily: 'Poppins-Regular',
      fontSize: 12,
      color: colors.error,
    },
    buttonContainer: {
      marginTop: SPACING.xl,
      alignItems: 'center',
      gap: SPACING.md,
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 28,
      backgroundColor: colors.primary,
      borderRadius: 28,
      gap: 8,
    },
    retryText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: 15,
      color: '#FFFFFF',
    },
    reportButton: {
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    reportText: {
      fontFamily: 'Poppins-Medium',
      fontSize: 14,
      color: colors.gray,
      textDecorationLine: 'underline',
    },
    // Minimal styles
    minimalContainer: {
      padding: SPACING.lg,
      alignItems: 'center',
    },
    minimalText: {
      fontFamily: 'Poppins-Regular',
      fontSize: 14,
      color: colors.gray,
    },
    minimalRetry: {
      fontFamily: 'Poppins-Medium',
      fontSize: 14,
      color: colors.primary,
      marginTop: SPACING.sm,
    },
  });

// Wrapper to inject theme into class component
function ErrorBoundaryWithTheme(props: Omit<ErrorBoundaryProps, 'colors' | 'isDark'>) {
  const { colors, isDark } = useTheme();
  return <ErrorBoundary {...props} colors={colors} isDark={isDark} />;
}

export default ErrorBoundaryWithTheme;
