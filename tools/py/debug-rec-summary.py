#!/usr/bin/env python3
"""教师工作台 .debug-rec 录制日志摘要（一次性辅助脚本）。

读取 LAN 模式上报的调试录制文件（见 docs/guides/development.md「录制复现日志」），
输出录制头部信息、按事件类型统计的条数，以及最后若干条事件原文，
便于快速判断一次复现覆盖了哪些路径。

用法:
    python tools/py/debug-rec-summary.py            # 最新一份录制
    python tools/py/debug-rec-summary.py --all      # 全部录制文件
    python tools/py/debug-rec-summary.py <文件路径>
    python tools/py/debug-rec-summary.py -n 20      # 末尾输出 20 条事件
"""

import argparse
import re
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table

REC_DIR = Path(__file__).resolve().parents[2] / ".debug-rec"
EVENT_RE = re.compile(r"^\d{2}:\d{2}\.\d{3}\s+([A-Z][A-Z ]*)")
HEADER_PREFIXES = ("build:", "origin:", "recId:", "时间:")


def parse(path: Path) -> tuple[dict[str, str], list[tuple[str, str]]]:
    """返回 (头部信息, [(事件类型, 原始行)])；无法解析的行被忽略。"""
    header: dict[str, str] = {}
    events: list[tuple[str, str]] = []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.rstrip("\r")
        if not line or line.startswith("---"):
            continue
        m = EVENT_RE.match(line)
        if m:
            events.append((m.group(1).strip(), line))
        elif line.startswith(HEADER_PREFIXES):
            key, _, value = line.partition(":")
            header[key.strip()] = value.strip()
    return header, events


def main() -> int:
    ap = argparse.ArgumentParser(description="教师工作台 .debug-rec 录制日志摘要")
    ap.add_argument("file", nargs="?", help="指定录制文件；缺省使用最新一份")
    ap.add_argument("-n", "--tail", type=int, default=8, help="额外输出最后 N 条事件（默认 8）")
    ap.add_argument("--all", action="store_true", help="统计全部录制文件")
    args = ap.parse_args()

    console = Console()
    if args.file:
        files = [Path(args.file)]
    elif args.all:
        files = sorted(REC_DIR.glob("*.log"))
    else:
        candidates = sorted(REC_DIR.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
        files = candidates[:1]

    if not files:
        console.print("[red]没有找到录制文件。[/]")
        return 1

    total = 0
    for path in files:
        header, events = parse(path)
        console.print(f"[bold]{path.name}[/]")
        for key, value in header.items():
            console.print(f"  {key}: {value}")

        counts: dict[str, int] = {}
        for kind, _ in events:
            counts[kind] = counts.get(kind, 0) + 1
        if counts:
            table = Table(title="事件统计")
            table.add_column("类型")
            table.add_column("条数", justify="right")
            for kind, count in sorted(counts.items(), key=lambda kv: -kv[1]):
                table.add_row(kind, str(count))
            console.print(table)

        tail = events[-args.tail :] if events else []
        if tail:
            console.print(f"最后 {len(tail)} 条事件：")
            for _, line in tail:
                console.print(f"  {line}")
        total += len(events)
        console.print()

    console.print(f"共 {len(files)} 个文件、{total} 条事件。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
