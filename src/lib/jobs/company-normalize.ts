/**
 * Company name normalizer for machine comparison and deduplication.
 * Strips legal suffixes, punctuation noise, and common generic words so that
 * "Accenture Pvt. Ltd." and "Accenture Solutions India" resolve to the same token.
 *
 * Ported from opensourceame/company_name_normalizer, extended for Indian market.
 */

const LEGAL_SUFFIXES = [
  // Indian legal forms (order matters — longer strings first)
  'private limited',
  'pvt limited',
  'pvt ltd',
  'pvt. ltd.',
  'pvt ltd.',
  'pvt. ltd',
  // Generic international
  'limited liability company',
  'limited liability partnership',
  'limited partnership',
  'incorporated',
  'corporation',
  'company',
  'limited',
  'holdings',
  'holding',
  'group',
  // Abbreviations
  'llp',
  'llc',
  'ltd',
  'inc',
  'corp',
  'plc',
  'ag',
  'gmbh',
  'bv',
  'nv',
  'sas',
  'sa',
  // Common generic suffixes in Indian tech
  'technologies',
  'technology',
  'software',
  'solutions',
  'services',
  'consulting',
  'consultancy',
  'systems',
  'infotech',
  'infosystems',
  'global',
  'india',
  'worldwide',
  'international',
  'enterprises',
  'ventures',
];

// Build a regex that strips any trailing suffix (case-insensitive, with optional punctuation)
const SUFFIX_PATTERN = new RegExp(
  `\\b(${LEGAL_SUFFIXES.map((s) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|')})\\b[.,]*\\s*$`,
  'gi',
);

/**
 * Normalise a company name to a compact, comparable token.
 * "Accenture Pvt. Ltd." → "accenture"
 * "Google India" → "google"
 * "HDFC Bank Ltd" → "hdfcbank"
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  let result = name
    .toLowerCase()
    .replace(/[''`]/g, '')          // smart quotes → nothing
    .replace(/[&+]/g, 'and')        // ampersand → and
    .replace(/[^\w\s]/g, ' ')       // other punctuation → space
    .replace(/\s+/g, ' ')
    .trim();

  // Strip legal suffixes repeatedly until stable
  let prev = '';
  while (prev !== result) {
    prev = result;
    result = result.replace(SUFFIX_PATTERN, '').trim();
  }

  // Final compact form: strip spaces to get a single canonical token
  return result.replace(/\s+/g, '').trim();
}

/**
 * Return true if two company names refer to the same entity.
 * Uses normalizeCompanyName on both sides.
 */
export function isSameCompany(a: string, b: string): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return false;
  // Exact match on normalized token
  if (na === nb) return true;
  // Substring match for parent/subsidiary detection (e.g. "tcs" inside "tataconsultancyservices")
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 4 && longer.startsWith(shorter);
}
