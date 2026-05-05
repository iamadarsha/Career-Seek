"""
Browser-Use AI agent runner — last-resort scraper for blocked portals.

Usage: python browser_use_runner.py '<json_config>'

Config keys:
  portal       (str) — portal id
  task         (str) — natural language task description
  llm_provider (str) — 'openai' | 'anthropic' | 'gemini'
  llm_api_key  (str) — API key for the chosen provider
"""

import asyncio
import json
import re
import sys


def build_llm(provider: str, api_key: str):
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4.1-mini", api_key=api_key, temperature=0)
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model="claude-haiku-4-5-20251001", api_key=api_key, temperature=0)
    # fallback: gemini
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api_key, temperature=0)


def parse_jobs(text: str) -> list[dict]:
    """Extract a JSON array from possibly messy agent output."""
    # Try direct parse first
    text = text.strip()
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "jobs" in data:
            return data["jobs"]
    except json.JSONDecodeError:
        pass

    # Try extracting JSON array from markdown code block or inline
    patterns = [
        r"```(?:json)?\s*(\[[\s\S]*?\])\s*```",
        r"(\[[\s\S]*\])",
    ]
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            try:
                data = json.loads(m.group(1))
                if isinstance(data, list):
                    return data
            except json.JSONDecodeError:
                continue

    return []


async def run_agent(task: str, llm) -> str:
    try:
        from browser_use import Agent
    except ImportError:
        raise RuntimeError("browser_use package not installed. Run: pip install browser-use")

    agent = Agent(task=task, llm=llm)
    result = await agent.run()

    # browser-use returns an AgentHistoryList — get the final message
    if hasattr(result, "final_result"):
        return str(result.final_result() or "")
    if hasattr(result, "__str__"):
        return str(result)
    return ""


async def main_async(config: dict) -> int:
    task = config.get("task", "")
    provider = config.get("llm_provider", "openai")
    api_key = config.get("llm_api_key", "")

    if not task:
        print(json.dumps({"jobs": [], "error": "no task provided"}))
        return 1

    try:
        llm = build_llm(provider, api_key)
    except ImportError as exc:
        print(json.dumps({"jobs": [], "error": f"LLM provider not installed: {exc}"}))
        return 1

    try:
        output = await run_agent(task, llm)
        jobs = parse_jobs(output)
        print(json.dumps({"jobs": jobs}))
        return 0
    except Exception as exc:
        print(json.dumps({"jobs": [], "error": str(exc)}))
        return 1


def main():
    config = json.loads(sys.argv[1])
    return asyncio.run(main_async(config))


if __name__ == "__main__":
    raise SystemExit(main())
