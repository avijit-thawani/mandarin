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
- `Vocabulary`: import/browse words, toggle known/unknown. Filterable by chapter and part of speech (PoS). "For today" buttons let you send a filtered subset to Quiz/Study as a temporary session filter.
- `Study`: passive flashcards (self-paced). Supports temporary "for today" filters set from the Vocab page.
- `Quiz`: active MCQ + scoring + attempt logging. Supports temporary "for today" filters set from the Vocab page.
- `Pinyin`: pronunciation practice with listen-and-pick quiz and speak-and-check self-evaluation.
- `Syntax`: sentence construction practice.
- `Profile`: progress charts + settings.

### High-Value Files
- `src/App.tsx`: app composition and top-level routing, streak wiring.
- `src/components/Navbar.tsx`: tab navigation + global streak badge.
- `src/pages/ProfilePage.tsx`: progress dashboard, streak recovery, and all settings.
- `src/hooks/useStreak.ts`: streak calculation (pure computation from quiz_attempts + cardsPerSession).
- `src/pages/VocabularyPage.tsx`: vocabulary list, filters, toggle flow.
- `src/pages/StudyPage.tsx`: flashcard behavior.
- `src/pages/QuizPage.tsx`: question lifecycle, correctness UI (post-answer: all options reveal full character/pinyin/meaning), logging controls.
- `src/pages/PinyinPage.tsx`: pinyin chart reference + listen/speak practice modes.
- `src/data/pinyinChart.ts`: complete pinyin syllable grid data and character-to-TTS mapping.
- `src/pages/SyntaxPage.tsx`: sentence construction and grammar practice.
- `src/pages/ProfilePage.tsx`: dashboard/settings entry.
- `src/pages/SettingsPage.tsx`: user preferences.

### State and Domain Logic
- `src/stores/vocabularyStore.ts`: concept state and vocabulary lifecycle.
- `src/stores/settingsStore.ts`: focus weights, UI and quiz settings.
- `src/stores/todayFilterStore.ts`: ephemeral in-memory filter (PoS/chapter) for temporary quiz/study sessions. Resets on page refresh.
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

**Concept** (client-side): static vocab fields (including semantic `category`) + per-modality knowledge/attempt metadata + overall knowledge (weighted average) + paused/selection state.

**Quiz Attempt** (analytics + ML): vocabulary id, question/answer modalities, selected option, correctness, difficulty context, knowledge snapshot. Do not remove fields without migration and analytics review.

---

## Quiz and Knowledge Behavior

### 12 Task Directions
All modality pairs are supported (e.g., `character -> meaning`, `audio -> pinyin`, etc.).
**Trivial pair penalty**: `pinyin ↔ audio` directions receive a 95% weight reduction because pinyin directly encodes pronunciation, making these questions trivially easy.

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

### Distractor Selection
MCQ distractors are scored by multiple signals (see `selectDistractors` in `quiz.ts`):
- **Semantic category** (`category` field in vocabulary JSON): same-category words are strongly preferred in hard/expert mode (e.g., 爸爸 draws 妈妈/儿子, not 桌子/学校).
- **Character structure**: words with matching repetition patterns (AA like 爸爸/妈妈/谢谢) are preferred as distractors for each other, preventing the "spot the doubled character" shortcut.
- POS match, chapter proximity, word length, pinyin similarity, knowledge proximity (expert).
- Easy mode inverts most signals to make wrong answers obviously different.
- **Synonym disambiguation**: words that share similar English meanings (e.g., 但是/可是 "but", 会/能 "can", 按/照 "according to") have differentiated glosses with parenthetical context hints (formal/casual, learned skill/permission, etc.) so each meaning is unique and quiz collisions are avoided.

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
- `langseed_quiz_completed`: daily quiz completion flag
- (streak is now computed purely from quiz_attempts — no localStorage needed)

### Auto Sync Behavior
- Debounced sync after quiz actions.
- Immediate sync on hide/unload when possible.
- On startup, cloud state can overwrite stale local cache.

### Offline Mode
- App remains usable with local cache.
- UI indicates offline state.
- Sync resumes when connectivity returns.
- Local offline indicator test path exists via `?offlineTest=1` in local development.

