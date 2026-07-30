# Saras - Mandarin Learning App

React + TypeScript web app for learning Mandarin with adaptive quiz practice, modality-level tracking, and cloud sync.

---

## Agent Operating Instructions (Read First)

Future agents: this file is intentionally operational. It is the first map for where to edit code safely.

1. Always read `.cursorrules` and `README.md` before making changes.
2. Keep this README at or below **400 lines**. If an edit would exceed 400, rephrase or trim other sections judiciously — never just append.
3. **Only update README for major changes** (new features, new failure modes, architecture shifts, schema changes) — not minor bug fixes, style tweaks, or tuning knobs. Docs are layered: README holds stable contracts, architecture, and safety; module docstrings hold volatile implementation (quiz heuristics, ML thresholds, syntax templates); script headers hold run instructions. Update the lowest layer that fits, then README pointers. If a section feels outdated, propose doc updates in the same task.
4. Document known failures/incidents and any mitigation steps. When scripts change (build, data extraction, sync tooling, ML analysis), update "Script Behavior".
5. Never run risky DB migrations without explicit user confirmation and backup strategy.
6. All new UI follows "UI and Interaction Design" by default — chunky buttons, entrance animations, haptics, semantic color, and zero layout shift. It is a contract, not a style suggestion.

### MCP Supabase Access Policy

Two Supabase MCP servers are configured (in `~/.cursor/mcp.json`):

- **`supabase-read`** (`?read_only=true`): mutations are rejected server-side, so it is safe for autonomous use. Prefer it for all reads — exploration, ML exports, debugging, schema inspection. Its `execute_sql` is safe to allowlist in Cursor.
- **`supabase-admin`**: full read/write. **Always require explicit user approval** and never allowlist its write tools (`execute_sql`, `apply_migration`, `deploy_edge_function`). Escalate here only to write data (see "Database and Migration Safety").

### Communicating with the User

Reference Chinese words by **pinyin** by default (e.g. "nǚ'ér" not "daughter"), using **hanzi** only to disambiguate (的/地/得 all read "de"). Everything else in **English**. The user is a learner — do not default to hanzi-heavy output.

---

## Product Goals and Core Rules

### Learning Philosophy

Keep users around a ~70-80% quiz success range. Track knowledge per modality (`character`, `pinyin`, `meaning`, `audio`). Reward recovery: wrong answers reduce score less than correct answers increase it. Show progress clearly (overall + per modality).

### Critical Concept: Known vs Unknown Words

Binary categories only: **known** (checkbox checked) is in the Revise/Quiz pool, **unknown** (unchecked) is not. Stored as `user_progress.paused` — `!paused` is the pool. This is the primary anti-overwhelm mechanism. Do not silently alter this behavior.

---

## App Surfaces and Where to Edit

### Main Tabs

- `Vocabulary`: browse words, toggle known/unknown. Filterable by chapter and part of speech (PoS). "For today" buttons let you send a filtered subset to Quiz/Study as a temporary session filter.
- `Study`: passive flashcards (self-paced). Supports temporary "for today" filters set from the Vocab page.
- `Quiz`: active MCQ + syntax tile-ordering exercises + LLM trivia interstitials + scoring + attempt logging. Syntax exercises are interleaved based on the Syntax Frequency setting (0-3). Supports temporary "for today" filters set from the Vocab page.
- `Pinyin`: pronunciation practice on known vocab. **Listen** = audio quiz with 6 pinyin options; **Speak** = see pinyin, speak, compare with TTS, self-rate.
- `Chat`: LLM tutor (Claude via Netlify Function). Can add/pause/delete vocabulary words via tool calling. Assistant replies render GitHub-flavored markdown, including tables (useful for pinyin/meaning lists) — wide tables scroll horizontally. Threads persist to Supabase and are reopenable from a history drawer.
- `Profile`: progress charts + settings.

**Hidden dev routes** (not in the navbar): `/mascot` renders every Saras pose/gesture for tuning; `/trivia` generates trivia cards on demand without playing a quiz. Both are prototyping harnesses, not user surfaces.

### High-Value Files

- `src/App.tsx`: app composition and top-level routing, streak wiring.
- `src/components/Navbar.tsx`: tab navigation + global streak badge.
- `src/pages/ProfilePage.tsx`: progress dashboard, streak recovery, and all settings.
- `src/hooks/useStreak.ts`: streak calculation (from quiz_attempts + per-day goal via `src/lib/streakGoal.ts`).
- `src/lib/streakGoal.ts`: per-day streak goal + the streak engine (`computeStreak`).
  - **Per-day goal**: the goal stored in `daily_goals` if present, else inferred by "always pick the larger candidate goal {50,30,20}" so lowering the daily setting can never retroactively inflate a streak.
  - **Carry-forward banking**: extra goals completed in a day bank "freezes" that carry forward chronologically and cover later missed days (unlimited).
  - **Recovery**: a streak-breaking miss (empty bank) stays recoverable for `RECOVERY_WINDOW` (20) days — extra quizzes beyond the daily goal pay off the gap and reconnect the prior run. Only offered when a real prior streak exists. `computeStreak` reports `recoverableStreak` and `quizzesNeeded`; Profile renders this as "do N quizzes today".
