import fs from 'fs';
import path from 'path';
import { getAppSubDir } from './local-paths';

export interface AppConfig {
  geminiApiKey?: string;
  isConfigured: boolean;
  onboardingStep?: number;
}

export function getAppConfig(): AppConfig {
  const configDir = getAppSubDir('config');
  const configPath = path.join(configDir, 'settings.json');
  
  if (!fs.existsSync(configPath)) {
    return { isConfigured: false, onboardingStep: 0 };
  }
  
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      geminiApiKey: parsed.geminiApiKey,
      isConfigured: !!parsed.isConfigured,
      onboardingStep: parsed.onboardingStep || 0,
    };
  } catch (e) {
    return { isConfigured: false, onboardingStep: 0 };
  }
}

export function saveAppConfig(updates: Partial<AppConfig>) {
  const configDir = getAppSubDir('config');
  const configPath = path.join(configDir, 'settings.json');
  
  const current = getAppConfig();
  const next = { ...current, ...updates };
  
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  return next;
}

