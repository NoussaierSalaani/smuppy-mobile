/**
 * AWS Endpoints Test
 * Verify that all AWS endpoints are accessible before migration
 */

import { AWS_CONFIG } from '../../config/aws-config';

const API_BASE = AWS_CONFIG.api.restEndpoint;
const GRAPHQL_ENDPOINT = AWS_CONFIG.api.graphqlEndpoint;

interface TestResult {
  endpoint: string;
  success: boolean;
  status?: number;
  error?: string;
  latency: number;
}

async function testEndpoint(
  name: string,
  url: string,
  options: RequestInit = {}
): Promise<TestResult> {
  const start = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const latency = Date.now() - start;

    return {
      endpoint: name,
      success: response.ok || response.status === 401, // 401 is expected without auth
      status: response.status,
      latency,
    };
  } catch (error: unknown) {
    return {
      endpoint: name,
      success: false,
      error: (error as Error).message,
      latency: Date.now() - start,
    };
  }
}

async function testGraphQL(): Promise<TestResult> {
  const start = Date.now();

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query IntrospectionQuery {
            __schema {
              types {
                name
              }
            }
          }
        `,
      }),
    });

    const latency = Date.now() - start;
    const data = await response.json();

    return {
      endpoint: 'GraphQL Introspection',
      success: response.ok || !!data.__schema,
      status: response.status,
      latency,
    };
  } catch (error: unknown) {
    return {
      endpoint: 'GraphQL Introspection',
      success: false,
      error: (error as Error).message,
      latency: Date.now() - start,
    };
  }
}

async function testCDN(): Promise<TestResult> {
  const start = Date.now();
  const cdnUrl = AWS_CONFIG.storage.cdnDomain;

  try {
    // Just test that CDN is reachable (will return 403 without valid path)
    const response = await fetch(cdnUrl, { method: 'HEAD' });
    const latency = Date.now() - start;

    return {
      endpoint: 'CloudFront CDN',
      success: response.status === 403 || response.status === 404 || response.ok,
      status: response.status,
      latency,
    };
  } catch (error: unknown) {
    return {
      endpoint: 'CloudFront CDN',
      success: false,
      error: (error as Error).message,
      latency: Date.now() - start,
    };
  }
}

export async function runAWSEndpointTests(): Promise<{
  allPassed: boolean;
  results: TestResult[];
  summary: string;
}> {
  console.log('🔄 Testing AWS Endpoints...\n');
  console.log(`API Base: ${API_BASE}`);
  console.log(`GraphQL: ${GRAPHQL_ENDPOINT}`);
  console.log(`CDN: ${AWS_CONFIG.storage.cdnDomain}\n`);

  const results: TestResult[] = [];

  // Test REST API endpoints (without auth, expecting 401)
  const restEndpoints = [
    { name: 'GET /posts', url: `${API_BASE}/posts`, method: 'GET' },
    { name: 'GET /profiles', url: `${API_BASE}/profiles`, method: 'GET' },
    { name: 'GET /feed', url: `${API_BASE}/feed`, method: 'GET' },
    { name: 'GET /peaks', url: `${API_BASE}/peaks`, method: 'GET' },
    { name: 'GET /notifications', url: `${API_BASE}/notifications`, method: 'GET' },
  ];

  for (const endpoint of restEndpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.url, { method: endpoint.method });
    results.push(result);

    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.endpoint}: ${result.status || result.error} (${result.latency}ms)`);
  }

  // Test GraphQL
  const graphqlResult = await testGraphQL();
  results.push(graphqlResult);
  console.log(`${graphqlResult.success ? '✅' : '❌'} ${graphqlResult.endpoint}: ${graphqlResult.status || graphqlResult.error} (${graphqlResult.latency}ms)`);

  // Test CDN
  const cdnResult = await testCDN();
  results.push(cdnResult);
  console.log(`${cdnResult.success ? '✅' : '❌'} ${cdnResult.endpoint}: ${cdnResult.status || cdnResult.error} (${cdnResult.latency}ms)`);

  const allPassed = results.every(r => r.success);
  const passedCount = results.filter(r => r.success).length;

  const summary = `\n📊 Results: ${passedCount}/${results.length} endpoints passed`;
  console.log(summary);

  if (allPassed) {
    console.log('✅ All AWS endpoints are reachable! Ready for migration.');
  } else {
    console.log('⚠️ Some endpoints failed. Check configuration before migration.');
  }

  return { allPassed, results, summary };
}

// Export for use in app
export default runAWSEndpointTests;
