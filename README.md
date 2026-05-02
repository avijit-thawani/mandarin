# Saras - Mandarin Learning App

React + TypeScript web app for learning Mandarin with adaptive quiz practice, modality-level tracking, and cloud sync.

---

## Agent Operating Instructions (Read First)

Future agents: this file is intentionally operational. It is the first map for where to edit code safely.

1. Always read `.cursorrules` and `README.md` before making changes.
2. Keep this README at or below **400 lines**. If an edit would exceed 400, rephrase or trim other sections judiciously — never just append.
3. **Only update README for major changes** (new features, new failure modes, architecture shifts, schema changes). Do not update it for minor bug fixes, style tweaks, or tuning knob adjustments.
4. If any section feels outdated or uncertain, suggest updates to the user before large changes.
5. Keep README focused on stable contracts and architecture, not fast-changing tuning details.
6. Document known failures/incidents and any mitigation steps.
7. When scripts change (build, data extraction, sync tooling, ML analysis), update the "Script Behavior" section.
8. Never run risky DB migrations without explicit user confirmation and backup strategy.
9. For volatile logic, update nearby module docs/docstrings first, then update README pointers.
10. If a user request introduces uncertainty, propose doc updates in the same PR/task.

### MCP Supabase Access Policy

Two Supabase MCP servers are configured (in `~/.cursor/mcp.json`):

- **`supabase-read`** (`?read_only=true`): Server-side read-only mode. Safe for autonomous use — mutations are rejected by the Supabase MCP server itself. **Allowlist this server's `execute_sql` tool** in Cursor's tool approval settings so agents can run SELECT queries without manual confirmation. Use this for data exploration, ML data exports, debugging, and schema inspection.
- **`supabase-admin`**: Full read/write access. **Always require explicit user approval.** Never allowlist write-capable tools (`execute_sql`, `apply_migration`, `deploy_edge_function`, etc.) from this server.

Future agents: prefer `supabase-read` for all read operations. Only escalate to `supabase-admin` when you need to write data, and always get user approval first (see "Database and Migration Safety" below).

### Communicating with the User

When discussing vocabulary, corrections, or changes with the user:

- Use **pinyin** as the default way to reference Chinese words (e.g. "nǚ'ér" not "daughter").
- Use **hanzi** only when characters are needed to disambiguate (e.g. 的/地/得 all read "de").
- Use **English** for everything else (explanations, technical discussion, UI labels).
- Do not default to hanzi-heavy output — the user is a learner, not a native speaker.

---

## Product Goals and Core Rules

### Learning Philosophy

- Keep users around a ~70-80% quiz success range.
- Track knowledge per modality: `character`, `pinyin`, `meaning`, `audio`.
- Reward recovery: wrong answers reduce score less than correct answers increase it.
- Show progress clearly (overall + per modality).

### Critical Concept: Known vs Unknown Words

Binary categories only:


| Status  | Checkbox  | In Revise/Quiz Pool |
| ------- | --------- | ------------------- |
| Known   | Checked   | Yes                 |
| Unknown | Unchecked | No                  |


This is the primary anti-overwhelm mechanism. Do not silently alter this behavior.

---

## App Surfaces and Where to Edit

### Main Tabs

- `Vocabulary`: browse words, toggle known/unknown. Filterable by chapter and part of speech (PoS). "For today" buttons let you send a filtered subset to Quiz/Study as a temporary session filter.
- `Study`: passive flashcards (self-paced). Supports temporary "for today" filters set from the Vocab page.
- `Quiz`: active MCQ + syntax tile-ordering exercises + scoring + attempt logging. Syntax exercises are interleaved based on the Syntax Frequency setting (0-3). Supports temporary "for today" filters set from the Vocab page.
- `Pinyin`: pronunciation practice with listen-and-pick quiz and speak-and-check self-evaluation.
- `Chat`: LLM tutor (Claude via Netlify Function). Can add/pause/delete vocabulary words via tool calling.
- `Profile`: progress charts + settings.

### High-Value Files

