import fs from 'fs';
import path from 'path';
import {
  commandExists,
  ensureDataDirectories,
  ensureSettingsFile,
  getBaseDir,
  loadDotEnv,
  nodeMajor,
  npxCmd,
  readPackageJson,
  run,
} from './lib/runtime.mjs';
import { getNativeManifest } from './lib/native-binaries.mjs';

console.log('Career Seek system doctor');
console.log('-------------------------');

loadDotEnv();

async function probeOllama(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) return { reachable: false, models: [] };
    const parsed = await response.json();
    const models = Array.isArray(parsed?.models) ? parsed.models.map((model) => String(model?.name || '')).filter(Boolean) : [];
    return { reachable: true, models };
  } catch {
    return { reachable: false, models: [] };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeHttp(baseUrl, pathName) {
  if (!baseUrl) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${pathName}`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function runDoctor() {
  const issues = [];
  const warnings = [];
  const baseDir = getBaseDir();
  const configDir = path.join(baseDir, 'config');
  const toolStatus = {};
  const nativeManifest = getNativeManifest();

  console.log(`Data directory: ${baseDir}`);
  ensureDataDirectories(baseDir);
  const settingsPath = ensureSettingsFile(baseDir);

  const major = nodeMajor();
  console.log(`Checking Node.js... ${process.version}`);
  if (major < 20 || major >= 26) {
    issues.push('Supported Node.js version is >=20 and <26. Recommended: Node 20 or 22 LTS.');
  }

  console.log('Checking dependencies...');
  if (!fs.existsSync(path.resolve(process.cwd(), 'node_modules'))) {
    issues.push('node_modules not found. Run: npm run bootstrap');
  }

  console.log('Checking better-sqlite3 native binding...');
  try {
    await import('better-sqlite3');
    console.log('OK better-sqlite3 native binding loads.');
  } catch (error) {
    issues.push(`better-sqlite3 failed to load (${error.message}). Run: npm rebuild better-sqlite3`);
  }

  console.log('Checking Playwright Chromium...');
  let browserOk = false;
  let chromium = null;
  try {
    ({ chromium } = await import('playwright'));
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    browserOk = true;
    console.log('OK Chromium is installed and working.');
  } catch (firstError) {
    console.log('Chromium launch failed; trying automatic install...');
    try {
      run(npxCmd, ['playwright', 'install', 'chromium']);
      if (!chromium) {
        ({ chromium } = await import('playwright'));
      }
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      browserOk = true;
      console.log('OK Chromium installed and verified.');
    } catch {
      warnings.push(`Playwright Chromium is unavailable. Live browser-backed scraping will run in safe mode. Original error: ${firstError.message}`);
    }
  }

  process.env.JOBHUNT_BROWSER_SAFE_MODE = browserOk ? '0' : '1';

  console.log('Checking native support service binaries...');
  const nativeServices = ['redis', 'meilisearch', 'qdrant'].reduce((acc, service) => {
    const entry = nativeManifest.services?.[service];
    acc[service] = Boolean(entry?.executablePath && fs.existsSync(entry.executablePath));
    console.log(`${acc[service] ? 'OK' : 'Info'} ${service} binary ${acc[service] ? 'available' : 'not installed'}${entry?.executablePath ? ` (${entry.executablePath})` : ''}.`);
    return acc;
  }, {});

  console.log('Checking OCR and PDF helper tools...');
  const ocrInstallCommand = process.platform === 'darwin'
    ? 'brew install poppler tesseract'
    : process.platform === 'win32'
      ? 'Install Poppler for Windows and Tesseract OCR, then add both bin folders to PATH. Poppler: https://github.com/oschwartz10612/poppler-windows/releases, Tesseract: https://github.com/UB-Mannheim/tesseract/wiki'
      : 'sudo apt-get install poppler-utils tesseract-ocr';
  const toolChecks = [
    ['pdftotext', 'Poppler pdftotext enables layout-aware PDF fallback.', false],
    ['pdfinfo', 'Poppler pdfinfo helps inspect PDFs.', false],
    ['pdftoppm', 'Poppler pdftoppm is required for image OCR fallback.', false],
    ['tesseract', 'Tesseract is the lightweight local OCR fallback.', false],
    ['paddleocr', 'PaddleOCR CLI is optional advanced OCR.', true],
  ];

  for (const [command, hint, optional] of toolChecks) {
    const exists = commandExists(command);
    toolStatus[command] = exists;
    if (exists) {
      console.log(`OK ${command} available.`);
    } else {
      console.log(`${optional ? 'Info' : 'Warning'} ${command} unavailable. ${hint}`);
      if (!optional) {
        warnings.push(`${command} unavailable. Scanned/image-based PDFs may require manual paste recovery. Install OCR helpers: ${ocrInstallCommand}`);
      }
    }
  }

  console.log('Checking local settings and capability matrix...');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    settings = {};
    warnings.push('settings.json could not be parsed; onboarding will recreate safe defaults when needed.');
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    settings?.aiProviders?.gemini?.apiKey?.trim() ||
    (typeof settings.geminiApiKey === 'string' && settings.geminiApiKey.trim());
  const openAIKey = process.env.OPENAI_API_KEY?.trim() || settings?.aiProviders?.openai?.apiKey?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || settings?.aiProviders?.anthropic?.apiKey?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim() || settings?.aiProviders?.groq?.apiKey?.trim();
  const deepSeekKey = process.env.DEEPSEEK_API_KEY?.trim() || settings?.aiProviders?.deepseek?.apiKey?.trim();
  const compatibleBaseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL?.trim() || settings?.aiProviders?.['openai-compatible']?.baseUrl?.trim();
  const compatibleKey = process.env.OPENAI_COMPATIBLE_API_KEY?.trim() || settings?.aiProviders?.['openai-compatible']?.apiKey?.trim();
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || settings?.aiProviders?.ollama?.baseUrl?.trim() || 'http://127.0.0.1:11434';
  const ollamaModel = process.env.CAREER_SEEK_OLLAMA_MODEL?.trim() || settings?.aiProviders?.ollama?.model?.trim() || 'llama3.2:3b-instruct-q4_K_M';

  const hasGeminiKey = Boolean(geminiKey);
  const hasCloudKey = Boolean(geminiKey || openAIKey || anthropicKey || groqKey || deepSeekKey || compatibleKey);
  const ollamaProbe = await probeOllama(ollamaBaseUrl);
  const redisReachable = await (async () => {
    try {
      const Redis = (await import('ioredis')).default;
      const client = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
        retryStrategy: () => null,
      });
      client.on('error', () => undefined);
      await client.ping();
      client.disconnect();
      return true;
    } catch {
      return false;
    }
  })();
  const meiliReachable = await probeHttp(process.env.MEILI_HOST || process.env.MEILISEARCH_URL || 'http://127.0.0.1:7700', '/health');
  const qdrantReachable = await probeHttp(process.env.QDRANT_URL || process.env.JOBS_QDRANT_URL, '/healthz');
  const hasOllama = ollamaProbe.reachable;
  const hasAIProvider = hasCloudKey || hasOllama || Boolean(compatibleBaseUrl);
  const selectedProvider =
    settings?.aiProvider ||
    process.env.CAREER_SEEK_AI_PROVIDER ||
    (hasGeminiKey ? 'gemini' : '') ||
    (openAIKey ? 'openai' : '') ||
    (anthropicKey ? 'anthropic' : '') ||
    (groqKey ? 'groq' : '') ||
    (deepSeekKey ? 'deepseek' : '') ||
    (compatibleBaseUrl ? 'openai-compatible' : '') ||
    (hasOllama ? 'ollama' : '');

  const hasOcr = Boolean(
    toolStatus.pdftotext &&
    toolStatus.pdfinfo &&
    toolStatus.pdftoppm &&
    toolStatus.tesseract
  );

  const capabilityWarnings = [];
  if (!browserOk) capabilityWarnings.push('Browser automation unavailable; live portal scraping is disabled.');
  if (!redisReachable) capabilityWarnings.push('Redis is not reachable. Background queues will wait until the native service starts.');
  if (!meiliReachable) capabilityWarnings.push('Meilisearch is not reachable. Search will use local saved-result fallback.');
  if (!hasOcr) capabilityWarnings.push('OCR helpers incomplete; scanned/image PDFs may require manual paste recovery.');
  if (!hasAIProvider) capabilityWarnings.push('No AI provider is configured yet. Career Seek will stay in deterministic local mode until you add a key or start Ollama.');
  if (!hasOllama) capabilityWarnings.push('Ollama is not reachable locally. Local model mode will stay unavailable until Ollama is running.');

  const capabilities = {
    schemaVersion: '1.1.0',
    generatedAt: new Date().toISOString(),
    source: 'doctor',
    baseDir,
    has_browser: browserOk,
    has_ocr: hasOcr,
    has_gemini_key: hasGeminiKey,
    has_ai_provider: hasAIProvider,
    selected_ai_provider: selectedProvider || undefined,
    has_cloud_ai_key: hasCloudKey,
    has_local_ollama: hasOllama,
    has_redis: redisReachable,
    has_meilisearch: meiliReachable,
    has_qdrant: qdrantReachable,
    native_binaries: nativeServices,
    safe_modes: {
      browser_scraping_disabled: !browserOk,
      ocr_manual_recovery_likely: !hasOcr,
      ai_generation_limited: !hasAIProvider,
      local_model_unavailable: !hasOllama,
    },
    tool_status: {
      ...toolStatus,
      ollama: hasOllama,
      redis: redisReachable,
      meilisearch: meiliReachable,
      qdrant: qdrantReachable,
    },
    ai: {
      ollama_base_url: ollamaBaseUrl,
      ollama_chat_model: ollamaModel,
      ollama_models_detected: ollamaProbe.models,
      custom_openai_base_url: compatibleBaseUrl || undefined,
    },
    warnings: capabilityWarnings,
  };

  const capabilitiesPath = path.join(configDir, 'capabilities.json');
  fs.writeFileSync(capabilitiesPath, JSON.stringify(capabilities, null, 2));
  console.log(`Capability matrix: ${capabilitiesPath}`);

  const dbPath = path.join(baseDir, 'db', 'jobhunt.db');
  if (!fs.existsSync(dbPath)) {
    issues.push('SQLite database is missing. Run: npm run bootstrap');
  } else {
    console.log(`SQLite DB: ${dbPath}`);
  }

  console.log('Checking package scripts...');
  try {
    const pkg = readPackageJson();
    for (const script of ['db:init', 'db:push:direct', 'source:seed', 'k1:migrate', 'build', 'launch', 'worker']) {
      if (!pkg.scripts?.[script]) issues.push(`Missing package script: ${script}`);
    }
  } catch {
    issues.push('Could not read package.json.');
  }

  console.log('-------------------------');
  if (issues.length === 0) {
    if (warnings.length > 0) {
      console.log('Core checks passed with safe-mode warnings:');
      warnings.forEach((warning) => console.log(` - ${warning}`));
    } else {
      console.log('System is healthy. Ready to launch.');
    }
    return;
  }

  console.log('Issues found:');
  issues.forEach((issue) => console.log(` - ${issue}`));
  if (warnings.length > 0) {
    console.log('Warnings:');
    warnings.forEach((warning) => console.log(` - ${warning}`));
  }
  process.exitCode = 1;
}

runDoctor().catch((error) => {
  console.error(`Doctor failed: ${error.message}`);
  process.exit(1);
});
