# Saras - Mandarin Learning App

React + TypeScript web app for learning Mandarin with adaptive quiz practice, modality-level tracking, and cloud sync.

---

## Agent Operating Instructions (Read First)

Future agents: this file is intentionally operational. It is the first map for where to edit code safely.

1. Always read `.cursorrules` and `README.md` before making changes.
2. Keep this README between **300 and 350 lines** after edits.
3. If any section feels outdated or uncertain, suggest updates to the user before large changes.
4. Keep README focused on stable contracts and architecture, not fast-changing tuning details.
5. Document known failures/incidents and any mitigation steps.
6. When scripts change (build, data extraction, sync tooling, ML analysis), update the "Script Behavior" section.
7. Never run risky DB migrations without explicit user confirmation and backup strategy.
8. For volatile logic, update nearby module docs/docstrings first, then update README pointers.
9. If a user request introduces uncertainty, propose doc updates in the same PR/task.

---

## Product Goals and Core Rules

### Learning Philosophy
- Keep users around a ~70-80% quiz success range.
- Track knowledge per modality: `character`, `pinyin`, `meaning`, `audio`.
- Reward recovery: wrong answers reduce score less than correct answers increase it.
- Show progress clearly (overall + per modality).

### Critical Concept: Known vs Unknown Words
Binary categories only:

| Status | Checkbox | In Revise/Quiz Pool |
|---|---|---|
| Known | Checked | Yes |
| Unknown | Unchecked | No |

This is the primary anti-overwhelm mechanism. Do not silently alter this behavior.

---

## App Surfaces and Where to Edit

### Main Tabs
- `Vocabulary`: import/browse words, toggle known/unknown.
- `Study`: passive flashcards (self-paced).
- `Quiz`: active MCQ + scoring + attempt logging.
- `Pinyin`: pronunciation practice with listen-and-pick quiz and speak-and-check self-evaluation.
- `Syntax`: sentence construction practice.
- `Profile`: progress charts + settings.

### High-Value Files
- `src/App.tsx`: app composition and top-level routing.
- `src/components/Navbar.tsx`: tab navigation.
- `src/pages/VocabularyPage.tsx`: vocabulary list, filters, toggle flow.
- `src/pages/StudyPage.tsx`: flashcard behavior.
- `src/pages/QuizPage.tsx`: question lifecycle, correctness UI, logging controls.
- `src/pages/PinyinPage.tsx`: pinyin chart reference + listen/speak practice modes.
- `src/data/pinyinChart.ts`: complete pinyin syllable grid data and character-to-TTS mapping.
- `src/pages/SyntaxPage.tsx`: sentence construction and grammar practice.
- `src/pages/ProfilePage.tsx`: dashboard/settings entry.
- `src/pages/SettingsPage.tsx`: user preferences.

### State and Domain Logic
- `src/stores/vocabularyStore.ts`: concept state and vocabulary lifecycle.
- `src/stores/settingsStore.ts`: focus weights, UI and quiz settings.
- `src/utils/knowledge.ts`: knowledge update math.
- `src/utils/quiz.ts`: question selection and option generation.
- `src/utils/syntax.ts`: template-driven sentence generation.
- `src/services/ttsService.ts`: speech playback.

### Cloud/Sync Layer
- `src/lib/supabase.ts`: Supabase client.
- `src/lib/syncService.ts`: sync orchestration.
- `src/lib/quizService.ts`: quiz attempt writes and related persistence.
- `src/lib/pwaReminderService.ts`: push subscription CRUD, schedule read/write, enable/disable.
- `src/types/database.ts`: DB schema typing contracts.

---

## Change Velocity Map

High-churn: `QuizPage`, `quiz.ts`, settings stores, `SyntaxPage`/`syntax.ts`, ML scripts, `App.tsx`/`Navbar`.
Stable contracts: known/unknown semantics, modality model, sync guarantees, migration safety.
Experimental behavior → module-level docs first, README at principle level.

---

## Data Model (What Must Stay Consistent)

**Concept** (client-side): static vocab fields + per-modality knowledge/attempt metadata + overall knowledge (weighted average) + paused/selection state.

**Quiz Attempt** (analytics + ML): vocabulary id, question/answer modalities, selected option, correctness, difficulty context, knowledge snapshot. Do not remove fields without migration and analytics review.

---

## Quiz and Knowledge Behavior

### 12 Task Directions
All modality pairs are supported (e.g., `character -> meaning`, `audio -> pinyin`, etc.).

