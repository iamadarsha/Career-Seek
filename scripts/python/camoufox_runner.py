"""
Camoufox-based job scraper for bot-protected portals.

Usage: python camoufox_runner.py '<json_config>'

Config keys:
  portal          (str)  — portal id: linkedin, naukri, instahyre, wellfound,
                           foundit, indeed, greenhouse, lever, company_ats, official
  search_term     (str)  — job title / keywords
  location        (str)  — location string
  is_remote       (bool) — include remote jobs
  results_wanted  (int)  — max jobs to return
  linkedin_email  (str)  — optional LinkedIn login email
  linkedin_password (str) — optional LinkedIn login password
  naukri_email    (str)  — optional Naukri login email
  naukri_password (str)  — optional Naukri login password
  company_url     (str)  — Greenhouse/Lever board URL (for greenhouse/lever portal)
"""

import json
import sys
import time
from urllib.parse import quote_plus

try:
    from camoufox.sync_api import Camoufox
except ImportError:
    print(json.dumps({"error": "camoufox not installed", "jobs": []}))
    raise SystemExit(1)


PORTAL_URLS = {
    "linkedin": "https://www.linkedin.com/jobs/search/?keywords={query}&location={location}&f_TP=1,2",
    "naukri": "https://www.naukri.com/{query_slug}-jobs-in-{location_slug}?experience=0",
    "instahyre": "https://www.instahyre.com/search-jobs/?search={query}&location={location}",
    "wellfound": "https://wellfound.com/jobs?q={query}&l={location}",
    "foundit": "https://www.foundit.in/srp/results?query={query}&location={location}",
    "indeed": "https://in.indeed.com/jobs?q={query}&l={location}",
    "company_ats": None,
    "official": None,
    "greenhouse": None,  # URL passed via config["company_url"]
    "lever": None,       # URL passed via config["company_url"]
}

# Portal-specific CSS selectors
PORTAL_SELECTORS = {
    "linkedin": {
        "cards": ".jobs-search__results-list > li, .base-card",
        "title": ".base-search-card__title, h3.base-search-card__title",
        "company": ".base-search-card__subtitle, h4.base-search-card__subtitle",
        "location": ".job-search-card__location",
        "link": "a.base-card__full-link, a.base-search-card__universal-link",
    },
    "naukri": {
        "cards": ".list article, .jobTupleHeader, [class*='jobTuple']",
        "title": "a.title, h2.jobTitle, [class*='title'] a",
        "company": "[class*='companyInfo'], [class*='comp-dtls']",
        "location": "[class*='location'], [class*='locWdth']",
        "link": "a.title, a[title]",
    },
    "instahyre": {
        "cards": ".job-card, [class*='job-listing'], .opportunities-list li",
        "title": "h2, h3, [class*='job-title'], [class*='role']",
        "company": "[class*='company'], [class*='employer']",
        "location": "[class*='location'], [class*='city']",
        "link": "a[href*='/jobs/'], a[href*='/apply']",
    },
    "wellfound": {
        "cards": "[class*='styles_component__'], [data-test*='job']",
        "title": "[class*='role'], [class*='title']",
        "company": "[class*='company'], [class*='startup']",
        "location": "[class*='location']",
        "link": "a[href*='/jobs/']",
    },
    "foundit": {
        "cards": ".card-apply-content, .jobTupleHeader, .srpResultCardContainer",
        "title": "h2 a, [class*='title'] a",
        "company": "[class*='company'], [class*='subTitle']",
        "location": "[class*='loc'], [class*='location']",
        "link": "a[href*='/job/'], h2 a",
    },
    "indeed": {
        "cards": ".job_seen_beacon, [class*='jobCard'], td.resultContent",
        "title": "h2.jobTitle span, [class*='jobTitle']",
        "company": "[class*='companyName'], [data-testid='company-name']",
        "location": "[class*='companyLocation'], [data-testid='job-location']",
        "link": "h2.jobTitle a, a[id^='job_']",
    },
    # Greenhouse board (boards.greenhouse.io)
    "greenhouse": {
        "cards": ".opening, li.opening, [class*='opening']",
        "title": "a[href*='/jobs/'], a",
        "company": ".company-name, h1, [class*='company']",
        "location": ".location, span.location, [class*='location']",
        "link": "a[href*='/jobs/']",
    },
    # Lever board (jobs.lever.co)
    "lever": {
        "cards": ".posting, [class*='posting']",
        "title": ".posting-name, h5.posting-name a, [class*='posting-name']",
        "company": ".posting-company, [class*='company']",
        "location": ".sort-by-location .sort-by-text, [class*='location']",
        "link": "a.posting-title, a[href*='lever.co']",
    },
}

GENERIC_SELECTORS = {
    "cards": "[class*='job-card'],[class*='job-listing'],[class*='job-result'],[data-job-id],article.job,li.job",
    "title": "h2 a, h3 a, [class*='job-title'], [class*='title'] a",
    "company": "[class*='company'], [class*='employer']",
    "location": "[class*='location'], [class*='city']",
    "link": "a[href*='job'], a[href*='/apply']",
}


