# Local Storage Strategy

## Path Conventions
The application stores all data locally in the user's home directory.
- **macOS**: `~/.jobhunt-india/`
- **Windows**: `%USERPROFILE%\.jobhunt-india\`

## Directory Structure
- `/config/`: JSON configuration files (e.g., `settings.json` storing the Gemini API key).
- `/db/`: The SQLite database file (`jobhunt.db`).
- `/cache/`: Temporary data, HTML pages from scraping.
- `/logs/`: Application execution logs.
- `/output/resumes/`: Generated `.docx` and `.pdf` tailored resumes.
- `/output/cover-letters/`: Generated cover letters.
- `/uploads/`: The base resume uploaded by the user.

## Rationale
Using a dedicated hidden folder in the home directory is standard practice for local CLI/GUI tools and ensures the app can be uninstalled simply by deleting the folder.