### PWA Caching and Updates
- `netlify.toml` sets `Cache-Control: no-cache` on `index.html`, `sw.js`, and `manifest.webmanifest` so the installed PWA always revalidates. Hashed assets under `/assets/*` are cached forever (`immutable`).
- Service worker (`public/sw.js`) uses **network-first** for navigation requests — always fetches fresh HTML when online, falls back to cache offline.
- `pwaReminderService.ts` listens for SW updates and **auto-reloads** the page when a new version is installed.
- Bump `SW_VERSION` in `public/sw.js` on any deploy that changes SW behavior (Vite asset hashes change `index.html` automatically).

### PWA Push Notifications
Per-device daily reminders via Web Push API.

Architecture:
- `push_subscriptions` table stores per-device VAPID keys, schedule, and timezone.
- `src/lib/pwaReminderService.ts` handles subscribe/unsubscribe/schedule CRUD + SW update detection + notification withdrawal.
- `supabase/functions/send-reminders/index.ts` is the Edge Function that checks each subscription's local-time schedule and sends push notifications.
- Service worker (`public/sw.js`) handles `push` (show), `notificationclick` (open app), and `message` (withdraw) events. Notifications use a `tag` so withdrawal targets only reminders.
- **Auto-withdraw**: when the user completes a quiz (streak activity), `App.tsx` calls `clearNotifications()` to dismiss any visible reminder. Profile page has a manual "Withdraw" button for testing.

Key columns on `push_subscriptions`: `reminder_hour_local`, `reminder_minute_local`, `reminder_timezone`, `last_sent_at`, `is_active`.

Migrations (must all be applied in order):
1. `20260213162000_create_push_subscriptions.sql` — creates the table + RLS policies.
2. `20260213230500_add_push_subscription_schedule.sql` — adds schedule columns (`reminder_timezone`, etc.).
3. `20260324120000_add_reminder_cron.sql` — enables `pg_cron` + `pg_net` extensions.

**Cron setup (already applied):**
`pg_cron` calls the Edge Function every 5 min (testing; switch to hourly for prod). Auth uses the service role key stored in Supabase Vault (`vault.decrypted_secrets` name `service_role_key`), passed as `Authorization: Bearer`. The Edge Function accepts service role key, cron secret, or user JWT.

Verify: `select * from cron.job;` / `select * from cron.job_run_details order by start_time desc limit 5;`

**Push delivery settings (critical for mobile):**
- `TTL: 14400` (4 hours) — FCM retains the message if the device is in Doze mode. A short TTL (e.g. 60s) causes silent drops.
- `urgency: 'high'` — tells FCM to deliver immediately, bypassing Android battery optimization batching.
- `last_sent_at` vs `last_tested_at` — test sends (`force: true`) write to `last_tested_at` so they never block scheduled sends.
- Schedule changes same-day: if the user moves their reminder to a later time, the guard compares `last_sent_at` against the new target time, not just the date, so re-sends are allowed.

Env: requires `VITE_VAPID_PUBLIC_KEY` (client) and `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` as Edge Function secrets.

**iOS/Safari testing (critical checklist):**
1. Requires **iOS 16.4+** (ideally 18.1.1+ for notification click handling).
2. Must **install PWA to home screen** first (Safari share sheet > Add to Home Screen). Push does NOT work in a Safari tab.
3. Open the installed app, sign in, go to Profile > Enable Reminders, grant notification permission.
4. Send a test notification to verify delivery.
5. Set a scheduled time and keep the app closed (fully swipe away) to test background delivery.
6. **EU users on iOS 17.4+** may be blocked — Apple removed standalone PWA mode in EU under DMA.
7. Push subscriptions on iOS can "disappear" after 1-2 weeks of non-use; user must re-enable.
8. Edge Function logs include `provider: "apple"` vs `"fcm"` in `pushResults` for diagnostics.

Any sync strategy changes must update this section and `Known Failures`.

---

## Authentication Modes

- Guest: local-only, no cloud sync.
- Signed in: Supabase sync with RLS user isolation.
- Do not silently change mode semantics; this affects data expectations.

### User Aliases
| Alias | Email | Notes |
|-------|-------|-------|
| niyati | niyatibafna13@gmail.com | Second user account |

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

Pronunciation practice using known vocab words. **Listen** mode: audio quiz with 6 pinyin options. **Speak** mode: self-evaluation — see pinyin, speak, compare with TTS, self-rate.

---

## Syntax Tab Behavior