def build_url(portal: str, search_term: str, location: str, config: dict) -> str | None:
    # Greenhouse / Lever: use company_url directly
    if portal in ("greenhouse", "lever", "company_ats", "official"):
        return config.get("company_url") or None

    template = PORTAL_URLS.get(portal)
    if not template:
        return None

    slug = search_term.lower().replace(" ", "-")
    loc_slug = location.lower().replace(" ", "-")
    return template.format(
        query=quote_plus(search_term),
        location=quote_plus(location),
        location_slug=loc_slug,
        query_slug=slug,
    )


def try_linkedin_login(page, email: str, password: str) -> bool:
    """
    Attempt LinkedIn login if we land on a login/auth-wall page.
    Returns True if login was attempted, False if credentials missing or page not a login wall.
    """
    if not email or not password:
        return False

    current_url = page.url
    is_login_wall = any(x in current_url for x in [
        "linkedin.com/login",
        "linkedin.com/uas/login",
        "linkedin.com/authwall",
        "linkedin.com/checkpoint",
    ])

    # Also detect login form on page
    has_login_form = page.query_selector("#username, input[name='session_key'], input[autocomplete='username']") is not None

    if not is_login_wall and not has_login_form:
        return False

    try:
        # Fill email
        email_sel = "#username, input[name='session_key'], input[autocomplete='username']"
        page.wait_for_selector(email_sel, timeout=8_000)
        page.fill(email_sel, email)

        # Fill password
        pass_sel = "#password, input[name='session_password'], input[type='password']"
        page.fill(pass_sel, password)

        # Submit
        page.click("button[type='submit'], .login__form_action_container button")
        page.wait_for_load_state("domcontentloaded", timeout=15_000)
        time.sleep(2)
        return True
    except Exception as exc:
        sys.stderr.write(f"[camoufox] LinkedIn login attempt failed: {exc}\n")
        return False


def try_naukri_login(page, email: str, password: str) -> bool:
    """Attempt Naukri login if login modal appears."""
    if not email or not password:
        return False

    has_login = page.query_selector("#usernameField, input[placeholder*='Email'], input[name='username']") is not None
    if not has_login:
        return False

    try:
        page.fill("#usernameField, input[placeholder*='Email'], input[name='username']", email)
        page.fill("#passwordField, input[type='password']", password)
        page.click("button[type='submit'], .loginButton, [class*='login-btn']")
        page.wait_for_load_state("domcontentloaded", timeout=15_000)
        time.sleep(2)
        return True
    except Exception as exc:
        sys.stderr.write(f"[camoufox] Naukri login attempt failed: {exc}\n")
        return False


def extract_jobs(page, portal: str, results_wanted: int) -> list[dict]:
    sel = PORTAL_SELECTORS.get(portal, GENERIC_SELECTORS)
    jobs = []

    try:
        page.wait_for_selector(sel["cards"], timeout=15_000)
    except Exception:
        time.sleep(3)
        sel = GENERIC_SELECTORS

    cards = page.query_selector_all(sel["cards"])

    for card in cards[:results_wanted]:
        try:
            title_el = card.query_selector(sel["title"])
            company_el = card.query_selector(sel["company"])
            location_el = card.query_selector(sel["location"])
            link_el = card.query_selector(sel["link"])

            title = title_el.inner_text().strip() if title_el else None
            company = company_el.inner_text().strip() if company_el else None
            location = location_el.inner_text().strip() if location_el else None
            url = link_el.get_attribute("href") if link_el else None

            if not title or not url:
                continue

            # Make relative URLs absolute
            if url and url.startswith("/"):
                base_domains = {
                    "linkedin": "https://www.linkedin.com",
                    "naukri": "https://www.naukri.com",
                    "instahyre": "https://www.instahyre.com",
                    "wellfound": "https://wellfound.com",
                    "foundit": "https://www.foundit.in",
                    "indeed": "https://in.indeed.com",
                }
                base = base_domains.get(portal, "")
                url = base + url

            jobs.append({
                "title": title,
                "company": company or "Company not listed",
                "location": location,
                "url": url,
                "apply_url": url,
                "snippet": "",
                "is_remote": False,
            })
        except Exception:
            continue

    return jobs


def main():
    config = json.loads(sys.argv[1])
    portal = config["portal"]
    search_term = config.get("search_term", "software engineer")
    location = config.get("location", "India")
    results_wanted = int(config.get("results_wanted", 20))
    linkedin_email = config.get("linkedin_email", "")
    linkedin_password = config.get("linkedin_password", "")
    naukri_email = config.get("naukri_email", "")
    naukri_password = config.get("naukri_password", "")

    url = build_url(portal, search_term, location, config)
    if not url:
        print(json.dumps({"jobs": [], "error": f"No URL template for portal: {portal}"}))
        return 0

    jobs = []
    with Camoufox(headless=True) as browser:
        page = browser.new_page()
        try:
            page.goto(url, timeout=30_000, wait_until="domcontentloaded")
            time.sleep(2)

            # Attempt portal-specific login if credentials provided
            if portal == "linkedin":
                logged_in = try_linkedin_login(page, linkedin_email, linkedin_password)
                if logged_in:
                    # After login, navigate to the jobs search URL
                    page.goto(url, timeout=30_000, wait_until="domcontentloaded")
                    time.sleep(2)
            elif portal == "naukri":
                try_naukri_login(page, naukri_email, naukri_password)

            jobs = extract_jobs(page, portal, results_wanted)
        except Exception as exc:
            print(json.dumps({"jobs": [], "error": str(exc)}))
            return 1

    print(json.dumps({"jobs": jobs}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