- `src/pages/VocabularyPage.tsx`: vocabulary list, filters, toggle flow.
- `src/pages/StudyPage.tsx`: flashcard behavior.
- `src/pages/QuizPage.tsx`: question lifecycle, mixed MCQ + syntax session, correctness UI (post-answer: all options reveal full character/pinyin/meaning), logging controls.
- `src/components/SyntaxExerciseCard.tsx`: tile-reordering syntax exercise UI (used inline in Quiz).
- `src/pages/PinyinPage.tsx`: pinyin chart reference + listen/speak practice modes.
- `src/data/pinyinChart.ts`: complete pinyin syllable grid data and character-to-TTS mapping.
- `src/pages/ChatPage.tsx`: LLM tutor chat UI (useChat hook, tool rendering, vocab context injection, `MessageMarkdown` renderer with `remark-gfm` tables).
- `src/components/ChatHistoryDrawer.tsx` + `src/lib/chatHistoryService.ts`: conversation list, load/rename/delete, thread persistence.
- `src/components/TriviaCard.tsx` + `src/lib/triviaService.ts`: trivia card UI and fetch/rank client (see "Trivia Cards").
- `netlify/functions/chat.ts`: Netlify Function — streamText, 4 vocabulary tools.
- `netlify/functions/trivia.ts`: Netlify Function — generateObject for trivia generation + ranking.
- `netlify/functions/_model.ts`: shared provider selection for both functions (see "LLM Provider").

### State and Domain Logic

- `src/stores/vocabularyStore.ts`: concept state and vocabulary lifecycle.
- `src/stores/settingsStore.ts`: focus weights, UI and quiz settings, theme pinning.
- `src/stores/todayFilterStore.ts`: ephemeral in-memory filter (PoS/chapter) for temporary quiz/study sessions. Resets on page refresh.
- `src/utils/knowledge.ts`: knowledge update math. `src/utils/quiz.ts`: question selection and option generation. `src/utils/syntax.ts`: template-driven sentence generation.
- `src/services/ttsService.ts`: speech playback. `src/services/hapticService.ts`: vibration feedback patterns (see "UI and Interaction Design").

### Cloud/Sync Layer

- `src/lib/supabase.ts`: Supabase client. `src/lib/syncService.ts`: sync orchestration.
- `src/lib/quizService.ts`: quiz attempt writes and related persistence.
- `src/lib/pwaReminderService.ts`: push subscription CRUD, schedule read/write, enable/disable.
- `src/types/database.ts`: DB schema typing contracts.

---

## Change Velocity Map

High-churn: `QuizPage`, `quiz.ts`, settings stores, `SyntaxExerciseCard`/`syntax.ts`, ML scripts, `App.tsx`/`Navbar`. Stable contracts: known/unknown semantics, modality model, sync guarantees, migration safety, UI interaction defaults. Experimental behavior → module docs first, README at principle level.

---

## Data Model (What Must Stay Consistent)

### Vocabulary Data Flow (READ THIS BEFORE TOUCHING VOCAB)

**Supabase `vocabulary` table is the single source of truth.** `src/data/hsk1_vocabulary.json` is kept for reference/scripts but is NOT imported at runtime.

On login, `loadFromCloud` fetches `user_progress JOIN vocabulary` (including `category`). localStorage caches concepts for instant boot; Supabase overwrites stale cache. Custom words use `source: 'chat'` and are first-class — they work in Quiz, Study, Syntax, and Vocab identically to HSK1 words.

**To add new vocabulary:** insert into the Supabase `vocabulary` table (required: `word`, `pinyin`, `part_of_speech`, `meaning`, `chapter`, `source`, `category`). Users can also add words via the Chat tab or a Trivia card suggestion (stored as `source: 'chat'`).

**Concept** (client-side): static vocab fields (including semantic `category`) + per-modality knowledge/attempt metadata + overall knowledge (weighted average) + paused/selection state.

**Quiz Attempt** (analytics + ML): vocabulary id, question/answer modalities, selected option, correctness, difficulty context, knowledge snapshot. Do not remove fields without migration and analytics review.

---

## Quiz and Knowledge Behavior

### 12 Task Directions

All modality pairs are supported (e.g., `character -> meaning`, `audio -> pinyin`). **Trivial pair penalty**: `pinyin ↔ audio` directions get a 95% weight reduction because pinyin directly encodes pronunciation.