### Knowledge Update Formula
Answer modality gets full update rate; question modality gets partial recognition credit.

Approximate update rates:
- Correct answer modality: +25% of remaining distance to 100
- Incorrect answer modality: -17.5% of current value
- Question modality uses half-strength rates

This asymmetry is intentional and should only change with explicit product decision.

### Quiz Logging Flow
1. User answers.
2. UI shows result.
3. On next question transition, log attempt asynchronously.
4. Support "Don't log" to skip accidental/lucky guesses.

If changing this flow, update analytics expectations and user-facing copy.

### Difficulty and Prediction Guidance
- Difficulty/strategy behavior changes often; treat `src/utils/quiz.ts` as source-of-truth for selection logic.
- Keep README language stable (intent and invariants), and put exact heuristics or scoring formulas in code docstrings.
- If ML predictions affect runtime behavior, document decision boundaries next to implementation and link from README.

---

## Storage, Sync, and Offline Behavior

### Hybrid Persistence
- Local: browser `localStorage` for immediate state and preferences.
- Cloud: Supabase for signed-in users and cross-device persistence.

Typical local keys include:
- progress state
- settings
- cache/sync flags
- vocabulary page preferences

### Auto Sync Behavior
- Debounced sync after quiz actions.
- Immediate sync on hide/unload when possible.
- On startup, cloud state can overwrite stale local cache.

### Offline Mode
- App remains usable with local cache.
- UI indicates offline state.
- Sync resumes when connectivity returns.
- Local offline indicator test path exists via `?offlineTest=1` in local development.

### PWA Push Notifications
Per-device daily reminders via Web Push API.

Architecture:
- `push_subscriptions` table stores per-device VAPID keys, schedule, and timezone.
- `src/lib/pwaReminderService.ts` handles subscribe/unsubscribe/schedule CRUD.
- `supabase/functions/send-reminders/index.ts` is the Edge Function that checks each subscription's local-time schedule and sends push notifications.
- Service worker (`public/sw.js`) handles the `push` event and shows the notification.

Key columns on `push_subscriptions`: `reminder_hour_local`, `reminder_minute_local`, `reminder_timezone`, `last_sent_at`, `is_active`.

Migrations (must both be applied in order):
1. `20260213162000_create_push_subscriptions.sql` — creates the table + RLS policies.
2. `20260213230500_add_push_subscription_schedule.sql` — adds schedule columns (`reminder_timezone`, etc.).

Env: requires `VITE_VAPID_PUBLIC_KEY` (client) and VAPID private key in Supabase Edge Function secrets.

Any sync strategy changes must update this section and `Known Failures`.

---

## Authentication Modes

- Guest: local-only, no cloud sync.
- Signed in: Supabase sync with RLS user isolation.
- Do not silently change mode semantics; this affects data expectations.

---

## Settings and Personalization

### Learning Focus Weights (0-3)
Controls:
1. Relative frequency of quiz task modalities.
2. Study card reveal preference.
3. Weighted overall knowledge score.

Weight meaning: `0` skip, `1` low, `2` medium, `3` high.

### Other User Controls
- cards per session
- theme
- character size
- pinyin style
- TTS voice/rate/auto-play
- quiz difficulty/selection strategy controls
- PWA reminders (per-device local time + timezone, default 4:00 PM)

---

## Pinyin Tab Behavior

Purpose: pronunciation practice using vocab-based exercises.

Two modes:
- **Listen**: audio quiz — plays a random vocab word's audio, user picks the matching pinyin from 6 options.
- **Speak**: self-evaluation — shows pinyin of a random vocab word, user speaks aloud, then taps Play to hear the correct pronunciation and self-rates (Got It / Try Again).

Both modes use the user's known vocabulary words for TTS (same pool as Quiz/Study).

---

## Syntax Tab Behavior

Purpose: grammar and word-order practice using known vocabulary.

Current model:
- template-driven sentence generation (`src/types/syntax.ts`, `src/utils/syntax.ts`)
- bidirectional exercises (reading/writing orientations)
- unlock behavior depends on required vocabulary/roles

If generation logic changes, update both this section and relevant template docs.

If syntax adds LLM-guided feedback or a dedicated quiz mode/tab, keep this section high-level and place prompt/selection/rubric docs in `src/pages/SyntaxPage.tsx` and `src/utils/syntax.ts`.

---

## Script Behavior (Update When Scripts Change)

### NPM Scripts
- `npm run dev`: start Vite dev server.
- `npm run build`: TypeScript build + production bundle.
- `npm run lint`: ESLint checks.
- `npm run preview`: preview built app.

