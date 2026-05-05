import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { inferRoleFamilies } from '../role-family-packs';

export class ValidationSeedAdapter extends BasePortalAdapter {
  identifier = 'validation_seed';
  displayName = 'Validation seed source';

  async healthCheck(_context: BrowserContext): Promise<boolean> {
    return process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE === '1';
  }

  async scrape(_context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    onProgress?.('Returning deterministic validation jobs');
    const title = query.titleVariants[0] || 'AI Product Manager';
    const location = query.locations[0] || 'Bengaluru';
    const roleFamilies = inferRoleFamilies([
      ...query.titleVariants,
      ...(query.keywords || []),
    ]);

    const validationPayload = (roleFamily: string) => ({
      proofMode: 'deterministic_validation_only',
      liveSourceProof: false,
      roleFamily,
    });

    if (roleFamilies.includes('design')) {
      return this.formatResult([
        {
          portal: this.identifier,
          externalId: 'validation-seed-design-001',
          title: /designer|design|ux|ui/i.test(title) ? title : 'Product Designer - UI/UX',
          company: 'Validation Health Design',
          location,
          isHybrid: true,
          salaryText: '₹18-28 LPA',
          experienceText: '3-6 years',
          url: 'https://example.com/careers/validation-product-designer-ui-ux',
          applyUrl: 'https://example.com/careers/validation-product-designer-ui-ux',
          snippet: 'Design SaaS workflows, run UX research, build Figma prototypes, maintain design systems, and partner with PM and engineering on measurable product improvements.',
          employmentType: 'validation_seed',
          rawPayload: validationPayload('design'),
        },
        {
          portal: this.identifier,
          externalId: 'validation-seed-design-002',
          title: 'Senior UX Designer',
          company: 'Validation Fintech Design',
          location: `${location}, Remote`,
          isRemote: true,
          salaryText: '₹24-36 LPA',
          experienceText: '4-8 years',
          url: 'https://example.com/careers/validation-senior-ux-designer',
          applyUrl: 'https://example.com/careers/validation-senior-ux-designer',
          snippet: 'Lead research synthesis, interaction design, usability testing, dashboard IA, accessibility checks, and design-system adoption for fintech onboarding.',
          employmentType: 'validation_seed',
          rawPayload: validationPayload('design'),
        },
      ] satisfies RawScrapedJob[]);
    }

    if (roleFamilies.includes('hr_recruiting')) {
      return this.formatResult([
        {
          portal: this.identifier,
          externalId: 'validation-seed-hr-001',
          title: /hr|people|talent|human resources/i.test(title) ? title : 'HR Generalist - People Operations',
          company: 'Validation People Cloud',
          location,
          isHybrid: true,
          salaryText: '₹12-20 LPA',
          experienceText: '3-6 years',
          url: 'https://example.com/careers/validation-hr-generalist-people-ops',
          applyUrl: 'https://example.com/careers/validation-hr-generalist-people-ops',
          snippet: 'Own onboarding, employee engagement, HR analytics dashboards, performance-cycle coordination, people operations workflows, and manager enablement.',
          employmentType: 'validation_seed',
          rawPayload: validationPayload('hr_recruiting'),
        },
        {
          portal: this.identifier,
          externalId: 'validation-seed-hr-002',
          title: 'HR Business Partner',
          company: 'Validation Retail Tech',
          location: `${location}, Remote`,
          isRemote: true,
          salaryText: '₹18-30 LPA',
          experienceText: '4-8 years',
          url: 'https://example.com/careers/validation-hr-business-partner',
          applyUrl: 'https://example.com/careers/validation-hr-business-partner',
          snippet: 'Partner with leaders on talent management, employee relations, retention programs, performance management, HRIS hygiene, and engagement interventions.',
          employmentType: 'validation_seed',
          rawPayload: validationPayload('hr_recruiting'),
        },
      ] satisfies RawScrapedJob[]);
    }

    return this.formatResult([
      {
        portal: this.identifier,
        externalId: 'validation-seed-001',
        title,
        company: 'Validation SaaS Labs',
        location,
        isHybrid: true,
        salaryText: '₹25-35 LPA',
        experienceText: '4-7 years',
        url: 'https://example.com/careers/validation-ai-product-manager',
        applyUrl: 'https://example.com/careers/validation-ai-product-manager',
        snippet: 'Own AI-native product workflows, partner with engineering and GTM teams, and use LLM/RAG systems to improve customer outcomes.',
        employmentType: 'validation_seed',
        rawPayload: validationPayload('product_management'),
      },
      {
        portal: this.identifier,
        externalId: 'validation-seed-002',
        title: `Senior ${title}`,
        company: 'Validation Fintech India',
        location: `${location}, Remote`,
        isRemote: true,
        salaryText: '₹30-45 LPA',
        experienceText: '5-9 years',
        url: 'https://example.com/careers/validation-senior-ai-product-manager',
        applyUrl: 'https://example.com/careers/validation-senior-ai-product-manager',
        snippet: 'Lead fintech AI product discovery, define roadmap, write PRDs, and use analytics to improve activation and retention.',
        employmentType: 'validation_seed',
        rawPayload: validationPayload('product_management'),
      },
    ] satisfies RawScrapedJob[]);
  }
}

export class ValidationFailAdapter extends BasePortalAdapter {
  identifier = 'validation_fail';
  displayName = 'Validation failing source';

  async healthCheck(_context: BrowserContext): Promise<boolean> {
    return process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE === '1';
  }

  async scrape(_context: BrowserContext): Promise<PortalScanResult> {
    return this.formatResult([], 'selector_not_found: simulated selector drift for validation', 'selector_not_found');
  }
}
