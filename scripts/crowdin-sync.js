#!/usr/bin/env node
/**
 * Crowdin Sync Script for Smuppy
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CROWDIN_PROJECT_ID = process.env.CROWDIN_PROJECT_ID;
const CROWDIN_TOKEN = process.env.CROWDIN_TOKEN;

if (!CROWDIN_PROJECT_ID || !CROWDIN_TOKEN) {
  console.error('❌ Missing Crowdin credentials');
  console.error('Set CROWDIN_PROJECT_ID and CROWDIN_TOKEN env variables');
  process.exit(1);
}

const commands = {
  upload: () => {
    console.log('📤 Uploading source files to Crowdin...');
    execSync('npx crowdin upload sources', { stdio: 'inherit' });
    console.log('✅ Upload complete');
  },

  download: () => {
    console.log('📥 Downloading translations from Crowdin...');
    execSync('npx crowdin download', { stdio: 'inherit' });
    console.log('✅ Download complete');
    execSync('npx prettier --write "src/i18n/locales/**/*.json"', { stdio: 'inherit' });
  },

  sync: () => {
    commands.upload();
    commands.download();
  }
};

const command = process.argv[2] || 'sync';
if (commands[command]) {
  commands[command]();
} else {
  console.log('Usage: node crowdin-sync.js [upload|download|sync]');
}
