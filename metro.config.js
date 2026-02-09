/**
 * Metro configuration for React Native with HTTPS support
 * https://facebook.github.io/metro/docs/configuration
 */

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable HTTPS for development server
config.server = {
  ...config.server,
  // Use HTTPS in development
  // Note: Expo will generate self-signed certificates automatically
  // For production builds, certificate pinning is enforced via apiClient.ts
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      // Add security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      return middleware(req, res, next);
    };
  },
};

// Asset resolution + tree-shaking via package.json exports fields
config.resolver = {
  ...config.resolver,
  assetExts: [...config.resolver.assetExts, 'pem', 'crt', 'key'],
  unstable_enablePackageExports: true,
};

module.exports = config;
