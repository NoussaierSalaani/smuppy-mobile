#!/usr/bin/env node
/**
 * Check translation completeness
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const LOCALES = ['en', 'fr', 'es', 'pt-BR', 'ar'];

function checkTranslations() {
  console.log('📊 Translation Status Report\n');
  console.log('=' .repeat(50));
  
  const enDir = path.join(LOCALES_DIR, 'en');
  const files = fs.readdirSync(enDir).filter(f => f.endsWith('.json'));
  
  let totalMissing = 0;
  
  files.forEach(file => {
    console.log(`\n📁 ${file}:`);
    
    const enPath = path.join(LOCALES_DIR, 'en', file);
    const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const enKeys = getAllKeys(enContent);
    
    console.log(`   Source (EN): ${enKeys.length} keys`);
    
    LOCALES.slice(1).forEach(locale => {
      const localePath = path.join(LOCALES_DIR, locale, file);
      
      if (!fs.existsSync(localePath)) {
        console.log(`   ❌ ${locale}: file missing`);
        totalMissing += enKeys.length;
        return;
      }
      
      const content = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      const keys = getAllKeys(content);
      const missing = enKeys.filter(k => !keys.includes(k));
      
      const percent = Math.round((keys.length / enKeys.length) * 100);
      const icon = percent === 100 ? '✅' : percent >= 80 ? '⚠️' : '❌';
      
      console.log(`   ${icon} ${locale}: ${keys.length}/${enKeys.length} (${percent}%)`);
      
      if (missing.length > 0 && missing.length <= 5) {
        missing.forEach(k => console.log(`      - ${k}`));
      } else if (missing.length > 5) {
        console.log(`      - ... and ${missing.length} more`);
      }
      
      totalMissing += missing.length;
    });
  });
  
  console.log('\n' + '='.repeat(50));
  if (totalMissing === 0) {
    console.log('🎉 All translations are complete!');
  } else {
    console.log(`⚠️  ${totalMissing} missing translations total`);
  }
}

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}:${key}` : key;
    if (typeof value === 'object' && value !== null) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

checkTranslations();
