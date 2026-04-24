# Chat Persistence — JobHunt India Phase F

## Overview

All coaching conversations persist locally in SQLite. Users can leave, return, and resume any conversation thread.

## Data Model

### `coach_threads`
| Field | Type | Description |
|---|---|---|
| id | INTEGER PK | Thread identifier |
| title | TEXT | Auto-generated from first question |
| scoredJobId | INTEGER | Linked job (null for profile-only coaching) |
| scope | TEXT | Retrieval scope for this thread |
| createdAt | TIMESTAMP | Creation time |
| updatedAt | TIMESTAMP | Last activity time |

### `coach_messages`
| Field | Type | Description |
|---|---|---|
| id | INTEGER PK | Message identifier |
| threadId | INTEGER FK | Parent thread |
| role | TEXT | 'user' or 'assistant' |
| content | TEXT | Message text |
| confidenceLevel | TEXT | 'high'/'medium'/'low' (assistant only) |
| answerMode | TEXT | 'concise'/'detailed' (assistant only) |
| retrievedChunkIds | TEXT | JSON array of chunk IDs used for this answer |
| createdAt | TIMESTAMP | Message time |

### `message_sources`
| Field | Type | Description |
|---|---|---|
| id | INTEGER PK | Source reference identifier |
| messageId | INTEGER FK | Parent assistant message |
| chunkId | TEXT | FK to document_chunks.chunkId |
| relevanceScore | INTEGER | 0-100 match quality |
| snippetPreview | TEXT | First 200 chars of the source chunk |
| sourceLabel | TEXT | Human-readable label (e.g., "Your Profile — Experience at Google") |

## Auto-titling

Threads are automatically titled using the first user message (truncated to 60 chars). Users see the title in the thread sidebar.

## Conversation Context

When generating follow-up answers, the last 6 messages (3 pairs) from the thread are injected as conversation history for coherent multi-turn dialogue.

## Thread Lifecycle

1. **Create** — on first question (or explicit "New Thread" button)
2. **Active** — messages accumulate, updatedAt refreshes
3. **Delete** — user deletes from sidebar (cascades to messages and sources)
