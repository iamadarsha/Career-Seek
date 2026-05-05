#!/usr/bin/env python3
import json
import sys


def main() -> int:
    try:
        from jobspy import scrape_jobs
    except Exception as exc:
        sys.stderr.write(f"python-jobspy is not installed: {exc}\n")
        return 2

    try:
        config = json.loads(sys.argv[1])
    except Exception as exc:
        sys.stderr.write(f"Invalid JSON config: {exc}\n")
        return 2

    try:
        jobs = scrape_jobs(
            site_name=[config.get("site_name")],
            search_term=config.get("search_term") or "product manager",
            google_search_term=config.get("google_search_term"),
            location=config.get("location") or "India",
            results_wanted=int(config.get("results_wanted") or 25),
            country_indeed=config.get("country_indeed") or "india",
            is_remote=config.get("is_remote"),
            hours_old=config.get("hours_old"),
            description_format="markdown",
        )
        if hasattr(jobs, "to_dict"):
            records = jobs.to_dict(orient="records")
        else:
            records = list(jobs or [])
        print(json.dumps({"jobs": records}, default=str))
        return 0
    except Exception as exc:
        sys.stderr.write(str(exc) + "\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
