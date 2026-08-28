#!/usr/bin/env python3
"""
Extract "New Words" (生词) vocabulary from Developing Chinese: Elementary Speaking Course 1.

Why vision instead of OCR: this book is a scanned two-colour textbook whose vocabulary
lists are four-column (no. / hanzi / pinyin / PoS / English). macOS Vision OCR reads it
column-by-column and drops tone marks (mā/má/mǎ/mà all come back as "md"), which is
unusable for a pronunciation-first course. So the local OCR pass (ocr_extract.py) is used
only to *find* the New Words pages cheaply, and each such page is then re-read by a vision
model that returns structured JSON.

Pinyin is additionally regenerated from the hanzi with pypinyin and compared against what
the model read; mismatches are reported so tone errors surface instead of shipping.

Output: developing_chinese_vocabulary.json — same schema as content/hsk1/hsk1_vocabulary.json
(word, pinyin, part_of_speech, meaning, chapter, source) so the Supabase import path is
unchanged. `chapter` is the book's Unit number; `source` is "developing_chinese_1".

Usage:
  extract_vocabulary.py --find                 # list detected New Words pages
  extract_vocabulary.py --pages 36,37 --dry    # inspect one unit
  extract_vocabulary.py                        # full run
"""
import argparse
import base64
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fitz
import requests

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
PDF = next(HERE.glob("*.pdf"))
OCR_DIR = HERE / "ocr"
OUT = HERE / "developing_chinese_vocabulary.json"
SOURCE = "developing_chinese_1"
MODEL = os.environ.get("EXTRACT_MODEL", "anthropic/claude-sonnet-4.6")

# Matches the section banner in its OCR-mangled forms: the book labels these
# "跟我读，学生词（一）/ New Words I" and later just "生词 / New Words".
NEW_WORDS_RE = re.compile(r"New\s*Words|生\s*词|学生词")

POS_MAPPING = {
    "pron.": "pronoun", "pron": "pronoun",
    "adj.": "adjective", "adj": "adjective",
    "v.": "verb", "v": "verb", "vt.": "verb", "vi.": "verb",
    "n.": "noun", "n": "noun",
    "adv.": "adverb", "adv": "adverb",
    "prep.": "preposition", "prep": "preposition",
    "conj.": "conjunction", "conj": "conjunction",
    "part.": "particle", "part": "particle", "pt.": "particle",
    "num.": "numeral", "num": "numeral",
    "m.": "measure_word", "mw.": "measure_word", "measure word": "measure_word",
    "interj.": "interjection", "interj": "interjection", "int.": "interjection",
    # The app's PartOfSpeech union has no proper-noun member; hsk1 data files them as nouns.
    "pn.": "noun", "pn": "noun",
}


# Verified against the printed page after the high-res recheck pass still misread them.
# Keyed by (word, unit) because a word can recur in a later unit with a different gloss.
MANUAL_PINYIN = {
    ("可以", 12): "kěyǐ",
    ("一般", 21): "yìbān",
}


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k, v.strip().strip('"').strip("'"))


def unit_ranges(doc):
    """Map each Unit to its PDF page span, from the PDF outline."""
    toc = doc.get_toc()
    ranges = []
    for i, (_, title, start) in enumerate(toc):
        if not title.startswith("Unit "):
            continue
        # End at the next outline entry of any kind — the last unit is followed by the
        # back-matter "Vocabulary" index, which must not be treated as unit content.
        end = toc[i + 1][2] - 1 if i + 1 < len(toc) else len(doc)
        unit = int(re.match(r"Unit (\d+)", title).group(1))
        ranges.append((unit, start, end, title))
    return ranges


def unit_for_page(ranges, page):
    for unit, start, end, _ in ranges:
        if start <= page <= end:
            return unit
    return None


def find_new_word_pages(ranges):
    """Pages whose OCR text mentions a New Words heading, plus the page after it
    (lists routinely run over onto the next page)."""
    if not OCR_DIR.exists():
        sys.exit("Run ocr_extract.py first — no ocr/ directory.")
    hits = set()
    for f in sorted(OCR_DIR.glob("page_*.txt")):
        pno = int(f.stem.split("_")[1])
        if unit_for_page(ranges, pno) is None:
            continue
        if NEW_WORDS_RE.search(f.read_text(encoding="utf-8")):
            hits.add(pno)
            hits.add(pno + 1)
    return sorted(p for p in hits if unit_for_page(ranges, p) is not None)


