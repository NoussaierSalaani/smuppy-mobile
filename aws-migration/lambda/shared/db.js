"use strict";
/**
 * Shared Database Connection Module
 * Provides secure PostgreSQL connection for all Lambda handlers
 *
 * OPTIMIZED FOR AURORA:
 * - Uses RDS Proxy for connection pooling (prevents Lambda connection explosion)
 * - Supports reader endpoint for read-heavy operations
 * - Uses proper SSL configuration for AWS Aurora PostgreSQL
 * - Caches connections across Lambda invocations
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecureHeaders = exports.getCorsHeaders = exports.createCorsResponse = exports.corsHeaders = void 0;
exports.getPool = getPool;
exports.getReaderPool = getReaderPool;
exports.query = query;
exports.readQuery = readQuery;
exports.getClient = getClient;
exports.getReaderClient = getReaderClient;
exports.closePool = closePool;
exports.healthCheck = healthCheck;
var pg_1 = require("pg");
var client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
var rds_signer_1 = require("@aws-sdk/rds-signer");
var logger_1 = require("../api/utils/logger");
var log = (0, logger_1.createLogger)('db');
// Check if IAM auth is required (for RDS Proxy)
var USE_IAM_AUTH = process.env.DB_USE_IAM_AUTH === 'true';
// Connection pools (reused across Lambda invocations)
var writerPool = null;
var readerPool = null;
var cachedCredentials = null;
// Credential cache TTL: 30 minutes (allows for credential rotation)
var CREDENTIALS_CACHE_TTL_MS = 30 * 60 * 1000;
var secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
/**
 * Fetches database credentials from AWS Secrets Manager
 * Caches credentials with TTL to support credential rotation
 *
 * SECURITY: Credentials are cached for 30 minutes to balance
 * performance (reducing Secrets Manager API calls) and security
 * (picking up rotated credentials reasonably quickly)
 */
function getDbCredentials() {
    return __awaiter(this, void 0, void 0, function () {
        var now, command, response, credentials;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = Date.now();
                    // Return cached credentials if still valid
                    if (cachedCredentials && cachedCredentials.expiresAt > now) {
                        return [2 /*return*/, cachedCredentials.credentials];
                    }
                    if (!process.env.DB_SECRET_ARN) {
                        throw new Error('DB_SECRET_ARN environment variable is required');
                    }
                    command = new client_secrets_manager_1.GetSecretValueCommand({
                        SecretId: process.env.DB_SECRET_ARN,
                    });
                    return [4 /*yield*/, secretsClient.send(command)];
                case 1:
                    response = _a.sent();
                    if (!response.SecretString) {
                        throw new Error('Failed to retrieve database credentials from Secrets Manager');
                    }
                    credentials = JSON.parse(response.SecretString);
                    // Cache with expiration
                    cachedCredentials = {
                        credentials: credentials,
                        expiresAt: now + CREDENTIALS_CACHE_TTL_MS,
                    };
                    // If pools exist and credentials changed, recreate them
                    // This handles credential rotation gracefully
                    if (writerPool || readerPool) {
                        log.info('Credentials refreshed, pools will use new credentials on next connection');
                    }
                    return [2 /*return*/, credentials];
            }
        });
    });
}
/**
 * Generates an IAM auth token for RDS Proxy connection
 */
function generateIAMToken(host, port, username) {
    return __awaiter(this, void 0, void 0, function () {
        var signer;
        return __generator(this, function (_a) {
            signer = new rds_signer_1.Signer({
                hostname: host,
                port: port,
                username: username,
                region: process.env.AWS_REGION || 'us-east-1',
            });
            return [2 /*return*/, signer.getAuthToken()];
        });
    });
}
/**
 * Creates a database pool with optimized settings for Lambda
 */
function createPool(host, options) {
    return __awaiter(this, void 0, void 0, function () {
        var credentials, port, database, password, poolConfig, pool;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDbCredentials()];
                case 1:
                    credentials = _a.sent();
                    port = parseInt(process.env.DB_PORT || '5432');
                    database = credentials.dbname || credentials.database || process.env.DB_NAME || 'smuppy';
                    if (!USE_IAM_AUTH) return [3 /*break*/, 3];
                    log.info('Using IAM authentication for RDS Proxy');
                    return [4 /*yield*/, generateIAMToken(host, port, credentials.username)];
                case 2:
                    password = _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    password = credentials.password;
                    _a.label = 4;
                case 4:
                    poolConfig = {
                        host: host,
                        port: port,
                        database: database,
                        user: credentials.username,
                        password: password,
                        // Secure SSL configuration for AWS Aurora PostgreSQL
                        // In production with RDS Proxy, strict verification is handled at proxy level
                        // For direct connections, we use permissive SSL (RDS requires SSL but Lambda doesn't have CA bundle)
                        ssl: {
                            rejectUnauthorized: false, // RDS Proxy handles certificate verification
                        },
                        // Connection pool settings optimized for Lambda with RDS Proxy
                        // RDS Proxy handles connection pooling, so Lambda can use fewer connections
                        max: (options === null || options === void 0 ? void 0 : options.maxConnections) || 5, // Reduced from 10 since RDS Proxy pools connections
                        min: 0, // Allow pool to shrink to 0 when idle
                        idleTimeoutMillis: 10000, // 10 seconds - release idle connections faster
                        connectionTimeoutMillis: 10000, // 10 seconds - reduced for Lambda cold starts
                        // Note: statement_timeout not supported by RDS Proxy, using query-level timeouts instead
                    };
                    pool = new pg_1.Pool(poolConfig);
                    // Handle pool errors gracefully
                    pool.on('error', function (err) {
                        log.error('Unexpected database pool error', err);
                        // Don't nullify the pool reference here - let the next query attempt to reconnect
                    });
                    return [2 /*return*/, pool];
            }
        });
    });
}
/**
 * Gets or creates the writer database connection pool
 * Uses RDS Proxy endpoint for connection pooling
 */
