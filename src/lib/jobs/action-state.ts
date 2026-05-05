export type JobActionState = {
  primaryLabel: string;
  primaryKind: 'prepare' | 'apply' | 'follow_up' | 'continue';
  readinessLabel: string;
};

export function getJobActionState(input: {
  applicationStatus?: string | null;
  hasResume?: boolean;
  hasCoverLetter?: boolean;
}): JobActionState {
  const prepared = Boolean(input.hasResume || input.hasCoverLetter);

  if (input.applicationStatus === 'applied') {
    return { primaryLabel: 'Follow up', primaryKind: 'follow_up', readinessLabel: 'Applied' };
  }

  if (input.applicationStatus === 'saved' && prepared) {
    return { primaryLabel: 'Apply', primaryKind: 'apply', readinessLabel: 'Ready to apply' };
  }

  if (input.applicationStatus === 'saved') {
    return { primaryLabel: 'Continue', primaryKind: 'continue', readinessLabel: 'Saved' };
  }

  if (prepared) {
    return { primaryLabel: 'Apply', primaryKind: 'apply', readinessLabel: 'Prepared' };
  }

  return { primaryLabel: 'Prepare application', primaryKind: 'prepare', readinessLabel: 'Needs assets' };
}
