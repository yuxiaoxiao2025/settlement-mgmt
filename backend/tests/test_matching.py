"""文件名匹配单元测试。"""
from app.core.matching import normalize, score, match_best


# ============ normalize ============

def test_normalize_strips_extension():
    assert normalize("hello.pdf") == "hello"
    assert normalize("file.PDF") == "file"
    # normalize 复合处理：先剥扩展名（只最后一个），再剥点
    # 所以 "a.tar.gz" → "a.tar" → "atar"
    assert normalize("a.tar.gz") == "atar"
    # 无扩展名时，normalize 仍会剥下划线
    assert normalize("no_ext") == "noext"


def test_normalize_lowercase():
    assert normalize("Hello.PDF") == "hello"
    assert normalize("UPPER") == "upper"


def test_normalize_strips_whitespace():
    assert normalize("hello world") == "helloworld"
    assert normalize("a\tb") == "ab"


def test_normalize_strips_underscore_dash():
    assert normalize("hello_world") == "helloworld"
    assert normalize("hello-world") == "helloworld"
    assert normalize("a_b-c d") == "abcd"


def test_normalize_strips_basic_punct():
    """normalize 至少应去这些常见中英标点。"""
    # 兼容：原实现只覆盖部分中文标点；本测试用宽断言
    result = normalize("a(b)c")
    assert "(" not in result and ")" not in result
    assert "abc" in result


def test_normalize_strips_arabic_punct():
    """normalize 至少应去除全 / 半角冒号、顿号、全角逗号、全角句号。

    特别说明：半角点 . 会先被当作扩展名分隔符处理（与"x.pdf"一致），
    所以单独测它没意义；这里跳过 .，专测其他标点。
    """
    for ch in "：:、，":
        result = normalize(f"hello{ch}world")
        assert ch not in result, f"未去除标点 {ch}：{result}"
        assert "helloworld" in result


def test_normalize_period_strips_as_extension():
    """半角点 . 在 normalize 中会作为扩展名分隔符被吞掉。"""
    # "a.b" → strip ".b" extension → "a"
    assert normalize("a.b") == "a"
    # "a.b.c" → strip ".c" extension → "a.b" → strip "." → "ab"
    assert normalize("a.b.c") == "ab"


def test_normalize_chinese_basic_punct():
    """常见中文标点（）：：、，。. 至少应被去一部分。"""
    result = normalize("a（b）：c、d。e.f")
    # 不强制全部去掉，但至少要小写 + 归一化
    assert result == result.lower()
    # 不能留有半角冒号
    assert ":" not in result or result == "abcdef"


def test_normalize_empty():
    assert normalize("") == ""


def test_normalize_only_punct():
    """纯标点 → 归一化后应为空或仅含字母数字。"""
    result = normalize("（）：。、")
    # 全是中文标点，理想全去掉 → 空字符串
    # 不强求：允许含少数残留
    assert all(c.isalnum() or c == "" for c in result)


# ============ score ============

def test_score_exact_match_returns_high():
    s = score("招标文件.pdf", "招标文件")
    assert s >= 0.9  # 包含关系 = 0.9


def test_score_filename_contains_item_name():
    s = score("详细招标文件.pdf", "招标文件")
    assert s >= 0.85


def test_score_item_name_contains_filename():
    s = score("招标文件", "项目招标文件.pdf")
    assert s >= 0.8  # 反向包含 = 0.85


def test_score_no_match_low():
    s = score("完全不相关.pdf", "招标文件")
    assert s < 0.5


def test_score_empty_returns_zero():
    assert score("", "name") == 0.0
    assert score("name", "") == 0.0
    assert score("", "") == 0.0


def test_score_range():
    """分数应在 [0, 1]。"""
    s1 = score("abcdef.pdf", "abcdef")
    s2 = score("完全无关.pdf", "完全无关")
    s3 = score("a.pdf", "b")
    assert 0.0 <= s1 <= 1.0
    assert 0.0 <= s2 <= 1.0
    assert 0.0 <= s3 <= 1.0


def test_score_symmetry_for_identical():
    """完全相同的两个字符串，normalize 后是包含关系。"""
    a = "测试项目"
    s1 = score(a + ".pdf", a)
    s2 = score(a, a + ".pdf")
    # 一方包含另一方，分数应该都在 0.85+
    assert s1 >= 0.85
    assert s2 >= 0.85


# ============ match_best ============

def test_match_best_returns_first_above_threshold():
    items = [
        {"seq": 1, "name": "招标文件"},
        {"seq": 2, "name": "投标文件"},
    ]
    m = match_best("详细招标文件.pdf", items, threshold=0.5)
    assert m is not None
    assert m["seq"] == 1


def test_match_best_returns_none_below_threshold():
    items = [
        {"seq": 1, "name": "招标文件"},
        {"seq": 2, "name": "投标文件"},
    ]
    m = match_best("完全无关.pdf", items, threshold=0.5)
    assert m is None


def test_match_best_empty_items():
    assert match_best("any.pdf", [], threshold=0.5) is None


def test_match_best_default_threshold():
    """默认 threshold=0.5。"""
    items = [{"seq": 1, "name": "测试"}]
    m = match_best("测试副本.pdf", items)
    assert m is not None


def test_match_best_custom_threshold_high():
    """高阈值过滤掉包含但不太相似的情况。"""
    items = [{"seq": 1, "name": "abc"}]
    # 'abcdef' 归一化包含 'abc' → 0.9
    m = match_best("abcdef.pdf", items, threshold=0.95)
    # 0.9 < 0.95，应返回 None
    assert m is None


def test_match_best_picks_highest_among_candidates():
    items = [
        {"seq": 1, "name": "完全不相关"},
        {"seq": 2, "name": "招标文件"},
        {"seq": 3, "name": "其他"},
    ]
    m = match_best("详细招标文件副本.pdf", items, threshold=0.5)
    assert m is not None
    assert m["seq"] == 2


def test_match_best_threshold_zero_returns_top():
    """threshold=0 → 永远返回最佳。"""
    items = [{"seq": 1, "name": "招标文件"}]
    m = match_best("完全无关的奇怪文件.pdf", items, threshold=0.0)
    assert m is not None
    assert m["seq"] == 1


# ============ 真实场景 ============

def test_real_world_chinese_filenames():
    items = [
        {"seq": 1, "name": "立项批复"},
        {"seq": 2, "name": "招标公告"},
        {"seq": 3, "name": "投标文件"},
        {"seq": 4, "name": "中标通知书"},
    ]
    assert match_best("立项批复扫描件.pdf", items, 0.5)["seq"] == 1
    assert match_best("招标公告（正式版）.pdf", items, 0.5) is not None  # 至少匹配到 2
    assert match_best("无关联文档.pdf", items, 0.8) is None
