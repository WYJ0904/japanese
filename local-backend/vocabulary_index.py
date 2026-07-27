from __future__ import annotations

import hashlib
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from difflib import SequenceMatcher


ENGLISH_LEVEL_ORDER = (
    "primary_3",
    "primary_4",
    "primary_5",
    "primary_6",
    "middle_1",
    "middle_2",
    "middle_3",
    "high_1",
    "high_2",
    "high_3",
    "cet_4",
    "cet_6",
)
JAPANESE_LEVEL_ORDER = ("n5", "n4", "n3", "n2", "n1")

VOCABULARY_BY_LEVEL = {
    "english": {
        "primary_3": """
            apple bag bed bird black blue book boy cake cat chair class clock close
            cold colour come dad desk dog door draw drink ear egg eight eye face family
            father fish five flower four friend girl go good green hand happy head hello
            help home hot house how I jump key leg like look love lunch map milk mother
            name nine nose one open orange pen pencil pig play please red rice run school
            seven sing sister six small stand student teacher ten thank three tiger two
            walk water white window yellow you zoo
        """,
        "primary_4": """
            afternoon animal answer art baby bathroom beautiful bedroom breakfast brother
            brown bus busy buy camera canteen car classroom clean clothes computer cook
            dinner doctor dress driver early evening farmer floor food football garden
            glasses great gym hair homework horse hospital hungry jacket kitchen library
            light living long maths morning music nurse parent picture playground read
            right river ruler science sheep short skirt sleep sock song speak story strong
            study sunny table tall these those today tree trousers uncle warm wash watch
            weather welcome whose woman
        """,
        "primary_5": """
            always autumn because begin beside bottle bridge bring building catch children
            clever cloudy collect country dance delicious different difficult enjoy favourite
            festival first forest Friday front game gift give healthy holiday kind lake
            language later listen market Monday mountain museum often park party people
            plant polite pretty question quiet rainy remember Saturday season second show
            sometimes spring station summer Sunday supermarket swim Thursday together
            Tuesday usually village Wednesday weekend winter world write year yesterday
        """,
        "primary_6": """
            abroad airport amazing arrive beach before bicycle cinema city climb comic
            concert dictionary direction east email exciting exercise famous film finish
            future hobby hotel idea important interesting internet journey learn leave
            lesson letter message minute moon newspaper north office passport past present
            problem race restaurant robot save shop south space special start street
            theatre ticket travel trip useful visit west winner wonderful worry
        """,
        "middle_1": """
            activity age also apartment basketball borrow calendar celebrate center club
            complete conversation cousin culture daily decide describe diary during each
            everyone example expensive experience explain friendly geography habit history
            hundred invite join local lucky magazine member movie never number practice
            prepare price really reason report result rule subject surprise team thousand
            traditional vacation volunteer weekday young
        """,
        "middle_2": """
            advice although appear article attention average avoid believe care character
            choice communication competition continue control creative deal develop
            difference environment fact formal finally follow foreign improve instead
            knowledge least lonely meaning mind nature necessary notice opinion perfect
            perhaps population possible protect public relationship serious service
            several similar situation society successful technology through trust
        """,
        "middle_3": """
            ability achieve advantage allow ancient cause certain challenge common condition
            connect consider courage create decision discover education effort energy
            especially event influence information introduce invention manage method
            mistake modern opportunity organize patient perform pressure progress project
            purpose receive reduce research respect responsibility solve standard suggest
            support value whether
        """,
        "high_1": """
            academic adapt attitude benefit campaign career comment compare concern conduct
            confident contact context contribute custom demand determine economic effective
            emotion establish feature focus function global identity independent individual
            industry inspire issue maintain material measure mental occur particular
            positive process range recognize resource respond significant solution specific
            strategy structure
        """,
        "high_2": """
            access approach assume aware capacity circumstance complex concept consequence
            convey contrast convince cooperate critical define demonstrate despite
            element engage evaluate evidence expand factor flexible impact indicate
            interpret involve likely motivate obtain perspective principle promote
            recover relevant require role secure select source theory transfer various
        """,
        "high_3": """
            advocate alternative analyse anticipate appropriate argument assess authority
            brief clarify conflict consistent consult contemporary criteria decline
            domestic emerge emphasis ensure ethical generate implement imply initial
            insight integrate justify legal mechanism outcome priority professional
            proportion react regulate resolve restrict retain shift stable valid
        """,
        "cet_4": """
            abandon absolute absorb abstract accompany accurate acquire adequate adjust
            administration adopt afford apparent appeal application appoint appreciate
            approximately atmosphere attach available allocate barrier category combination
            commercial commit communicate compensate concentrate conclude considerable
            constant construct consume convention declare efficient estimate exposure
            finance fundamental guarantee investigate modify potential primary procedure
        """,
        "cet_6": """
            abolish abrupt accumulate acknowledge adjacent ambiguous analogy arbitrary
            articulate attain attribute authentic autonomous coherent coincide compile
            comprehensive concede contemplate contradict controversy crucial cumulative
            deteriorate dilemma discriminate elaborate empirical equivalent facilitate
            formulate hypothesis inevitable inherent manipulate marginal nevertheless
            paradox preliminary profound reinforce reluctant sophisticated subordinate
            supplement tentative trigger undermine
        """,
    },
    "japanese": {
        "n5": """
            私 あなた 人 子供 先生 学生 学校 本 水 火 木 金 土 日 月 年 時
            今日 明日 昨日 朝 昼 夜 毎日 家 部屋 机 椅子 車 電車 駅 道 店
            会社 友達 父 母 兄 姉 弟 妹 犬 猫 魚 肉 野菜 果物 ご飯 お茶
            コーヒー 行く 来る 帰る 食べる 飲む 見る 聞く 話す 読む 書く
            買う 大きい 小さい 新しい 古い 良い 悪い 暑い 寒い 上 下 左 右
        """,
        "n4": """
            会議 受付 住所 運転 海岸 会場 関係 季節 急行 教育 近所 経験
            工場 交通 高校 公園 国際 最近 産業 試合 事故 自由 習慣 準備
            紹介 招待 将来 食事 新聞 世界 説明 相談 卒業 大切 台風 地下鉄
            注意 駐車場 都合 特別 入院 発音 必要 文化 返事 法律 約束 予定
            連絡 安全 以外 一度 残念 十分 親切 簡単 複雑 続ける 間に合う
        """,
        "n3": """
            愛情 安定 意識 一般 印象 営業 影響 援助 応募 改善 確認 活動
            完成 管理 期待 記録 技術 議論 協力 具体 結果 健康 現在 原因
            効果 行動 国民 作業 支援 事実 実際 社会 収入 状況 情報 信頼
            成功 責任 選択 対象 態度 地域 調査 能力 判断 方法 目的 利用
            理解 連続 重要 適切 積極的 豊か 深刻 増加 減少 解決 進める
        """,
        "n2": """
            圧倒 安易 維持 一致 運営 衛生 応用 解釈 確保 革新 環境 観測
            基準 義務 供給 競争 強調 傾向 契約 貢献 構成 雇用 採用 資源
            実施 需要 条件 推進 制度 成果 政策 専門 組織 対策 達成 調整
            提供 適用 展開 統計 導入 独立 背景 評価 普及 分析 変化 方針
            予測 要求 論理 柔軟 慎重 著しい 伴う 防ぐ 促す 認める
        """,
        "n1": """
            暗黙 威厳 一括 逸脱 概念 還元 規範 脅威 局面 均衡 経緯 権限
            顕著 原則 源泉 控除 根拠 錯覚 指針 趣旨 収束 循環 措置 妥当
            抽象 秩序 追及 定義 展望 動向 認識 配慮 反響 比率 複合 本質
            枠組み 矛盾 優位 抑制 倫理 類推 論点 簡潔 緻密 謙虚 壮大
            甚だしい 覆す 踏まえる 損なう 遂げる 顧みる 免れる 促進
        """,
    },
}