### Knowledge Update Formula

Answer modality gets the full update rate, question modality partial recognition credit (half-strength). Correct: +25% of the remaining distance to 100. Incorrect: −17.5% of current value. The asymmetry rewards recovery and should only change with an explicit product decision.

### Quiz Logging Flow

User answers, the UI shows the result, and the attempt logs asynchronously on the next-question transition. "Don't log" skips accidental/lucky guesses. If changing this flow, update analytics expectations and user-facing copy.

### Difficulty and Prediction Guidance

- A single **Difficulty** control (easy/hard/expert, set in Profile → Quiz Settings) drives both distractor trickiness AND word selection. All levels use 4 options. `easy` quizzes a random mix; `hard`/`expert` target weak & stale words (`selectionForDifficulty` in `quiz.ts`) to keep accuracy in the ~70-80% band even with few cards/day. There is no separate manual "question selection" control.
- **Selection-time knowledge decay**: `effectiveKnowledge` in `knowledge.ts` virtually fades stale "mastered" words toward a floor (default ~1.5 pts/idle day, floor 40) so they resurface in hard/expert selection. This decay is NOT persisted — it never writes to `user_progress`, only influences which words are picked.
- Difficulty/strategy behavior changes often; treat `src/utils/quiz.ts` as source-of-truth. Keep README to intent and invariants; put exact heuristics, scoring formulas, and ML decision boundaries in code docstrings next to the implementation.

### Distractor Selection

MCQ distractors are scored by multiple signals (see `selectDistractors` in `quiz.ts`):

- **Semantic category** (`category` field in vocabulary JSON): same-category words are strongly preferred in hard/expert mode (e.g., 爸爸 draws 妈妈/儿子, not 桌子/学校).
- **Character structure**: words with matching repetition patterns (AA like 爸爸/妈妈/谢谢) are preferred as distractors for each other, preventing the "spot the doubled character" shortcut.
- POS match, chapter proximity, word length, pinyin similarity, knowledge proximity (expert). All difficulties use 4 options. Easy mode inverts most signals to make wrong answers obviously different.
- **Synonym disambiguation**: words sharing an English meaning (但是/可是 "but", 会/能 "can", 儿/儿子 "son", 小/些/一点儿/少) carry differentiated glosses with parenthetical hints (formal/casual, size vs quantity, suffix vs standalone noun) so each meaning is unique. `hasCollision` is exact-string match on the answer-modality value, so disambiguation must happen in the gloss, not the code.

---

## Storage, Sync, and Offline Behavior

### Hybrid Persistence, Sync, and Offline

Local: `localStorage` for immediate state/preferences. Cloud: Supabase for signed-in users. Notable local key: `langseed_quiz_completed` (daily flag). Streak is computed purely from `quiz_attempts`. Debounced sync after quiz actions; immediate on hide/unload. Cloud can overwrite stale local cache on startup. App works offline with local cache; sync resumes on reconnect. Test offline mode: `?offlineTest=1`.

### PWA Caching

`netlify.toml` sets no-cache on `index.html`/`sw.js`/`manifest.webmanifest`; hashed assets cached forever. SW uses network-first for navigation. Auto-reloads on new SW version. Bump `SW_VERSION` in `public/sw.js` for SW behavior changes.

### PWA Push Notifications

