#!/usr/bin/env python3
"""
字体子集化脚本 —— 改完页面文案后重跑，避免新增的字变成豆腐块。

依赖：
    pip install fonttools brotli

用法（在项目根目录）：
    python tools/make-fonts.py --noto /path/NotoSerifSC-VF.ttf --mashan /path/MaShanZheng-Regular.ttf

字集策略：
    Noto Serif SC    正文用，收 GB2312 全字集（6763 汉字 + 符号）+ 页面现有全部字符，
                     以后随手加常用中文也不会缺字
    Ma Shan Zheng    装饰用（班训 / 签名 / 页脚），只收页面现有字符，
                     新增文案后必须重跑，否则新字会回退成楷体

输出：assets/fonts/NotoSerifSC.woff2、assets/fonts/MaShanZheng.woff2
完成后记得把 index.html 里 @font-face 的 ?v=N 加一。
"""

import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_DIR = os.path.join(ROOT, "assets", "fonts")

EXTRA_SYMBOLS = (
    "，。、；：？！“”‘’（）《》〈〉【】〔〕—…·～￥％＃＠＆＊＋－／＜＝＞"
    "±×÷°′″㎡№→←↑↓■□●○◆◇▲△▼▽★☆♪♫❀①②③④⑤"
)


def collect_text():
    parts = []
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as handle:
        parts.append(handle.read())
    media = os.path.join(ROOT, "media")
    if os.path.isdir(media):
        for name in sorted(os.listdir(media)):
            if name.endswith(".lrc"):
                with open(os.path.join(media, name), encoding="utf-8") as handle:
                    parts.append(handle.read())
    return "".join(parts)


def gb2312_chars():
    found = set()
    for high in range(0xA1, 0xF8):
        for low in range(0xA1, 0xFF):
            try:
                found.add(bytes([high, low]).decode("gb2312"))
            except UnicodeDecodeError:
                continue
    return found


def write_charset(path, chars):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("".join(sorted(chars)))
    return len(chars)


def run_subset(source, charset_file, target):
    cmd = [
        sys.executable, "-m", "fontTools.subset", source,
        "--text-file=" + charset_file,
        "--flavor=woff2",
        "--no-hinting",
        "--layout-features=kern",
        "--name-IDs=1,2,3,4,6",
        "--output-file=" + target,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit("subset failed:\n" + (result.stderr or result.stdout))
    return os.path.getsize(target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--noto", required=True, help="NotoSerifSC-VF.ttf 路径")
    parser.add_argument("--mashan", required=True, help="MaShanZheng-Regular.ttf 路径")
    args = parser.parse_args()

    for path in (args.noto, args.mashan):
        if not os.path.exists(path):
            raise SystemExit("找不到字体文件：" + path)

    text = collect_text()
    page_chars = set(text)
    base = {chr(code) for code in range(0x20, 0x7F)} | set(EXTRA_SYMBOLS)

    noto_set = base | gb2312_chars() | page_chars
    mashan_set = base | page_chars

    tmp_dir = os.path.join(ROOT, ".font-tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    jobs = [
        (args.noto, noto_set, "NotoSerifSC.woff2"),
        (args.mashan, mashan_set, "MaShanZheng.woff2"),
    ]

    for source, chars, out_name in jobs:
        charset_file = os.path.join(tmp_dir, out_name + ".txt")
        count = write_charset(charset_file, chars)
        target = os.path.join(FONTS_DIR, out_name)
        size = run_subset(source, charset_file, target)
        before = os.path.getsize(source)
        print(
            "%-22s %6.2f MB -> %5.2f MB  （%d 个字符）"
            % (out_name, before / 1048576, size / 1048576, count)
        )

    # 校验：页面里出现的每个非 ASCII 字符都要在生成结果里（emoji 由系统字体兜底）
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return
    for _, _, out_name in jobs:
        font = TTFont(os.path.join(FONTS_DIR, out_name))
        cmap = font.getBestCmap()
        missing = sorted({ch for ch in text if ord(ch) > 0x7F and ord(ch) not in cmap})
        font.close()
        if missing:
            print("  %s 缺少 %d 个字符（由系统字体兜底）：%s" % (out_name, len(missing), "".join(missing)[:40]))
    print("完成。记得把 index.html 里 @font-face 的 ?v= 加一。")


if __name__ == "__main__":
    main()