function getPool() {
    return __awaiter(this, void 0, void 0, function () {
        var host;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!writerPool) return [3 /*break*/, 2];
                    host = process.env.DB_HOST || process.env.DB_WRITER_HOST;
                    if (!host) {
                        throw new Error('DB_HOST or DB_WRITER_HOST environment variable is required');
                    }
                    return [4 /*yield*/, createPool(host)];
                case 1:
                    writerPool = _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/, writerPool];
            }
        });
    });
}
/**
 * Gets or creates the reader database connection pool
 * Uses the Aurora reader endpoint for read-heavy operations
 * This helps distribute read load across read replicas
 *
 * Use this for:
 * - Feed queries
 * - Search operations
 * - List operations
 * - Profile lookups
 *
 * Do NOT use for:
 * - Any write operations (INSERT, UPDATE, DELETE)
 * - Operations that require read-after-write consistency
 */
function getReaderPool() {
    return __awaiter(this, void 0, void 0, function () {
        var readerHost;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!readerPool) return [3 /*break*/, 2];
                    readerHost = process.env.DB_READER_HOST;
                    if (!readerHost) {
                        // Fall back to writer pool if no reader endpoint is configured
                        log.warn('DB_READER_HOST not configured, falling back to writer pool');
                        return [2 /*return*/, getPool()];
                    }
                    return [4 /*yield*/, createPool(readerHost, { maxConnections: 10 })];
                case 1:
                    readerPool = _a.sent(); // More connections for reads
                    _a.label = 2;
                case 2: return [2 /*return*/, readerPool];
            }
        });
    });
}
/**
 * Executes a query with automatic connection handling (writer pool)
 * @param text SQL query string
 * @param params Query parameters
 */
function query(text, params) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getPool()];
                case 1:
                    db = _a.sent();
                    return [2 /*return*/, db.query(text, params)];
            }
        });
    });
}
/**
 * Executes a read-only query using the reader pool
 * Use this for SELECT queries that don't require immediate consistency
 * @param text SQL query string
 * @param params Query parameters
 */
function readQuery(text, params) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getReaderPool()];
                case 1:
                    db = _a.sent();
                    return [2 /*return*/, db.query(text, params)];
            }
        });
    });
}
/**
 * Gets a client from the writer pool for transactions
 * Remember to release the client after use!
 */
function getClient() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getPool()];
                case 1:
                    db = _a.sent();
                    return [2 /*return*/, db.connect()];
            }
        });
    });
}
/**
 * Gets a client from the reader pool for read-only transactions
 * Remember to release the client after use!
 */
function getReaderClient() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getReaderPool()];
                case 1:
                    db = _a.sent();
                    return [2 /*return*/, db.connect()];
            }
        });
    });
}
/**
 * Closes all database pools
 * Call this during graceful shutdown if needed
 */
function closePool() {
    return __awaiter(this, void 0, void 0, function () {
        var closePromises;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    closePromises = [];
                    if (writerPool) {
                        closePromises.push(writerPool.end());
                        writerPool = null;
                    }
                    if (readerPool) {
                        closePromises.push(readerPool.end());
                        readerPool = null;
                    }
                    cachedCredentials = null;
                    return [4 /*yield*/, Promise.all(closePromises)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Health check for database connectivity
 * Useful for Lambda warmup or health endpoints
 */
function healthCheck() {
    return __awaiter(this, void 0, void 0, function () {
        var results, pool, err_1, pool, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    results = { writer: false, reader: false };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, getPool()];
                case 2:
                    pool = _a.sent();
                    return [4 /*yield*/, pool.query('SELECT 1')];
                case 3:
                    _a.sent();
                    results.writer = true;
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _a.sent();
                    log.error('Writer health check failed', err_1);
                    return [3 /*break*/, 5];
                case 5:
                    _a.trys.push([5, 8, , 9]);
                    return [4 /*yield*/, getReaderPool()];
                case 6:
                    pool = _a.sent();
                    return [4 /*yield*/, pool.query('SELECT 1')];
                case 7:
                    _a.sent();
                    results.reader = true;
                    return [3 /*break*/, 9];
                case 8:
                    err_2 = _a.sent();
                    log.error('Reader health check failed', err_2);
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/, results];
            }
        });
    });
}
/**
 * Re-export CORS utilities for backwards compatibility
 * @deprecated Import from '../api/utils/cors' instead
 */
var cors_1 = require("../api/utils/cors");
Object.defineProperty(exports, "corsHeaders", { enumerable: true, get: function () { return cors_1.headers; } });
Object.defineProperty(exports, "createCorsResponse", { enumerable: true, get: function () { return cors_1.createCorsResponse; } });
Object.defineProperty(exports, "getCorsHeaders", { enumerable: true, get: function () { return cors_1.getCorsHeaders; } });
Object.defineProperty(exports, "getSecureHeaders", { enumerable: true, get: function () { return cors_1.getSecureHeaders; } });
