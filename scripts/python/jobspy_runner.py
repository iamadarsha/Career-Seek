#!/usr/bin/env python3
"""
JobSpy runner — tries jobspy2 (speedyapply fork, multi-site) first,
falls back to legacy jobspy package if jobspy2 is not installed.

Supported sites: linkedin, indeed, naukri, glassdoor, zip_recruiter

Called by python-jobspy.ts and jobspy2.ts providers.
"""
import json
import sys


def _try_jobspy2(config: dict) -> list | None:
    """Attempt scrape with jobspy2 (speedyapply fork). Returns job list or None if not installed."""
    try:
        from jobspy import scrape_jobs
    except ImportError:
        return None

    site = config.get("site_name", "indeed")
    sites = [site] if isinstance(site, str) else (site or ["indeed"])

    kwargs = dict(
        site_name=sites,
        search_term=config.get("search_term") or "product manager",
        location=config.get("location") or "India",
        results_wanted=int(config.get("results_wanted") or 25),
        description_format="markdown",
    )
    if config.get("google_search_term"):
        kwargs["google_search_term"] = config["google_search_term"]
    if config.get("country_indeed"):
        kwargs["country_indeed"] = config["country_indeed"]
    if config.get("is_remote") is not None:
        kwargs["is_remote"] = bool(config["is_remote"])
    if config.get("hours_old"):
        kwargs["hours_old"] = int(config["hours_old"])

    try:
        jobs_df = scrape_jobs(**kwargs)
        if hasattr(jobs_df, "to_dict"):
            records = jobs_df.to_dict(orient="records")
        else:
            records = list(jobs_df or [])

        # Retry once with broader params if empty
        if not records and config.get("hours_old"):
            del kwargs["hours_old"]
            jobs_df2 = scrape_jobs(**kwargs)
            records = jobs_df2.to_dict(orient="records") if hasattr(jobs_df2, "to_dict") else list(jobs_df2 or [])

        return records
    except Exception as exc:
        sys.stderr.write(f"[jobspy2] scrape_jobs failed: {exc}\n")
        return []


def _try_legacy_jobspy(config: dict) -> list | None:
    """Attempt scrape with legacy python-jobspy. Returns job list or None if not installed."""
    try:
        from jobspy import scrape_jobs  # noqa: F401 — same import, different package path
    except ImportError:
        return None

    site = config.get("site_name", "indeed")
    try:
        jobs_df = scrape_jobs(
            site_name=[site] if isinstance(site, str) else site,
            search_term=config.get("search_term") or "product manager",
            google_search_term=config.get("google_search_term"),
            location=config.get("location") or "India",
            results_wanted=int(config.get("results_wanted") or 25),
            country_indeed=config.get("country_indeed") or "india",
            is_remote=config.get("is_remote"),
            hours_old=config.get("hours_old"),
            description_format="markdown",
        )
        if hasattr(jobs_df, "to_dict"):
            return jobs_df.to_dict(orient="records")
        return list(jobs_df or [])
    except Exception as exc:
        sys.stderr.write(f"[legacy-jobspy] scrape_jobs failed: {exc}\n")
        return []


def main() -> int:
    try:
        config = json.loads(sys.argv[1])
    except Exception as exc:
        sys.stderr.write(f"Invalid JSON config: {exc}\n")
        return 2

    # 1. Try jobspy2 (speedyapply fork — multi-site, actively maintained)
    records = _try_jobspy2(config)

    # 2. If jobspy2 not installed, fall back to legacy python-jobspy
    if records is None:
        sys.stderr.write("[jobspy_runner] jobspy2 not found, falling back to legacy python-jobspy\n")
        records = _try_legacy_jobspy(config)

    # 3. Neither package installed
    if records is None:
        sys.stderr.write(
            "Neither jobspy2 nor python-jobspy is installed.\n"
            "Install one: pip install 'jobspy2' or pip install 'python-jobspy'\n"
        )
        return 2

    print(json.dumps({"jobs": records}, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