Per-device daily reminders via Web Push API. Key files: `pwaReminderService.ts` (client CRUD + SW updates), `supabase/functions/send-reminders/index.ts` (Edge Function), `public/sw.js` (push/click/withdraw handlers). Auto-withdraw on quiz completion via `clearNotifications()`. Key table: `push_subscriptions` (`reminder_hour_local`, `reminder_minute_local`, `reminder_timezone`, `last_sent_at`, `is_active`). Env: `VITE_VAPID_PUBLIC_KEY` (client), `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (Edge Function secrets).

Migrations (apply in order): `20260213162000` (table + RLS), `20260213230500` (schedule columns), `20260324120000` (pg_cron + pg_net). Cron calls Edge Function every 5 min via service role key in Vault. Verify: `select * from cron.job;`

**Critical mobile settings:** `TTL: 14400` + `urgency: 'high'` (short TTL / default urgency = silent drops). Test sends use `last_tested_at` to avoid blocking scheduled sends. **iOS:** requires 16.4+, must install PWA to home screen (not Safari tab), subscriptions expire after ~2 weeks of non-use. EU iOS 17.4+ may block standalone PWA (DMA).

Any sync strategy changes must update this section and `Known Failures`.

---

## Authentication

All users must sign in via Supabase. Guest mode has been removed. RLS ensures user isolation.

## Settings and Personalization

**Learning Focus (0-3)** — `0` skip, `1` low, `2` medium, `3` high. Controls quiz task modality frequency, Study card reveal preference, and the weighted overall knowledge score.

**Syntax Frequency (0-3)** — same scale, mapping to 0%/20%/35%/50% of quiz questions being tile-ordering exercises. Degrades to all MCQ if vocab satisfies no template.

**Trivia Frequency (0-3)** — effectively an on/off switch: `0` disables trivia entirely, any other value enables it. How many cards actually appear is decided by ranking (see "Trivia Cards"), not by the setting, so the 1/2/3 interval scale in `TRIVIA_FREQUENCY_META` is vestigial.

**Other controls** — cards per session, character size, pinyin style, TTS voice/rate/auto-play, quiz difficulty (easy/hard/expert, which also drives weak/stale word selection + decay), PWA reminders (per-device local time + timezone, default 4:00 PM).

**Theme is locked to `duo`** for everyone: `THEME_PICKER_ENABLED = false` (`src/types/settings.ts`) hides the picker and `activeTheme()` (`settingsStore.ts`) pins what's applied. The other 7 themes and their CSS are untouched, and stored preferences are deliberately *not* rewritten, so flipping the flag back restores each user's old choice instead of stranding everyone on duo.

---

## UI and Interaction Design

**These are the defaults for all new UX, not opt-in extras.** Every new page, card, modal, or control is expected to follow every rule here. A surface that skips them feels foreign next to the rest of the app, so treat an exception as a deliberate decision worth stating. Primitives live in `src/index.css` and `src/services/hapticService.ts` — extend those rather than inventing per-page styles.

1. **Chunky buttons** — `btn btn-chunky` on tappable controls. A solid bottom edge compresses on `:active` so taps feel physical. Solid variants get a darker edge via `color-mix`, others derive it from `currentColor`, so it adapts to all 8 themes. Ghost variants get no edge (with no fill above it, an edge reads as a stray underline).
2. **Thumb-sized targets** — primary choices ≥72px tall (`.answer-option`), primary actions `btn-lg`. Size for thumbs, not cursors.
3. **Animate every entrance** — `pop-in` (new card), `slide-up` (feedback), `tile-pop` (tiles), `pulse-correct` / `shake` for right/wrong. Content should never just blink into existence.
4. **Haptics on every committed action** — `haptic('tap'|'select'|'correct'|'wrong'|'complete')`. Applies app-wide, not just Quiz: taps, selections, and any success/failure moment.
5. **Never move what the user is looking at** — see Layout Stability below. This is the rule most easily broken and the most jarring when broken.
6. **Semantic color** — `success` means correct, `error` means a mistake, `info` means neutral explanation. Never reuse error red for something that isn't wrong.

### Layout Stability (No Shift After Interaction)

Nothing may move when state changes — never yank content out from under a thumb. Learned in Quiz, where revealing an answer moved the first option row 113px:

- **Anchor containers to the top.** Never `justify-center` a container whose content grows; centering makes it expand upward as well as down.
- **Reserve space for anything that appears later.** Render it and toggle `invisible` (plus `aria-hidden`) instead of mounting it on demand.
- **Overlay decorations rather than inlining them.** The ✓/✗ on an answered option is `absolute` inside the button's padding, so it costs no height. Likewise keep border widths identical across states — a 2px→1px change on answer silently reflows the row.
- **Verify by measuring**, not eyeballing: compare `getBoundingClientRect().top` before and after. Note the automated browser tab freezes CSS animations at frame 0, so neutralize transforms first or you will chase phantom offsets from a frozen `scale()`.

### Constraints and Gotchas

- **`reduced-motion`** must disable both animations and haptics. Define animations in `index.css` so the global override catches them. **Haptics are Vibration API**, a silent no-op on iOS Safari — never let behavior depend on one firing.
- **A theme's `primary` must be clearly distinguishable from `error`**, since primary is the "Next" CTA sitting beside a red wrong answer. `sunset` was retired for failing this. Retiring a theme needs a `RETIRED_THEMES` entry (`settingsStore.ts`): stored settings still reference it, and an unknown `data-theme` silently falls back.
- **`duo` theme** = Duolingo's published palette (design.duolingo.com/identity/color): Feather Green `#58CC02`, Macaw `#1CB0F6`, Cardinal `#FF4B4B`, Bee `#FFC800`, Eel/Swan/Polar neutrals; streak badge uses Fox→Bee.
- Do **not** `@apply btn` inside a custom class — it inlines daisyUI's base background unlayered, which then beats `btn-success`/`btn-error`. Put `btn` in the markup.
- Do **not** set `disabled` on answered quiz options; daisyUI's disabled style greys out the fill and hides the correct/wrong feedback. Use `aria-disabled` + `pointer-events-none`.

### Saras (Mascot)

