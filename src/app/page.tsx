import { redirect } from 'next/navigation';
import { CommandCenterClient } from '@/components/CommandCenterClient';
import { getOnboardingGate } from '@/lib/onboarding/gate';
import { getCommandCenterData } from '@/lib/services/dashboard/command-center';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const gate = getOnboardingGate();
  if (!gate.isComplete) {
    redirect('/onboarding');
  }

  const initialData = await getCommandCenterData();
  return <CommandCenterClient initialData={initialData} />;
}
