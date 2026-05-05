export interface JobQuery {
  titleVariants: string[];
  locations: string[];
  targetCompanies?: string[];
  companyTypes?: string[];
  isRemote?: boolean;
  isHybrid?: boolean;
  salaryMin?: number;
  experienceMin?: number;
  experienceMax?: number;
  keywords: string[];
  avoidKeywords: string[];
}

export interface RawScrapedJob {
  portal: string;
  externalId?: string;
  title: string;
  company: string;
  location?: string;
  isRemote?: boolean;
  isHybrid?: boolean;
  salaryText?: string;
  experienceText?: string;
  url: string;
  applyUrl?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  status?: 'full' | 'partial';
  postedDateText?: string;
  snippet?: string;
  employmentType?: string;
  rawPayload?: any; // The original portal payload, useful for debugging
}

export interface NormalizedJob extends RawScrapedJob {
  id?: number;
  profileId: number; // K-1 ownership
  scanId: number;
  searchProfileId: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  experienceMin?: number;
  experienceMax?: number;
  postedDate?: Date;
  scrapedAt: Date;
}

export interface PortalScanResult {
  portal: string;
  status: 'success' | 'partial' | 'failed';
  jobs: RawScrapedJob[];
  error?: string;
  failureCode?: string;
  debugSnapshotPath?: string;
  sourceHealthLabel?: string;
  gracefulFallback?: {
    localOnly: boolean;
    label: string;
    reason: string;
    suggestedSourceIds?: string[];
  };
}

export interface SearchExpansion {
  reason: string;
  oldQuery: Partial<JobQuery>;
  newQuery: Partial<JobQuery>;
}