PROMPT = """This is a page from the Chinese textbook "Developing Chinese: Elementary Speaking Course 1".

Extract ONLY entries from "New Words" / 生词 / 学生词 lists on this page (they are numbered
lists with columns: number, Chinese characters, pinyin, part of speech, English meaning).
A list may continue from the previous page, so include numbered entries even if the heading
is not visible on this page. Include proper-noun sub-lists (专名) if present.

Ignore: dialogue text, pronunciation drills, exercises, grammar tables, page headers.

Return STRICT JSON, no prose, no markdown fence:
{"entries":[{"num":1,"word":"我","pinyin":"wǒ","pos":"pron.","meaning":"I, me"}]}

Rules:
- "word": simplified characters exactly as printed.
- "pinyin": with tone marks exactly as printed (ā á ǎ à etc.), spaced as printed.
- "pos": the abbreviation as printed (pron., v., n., adj., adv., m., num., part., conj., prep., interj., pn.). Empty string if none.
- "meaning": the full English gloss.
- Empty list if the page has no New Words entries."""


def reply_json(response, label: str) -> dict:
    """Pull the JSON object out of a chat completion, tolerating the model prefacing it
    with a sentence or fencing it. Returns {} on an API error payload or unparseable reply
    so one bad page never aborts a whole run."""
    body = response.json()
    if "choices" not in body:
        print(f"{label}: API error {str(body)[:160]}", file=sys.stderr)
        return {}
    text = body["choices"][0]["message"]["content"].strip()
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        print(f"{label}: no JSON in reply {text[:120]!r}", file=sys.stderr)
        return {}
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        print(f"{label}: unparseable JSON {text[:120]!r}", file=sys.stderr)
        return {}


def page_png(doc, pno, dpi=200):
    return doc[pno - 1].get_pixmap(dpi=dpi).tobytes("png")


def call_model(png: bytes, label: str) -> dict:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY not set (expected in repo-root .env).")
    b64 = base64.b64encode(png).decode()
    r = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://saras-mandarin.netlify.app",
            "X-Title": "Saras Mandarin vocab extraction",
        },
        json={
            "model": MODEL,
            "temperature": 0,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                ],
            }],
        },
        timeout=180,
    )
    r.raise_for_status()
    return reply_json(r, label)


def extract_page(doc_path, pno, unit):
    doc = fitz.open(doc_path)  # per-thread handle; fitz docs are not thread-safe
    try:
        data = call_model(page_png(doc, pno), f"page {pno}")
    except Exception as e:  # keep one bad page from killing a 60-page run
        print(f"page {pno}: FAILED {e}", file=sys.stderr)
        return []
    finally:
        doc.close()
    out = []
    for e in data.get("entries", []):
        word = (e.get("word") or "").strip()
        if not word:
            continue
        # The book prints alternative readings inline (shéi (shuí), nà (nèi)); the app wants
        # one pronunciation, so keep the first and drop the parenthetical.
        py = re.sub(r"\s*\([^)]*\)", "", (e.get("pinyin") or "")).strip()
        pos = POS_MAPPING.get((e.get("pos") or "").lower().strip(), "other")
        # Proper nouns sit in a 专名 sub-list that often prints no PoS column; the book
        # capitalises their pinyin, which is the only signal left on the page.
        if pos == "other" and py[:1].isupper():
            pos = "noun"
        # Patterns and set expressions (太……了, 从……到……) print no PoS; hsk1 calls these
        # "phrase", which is what the quiz's distractor logic already expects.
        if pos == "other" and ("……" in word or len(word) > 3):
            pos = "phrase"
        out.append({
            "word": word,
            "pinyin": py,
            "part_of_speech": pos,
            "meaning": (e.get("meaning") or "").strip(),
            "chapter": unit,
            "source": SOURCE,
            "_page": pno,
        })
    print(f"page {pno} (unit {unit}): {len(out)} entries", file=sys.stderr)
    return out


