#!/usr/bin/env node
/**
 * Extract i18n keys from source code
 * Scans all tsx files for t('...') usage and updates EN JSON files
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const SOURCE_DIR = path.join(__dirname, '..', 'src');
const LOCALES_DIR = path.join(SOURCE_DIR, 'i18n', 'locales', 'en');

// Regex to find t('namespace:key') or t("namespace:key")
const tRegex = /t\(['"]([^'"]+)['"]\)/g;

function extractKeys() {
  const keysByNamespace = {};
  
  // Find all tsx files
  const files = glob.sync('**/*.tsx', { cwd: SOURCE_DIR, absolute: true });
  
  console.log(`🔍 Scanning ${files.length} files...\n`);
  
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    
    while ((match = tRegex.exec(content)) !== null) {
      const fullKey = match[1];
      const parts = fullKey.split(':');
      
      if (parts.length >= 2) {
        const namespace = parts[0];
        const key = parts.slice(1).join(':');
        
        if (!keysByNamespace[namespace]) {
          keysByNamespace[namespace] = new Set();
        }
        keysByNamespace[namespace].add(key);
      }
    }
  });
  
  // Update JSON files
  Object.entries(keysByNamespace).forEach(([namespace, keys]) => {
    const filePath = path.join(LOCALES_DIR, `${namespace}.json`);
    
    let existing = {};
    if (fs.existsSync(filePath)) {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    const newKeys = [];
    keys.forEach(key => {
      if (!keyExists(existing, key)) {
        setKey(existing, key, key); // Use key as default value
        newKeys.push(key);
      }
    });
    
    if (newKeys.length > 0) {
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
      console.log(`✅ ${namespace}.json: +${newKeys.length} new keys`);
      newKeys.forEach(k => console.log(`   + ${k}`));
    } else {
      console.log(`✓ ${namespace}.json: up to date`);
    }
  });
}

function keyExists(obj, key) {
  const parts = key.split(':');
  let current = obj;
  for (const part of parts) {
    if (!current || !current[part]) return false;
    current = current[part];
  }
  return true;
}

function setKey(obj, key, value) {
  const parts = key.split(':');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

extractKeys();
console.log('\n🎉 Extraction complete!');
