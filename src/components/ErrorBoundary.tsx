import React, { Component } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../config/theme';
import { captureException, addBreadcrumb } from '../lib/sentry';

/**
 * Error Boundary component to catch and handle React errors gracefully.
 * Prevents the entire app from crashing when a component throws an error.
 * Now integrated with Sentry for error tracking.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Store error info for display
    this.setState({ errorInfo });

    // Log to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

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
    // For now, just log - you can integrate with a feedback system
    console.log('User requested feedback');
  };

  render() {
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
            <Ionicons name="warning-outline" size={48} color={COLORS.error || '#EF4444'} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.white || '#FFFFFF',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 20,
    color: COLORS.dark || '#0A252F',
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray || '#8E8E93',
    marginTop: SPACING.sm,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.lg,
  },
  errorDetails: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    maxWidth: '100%',
  },
  errorText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#991B1B',
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
    backgroundColor: COLORS.primary || '#00CDB5',
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
    color: COLORS.gray || '#8E8E93',
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
    color: COLORS.gray || '#8E8E93',
  },
  minimalRetry: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: COLORS.primary || '#00CDB5',
    marginTop: SPACING.sm,
  },
});

export default ErrorBoundary;
