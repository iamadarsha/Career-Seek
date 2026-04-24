import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 JobHunt India - System Doctor');
console.log('-------------------------------');

async function runDoctor() {
  const issues = [];
  
  // 1. Check Node.js version
  const nodeVersion = process.version;
  console.log(`Checking Node.js... ${nodeVersion}`);
  if (parseInt(nodeVersion.slice(1)) < 18) {
    issues.push('Node.js version 18+ is required.');
  }

  // 2. Check Playwright/Browsers
  console.log('Checking Playwright browsers...');
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    console.log('✅ Chromium is installed and working.');
  } catch (e) {
    console.log('❌ Chromium launch failed.');
    issues.push('Playwright browsers not found. Run: npx playwright install chromium');
    
    // Attempt auto-fix?
    console.log('Attempting to install chromium automatically...');
    try {
      execSync('npx playwright install chromium', { stdio: 'inherit' });
      console.log('✅ Auto-install successful.');
    } catch (err) {
      console.log('❌ Auto-install failed. Please run manually: npx playwright install chromium');
    }
  }

  // 3. Check environment
  console.log('Checking environment...');
  if (!fs.existsSync('.env.local') && !fs.existsSync('.env')) {
    issues.push('Missing .env file. Please create one with GEMINI_API_KEY if not using onboarding.');
  }

  // 4. Check dependencies
  console.log('Checking dependencies...');
  if (!fs.existsSync('node_modules')) {
    issues.push('node_modules not found. Run: npm install');
  }

  console.log('-------------------------------');
  if (issues.length === 0) {
    console.log('✅ System is healthy! Ready to hunt.');
  } else {
    console.log('⚠️  Issues found:');
    issues.forEach(i => console.log(` - ${i}`));
  }
}

runDoctor();
