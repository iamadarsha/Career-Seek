import { NextResponse } from 'next/server';
import { checkSystemHealth } from '@/lib/services/system/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await checkSystemHealth();
    return NextResponse.json({
      ok: health.ok,
      health,
      degraded: !health.ok,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'System health could not be checked.';
    return NextResponse.json({
      ok: false,
      degraded: true,
      error: {
        code: 'health_check_failed',
        message,
        action: 'Restart with ./setup.sh --repair, then reopen System Status.',
      },
      health: {
        status: 'fail',
        generatedAt: new Date().toISOString(),
        checks: [
          {
            id: 'health',
            label: 'System health',
            state: 'fail',
            message,
            action: 'Restart with ./setup.sh --repair, then reopen System Status.',
          },
        ],
      },
    });
  }
}
