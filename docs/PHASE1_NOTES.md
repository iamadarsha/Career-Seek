# Phase 1 Notes

> Historical snapshot from early bootstrap. Current validated status is in `docs/PROJECT_STATUS.md`.

## Completed
1. **Repository Structure**: Established `src/app`, `src/components`, `src/lib`, `src/db`, `scripts`, `installer`, and `docs`.
2. **Local App Shell**: Created Next.js 14 App Router layout, sidebar navigation, and polished placeholder pages using Tailwind CSS and Lucide React.
3. **Design System**: Set up Apple HIG-inspired CSS variables (`globals.css`) for backgrounds, cards, typography, and glass effects.
4. **Routing Logic**: Basic config check (`lib/config.ts`) that redirects to `/onboarding` if the setup is incomplete.
5. **Local Data**: Created path utilities mapping to OS-specific hidden folders (`~/.jobhunt-india/`).
6. **Database Schema**: Scaffolded basic SQLite schema using Drizzle ORM.
7. **Installer/Scripts**: Created bootstrap, doctor, launch, and init scripts.

## Deferred to Phase 2
- **Playwright Scraping**: No active scraping logic exists yet.
- **Gemini Integration**: The API key can be collected, but no AI prompts or analysis logic is built.
- **RAG & Chunking**: Not implemented. (May evaluate LangChain or claude-mem here).
- **Document Generation**: `docx` dependency added, but no resume tailoring function exists.
- **Onboarding UX**: Currently just a placeholder UI. Needs actual form submission and API logic to save to local config.