- `src/App.tsx`: app composition and top-level routing, streak wiring.
- `src/components/Navbar.tsx`: tab navigation + global streak badge.
- `src/pages/ProfilePage.tsx`: progress dashboard, streak recovery, and all settings.
- `src/hooks/useStreak.ts`: streak calculation (pure computation from quiz_attempts + cardsPerSession).
- `src/pages/VocabularyPage.tsx`: vocabulary list, filters, toggle flow.
- `src/pages/StudyPage.tsx`: flashcard behavior.
- `src/pages/QuizPage.tsx`: question lifecycle, mixed MCQ + syntax session, correctness UI (post-answer: all options reveal full character/pinyin/meaning), logging controls.
- `src/components/SyntaxExerciseCard.tsx`: tile-reordering syntax exercise UI (used inline in Quiz).
- `src/pages/PinyinPage.tsx`: pinyin chart reference + listen/speak practice modes.
- `src/data/pinyinChart.ts`: complete pinyin syllable grid data and character-to-TTS mapping.
- `src/pages/ChatPage.tsx`: LLM tutor chat UI (useChat hook, tool rendering, vocab context injection).
- `netlify/functions/chat.mts`: Netlify Function — streamText with Anthropic Claude, 4 vocabulary tools.
- `src/pages/ProfilePage.tsx`: dashboard/settings entry.

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

High-churn: `QuizPage`, `quiz.ts`, settings stores, `SyntaxExerciseCard`/`syntax.ts`, ML scripts, `App.tsx`/`Navbar`.
Stable contracts: known/unknown semantics, modality model, sync guarantees, migration safety.
Experimental behavior → module-level docs first, README at principle level.

---

## Data Model (What Must Stay Consistent)

### Vocabulary Data Flow (READ THIS BEFORE TOUCHING VOCAB)

**Supabase `vocabulary` table is the single source of truth.** `src/data/hsk1_vocabulary.json` is kept for reference/scripts but is NOT imported at runtime.

1. On login, `loadFromCloud` fetches `user_progress JOIN vocabulary` (including `category` column).
2. localStorage caches concepts for instant boot; Supabase overwrites stale cache.
3. Custom words (added via Chat tab) use `source: 'chat'` and are first-class — they work in Quiz, Study, Syntax, and Vocab identically to HSK1 words.

**To add new vocabulary:**

- Insert into Supabase `vocabulary` table (required: `word`, `pinyin`, `part_of_speech`, `meaning`, `chapter`, `source`, `category`).
- Users can also add words via the Chat tab (stored as `source: 'chat'`).

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
- **Synonym disambiguation**: words that share similar English meanings (e.g., 但是/可是 "but", 会/能 "can", 按/照 "according to", 儿/儿子 "son", 小/些/一点儿/少 "small/some/a little/few") have differentiated glosses with parenthetical context hints (formal/casual, size vs quantity, diminutive suffix vs standalone noun, etc.) so each meaning is unique and quiz collisions are avoided. Collision detection in `hasCollision` is exact-string match on the answer-modality value, so disambiguation must happen in the content/gloss, not the code.

---

## Storage, Sync, and Offline Behavior

### Hybrid Persistence

Local: `localStorage` for immediate state/preferences. Cloud: Supabase for signed-in users. Notable local key: `langseed_quiz_completed` (daily flag). Streak is computed purely from `quiz_attempts`.

### Sync and Offline

Debounced sync after quiz actions; immediate on hide/unload. Cloud can overwrite stale local cache on startup. App works offline with local cache; sync resumes on reconnect. Test offline mode: `?offlineTest=1`.

### PWA Caching

`netlify.toml` sets no-cache on `index.html`/`sw.js`/`manifest.webmanifest`; hashed assets cached forever. SW uses network-first for navigation. Auto-reloads on new SW version. Bump `SW_VERSION` in `public/sw.js` for SW behavior changes.

### PWA Push Notifications

Per-device daily reminders via Web Push API. Key files: `pwaReminderService.ts` (client CRUD + SW updates), `supabase/functions/send-reminders/index.ts` (Edge Function), `public/sw.js` (push/click/withdraw handlers). Auto-withdraw on quiz completion via `clearNotifications()`.

Key table: `push_subscriptions` (`reminder_hour_local`, `reminder_minute_local`, `reminder_timezone`, `last_sent_at`, `is_active`).