Template-driven grammar/word-order practice using known vocabulary. Levels: L1 basic SVO + 在/很, L2 questions/negation/want/prepositions, L3 time expressions. See `src/types/syntax.ts` and `src/utils/syntax.ts` for template details. If generation logic changes, update both template code and this section.

---

## Script Behavior (Update When Scripts Change)

### NPM Scripts
- `npm run dev`: start Vite dev server.
- `npm run build`: TypeScript build + production bundle.
- `npm run lint`: ESLint checks.
- `npm run preview`: preview built app.

### Content/Vocabulary Data
`src/data/hsk1_vocabulary.json` — canonical word list (348 entries). Ch 1-15: standard HSK1 textbook. Ch 16: advanced function words (particles, prepositions, conjunctions, common verbs, noun morphemes). Negative chapters: compound phrases tied to their positive chapter.

**TTS polyphonic overrides**: When adding single-character vocabulary that is a polyphonic character (多音字), check whether browser TTS will default to the wrong reading. If so, add an entry to `TTS_OVERRIDES` in `src/services/ttsService.ts`. Current overrides: 了的地得着过个. Only needed for single characters whose standalone TTS reading differs from the intended pronunciation (multi-character words get enough context for TTS to disambiguate).

Extraction scripts under `content/hsk1/`: OCR + extraction utilities for textbook-driven vocab imports.

### ML/Analysis Scripts
`analysis/quiz_ml_model.py` — offline model predicting quiz correctness from context features. Not runtime. Data in `analysis/quiz_attempts_data.json` (gitignored). Export via MCP Supabase read or Python client (see script docstring).

**v2 (Apr 2026):** 26 features (was 11), including `knowledge_before`, modality pair one-hot encoding, individual user averages, per-concept attempt number. Models: Logistic Regression, Random Forest, HistGradientBoostingClassifier + isotonic calibration. Evaluation via stratified 5-fold CV. Best calibration: Brier 0.066 (HGB+Cal). Best discrimination: ROC-AUC 0.844 (LR). Log feature/label changes here.

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
4. **PWA migration not applied (Mar 2026)**: migration adding `reminder_timezone` columns was committed but never run against production → `column does not exist` errors. Fix: run migration SQL in Dashboard SQL Editor. **Lesson**: verify migrations are applied to the live DB, not just committed.
5. **PWA cron trigger missing (Mar 2026)**: Edge Function existed and test notifications worked (`force: true`), but no `pg_cron` job was calling it on a schedule, so scheduled reminders never fired. Fix: set up `pg_cron` + `pg_net` to POST to the function every 10 min (see PWA Push Notifications section). **Lesson**: an Edge Function without a trigger is dead code — always wire up the invocation mechanism.
6. **PWA push dropped on mobile (Mar 2026)**: server sent successfully (FCM 201) but phone never displayed the notification. Root cause: `TTL: 60` (seconds) meant FCM silently dropped the message if the device was in Doze mode; missing `urgency: 'high'` let Android batch/delay delivery indefinitely. Fix: set `TTL: 14400` and `urgency: 'high'`. **Lesson**: always use high urgency + long TTL for user-facing push — short TTL + default urgency is only safe for devices that are always awake.
7. **Streak showed 0 despite quiz data (Apr 2026)**: `getQuizStats` used `.limit(10000)` but Supabase's server-side `max_rows` (typically 1000) silently truncated the response. With 1747+ rows, the oldest 1000 were returned and recent days were missing, so streak computed as 0. Fix: paginate using `.range()` in a loop until all rows are fetched. **Lesson**: Supabase `.limit(N)` does NOT override the server's `max_rows` config — always paginate queries that may exceed 1000 rows, or use `.range()` with a fetch loop.

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
- "TTS mispronounces a word" -> `src/services/ttsService.ts` `TTS_OVERRIDES` map
- "Syntax generation bugs" -> `src/utils/syntax.ts`, `src/types/syntax.ts`, `src/pages/SyntaxPage.tsx`
- "Push notifications broken" -> `src/lib/pwaReminderService.ts`, `supabase/migrations/`, `supabase/functions/send-reminders/`
- "Streak/recovery issues" -> `src/hooks/useStreak.ts`, `src/pages/ProfilePage.tsx`, `src/components/Navbar.tsx`
- "Vocab import issues" -> `content/hsk1/*.py`, vocabulary store ingest path

---

## License

Private use.
