# Company Careers Source Map

The official company careers seed now lives at `data/company_careers_seed.csv`.
It is a broad India-first employer catalog for official-first job discovery before the app falls back to public job boards.

## Seed Summary

- Rows: 285 employers.
- Schema: `sector,subsector,role_family,company,priority,country_focus,india_presence,career_url_hint,career_url_final,ats_type,city_tags,remote_possible,role_keywords,notes`.
- URL policy: `career_url_final` points to an official employer careers page or an official employer ATS/job board URL. When a search-filter URL is fragile, `career_url_hint` preserves the same official landing/search surface.
- Priority intent: `1` means high-volume or strategically important India hiring source; `2` means useful specialist or periodic source; `3` is niche long-tail.

## Sector Counts

| Sector | Rows |
|---|---:|
| `bfsi` | 22 |
| `ecommerce_logistics_retail` | 25 |
| `education` | 21 |
| `global_tech_gcc` | 25 |
| `government_psu_public` | 28 |
| `healthcare` | 24 |
| `india_it_services` | 22 |
| `manufacturing_ev_energy` | 31 |
| `media_gaming` | 15 |
| `ngo_social_impact` | 12 |
| `pharma` | 13 |
| `product_saas_fintech` | 25 |
| `real_estate_infra` | 10 |
| `travel_hospitality_aviation` | 12 |

## Source Categories

The seed includes every company currently listed in the runtime India careers map and expands it across these categories:

| Category | Coverage |
|---|---|
| Global tech and GCC | Big tech, enterprise SaaS, semiconductor, cloud, payments, social platforms, and India capability centers. |
| India IT services | Large IT services, consulting, digital engineering, embedded engineering, and product engineering services. |
| Product, SaaS, and fintech | India-headquartered SaaS, developer tools, HR tech, payments, lending, brokerage, and consumer fintech. |
| Ecommerce, logistics, and retail | Marketplaces, food and quick commerce, warehouse/logistics networks, omnichannel retail, stores, and field operations. |
| BFSI | Private banks, public banks, insurers, NBFCs, brokerages, consulting, audit, risk, branch banking, and field sales. |
| Education | Edtech, coaching, schools, universities, faculty, adjunct faculty, trainers, tutors, and center operations. |
| Healthcare | Hospitals, diagnostics, healthtech, pharmacy, home healthcare, nurses, technicians, doctors, locum or visiting consultant signals. |
| Manufacturing, EV, and energy | Automotive, EV, steel, EPC, industrial automation, utilities, renewables, plants, projects, and field service. |
| Pharma | Indian and MNC pharma employers across R&D, QA, QC, production, regulatory, medical affairs, and field sales. |
| Media and gaming | Gaming studios, fantasy sports, broadcast media, news, adtech, social platforms, and audio content. |
| Real estate and infrastructure | Developers, EPC, airports, ports, construction, project controls, sales, and facilities. |
| Travel, hospitality, and aviation | Airlines, hotels, travel tech, cabin crew, airport operations, hotel operations, and disability-inclusive hotel hiring. |
| NGO and social impact | Foundations, nonprofits, fellowships, education, livelihoods, fundraising, M&E, and field program roles. |
| Government, PSU, and public institutions | Central recruitment, regulators, public research bodies, digital government, PSUs, airports, AIIMS, IIT, and IISc. |

## ATS Coverage Caveats

Current ATS counts in the seed:

| ATS type | Rows |
|---|---:|
| `unknown_or_custom` | 278 |
| `greenhouse` | 1 |
| `icims` | 2 |
| `rippling` | 1 |
| `successfactors` | 2 |
| `workday` | 1 |

This is intentionally conservative. Many India employer career pages are custom JavaScript applications, redirect through changing vendor URLs, or expose openings through campaign-specific pages. The seed only marks a structured ATS when the official URL itself gives strong evidence. Otherwise it uses `unknown_or_custom` so scanners can apply safe public-link extraction, page-health checks, and source failure reporting without pretending structured ATS coverage exists.

Government, PSU, hospital, university, and NGO pages are often notice-driven rather than evergreen ATS feeds. Their pages may be empty between recruitment cycles, publish PDF notices, or split roles across campus/unit pages.

## Official-First Discovery

The CSV supports official-first discovery by making employer-owned sources the first search surface:

- `sector`, `subsector`, and `role_family` let role packs select relevant employers before broad portals.
- `city_tags`, `country_focus`, `india_presence`, and `remote_possible` let searches favor India city fit, remote-friendly roles, branch networks, campuses, plants, hospitals, warehouses, and field-heavy employers.
- `role_keywords` gives the scanner safe query expansion terms without inventing job titles.
- `notes` captures special routing hints such as returnships, disability-inclusive hiring, adjunct faculty, locum doctors, branch banking, warehouse and logistics roles, field sales, and public recruitment cycles.
- `career_url_hint` and `career_url_final` separate a durable official source hint from the crawl target used today.

The expected scan behavior is: try matching official company pages first, extract only employer-attributed public openings, record partial failures by source, and then fall back to Google discovery or public job portals only when official sources are insufficient.

## Known Gaps

- Exact ATS vendor coverage needs periodic revalidation because many official pages hide or rotate the backend vendor.
- Some official pages may gate traffic, require JavaScript, or block HEAD/automation checks.
- Government and PSU sources may require notice/PDF parsing beyond normal job-card extraction.
- Hospital locum roles, adjunct faculty, contract researchers, apprenticeships, and field sales may live on sub-pages or PDFs not linked from the top-level careers page.
- The seed is broad rather than exhaustive; additional regional employers, MSMEs, state government portals, and city-specific hospital/school chains can be added in later passes.