def normalize_kana(value):
    output = []
    for character in value:
        code = ord(character)
        if 0x30A1 <= code <= 0x30F6:
            output.append(chr(code - 0x60))
        else:
            output.append(character)
    return "".join(output)


def normalize_word(value, language):
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    text = re.sub(r"\s+", "", text)
    if language == "english":
        return text.casefold()
    return normalize_kana(text)


def english_morphology_keys(value):
    value = normalize_word(value, "english")
    keys = {value}
    if len(value) > 4 and value.endswith("ies"):
        keys.add(value[:-3] + "y")
    if len(value) > 3 and value.endswith("es"):
        keys.add(value[:-2])
    if len(value) > 3 and value.endswith("s"):
        keys.add(value[:-1])
    if len(value) > 5 and value.endswith("ing"):
        stem = value[:-3]
        keys.add(stem)
        keys.add(stem + "e")
        if len(stem) > 2 and stem[-1] == stem[-2]:
            keys.add(stem[:-1])
    if len(value) > 4 and value.endswith("ed"):
        stem = value[:-2]
        keys.add(stem)
        keys.add(stem + "e")
        if len(stem) > 2 and stem[-1] == stem[-2]:
            keys.add(stem[:-1])
    return {item for item in keys if item}


class BoundedTTLCache:
    def __init__(self, max_items=256, ttl_seconds=15 * 60):
        self.max_items = max(8, int(max_items))
        self.ttl_seconds = max(1, int(ttl_seconds))
        self._items = OrderedDict()
        self._lock = threading.RLock()

    def get(self, key):
        now = time.monotonic()
        with self._lock:
            record = self._items.pop(key, None)
            if not record:
                return None
            created_at, value = record
            if now - created_at >= self.ttl_seconds:
                return None
            self._items[key] = record
            return [dict(item) for item in value]

    def set(self, key, value):
        with self._lock:
            self._items.pop(key, None)
            self._items[key] = (time.monotonic(), [dict(item) for item in value])
            while len(self._items) > self.max_items:
                self._items.popitem(last=False)

    def clear(self):
        with self._lock:
            self._items.clear()

    def __len__(self):
        with self._lock:
            return len(self._items)


