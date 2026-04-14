---
name: HSK1 textbook gap audit
overview: Comprehensive gap analysis comparing all 109 current syntax templates against every grammar pattern and sentence structure from all 15 HSK1 textbook chapters, organized by priority.
todos:
  - id: p1-adj-negation
    content: Add thing_not_adj (S + bu + Adj) and thing_not_very_adj (S + bu tai + Adj) templates
    status: completed
  - id: p1-hui-negation
    content: Add person_cant_write, person_cant_make templates (extend bu hui to other verbs)
    status: completed
  - id: p1-neg-patterns
    content: Add person_not_at (bu zai), person_not_love_eat (bu ai chi), person_not_doing (mei zai V)
    status: completed
  - id: p1-dou-shi
    content: Add person_all_are (dou shi) template
    status: completed
  - id: p2-zai-place-v
    content: Add person_at_place_read and person_at_place_drink templates
    status: completed
  - id: p2-hui-future
    content: Add person_will_come and person_wont_come (hui for future possibility)
    status: completed
  - id: p2-questions
    content: Add what_doing_now (zai zuo shenme ne?) template
    status: completed
  - id: p2-shi-de
    content: Add emphasis_place_buy (shi zai place V de) and emphasis_not_time (bu shi time lai de)
    status: completed
  - id: p3-extensions
    content: Add person_want_study, person_sleeping_now, how_to_read, person_able_question, person_not_love_drink
    status: completed
  - id: update-readme-final
    content: Update README template count and grammar coverage after all additions
    status: completed
isProject: false
---

# HSK1 Textbook vs Current Templates — Gap Audit

File: `[src/utils/syntax.ts](src/utils/syntax.ts)`

## Current coverage summary

109 templates covering: chi/he/qu/kan/xue/zuo/mai/hui/lai/ai/ting/du/shi/you/zai/gongzuo/zhu/xihuan/qing/neng/xiang + negation combos + time + location + progressive + ba/le/de/dou/zenme/shenme/shei/nar/zenmeyang/tai...le/shi...de

## Chapter-by-chapter gap analysis

### Ch 1-2 (Hello / Thank you) — No gaps
Functional greetings and classroom phrases. Not templateable grammar.

### Ch 3 (你叫什么名字) — 1 gap

**Covered**: shi sentences (3 templates), shenme questions, ma questions
**Gap**:
- **S + 叫 + Name**: "My name is..." / "What is your name?" — the most fundamental self-introduction pattern in Chinese. Currently no template uses 叫 at all.
  - Template idea: `person_called`: S + jiao + identity, English "{subject} is called {identity}"
  - Reuses existing `identity` slot (profession/person nouns)

### Ch 4 (她是我的汉语老师) — Fully covered
**Covered**: shei (who_is), de possessive (2 templates), na+MW (too number-dependent)
**No actionable gaps** — 呢 as follow-up ("A呢?") is too minimal to template well.

### Ch 5 (她女儿今年二十岁) — Excluded by design
All patterns are number-dependent (age, counting, 几口人). The current slot system has no numeric slots.

### Ch 6 (我会说汉语) — 3 gaps

**Covered**: hui+shuo/xie/zuo (4 templates), hen+adj, zenme+shuo/xie
**Gaps**:
- **S + 不 + Adj** (adjective negation without 很): "The weather is not cold." "He is not tall." — This is explicitly taught in the Notes as the negative form of 形容词谓语句. Currently we only have 很+Adj but no negation form.
  - Template idea: `thing_not_adj`: S + bu + Adj, English "{subject} is not {adjective}"
