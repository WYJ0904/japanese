import time
import unittest
from collections import defaultdict
from unittest import mock

from vocabulary_index import (
    BoundedTTLCache,
    VOCABULARY_BY_LEVEL,
    VocabularyIndex,
    english_morphology_keys,
    normalize_word,
)


class VocabularyIndexTests(unittest.TestCase):
    def test_nfkc_case_and_kana_normalization(self):
        self.assertEqual(normalize_word("Ａｐｐｌｅ", "english"), "apple")
        self.assertEqual(normalize_word("  APPLE  ", "english"), "apple")
        self.assertEqual(
            normalize_word("\u30b3\u30fc\u30d2\u30fc", "japanese"),
            normalize_word("\u3053\u30fc\u3072\u30fc", "japanese"),
        )

    def test_exact_then_prefix_order_is_stable(self):
        index = VocabularyIndex(
            {
                "english": {
                    "primary_3": ["application", "apple", "app"],
                }
            }
        )
        results = index.search("english", "primary_3", query="app", count=3)
        self.assertEqual([item["word"] for item in results], ["app", "apple", "application"])
        self.assertEqual(
            [item["match_type"] for item in results],
            ["exact", "prefix", "prefix"],
        )
        self.assertEqual(results, index.search("english", "primary_3", query="app", count=3))

    def test_english_morphology_matches_common_inflections(self):
        self.assertIn("apple", english_morphology_keys("apples"))
        self.assertIn("study", english_morphology_keys("studies"))
        index = VocabularyIndex(
            {"english": {"primary_3": ["apple", "study", "run"]}}
        )
        self.assertEqual(
            index.search("english", "primary_3", query="apples", count=1)[0]["word"],
            "apple",
        )
        self.assertEqual(
            index.search("english", "primary_3", query="studies", count=1)[0]["word"],
            "study",
        )

    def test_same_level_fuzzy_precedes_adjacent_level(self):
        index = VocabularyIndex(
            {
                "english": {
                    "primary_3": ["planet"],
                    "primary_4": ["planer", "plane"],
                }
            }
        )
        results = index.search("english", "primary_3", query="planat", count=3)
        self.assertEqual(results[0]["word"], "planet")
        self.assertEqual(results[0]["level"], "primary_3")
        self.assertEqual(results[0]["match_type"], "fuzzy")
        self.assertTrue(all(item["match_type"].startswith("adjacent_") for item in results[1:]))

    def test_adjacent_fallback_is_limited_to_four(self):
        index = VocabularyIndex(
            {
                "english": {
                    "primary_3": ["one"],
                    "primary_4": [f"word{index}" for index in range(20)],
                }
            }
        )
        results = index.search("english", "primary_3", count=20)
        adjacent = [item for item in results if item["level"] != "primary_3"]
        self.assertLessEqual(len(adjacent), 4)

    def test_exclusions_and_deduplication_are_normalized(self):
        index = VocabularyIndex(
            {"english": {"primary_3": ["Apple", "apple", "bag", "book"]}}
        )
        results = index.search(
            "english",
            "primary_3",
            count=10,
            exclude=["ＡＰＰＬＥ", "BAG"],
        )
        self.assertEqual([item["word"] for item in results], ["book"])

    def test_cache_key_covers_the_complete_exclusion_set(self):
        words = [f"word{number:03d}" for number in range(503)]
        index = VocabularyIndex({"english": {"primary_3": words}})
        common = words[:500]
        first = index.search(
            "english", "primary_3", count=3, exclude=[*common, "word500"]
        )
        second = index.search(
            "english", "primary_3", count=3, exclude=[*common, "word501"]
        )
        self.assertEqual(first[0]["word"], "word501")
        self.assertEqual(second[0]["word"], "word500")

    def test_curated_vocabulary_has_one_authoritative_stage_per_word(self):
        stages = defaultdict(set)
        for language, levels in VOCABULARY_BY_LEVEL.items():
            for level, words in levels.items():
                for word in words.split() if isinstance(words, str) else words:
                    stages[(language, normalize_word(word, language))].add(level)
        duplicates = {
            key: sorted(levels)
            for key, levels in stages.items()
            if len(levels) > 1
        }
        self.assertEqual(duplicates, {})

    def test_stage_validation_accepts_only_target_or_adjacent(self):
        index = VocabularyIndex()
        self.assertTrue(index.accepts_stage("apple", "english", "primary_3"))
        self.assertTrue(
            index.accepts_stage("afternoon", "english", "primary_3", allow_adjacent=True)
        )
        self.assertFalse(index.accepts_stage("hypothesis", "english", "primary_3"))

    def test_cache_is_lru_bounded_and_ttl_expiring(self):
        cache = BoundedTTLCache(max_items=8, ttl_seconds=10)
        with mock.patch("vocabulary_index.time.monotonic", return_value=100.0):
            for index in range(12):
                cache.set(index, [{"word": str(index)}])
        self.assertEqual(len(cache), 8)
        self.assertIsNone(cache.get(0))
        with mock.patch("vocabulary_index.time.monotonic", return_value=111.0):
            self.assertIsNone(cache.get(11))

    def test_cached_and_cold_local_search_meet_latency_budget(self):
        index = VocabularyIndex(cache_max_items=32)
        cold_started = time.perf_counter()
        first = index.search("english", "cet_6", query="coher", count=20)
        cold_elapsed = time.perf_counter() - cold_started
        cached_started = time.perf_counter()
        second = index.search("english", "cet_6", query="coher", count=20)
        cached_elapsed = time.perf_counter() - cached_started
        self.assertEqual(first, second)
        self.assertLess(cold_elapsed, 1.0)
        self.assertLess(cached_elapsed, 0.3)

    def test_kana_query_resolves_without_network(self):
        index = VocabularyIndex()
        katakana = index.search(
            "japanese", "n5", query="\u30b3\u30fc\u30d2\u30fc", count=5
        )
        hiragana = index.search(
            "japanese", "n5", query="\u3053\u30fc\u3072\u30fc", count=5
        )
        self.assertTrue(katakana)
        self.assertEqual(katakana, hiragana)


if __name__ == "__main__":
    unittest.main()
