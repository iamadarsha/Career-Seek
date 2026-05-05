# Role Family Search Packs

The rich role-family catalog lives in `data/role_family_packs.json`. It is designed as a machine-readable source for future loader work, search preference expansion, source routing, and validation fixtures.

The current runtime implementation in `src/lib/services/scraping/role-family-packs.ts` is still a smaller TypeScript subset. This worker did not edit TS source, so the JSON should be treated as the complete data contract and not yet as proof that every pack is wired into scans.

## JSON Contract

Each pack includes:

| Field | Purpose |
|---|---|
| `id` | Stable snake_case identifier. |
| `label` | Human-readable pack name. |
| `cluster` | Mission cluster label from the product requirement. |
| `primary_titles` | Core titles to search directly. |
| `synonyms` | Abbreviations, alternate spellings, and India-market wording. |
| `adjacent_titles` | Nearby roles worth searching when the user's profile supports them. |
| `junior_senior_variants` | Internship through leadership variants for seniority expansion. |
| `sector_specific_variants` | Domain-specific overlays, grouped by sector. |
| `special_use_cases` | Routing and expansion notes for India-specific behavior. |
| `keyword_hints` | Resume/search terms that help rank and filter results. |

## Coverage

| Pack id | Mission cluster | Coverage notes |
|---|---|---|
| `engineering` | engineering | Software, cloud, infra, mobile, QA, security, embedded, IT services, solutions engineering. |
| `product_program_strategy` | product/program/strategy | PM, APM, TPM, program, strategy, BizOps, founder office, AI product, fintech, SaaS, consumer. |
| `design_creative` | design/creative | Product, UI/UX, research, visual, motion, brand, content, gaming, learning design. |
| `data_ai_analytics` | data/AI/analytics | Analyst, BI, data science, ML, AI, MLOps, GenAI, risk, product, operations analytics. |
| `sales_growth_marketing_customer` | sales/growth/marketing/customer | BDE, BDM, SDR, AE, CSM, support, growth, digital marketing, field sales, BFSI sales. |
| `hr_talent_people` | HR/talent/people | HR generalist, TA, recruiter, people ops, HRBP, L&D, payroll, industrial relations. |
| `finance_legal_compliance_risk` | finance/legal/compliance/risk | Finance, accounts, CA/CS, FP&A, audit, tax, legal, compliance, AML, KYC, risk. |
| `operations_supply_logistics_admin` | operations/supply/logistics/admin | Ops, SCM, logistics, warehouse, procurement, admin, facilities, shared services. |
| `education` | education | Teacher, faculty, PRT/TGT/PGT, edtech, curriculum, instructional design, coaching. |
| `healthcare` | healthcare | Doctors, nurses, clinical, hospital ops, diagnostics, pharma, healthtech, insurance. |
| `government_public_research` | government/public/research | Government, PSU, policy, research, JRF/SRF, public health, development sector. |
| `freshers_trainees_internships` | freshers/trainees/internships | Interns, graduate trainees, campus hires, apprentices, off-campus and 0-1 year searches. |
| `specialized_sectors` | specialized sectors | Cybersecurity, semiconductor, EV, manufacturing, energy, climate, gaming, hospitality, agri. |

## India Use Cases

1. `freshers_trainees_internships` should be activated only by explicit fresher, intern, trainee, campus, batch-year, or 0-1 year signals. This prevents internship noise in experienced searches.
2. `government_public_research` should route discovery toward official recruitment notifications, institute pages, PSU pages, and university pages. Portal copies should be used only to find canonical links.
3. `sales_growth_marketing_customer` and `operations_supply_logistics_admin` are the main packs that justify optional Apna and WorkIndia fallback use because those sources are more useful for field, admin, delivery, retail, and support roles.
4. `education` and `healthcare` preserve qualification, subject, specialty, registration, and onsite location signals more aggressively than generic corporate packs.
5. `specialized_sectors` is an overlay pack. It should usually combine with a function pack such as engineering, operations, data, sales, finance, or product.

## Expansion Expectations

Role expansion should be conservative:

1. Start with the user's exact titles and custom role text.
2. Add `primary_titles` from confidently matched packs.
3. Add `synonyms` and `junior_senior_variants` only when seniority or abbreviation evidence exists.
4. Add `sector_specific_variants` only when the resume, user preference, company target, or keyword hints support that sector.
5. Add `adjacent_titles` last, and cap total title variants to avoid broad noisy scans.

## Validation Expectations

Validation should check the JSON and the behavior separately:

1. JSON parses with `jq`.
2. Every pack has the required fields listed above.
3. Every mission cluster is represented exactly once or intentionally documented as an overlay.
4. Title expansion tests cover at least one example per pack, including a negative test where adjacent titles are not added without enough evidence.
5. Runtime tests should remain honest until a loader is added. Passing JSON validation does not mean the current scanner uses every pack.

## Example

Input:

```text
Product Manager, AI Product Manager, Bengaluru
```

Expected expansion candidates include:

```text
Product Manager, Associate Product Manager, Technical Product Manager,
AI Product Manager, GenAI Product Manager, LLM Product Manager,
Program Manager, Product Analyst, Founder Office, Strategy and Operations
```

The final scan should still rank official employer and ATS sources before broad portals.