def verify_pinyin(entries):
    """Cross-check the model's pinyin against pypinyin. Reports, does not overwrite:
    the book's neutral tones and erhua legitimately differ from the dictionary."""
    try:
        from pypinyin import pinyin, Style
    except ImportError:
        print("pypinyin not installed — skipping pinyin verification", file=sys.stderr)
        return
    bad = []
    for e in entries:
        if not re.fullmatch(r"[一-鿿]+", e["word"]):
            continue
        expected = "".join(s[0] for s in pinyin(e["word"], style=Style.TONE))
        got = e["pinyin"].replace(" ", "")
        if expected != got:
            bad.append((e["word"], e["pinyin"], expected, e["_page"]))
    if bad:
        print(f"\npinyin mismatches vs pypinyin ({len(bad)}) — review these:", file=sys.stderr)
        for w, got, exp, pg in bad:
            print(f"  p{pg} {w}: book={got!r} dict={exp!r}", file=sys.stderr)


RECHECK_PROMPT = """This page of a Chinese textbook contains a numbered "New Words" list.
Read the pinyin printed for these words EXACTLY as typeset, paying close attention to the
tone mark over each vowel (ā first, á second, ǎ third, à fourth, none = neutral):

{words}

Return STRICT JSON, no prose: {{"pinyin":{{"词":"cí"}}}}
Omit any word you cannot find printed on this page."""


def recheck_page(doc_path, pno, words):
    """Re-read specific words at high resolution. The first pass reads a whole page at
    200 dpi and occasionally mis-sees a tone mark (yībān for yìbān); this pass looks at
    only the handful of words the pypinyin cross-check flagged."""
    doc = fitz.open(doc_path)
    try:
        png = page_png(doc, pno, dpi=320)  # 400 dpi pushes some pages past the 10 MB image limit
    finally:
        doc.close()
    prompt = RECHECK_PROMPT.format(words="\n".join(f"- {w}" for w in words))
    key = os.environ["OPENROUTER_API_KEY"]
    b64 = base64.b64encode(png).decode()
    r = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={"model": MODEL, "temperature": 0, "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ]}]},
        timeout=180,
    )
    return reply_json(r, f"page {pno} recheck").get("pinyin", {})


def run_recheck():
    """Second pass over the written JSON: re-read every entry whose pinyin disagrees with
    pypinyin, and correct the ones the high-res read revises."""
    entries = json.loads(OUT.read_text(encoding="utf-8"))
    pages = json.loads((HERE / "developing_chinese_pages.json").read_text(encoding="utf-8"))
    try:
        from pypinyin import pinyin, Style
    except ImportError:
        sys.exit("pypinyin required for --recheck")

    by_page = {}
    for e in entries:
        if not re.fullmatch(r"[一-鿿]+", e["word"]):
            continue
        expected = "".join(s[0] for s in pinyin(e["word"], style=Style.TONE))
        if expected != e["pinyin"].replace(" ", "").lower():
            by_page.setdefault(pages[e["word"]], []).append(e)

    print(f"rechecking {sum(len(v) for v in by_page.values())} entries on {len(by_page)} pages",
          file=sys.stderr)
    changed = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(
            lambda kv: (kv[0], recheck_page(PDF, kv[0], [e["word"] for e in kv[1]])),
            by_page.items()))
    for pno, fixed in results:
        for e in by_page[pno]:
            new = (fixed.get(e["word"]) or "").strip()
            if new and new != e["pinyin"]:
                print(f"  p{pno} {e['word']}: {e['pinyin']!r} -> {new!r}", file=sys.stderr)
                e["pinyin"] = new
                changed += 1
    for e in entries:
        fix = MANUAL_PINYIN.get((e["word"], e["chapter"]))
        if fix:
            e["pinyin"] = fix
    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"corrected {changed} pinyin readings", file=sys.stderr)


SEMANTIC_CATEGORIES = [
    "number", "family", "person", "pronoun", "animal", "body", "country", "food",
    "time", "direction", "place", "object", "weather", "size", "nature",
    "communication", "movement", "emotion", "greeting", "action", "grammar", "other",
]

CATEGORY_PROMPT = """Assign each Chinese word a semantic category. The category drives quiz
distractor choice, so words a learner could plausibly confuse should share one.

Allowed categories (use no others): {cats}

Words:
{words}

Return STRICT JSON, no prose: {{"categories":{{"词":"object"}}}}"""