class VocabularyIndex:
    def __init__(self, vocabulary=None, cache_max_items=256, cache_ttl_seconds=15 * 60):
        raw = vocabulary or VOCABULARY_BY_LEVEL
        self._entries = {}
        self._level_words = {}
        self._orders = {
            "english": ENGLISH_LEVEL_ORDER,
            "japanese": JAPANESE_LEVEL_ORDER,
        }
        for language, levels in raw.items():
            self._entries[language] = {}
            for level, text in levels.items():
                words = text.split() if isinstance(text, str) else list(text)
                entries = []
                seen = set()
                for position, word in enumerate(words):
                    normalized = normalize_word(word, language)
                    if not normalized or normalized in seen:
                        continue
                    seen.add(normalized)
                    entries.append(
                        {
                            "word": word,
                            "normalized": normalized,
                            "language": language,
                            "level": level,
                            "position": position,
                        }
                    )
                self._entries[language][level] = entries
                self._level_words[(language, level)] = {item["normalized"] for item in entries}
        self.cache = BoundedTTLCache(cache_max_items, cache_ttl_seconds)

    def adjacent_levels(self, language, level):
        order = self._orders.get(language, ())
        if level not in order:
            return ()
        index = order.index(level)
        output = []
        if index > 0:
            output.append(order[index - 1])
        if index + 1 < len(order):
            output.append(order[index + 1])
        return tuple(output)

    def stage_for(self, word, language):
        normalized = normalize_word(word, language)
        return [
            level
            for level in self._orders.get(language, ())
            if normalized in self._level_words.get((language, level), set())
        ]

    def accepts_stage(self, word, language, level, allow_adjacent=False):
        levels = {level}
        if allow_adjacent:
            levels.update(self.adjacent_levels(language, level))
        return any(
            normalize_word(word, language) in self._level_words.get((language, candidate), set())
            for candidate in levels
        )

    @staticmethod
    def _match_score(entry, query, language):
        normalized = entry["normalized"]
        if not query:
            return 500, "level"
        if normalized == query:
            return 1000, "exact"
        if normalized.startswith(query):
            return 900 - min(100, len(normalized) - len(query)), "prefix"
        if language == "english":
            query_roots = english_morphology_keys(query)
            entry_roots = english_morphology_keys(normalized)
            if query_roots & entry_roots:
                return 790, "morphology"
        ratio = SequenceMatcher(None, query, normalized).ratio()
        minimum = 0.72 if max(len(query), len(normalized)) <= 7 else 0.66
        if ratio >= minimum:
            return int(600 * ratio), "fuzzy"
        return 0, ""

    def search(self, language, level, query="", count=15, exclude=None):
        language = str(language or "").strip().lower()
        level = str(level or "").strip().lower()
        if language not in self._entries or level not in self._entries[language]:
            return []
        count = max(1, min(int(count or 15), 200))
        normalized_query = normalize_word(query, language)
        excluded = {
            normalize_word(item, language)
            for item in (exclude or [])
            if normalize_word(item, language)
        }
        excluded_digest = hashlib.sha256(
            "\0".join(sorted(excluded)).encode("utf-8")
        ).hexdigest()
        cache_key = (
            language,
            level,
            normalized_query,
            count,
            excluded_digest,
        )
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        ranked = []
        for entry in self._entries[language][level]:
            if entry["normalized"] in excluded:
                continue
            score, match_type = self._match_score(entry, normalized_query, language)
            if score:
                ranked.append((score, entry["position"], entry, match_type))
        ranked.sort(key=lambda item: (-item[0], item[1], item[2]["normalized"]))

        results = []
        seen = set(excluded)
        for score, _, entry, match_type in ranked:
            if entry["normalized"] in seen:
                continue
            seen.add(entry["normalized"])
            results.append(
                {
                    "word": entry["word"],
                    "level": level,
                    "match_type": match_type,
                    "score": score,
                }
            )
            if len(results) >= count:
                break

        adjacent_limit = min(4, max(0, count - len(results)))
        if adjacent_limit:
            adjacent_ranked = []
            for adjacent_index, adjacent in enumerate(self.adjacent_levels(language, level)):
                for entry in self._entries[language].get(adjacent, []):
                    if entry["normalized"] in seen:
                        continue
                    score, match_type = self._match_score(entry, normalized_query, language)
                    if not normalized_query:
                        score, match_type = 180 - adjacent_index, "adjacent"
                    elif score:
                        score = min(score, 350) - adjacent_index
                        match_type = f"adjacent_{match_type}"
                    if score:
                        adjacent_ranked.append(
                            (score, adjacent_index, entry["position"], entry, match_type)
                        )
            adjacent_ranked.sort(
                key=lambda item: (-item[0], item[1], item[2], item[3]["normalized"])
            )
            for score, _, _, entry, match_type in adjacent_ranked:
                if entry["normalized"] in seen:
                    continue
                seen.add(entry["normalized"])
                results.append(
                    {
                        "word": entry["word"],
                        "level": entry["level"],
                        "match_type": match_type,
                        "score": score,
                    }
                )
                if len(results) >= count or sum(
                    1 for item in results if item["level"] != level
                ) >= adjacent_limit:
                    break

        self.cache.set(cache_key, results)
        return [dict(item) for item in results]


LOCAL_VOCABULARY_INDEX = VocabularyIndex()