Migrations (apply in order): `20260213162000` (table + RLS), `20260213230500` (schedule columns), `20260324120000` (pg_cron + pg_net). Cron calls Edge Function every 5 min via service role key in Vault. Verify: `select * from cron.job;`

**Critical mobile settings:** `TTL: 14400` + `urgency: 'high'` (short TTL / default urgency = silent drops). Test sends use `last_tested_at` to avoid blocking scheduled sends.

Env: `VITE_VAPID_PUBLIC_KEY` (client), `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (Edge Function secrets).

**iOS:** Requires 16.4+, must install PWA to home screen (not Safari tab), subscriptions expire after ~2 weeks of non-use. EU iOS 17.4+ may block standalone PWA (DMA).

Any sync strategy changes must update this section and `Known Failures`.

---

## Authentication

All users must sign in via Supabase. Guest mode has been removed. RLS ensures user isolation.
| "Restore (111)" baseline button | Shown (111-word curated set) | Hidden |


---

## Settings and Personalization

### Learning Focus Weights (0-3)

Controls:

1. Relative frequency of quiz task modalities.
2. Study card reveal preference.
3. Weighted overall knowledge score.

Weight meaning: `0` skip, `1` low, `2` medium, `3` high.

### Syntax Frequency (0-3)

Controls how many quiz questions are syntax tile-ordering exercises vs MCQ. Same scale: `0` skip, `1` low (~20%), `2` medium (~35%), `3` high (~50%). Gracefully degrades to all MCQ if vocab doesn't satisfy any template.

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

Pronunciation practice using known vocab words. **Listen**: audio quiz with 6 pinyin options. **Speak**: self-evaluation — see pinyin, speak, compare with TTS, self-rate.

---

## Syntax (Integrated into Quiz)

Syntax exercises are now mixed into each quiz session (no separate tab). Controlled by `syntax.frequency` setting (0-3: Skip/Low/Med/High) — maps to 0%/20%/35%/50% of quiz questions being syntax. Falls back to all MCQ if the user's known vocab doesn't satisfy any template.

Template-driven grammar/word-order practice using known vocabulary (~130 templates). Covers HSK1 chapters 3–15 grammar at three levels (L1: basic SVO/是/有/很/不/请/的; L2: questions, negation, modals, adverbs, progressive, completion; L3: time expressions, past tense, 是...的 emphasis). See `src/utils/syntax.ts` for full grammar catalog.

**Exercise format**: tile reordering (no distractors). EN→CN shows English prompt, user arranges Chinese tiles. CN→EN shows Chinese, English tiles are lowercase-shuffled to prevent capitalization-based guessing. Verb conjugation auto-adjusts for subject person.

**Slot filling**: words fill template slots via `SEMANTIC_CATEGORIES` + `VOCAB_CATEGORY_TO_SYNTAX`. Only known/unpaused words participate. Verbs, particles, numbers appear only as `fixedWords`. See `src/types/syntax.ts` for details.

**Slot-filter rules (`src/utils/syntax.ts`)**

- `SEMANTIC_CATEGORIES[word]` is **authoritative**. An explicit entry (including `[]`) wins over `VOCAB_CATEGORY_TO_SYNTAX[word.category]`. Use `[]` to block a word from all slots (verbs, interrogatives, single-character morpheme roots like `师/员/者/口/体/儿/室/馆/国/店`, bare directionals `里/外/上/下/前/后`, and HSK1 V-O compounds `吃饭/睡觉/看见` — they remain in vocab quizzes but never appear as sentence subjects/objects).
- `isSlotEligible(word)` rejects `paused`, `source==='compound'`, and `part_of_speech==='phrase'` words so user-added compound study items (`喝水`, `回家`, `几点回家`) never slot in.
- `allFixedWordsKnown(...)` requires every `fixedWord` (verb/particle/negator the template renders verbatim) to also be in the user's known vocab. Without this, zero-slot templates like `how_to_write` (fixedWords `这个/字/怎么/写`) "unlocked" for users who hadn't accepted any of those words — they'd see the same surprise sentence on every refresh. Now the template only counts as available if the user has actually approved every word that will appear.
- English conjugation is data-driven via `THIRD_PERSON_TO_BASE`. Module load runs `validateEnglishPatterns()`; any new template using an unregistered `-s` verb form prints a `console.warn` (e.g. adding "speaks" or "writes" without registering it).
- `您` (formal you) is treated as second-person for English conjugation, alongside `你`.
- Possessive templates (`possessive_book`, `possessive_food`) require `posFilter: ['pronoun']` on the subject, so we never produce "Mr.'s books".

**Local syntax review tooling (gitignored, in `.local-review/`)**: `enumerate-sentences.ts` pulls each user's known vocab from Supabase and writes every possible sentence per template; `classify-findings.ts` buckets the output by issue pattern. Used to drive grammar-rule fixes.

---

## Script Behavior (Update When Scripts Change)

### NPM Scripts

- `npm run dev`: start Vite dev server.
- `npm run build`: TypeScript build + production bundle.
- `npm run lint`: ESLint checks.
- `npm run preview`: preview built app.

### Content/Vocabulary Data

`src/data/hsk1_vocabulary.json` — canonical word list (354 entries). This is the **primary data source** the app reads from (see "Vocabulary Data Flow" above). Ch 1-15: standard HSK1 textbook. Ch 16: advanced function words (particles, prepositions, conjunctions, common verbs, noun morphemes). Negative chapters: compound phrases tied to their positive chapter.

**TTS polyphonic characters**: Browser SpeechSynthesis mispronounces polyphonic characters (多音字) like 了/的/地/得/着. Pre-recorded audio clips (`public/audio/tts/`) are used instead, generated via macOS `say -v Tingting` + ffmpeg. See `STATIC_AUDIO` map in `src/services/ttsService.ts`.

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

1. **Past migration data loss** on quiz history (see DB safety section above).
2. **Class imbalance in ML data** — mostly correct answers can overestimate model performance.
3. **Unsynced local progress risk** — cloud load can overwrite stale local state after interrupted sync.
4. **PWA migration not applied (Mar 2026)** — committed but never run against production. **Lesson**: verify migrations hit the live DB.
5. **PWA cron trigger missing (Mar 2026)** — Edge Function existed but no pg_cron job called it. **Lesson**: wire up invocation, not just deploy.
6. **PWA push dropped on mobile (Mar 2026)** — short TTL + default urgency = silent drops in Doze. **Lesson**: use `TTL: 14400` + `urgency: 'high'`.
7. **Streak showed 0 (Apr 2026)** — Supabase `max_rows` silently truncated `.limit(10000)`. **Lesson**: always paginate with `.range()` for >1000 rows.

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

Layers: README (stable contracts, architecture, safety), module docstrings (volatile implementation), script headers (run instructions). Update README for user-visible behavior, new failures, setup/schema changes. Update module docs for quiz heuristics, ML thresholds, syntax templates.

## Quick Task Routing Cheat Sheet

- "Quiz options are wrong" -> `src/utils/quiz.ts`, `src/pages/QuizPage.tsx`
- "Scores feel off" -> `src/utils/knowledge.ts`, settings weights
- "Sync conflicts" -> `src/lib/syncService.ts`, storage key handling
- "Attempt logs missing" -> `src/lib/quizService.ts`, quiz transition logic
- "Pinyin chart or pronunciation" -> `src/pages/PinyinPage.tsx`, `src/data/pinyinChart.ts`
- "TTS mispronounces a word" -> `src/services/ttsService.ts` (known polyphonic limitation, no fix yet)
- "Syntax generation bugs" -> `src/utils/syntax.ts`, `src/types/syntax.ts`, `src/components/SyntaxExerciseCard.tsx`
- "Push notifications broken" -> `src/lib/pwaReminderService.ts`, `supabase/migrations/`, `supabase/functions/send-reminders/`
- "Streak/recovery issues" -> `src/hooks/useStreak.ts`, `src/pages/ProfilePage.tsx`, `src/components/Navbar.tsx`
- "Vocab import issues" -> `content/hsk1/*.py`, vocabulary store ingest path

---

## License

Private use.