def run_categorize():
    """Fill the `category` field the Supabase vocabulary table requires. Words already in
    src/data/hsk1_vocabulary.json inherit that file's category so the two sources agree;
    the rest are labelled by the model in batches."""
    entries = json.loads(OUT.read_text(encoding="utf-8"))
    known = {w["word"]: w["category"]
             for w in json.loads((ROOT / "src/data/hsk1_vocabulary.json").read_text(encoding="utf-8"))}

    todo = []
    for e in entries:
        if e["word"] in known:
            e["category"] = known[e["word"]]
        else:
            todo.append(e)

    print(f"{len(entries) - len(todo)} categories reused from hsk1, {len(todo)} to label",
          file=sys.stderr)
    batches = [todo[i:i + 40] for i in range(0, len(todo), 40)]
    key = os.environ["OPENROUTER_API_KEY"]

    def label(batch):
        prompt = CATEGORY_PROMPT.format(
            cats=", ".join(SEMANTIC_CATEGORIES),
            words="\n".join(f'- {e["word"]} ({e["pinyin"]}): {e["meaning"]}' for e in batch))
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": MODEL, "temperature": 0,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=180)
        r.raise_for_status()
        return reply_json(r, "categorize").get("categories", {})

    with ThreadPoolExecutor(max_workers=4) as ex:
        for batch, got in zip(batches, ex.map(label, batches)):
            for e in batch:
                cat = got.get(e["word"], "other")
                e["category"] = cat if cat in SEMANTIC_CATEGORIES else "other"

    missing = [e["word"] for e in entries if not e.get("category")]
    if missing:
        print(f"no category for {len(missing)}: {missing[:10]}", file=sys.stderr)
        for e in entries:
            e.setdefault("category", "other")
    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print("categories written", file=sys.stderr)


def main():
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--find", action="store_true", help="only list detected New Words pages")
    ap.add_argument("--pages", default="", help="explicit 1-indexed pages, e.g. 36,37")
    ap.add_argument("--dry", action="store_true", help="print JSON instead of writing the file")
    ap.add_argument("--recheck", action="store_true",
                    help="re-read pypinyin-flagged entries at high resolution and correct them")
    ap.add_argument("--categorize", action="store_true",
                    help="fill the semantic `category` field required by the Supabase table")
    ap.add_argument("--passes", type=int, default=2,
                    help="reads per page; results are unioned to cover vision-pass variance")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    if args.categorize:
        run_categorize()
        return

    if args.recheck:
        run_recheck()
        return

    doc = fitz.open(PDF)
    ranges = unit_ranges(doc)

    if args.pages:
        pages = [int(p) for p in args.pages.split(",")]
    else:
        pages = find_new_word_pages(ranges)

    if args.find:
        for unit, start, end, title in ranges:
            hit = [p for p in pages if start <= p <= end]
            print(f"Unit {unit:2d} (pdf {start}-{end}) {title[:45]:45s} -> {hit}")
        print(f"\n{len(pages)} candidate pages")
        return

    # Two reads of each page, unioned. The vision pass is not perfectly repeatable even at
    # temperature 0 — consecutive runs differed by ~2% of entries — and a missed word is
    # worse than a duplicate, which de-duplication removes anyway.
    jobs = [(p, unit_for_page(ranges, p)) for p in pages] * args.passes
    doc.close()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = list(ex.map(lambda j: extract_page(PDF, j[0], j[1]), jobs))

    entries = [e for r in results for e in r]

    # De-duplicate on (word, unit); a list spanning two pages can be read twice.
    seen, deduped = set(), []
    for e in sorted(entries, key=lambda e: (e["chapter"], e["_page"])):
        key = (e["word"], e["chapter"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(e)

    for e in deduped:
        fix = MANUAL_PINYIN.get((e["word"], e["chapter"]))
        if fix:
            e["pinyin"] = fix

    verify_pinyin(deduped)
    # Keep the word -> source page map so --recheck knows where to look again.
    (HERE / "developing_chinese_pages.json").write_text(
        json.dumps({e["word"]: e["_page"] for e in deduped}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    for e in deduped:
        e.pop("_page", None)

    print(f"\n{len(deduped)} unique entries across {len({e['chapter'] for e in deduped})} units",
          file=sys.stderr)
    if args.dry:
        print(json.dumps(deduped, ensure_ascii=False, indent=2))
    else:
        OUT.write_text(json.dumps(deduped, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