### Content/Vocabulary Extraction Scripts
Located under `content/hsk1/`:
- OCR + structure analysis + correction + extraction utilities for textbook-driven vocab imports.
- Scripts are workflow-oriented and may rely on local environment/API keys.

When modifying extraction scripts:
1. document required env vars and dependencies
2. document changed input/output file names
3. document behavior changes in parsing/correction rules
4. add migration notes if output schema changes

### ML/Analysis Scripts
Key files:
- `analysis/quiz_ml_model.py`
- `analysis/quiz_attempts_data.json`

Use them for model experiments and calibration notes, not runtime quiz correctness.
If feature extraction or target labeling changes, log it in README and mention data compatibility impact.

---

## Database and Migration Safety (Critical)

Historical incident (Feb 2, 2026):
- A migration changed ID references and added a FK path that orphaned/deleted large quiz history.

Never repeat this class of failure.

### Unsafe Patterns (Do Not Do)
- adding FK constraints against remapped IDs without mapping table
- using `ON DELETE CASCADE` on user-history paths without full impact analysis
- destructive table recreation on live user tables

### Required Safety Process
1. Back up production data first.
2. Show exact SQL to user before execution.
3. Explain at-risk tables and blast radius.
4. Wait for explicit user approval.
5. Test on a production-like copy/branch before real run.

### Sensitive Tables
- `quiz_attempts` (history + analytics + ML inputs)
- `user_progress` (current learning state)
- `user_settings` (behavioral preferences)
- `push_subscriptions` (per-device VAPID keys + reminder schedule)

---

## Known Failures and Risk Areas

1. **Past migration data loss** on quiz history (see section above).
2. **Class imbalance in ML data** can overestimate performance if mostly correct answers are logged.
3. **Unsynced local progress risk** if cloud load overwrites stale local state after interrupted sync.
4. **PWA migration not applied (Mar 2026)**: `push_subscriptions` table existed but the second migration (`20260213230500_add_push_subscription_schedule.sql`) adding `reminder_timezone` and schedule columns was never run against production. Caused `column push_subscriptions.reminder_timezone does not exist` errors on any push subscribe/schedule operation. Fix: run the migration SQL in the Supabase Dashboard SQL Editor — it is idempotent (`ADD COLUMN IF NOT EXISTS`). **Lesson**: after adding migration files, always verify they are applied to the live database, not just committed to the repo.

---

## Setup and Local Development

### Install
```bash
git clone https://github.com/avi-otterai/mandarin.git
cd avi-mandarin
npm install
```

### Environment
```bash
cp .env.example .env
```

Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Optional: `VITE_DEV_USER_EMAIL`, `VITE_DEV_USER_PASSWORD`, `VITE_VAPID_PUBLIC_KEY` (PWA reminders).

### Run
```bash
npm run dev
```

---

## Supabase Schema Overview (Conceptual)

Core tables: `vocabulary`, `user_progress`, `quiz_attempts`, `user_settings`, `push_subscriptions`.
RLS expectation: user tables are private; vocabulary is shared reference data.
If schema contracts change, update `src/types/database.ts`, sync services, and README together.

---

## Change Documentation Policy (For Future Agents)

Layers: README (stable contracts, architecture, safety), module docstrings (volatile implementation), script headers (run instructions).
Update README for: user-visible behavior changes, new failure modes, setup/schema/script workflow changes.
Update module docs for: quiz heuristics, ML features/thresholds, syntax templates, layout tweaks.
If unsure, update both briefly and keep README high-level.

---

## Quick Task Routing Cheat Sheet

- "Quiz options are wrong" -> `src/utils/quiz.ts`, `src/pages/QuizPage.tsx`
- "Scores feel off" -> `src/utils/knowledge.ts`, settings weights
- "Sync conflicts" -> `src/lib/syncService.ts`, storage key handling
- "Attempt logs missing" -> `src/lib/quizService.ts`, quiz transition logic
- "Pinyin chart or pronunciation" -> `src/pages/PinyinPage.tsx`, `src/data/pinyinChart.ts`
- "Syntax generation bugs" -> `src/utils/syntax.ts`, `src/types/syntax.ts`, `src/pages/SyntaxPage.tsx`
- "Push notifications broken" -> `src/lib/pwaReminderService.ts`, `supabase/migrations/`, `supabase/functions/send-reminders/`
- "Vocab import issues" -> `content/hsk1/*.py`, vocabulary store ingest path

---

## License

Private use.
