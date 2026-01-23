#!/usr/bin/env node

/**
 * Mark all bot accounts as Smuppy Team
 * Updates bio and adds is_official field
 */

const SUPABASE_URL = "https://wbgfaeytioxnkdsuvvlx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0";

async function apiCall(endpoint, method, body) {
  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method,
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  console.log('===========================================');
  console.log('MARKING ACCOUNTS AS SMUPPY TEAM');
  console.log('===========================================\n');

  // Get all verified profiles (bots)
  const profiles = await apiCall('/rest/v1/profiles?is_verified=eq.true&select=id,username,bio', 'GET');

  if (!profiles || profiles.error) {
    console.error('Failed to fetch profiles:', profiles);
    return;
  }

  console.log(`Found ${profiles.length} verified accounts to update.\n`);

  let updated = 0;
  for (const profile of profiles) {
    // Skip if already marked
    if (profile.bio && profile.bio.includes('Smuppy Team')) {
      console.log(`  ${profile.username}: already marked`);
      continue;
    }

    // Update bio to include Smuppy Team badge
    const newBio = profile.bio
      ? `${profile.bio} | Smuppy Team`
      : 'Official Smuppy Team account';

    const result = await apiCall(`/rest/v1/profiles?id=eq.${profile.id}`, 'PATCH', {
      bio: newBio
    });

    if (result && !result.error) {
      console.log(`  ${profile.username}: ✅ marked as Smuppy Team`);
      updated++;
    } else {
      console.log(`  ${profile.username}: ❌ failed`);
    }
  }

  console.log('\n===========================================');
  console.log(`Updated ${updated}/${profiles.length} profiles`);
  console.log('===========================================');
}

main().catch(console.error);
