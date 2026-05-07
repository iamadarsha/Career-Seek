#!/usr/bin/env python3
"""
JobSpy runner — tries jobspy2 (speedyapply fork, multi-site) first,
falls back to legacy jobspy package if jobspy2 is not installed.

Supported sites: linkedin, indeed, naukri, glassdoor, zip_recruiter

Called by python-jobspy.ts / jobspy2.ts providers.
"""
import json
import sys
import time


JOBSPY2_SITES = {"linkedin", "indeed", "glassdoor", "zip_recruiter"}
LEGACY_SITES = {"indeed", "naukri"}


def _try_jobspy2(config: dict) -> list | None:
    """Attempt scrape with jobspy2. Returns list of jobs or None on import error."""
    try:
        from jobspy import scrape_jobs  # jobspy2 exposes same API
    except ImportError:
        return None

    site = config.get("site_name", "indeed")
    # jobspy2 multi-site: pass a list
    sites = [site] if site else ["indeed"]

    kwargs = dict(
        site_name=sites,
        search_term=config.get("search_term") or "product manager",
        location=config.get("location") or "India",
        results_wanted=int(config.get("results_wanted") or 25),
        description_format="markdown",
    )

    # Optional params — only pass if provided
    if config.get("google_search_term"):