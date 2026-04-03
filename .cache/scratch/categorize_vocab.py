#!/usr/bin/env python3
"""Assign semantic categories to HSK vocabulary words."""
import json

INPUT = "src/data/hsk1_vocabulary.json"
OUTPUT = INPUT  # overwrite in place

CATEGORY_MAP = {
    # ── Numbers & money ──
    "一": "number", "二": "number", "三": "number", "四": "number",
    "五": "number", "六": "number", "七": "number", "八": "number",
    "九": "number", "十": "number", "百": "number", "零": "number",
    "两": "number", "块": "number", "钱": "number",
    "多少钱": "number",

    # ── Family ──
    "爸爸": "family", "妈妈": "family", "儿子": "family",
    "儿": "family", "家": "family",
    "在家": "family", "回家": "family", "几点回家": "family",

    # ── People & roles ──
    "人": "person", "学生": "person", "老师": "person", "同学": "person",
    "朋友": "person", "医生": "person", "先生": "person", "小姐": "person",
    "女": "person", "我的朋友": "person",
    "我是学生": "person", "你是学生吗": "person",

    # ── Pronouns & question words ──
    "你": "pronoun", "你们": "pronoun", "您": "pronoun",
    "我": "pronoun", "我们": "pronoun",
    "他": "pronoun", "她": "pronoun", "他们": "pronoun",
    "谁": "pronoun", "哪": "pronoun", "什么": "pronoun",
    "这": "pronoun", "那": "pronoun",
    "这儿": "pronoun", "那儿": "pronoun", "哪儿": "pronoun",
    "这个": "pronoun", "那个": "pronoun", "这些": "pronoun",
    "几": "pronoun", "怎么": "pronoun", "怎么样": "pronoun",
    "他是谁": "pronoun", "你的名字": "pronoun",

    # ── Animals ──
    "马": "animal", "鱼": "animal", "羊": "animal",
    "狗": "animal", "猫": "animal",

    # ── Body ──
    "手": "body", "心": "body", "身体": "body",
    "口": "body", "目": "body",

    # ── Country & nationality ──
    "中国": "country", "美国": "country", "国": "country",
    "中国人": "country", "美国人": "country", "哪国人": "country",

    # ── Food & drink ──
    "菜": "food", "中国菜": "food", "米饭": "food", "饭": "food",
    "茶": "food", "水": "food", "水果": "food", "苹果": "food",
    "杯子": "food",
    "吃": "food", "喝": "food",
    "喝茶": "food", "喝水": "food", "吃饭": "food", "喜欢吃": "food",

    # ── Time ──
    "今天": "time", "明天": "time", "昨天": "time",
    "今年": "time", "年": "time", "月": "time", "日": "time",
    "星期": "time", "号": "time", "日历": "time",
    "上午": "time", "下午": "time", "中午": "time", "午": "time",
    "早上": "time", "晚上": "time", "凌晨": "time",
    "时候": "time", "分": "time", "分钟": "time", "点": "time",
    "岁": "time",
    "今天几号": "time", "星期几": "time", "几点": "time",
    "你几岁": "time", "多大": "time",

    # ── Direction & position ──
    "上": "direction", "下": "direction", "前": "direction", "后": "direction",
    "左": "direction", "右": "direction", "东": "direction", "西": "direction",
    "里": "direction", "外": "direction", "中": "direction",
    "上面": "direction", "下面": "direction", "前面": "direction", "后面": "direction",
    "里面": "direction", "外面": "direction", "左边": "direction", "右边": "direction",
    "旁边": "direction", "对面": "direction", "上下": "direction",
    "在": "direction",
    "在上面": "direction", "在下面": "direction",
    "在前面": "direction", "在后面": "direction",
    "在里面": "direction", "在外面": "direction",
    "在左边": "direction", "在右边": "direction",
    "在旁边": "direction", "在对面": "direction",
    "在哪儿": "direction", "你在哪儿": "direction",

    # ── Places ──
    "学校": "place", "医院": "place", "商店": "place",
    "银行": "place", "饭店": "place", "大学": "place",
    "去学校": "place",

    # ── Objects ──
    "书": "object", "桌子": "object", "椅子": "object",
    "电脑": "object", "电视": "object", "电影": "object",
    "车": "object", "出租车": "object", "飞机": "object",
    "衣服": "object", "东西": "object",

    # ── Weather ──
    "天气": "weather", "下雨": "weather", "冷": "weather", "热": "weather",
    "天气怎么样": "weather", "太冷了": "weather", "太热了": "weather",

    # ── Size & quantity ──
    "大": "size", "小": "size", "高": "size", "矮": "size",
    "多": "size", "少": "size", "多少": "size",
    "一点儿": "size", "些": "size",

    # ── Nature ──
    "天": "nature", "云": "nature", "山": "nature", "气": "nature",

    # ── Communication & language ──
    "叫": "communication", "名字": "communication",
    "说": "communication", "读": "communication", "写": "communication",
    "问": "communication", "听": "communication",
    "汉语": "communication", "汉字": "communication", "字": "communication",
    "认识": "communication", "习": "communication",
    "打电话": "communication",
    "怎么说": "communication", "怎么写": "communication",
    "会说汉语": "communication", "请问": "communication",

    # ── Movement & transport ──
    "去": "movement", "来": "movement", "回": "movement",
    "出": "movement", "飞": "movement", "坐": "movement",
    "回来": "movement", "坐下": "movement",
    "开": "movement", "开车": "movement",
    "坐飞机": "movement", "坐出租车": "movement", "一起去": "movement",

    # ── Emotion & quality ──
    "好": "emotion", "喜欢": "emotion", "爱": "emotion",
    "想": "emotion", "高兴": "emotion", "漂亮": "emotion",
    "很好": "emotion", "很高兴": "emotion", "很漂亮": "emotion",
    "我爱你": "emotion", "认识你很高兴": "emotion",
    "我很好": "emotion",

    # ── Greetings & polite ──
    "你好吗": "greeting", "对不起": "greeting", "没关系": "greeting",
    "不客气": "greeting", "再见": "greeting", "谢谢": "greeting",
    "请": "greeting", "大家好": "greeting",

    # ── Daily actions ──
    "做": "action", "工作": "action", "买": "action",
    "看": "action", "睡觉": "action", "住": "action",
    "看见": "action", "看电视": "action",
    "想买": "action", "买东西": "action",

    # ── Grammar & structural ──
    "不": "grammar", "吗": "grammar", "的": "grammar",
    "了": "grammar", "呢": "grammar", "是": "grammar",
    "有": "grammar", "会": "grammar", "能": "grammar",
    "个": "grammar", "本": "grammar", "很": "grammar",
    "太": "grammar", "也": "grammar", "和": "grammar",
    "都": "grammar", "一起": "grammar", "啊": "grammar",
    "有没有": "grammar",

    # ── Misc ──
    "工": "action",
}

with open(INPUT, "r", encoding="utf-8") as f:
    vocab = json.load(f)

missing = []
for entry in vocab:
    word = entry["word"]
    if word in CATEGORY_MAP:
        entry["category"] = CATEGORY_MAP[word]
    else:
        missing.append(word)
        entry["category"] = "other"

if missing:
    print(f"⚠ {len(missing)} words defaulted to 'other':")
    for w in missing:
        print(f"  {w}")

# Verify category distribution
from collections import Counter
cats = Counter(e["category"] for e in vocab)
print(f"\nCategory distribution ({len(vocab)} words):")
for cat, count in cats.most_common():
    print(f"  {cat}: {count}")

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(vocab, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"\n✓ Written to {OUTPUT}")
