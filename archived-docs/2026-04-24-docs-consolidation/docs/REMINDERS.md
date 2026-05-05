# Reminders — Phase G

## Design

Reminders are lightweight, locally-persisted follow-up alerts linked to applications.

### Fields

- `title` — what to do
- `dueAt` — when it's due (date + time)
- `category` — `follow_up`, `interview_prep`, `deadline`, `custom`
- `isCompleted` / `completedAt` — completion state

### Behaviors

1. **Auto nextFollowUpAt**: When a reminder is created/completed, the application's `nextFollowUpAt` is recalculated to the nearest pending reminder.
2. **Overdue detection**: Any pending reminder past `dueAt` is flagged.
3. **Dashboard surfacing**: Due-today and overdue reminders appear on the home dashboard.
4. **Timeline integration**: Reminder creation and completion are logged.

### Smart Suggestions (rules-based)

- Follow up 5 days after applying
- Flag stale applications (14+ days in "applied")
- Suggest action for "preparing" status > 3 days
- Surface high-score saved jobs with no activity
