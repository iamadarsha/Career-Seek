import { NextResponse } from 'next/server';
import { buildDefaultScraperManager } from '@/lib/services/scraping/scraper-manager';
import { apiException } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const manager = buildDefaultScraperManager();
    const providers = await manager.health();
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      providers,
    });
  } catch (error) {
    return apiException(error, 'scraping_sources_unavailable', 503, 'Open System Status and check Python, Chromium, and Redis.');
  }
}