A seated veena player, the app's namesake: Saraswati (goddess of learning, always shown with a veena), *saras* (the water her name derives from), and सारस (the Sarus crane). Drawn as a musician **inspired by** that iconography — deliberately not the deity, so no extra arms or halo. `Saras.tsx` geometry, `useMascotRig.ts` motion, `QuizMascot.tsx` quiz behaviour, `mascotConfig.ts` knobs.

Four variability axes: **colour** (sari + veena wood) and **motion** (idle loop set) are seeded from the session id and fixed for the session; **action** (gestures) is random per trigger and deliberately **orthogonal to emotion** (a cheerful pluck attached to a scowl is the charm, not a bug); **emotion** is deterministic from session accuracy.

- She appears in **33% of sessions**, rolled once at session start — not per question, since colour is session-scoped and a per-question roll would flicker her in and out wearing different saris.
- Her band sits **below** the quiz, outside the scrolling area, so a card growing on answer scrolls in its own container and can never displace her (see Layout Stability). Sparse ambient gestures while the user reads, a bigger reaction on answer, then settle back to the accuracy baseline rather than to neutral.
- **Band height scales with viewport height** (`viewportHeight - viewportReservePx`, capped at `maxStageHeightPx`) because every pixel she takes comes out of the question's space. Measured against the answered card (~463px): a 390×844 phone affords ~240px, a 375×667 phone only ~63px. Below `minStageHeightPx` she is **skipped entirely** rather than shrunk — on small phones that's what keeps the Next button above the fold.
- She is nudged left of centre and the navbar streak badge right by the same `horizontalOffsetPx`, since the badge floats above the centre of the navbar directly beneath her. Keep the two in sync.

---

## Tuning Constants (Hardcoded by Design)

Pacing and personality decisions, deliberately **not** user settings — exposing them would invite turning features into wallpaper or nuisance. Listed so there's no hunting.

| What | Where |
| ---- | ----- |
| Mascot appearance rate, gesture pools, idle/thinking timing, emotion thresholds | `mascot/mascotConfig.ts` |
| Animation easings, follow-through lag, gesture keyframes | `mascot/useMascotRig.ts` |
| Haptic patterns | `services/hapticService.ts` |
| Themed review rate (`THEMED_REVIEW_CHANCE`) | `utils/reviewTheme.ts` |
| Trivia show fraction, earliest slot, stagger | `pages/QuizPage.tsx` |
| Knowledge update rates + decay floor; distractor weights | `utils/knowledge.ts`, `utils/quiz.ts` |
| Streak recovery window | `lib/streakGoal.ts` |

Everything else the user *can* change stays in Profile (cards/session, difficulty, focus, syntax + trivia frequency, theme, TTS, reminders).

---

## Themed Reviews

Occasionally a quiz session becomes a **themed review**: MCQ words come from one semantic cluster (Clock & Calendar, Question Words, At School…) with that theme's colour wash and a banner. Motivation is variable reward — most sessions look normal, so themed ones surprise.