- **不会 + 写/做** (can't write/cook): We have `person_cant_speak` but no equivalent for the other two hui+V combos.
  - Template ideas: `person_cant_write`: S + bu + hui + xie + O; `person_cant_make`: S + bu + hui + zuo + O
- **怎么 + 读** (how to read/pronounce): Textbook example "这个汉字怎么读?" — we have zenme+shuo and zenme+xie but not zenme+du.
  - Template idea: `how_to_read`: S + zenme + du, English "how does {subject} read it?"

### Ch 7 (今天几号) — Fully covered
**Covered**: serial verb qu+place+V (3 templates), time expressions
Date/number patterns excluded by design.

### Ch 8 (我想喝茶) — 1 gap

**Covered**: xiang+chi/he/qu/mai (4 templates), duoshao qian
**Gap**:
- **想 + 学** (want to study): Textbook example "我想学汉语." All other major verbs have xiang+V combos except xue.
  - Template idea: `person_want_study`: S + xiang + xue + O(language), English "{subject} wants to study {object}"

### Ch 9 (你儿子在哪儿工作) — 2 gaps

**Covered**: zai as verb (person_at_place), nar (where_is), zai+place+chi, zai+place+gongzuo
**Gaps**:
- **不在 + place** (not at): "爸爸不在家." — Negation of location verb. Simple and common.
  - Template idea: `person_not_at`: S + bu zai + location, English "{subject} is not at {location}"
- **在 + place + 看书/喝茶**: Textbook examples "他们在学校看书" / "我在朋友家喝茶" — we only have zai+place+chi. Extending to kan and he would be low-effort, high-value.
  - Template ideas: `person_at_place_read`: S + zai + place + kan + readable; `person_at_place_drink`: S + zai + place + he + drinkable

### Ch 10 (我能坐这儿吗) — 1 gap

**Covered**: you existential (3 templates), neng+qu, qing+chi/he, you/meiyou
**Gap**:
- **能 + V + 吗?** (permission question): "我能坐这儿吗?" — The textbook's key example for neng. Currently `person_able_go` is a statement, not a question.
  - Template idea: `person_able_question`: S + neng + qu + destination + ma?, English "can {subject} go to {destination}?"

### Ch 11 (现在几点) — Fully covered
**Covered**: time+S+V (3 templates + return), hui+place, zhu+zai
Clock time excluded by design.

### Ch 12 (明天天气怎么样) — 3 gaps

**Covered**: zenmeyang, tai...le, ai/ai+ma
**Gaps**:
- **不爱 + V** (doesn't love to): Textbook dialog "不爱吃饭" — an important negative form of ai.
  - Template idea: `person_not_love_eat`: S + bu ai + chi + O, English "{subject} doesn't love to eat {object}"
- **不太 + Adj** (not very): Textbook "身体不太好" — distinct from tai...le because it's mild negation.
  - Template idea: `thing_not_very_adj`: S + bu tai + Adj, English "{subject} is not very {adjective}"
- **会 for future possibility** (Ch 12 meaning 2): "明天会下雨吗?" / "她会来吗?" — distinct from Ch 6 会=ability. However, "下雨" isn't in vocab slots and "会来" needs a person-comes pattern. The simplest form:
  - Template idea: `person_will_come`: S + hui + lai, English "{subject} will come"
  - Template idea: `person_wont_come`: S + bu hui + lai, English "{subject} won't come"

### Ch 13 (他在学做中国菜呢) — 2 gaps

**Covered**: zai...ne progressive (5 templates), ba suggestion (3 templates)
**Gaps**:
- **没(在) + V** (negative progressive): "我没在看电视." — explicitly taught in Notes. Currently no negative progressive template.
  - Template idea: `person_not_doing`: S + mei zai + kan + watchable, English "{subject} is not watching {object}"
  - Or generalized: `person_not_reading`: S + mei zai + kan + readable
- **在做什么呢?** (what are you doing?): "你在做什么呢?" — key question for progressive.
  - Template idea: `what_doing_now`: S + zai + zuo + shenme + ne?, English "what is {subject} doing?"

### Ch 14 (她买了不少衣服) — 1 gap

**Covered**: V+le completion (3), mei+V (2+3 new), dou+xihuan, mai+le, mei+mai/he
**Gap**:
- **都 + other verbs** (all/both): Textbook says "我们都是中国人" / "他们都喜欢喝茶." Currently only dou+xihuan. Adding dou+shi would cover the first example.
  - Template idea: `person_all_are`: S(plural) + dou + shi + identity, English "{subject} are all {identity}"

### Ch 15 (我是坐飞机来的) — 2 gaps

**Covered**: shi...de for time emphasis and vehicle emphasis (2 templates)
**Gaps**:
- **是在 + place + V + 的** (place emphasis): "我们是在学校认识的." / "这是在北京买的." — location version of shi...de.
  - Template idea: `emphasis_place`: S + shi + zai + place + V + de, English "{subject} [verb]ed at {destination}"
  - This one is tricky because the verb varies. Simplest: `emphasis_place_buy`: shi + zai + destination + mai + de
- **不是...的** (negative emphasis): "我不是昨天来的." — Negative shi...de explicitly taught in Notes.
  - Template idea: `emphasis_not_time`: S + bu shi + time + lai + de, English "{subject} didn't come {time}"

## Verb coverage audit

Verbs in HSK1 vocab with **zero** template usage:
- **叫** (jiao, "to be called") — Ch 3, fundamental
- **睡觉** (shuijiao, "to sleep") — Ch 13, good candidate for zai...ne progressive
- **认识** (renshi, "to know/recognize") — Ch 15, used in shi...de examples
- **开** (kai, "to drive/open") — Ch 14, "学开车" in dialog
- **看见** (kanjian, "to see") — Ch 14 compound verb
- **回来** (huilai, "to come back") — compound directional verb
- **问** (wen, "to ask") — hard to template naturally

Actionable verb templates:
- **睡觉**: `person_sleeping_now`: S + zai + shuijiao + ne, English "{subject} is sleeping" — fits progressive pattern perfectly, and 睡觉 just needs SEMANTIC_CATEGORIES tagging
- **叫**: `person_called`: S + jiao + identity — debatable, since 叫+Name is the usual pattern and names aren't slots

## Priority summary

### Priority 1 — Core grammar explicitly taught in Notes (8 templates)
1. `thing_not_adj`: S + 不 + Adj (Ch 6 adjective negation)
2. `person_cant_write`: S + 不会写 + O (Ch 6)
3. `person_cant_make`: S + 不会做 + O (Ch 6)
4. `person_not_at`: S + 不在 + place (Ch 9)
5. `person_not_love_eat`: S + 不爱 + 吃 + O (Ch 12)
6. `thing_not_very_adj`: S + 不太 + Adj (Ch 12)
7. `person_not_doing`: S + 没在 + V + O (Ch 13 negative progressive)
8. `person_all_are`: S(plural) + 都是 + identity (Ch 14)

### Priority 2 — Important textbook examples (7 templates)
9. `person_at_place_read`: S + 在 + place + 看 + readable (Ch 9)
10. `person_at_place_drink`: S + 在 + place + 喝 + drinkable (Ch 9)
11. `person_will_come`: S + 会来 (Ch 12 future)
12. `person_wont_come`: S + 不会来 (Ch 12 future)
13. `what_doing_now`: S + 在做什么呢? (Ch 13)
14. `emphasis_place_buy`: 是在 + place + 买的 (Ch 15)
15. `emphasis_not_time`: 不是 + time + 来的 (Ch 15)

### Priority 3 — Extensions and verb coverage (5 templates)
16. `person_want_study`: S + 想学 + O (Ch 8)
17. `person_sleeping_now`: S + 在睡觉呢 (Ch 13 progressive)
18. `how_to_read`: S + 怎么读 (Ch 6)
19. `person_able_question`: S + 能去 + place + 吗? (Ch 10)
20. `person_not_love_drink`: S + 不爱喝 + O (Ch 12, parallel to not_love_eat)

### Semantic tagging needed
- Add `睡觉: []` to SEMANTIC_CATEGORIES (suppress auto-derivation, used only as fixedWord)
- Add SENTENCE_ENGLISH entry for 睡觉 if used as slot (not needed if only fixedWord)

## Total: ~20 new templates (109 -> ~129)
