/**
 * API Module Barrel Export
 *
 * Enables future consumers to use:
 *   import { awsAPI, Post, Profile } from '../services/api';
 *
 * Existing imports from '../services/aws-api' continue working unchanged.
 */

export * from './types';
export { APIError } from './error';
export { awsAPI, default as default } from '../aws-api';