- **Catalog**: `src/data/reviewThemes.ts` (24 themes). Curated hanzi lists, *not* a `category` filter — `category` was built for distractor selection, so its buckets are the wrong shape (`grammar` mixes particles/conjunctions/prepositions; At School cuts across place/person/object/communication). `validateReviewThemes()` catches typo'd hanzi, which would otherwise silently shrink a theme below viability.
- **Selection**: `src/utils/reviewTheme.ts`. Fires on `THEMED_REVIEW_CHANCE` (20%) of sessions, rolled per session; **always fires on localhost**. Override with `?reviewTheme=<id>` or `?reviewTheme=off`.
- **Viability gate**: needs `max(8, ceil(cardsPerSession * 0.8))` known words, computed per user per session and never precomputed — it depends entirely on which words the user has checked off. A theme surfacing 4 words is worse than no theme.
- **Scope is MCQ word selection only.** Distractors (via `generateQuizSession`'s `distractorPool` arg) and syntax exercises intentionally keep the full pool: narrow options repeat and become guessable, and a narrow pool satisfies no syntax template, silently degrading the session to all-MCQ. Unlike `todayFilterStore`, which narrows the whole session for Quiz *and* Study — the two filters have deliberately different scopes.
- **Visuals**: `.quiz-themed` / `.review-banner` in `index.css`, driven by a `--review-tint` custom property mixed over the current base colours. Never recolours primary/success/error — right vs wrong keeps its semantic colour.

---

## Trivia Cards

Between quiz questions, an LLM card explains something surprising about the word just answered — character reuse, literal composition, etymology — and offers **exactly one next word** to add to vocab in a tap.

- **The suggestion is the payoff.** A fact with no next word is discarded unshown (`isShowableTrivia`), because trivia for its own sake doesn't earn an interruption. Two kinds qualify: a `missing_atom` (a character hiding inside 2+ compounds they know) or a `buildable_compound` (decodable from characters they know).
- **Generate many, show few.** A fact is generated for every eligible question in the background, then `rankTrivia` picks the keepers. Quality is only knowable after generation, so curating beats showing whatever landed at a fixed interval. Tune `TRIVIA_SHOW_FRACTION`, not a user setting.
- **Back half only** (`TRIVIA_EARLIEST_FRACTION` 0.5). A call takes seconds; an early slot would be reached mid-spinner. Starting halfway in guarantees cards are ready on arrival and halves the calls per quiz. Slots are staggered, one per word, never last (that would only delay the results screen).
- **Failures are soft.** A dead LLM call renders an in-card error with retry and never blocks the quiz.
- **Character status is computed client-side** (`src/lib/characterIndex.ts`), not by the model — it kept marking words the user had just been quizzed on as "new". `entry` (own vocab row) beats `seen` (inside a known compound).
- The card's known-word context is capped at 120 words, biased toward words sharing a character with the focus word.

## LLM Provider

`netlify/functions/_model.ts` resolves the model for both chat and trivia. **OpenRouter is preferred when `OPENROUTER_API_KEY` is set** (one key covers every provider, so switching models is an env change), falling back to Anthropic direct via `ANTHROPIC_API_KEY` so existing deployments keep working. Override slugs per role with `TRIVIA_MODEL` / `CHAT_MODEL`; both default to Claude Sonnet 4.6, so switching providers changes the route and not the behaviour.

Both functions verify the caller's Supabase access token before spending a model call.

## Syntax (Integrated into Quiz)

Syntax exercises are now mixed into each quiz session (no separate tab). Controlled by `syntax.frequency` setting (0-3: Skip/Low/Med/High) — maps to 0%/20%/35%/50% of quiz questions being syntax. Falls back to all MCQ if the user's known vocab doesn't satisfy any template.

Template-driven grammar/word-order practice using known vocabulary (~130 templates). Covers HSK1 chapters 3–15 grammar at three levels (L1: basic SVO/是/有/很/不/请/的; L2: questions, negation, modals, adverbs, progressive, completion; L3: time expressions, past tense, 是...的 emphasis). See `src/utils/syntax.ts` for full grammar catalog.

**Exercise format**: tile reordering (no distractors). EN→CN shows English prompt, user arranges Chinese tiles. CN→EN shows Chinese, English tiles are lowercase-shuffled to prevent capitalization-based guessing. Verb conjugation auto-adjusts for subject person.

**Slot filling**: words fill template slots via `SEMANTIC_CATEGORIES` + `VOCAB_CATEGORY_TO_SYNTAX`. Only known/unpaused words participate. Verbs, particles, numbers appear only as `fixedWords`. See `src/types/syntax.ts`.

**Slot-filter rules (`src/utils/syntax.ts`)**

- `SEMANTIC_CATEGORIES[word]` is **authoritative**. An explicit entry (including `[]`) wins over `VOCAB_CATEGORY_TO_SYNTAX[word.category]`. Use `[]` to block a word from all slots (verbs, interrogatives, single-character morpheme roots like `师/员/者/口/体/儿/室/馆/国/店`, bare directionals `里/外/上/下/前/后`, and HSK1 V-O compounds `吃饭/睡觉/看见` — they remain in vocab quizzes but never appear as sentence subjects/objects).
- `isSlotEligible(word)` rejects `paused`, `source==='compound'`, and `part_of_speech==='phrase'` words so user-added compound study items (`喝水`, `回家`, `几点回家`) never slot in.
- `allFixedWordsKnown(...)` requires every `fixedWord` (verb/particle/negator the template renders verbatim) to also be in the user's known vocab. Without this, zero-slot templates like `how_to_write` (fixedWords `这个/字/怎么/写`) "unlocked" for users who hadn't accepted any of those words — they'd see the same surprise sentence on every refresh. Now the template only counts as available if the user has actually approved every word that will appear.
- English conjugation is data-driven via `THIRD_PERSON_TO_BASE`. Module load runs `validateEnglishPatterns()`; any new template using an unregistered `-s` verb form prints a `console.warn` (e.g. adding "speaks" or "writes" without registering it).
- `您` (formal you) is treated as second-person for English conjugation, alongside `你`.
- Possessive templates (`possessive_book`, `possessive_food`) require `posFilter: ['pronoun']` on the subject, so we never produce "Mr.'s books".
- **Narrow tags beat broad ones.** `edible` was doing too much work, so verb-specific subsets exist: `cookable` (objects of 做 — dishes and meals, never raw fruit: "会做水果" ✗), `listenable` (objects of 听 — was reusing `watchable`, giving "听电影" ✗), and `study_place` (destinations for the 去…看书/看电影 errand templates — any destination gave "去车站看电视" ✗). Venue words whose DB rows are categorised `food` (`餐厅`, `饭馆`) carry explicit `['place','destination']` overrides; without them they derived `edible` and became objects of 吃/做 ("学生吃餐厅吗" ✗).
- `TemplateSlot.excludeCategories` disqualifies a word that otherwise matched, for strict-subset exclusions the positive tags can't express: the like/love templates accept any `edible` **except** `bare_meal` (`饭`), because 吃饭/做饭 are idiomatic but 喜欢饭/爱饭 are not.
- `ADJECTIVE_SUBJECT_CATEGORIES` + `fillIsCoherent()` enforce **cross-slot** agreement, which unary tags cannot: 好吃 and 高兴 are interchangeable as far as the adjective slot is concerned, but only food is delicious and only an animate subject is happy ("小姐很好吃" ✗). Adjectives absent from the map are unrestricted. Because an early slot pick can now strand a later slot, `canFillTemplate` backtracks instead of taking the first match — greedy matching would wrongly report a template as locked.
- English predicate nouns are number/article-aware: `identityGloss()` renders the 是 templates as "is a teacher" / "are teachers" (was "is the teacher"), and `SENTENCE_ENGLISH` subject forms are singular for countables so the copula agrees ("Books is under the table" → "The book is under the table"). The `item` role uses the subject form since it heads its clause in every template that uses it.

**Local syntax review tooling (gitignored: `.local-review/`, `.cache/`)**: `enumerate-sentences.ts` pulls each user's known vocab from Supabase and writes every possible sentence per template; `classify-findings.ts` buckets the output by issue pattern. Drives grammar-rule fixes. Output contains real user vocab — never commit it.

---

## Script Behavior (Update When Scripts Change)

### NPM Scripts

`npm run dev` (Vite dev server), `build` (TypeScript + production bundle), `lint` (ESLint), `preview` (preview built app). Note `lint` has a pre-existing backlog of errors in untouched files; `build` is the gate.

### Content/Vocabulary Data

`src/data/hsk1_vocabulary.json` — canonical word list (354 entries). This is the **primary data source** the app reads from (see "Vocabulary Data Flow" above). Ch 1-15: standard HSK1 textbook. Ch 16: advanced function words (particles, prepositions, conjunctions, common verbs, noun morphemes). Negative chapters: compound phrases tied to their positive chapter.

**TTS polyphonic characters**: Browser SpeechSynthesis mispronounces polyphonic characters (多音字) like 了/的/地/得/着. Pre-recorded audio clips (`public/audio/tts/`) are used instead, generated via macOS `say -v Tingting` + ffmpeg. See `STATIC_AUDIO` map in `src/services/ttsService.ts`.

Extraction scripts under `content/hsk1/`: OCR + extraction utilities for textbook-driven vocab imports.

### ML/Analysis Scripts

`analysis/quiz_ml_model.py` — offline model predicting quiz correctness from context features. Not runtime. Data in `analysis/quiz_attempts_data.json` (gitignored). Export via MCP Supabase read or Python client (see script docstring). **v2 (Apr 2026):** 26 features (was 11), including `knowledge_before`, modality pair one-hot encoding, individual user averages, per-concept attempt number. Models: Logistic Regression, Random Forest, HistGradientBoostingClassifier + isotonic calibration. Evaluation via stratified 5-fold CV. Best calibration: Brier 0.066 (HGB+Cal). Best discrimination: ROC-AUC 0.844 (LR). Log feature/label changes here.

---

## Database and Migration Safety (Critical)

Historical incident (Feb 2, 2026): a migration changed ID references and added a FK path that orphaned/deleted large quiz history. Never repeat this class of failure.

### Unsafe Patterns (Do Not Do)

Adding FK constraints against remapped IDs without a mapping table; `ON DELETE CASCADE` on user-history paths without full impact analysis; destructive table recreation on live user tables.

### Required Safety Process

1. Back up production data first. 2. Show exact SQL to user before execution. 3. Explain at-risk tables and blast radius. 4. Wait for explicit user approval. 5. Test on a production-like copy/branch before the real run.

### Sensitive Tables

`quiz_attempts` (history + analytics + ML inputs), `user_progress` (current learning state), `user_settings` (behavioral preferences), `push_subscriptions` (per-device VAPID keys + reminder schedule), `chat_messages` (conversation content).

## Known Failures and Risk Areas

1. **Past migration data loss** on quiz history (see DB safety section above).
2. **Class imbalance in ML data** — mostly correct answers can overestimate model performance.
3. **Unsynced local progress risk** — cloud load can overwrite stale local state after interrupted sync.
4. **PWA migration not applied (Mar 2026)** — committed but never run against production. **Lesson**: verify migrations hit the live DB.
5. **PWA cron trigger missing (Mar 2026)** — Edge Function existed but no pg_cron job called it. **Lesson**: wire up invocation, not just deploy.
6. **PWA push dropped on mobile (Mar 2026)** — short TTL + default urgency = silent drops in Doze. **Lesson**: use `TTL: 14400` + `urgency: 'high'`.
7. **Streak showed 0 (Apr 2026)** — Supabase `max_rows` silently truncated `.limit(10000)`. **Lesson**: always paginate with `.range()` for >1000 rows.
8. **Chat history depends on a migration (Jul 2026)** — `chatHistoryService` queries `chat_conversations`/`chat_messages`; if `20260729140000` hasn't been applied, the Chat tab breaks for everyone. Same class as #4. **Lesson**: verify the table exists in prod before deploying code that reads it.

---

## Setup and Local Development

```bash
git clone https://github.com/avi-otterai/mandarin.git && cd avi-mandarin
npm install && cp .env.example .env && npm run dev
```

Required env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Optional: `VITE_DEV_USER_EMAIL`, `VITE_DEV_USER_PASSWORD` (dev auto-login), `VITE_VAPID_PUBLIC_KEY` (PWA reminders). Server-side (Netlify): `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY` for Chat and Trivia.

**Testing functions locally**: run `netlify functions:serve` (port 9999) alongside `npm run dev`; Vite proxies `/.netlify/functions` to it (`vite.config.ts`). This keeps you on port 5173, so the Supabase session and cached vocab still apply — going through `netlify dev` on 8888 is a different origin and loses both. The proxy is harmless when nothing is listening on 9999.

---

## Supabase Schema Overview (Conceptual)

Core tables: `vocabulary`, `user_progress`, `quiz_attempts`, `user_settings`, `push_subscriptions`, `daily_goals`, `quiz_sessions`, `chat_conversations`, `chat_messages`.

`chat_conversations` / `chat_messages` (migration `20260729140000`) persist Chat threads, replacing a single rolling localStorage thread capped at 50 messages. `chat_messages` stores the full `UIMessage` parts array as jsonb so tool calls survive a reload, keyed `(conversation_id, message_id)` so re-saving a growing thread upserts instead of duplicating. The child→parent cascade is safe here (both tables started empty; messages are meaningless without their conversation) — unlike the Feb 2 incident, which cascaded off a column already holding UUIDs pointing elsewhere.

`daily_goals` (`user_id`, `date`, `goal`, `updated_at`; PK `(user_id, date)`) stores the per-day streak goal recorded going forward on session completion. RLS restricts rows to the owning user. Days without a stored goal fall back to inference (see `src/lib/streakGoal.ts`).

`quiz_sessions` (`id`, `user_id`, `created_at`, `goal`) is an append-only log, one row per completed session. Streaks count these directly (skip-proof) rather than inferring via `round(attempts/goal)`, which undercounts when questions are skipped. Days without session rows fall back to the attempts-based estimate.
RLS expectation: user tables are private; vocabulary is shared reference data.
If schema contracts change, update `src/types/database.ts`, sync services, and README together.

---

## Quick Task Routing Cheat Sheet

- "Quiz options are wrong" / "scores feel off" -> `src/utils/quiz.ts`, `src/pages/QuizPage.tsx`, `src/utils/knowledge.ts`
- "Sync conflicts" / "attempt logs missing" -> `src/lib/syncService.ts`, `src/lib/quizService.ts`, quiz transition logic
- "Pinyin chart or pronunciation" -> `src/pages/PinyinPage.tsx`, `src/data/pinyinChart.ts`
- "TTS mispronounces a word" -> `src/services/ttsService.ts` (known polyphonic limitation, no fix yet)
- "Syntax generation bugs" -> `src/utils/syntax.ts`, `src/types/syntax.ts`, `src/components/SyntaxExerciseCard.tsx`
- "Themed review never appears / wrong words" -> `src/utils/reviewTheme.ts`, `src/data/reviewThemes.ts`
- "Trivia cards missing / wrong facts" -> `src/pages/QuizPage.tsx`, `src/lib/triviaService.ts`, `netlify/functions/trivia.ts`
- "Chat history missing" -> `src/lib/chatHistoryService.ts`, migration `20260729140000`
- "LLM calls failing" -> `netlify/functions/_model.ts`, Netlify env vars
- "Push notifications broken" -> `src/lib/pwaReminderService.ts`, `supabase/migrations/`, `supabase/functions/send-reminders/`
- "Streak/recovery issues" -> `src/hooks/useStreak.ts`, `src/pages/ProfilePage.tsx`, `src/components/Navbar.tsx`
- "Buttons/animations/haptics wrong" -> `src/index.css`, `src/services/hapticService.ts`; "vocab import issues" -> `content/hsk1/*.py`, vocabulary store ingest path

---

## License

Private use.