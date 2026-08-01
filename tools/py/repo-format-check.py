#!/usr/bin/env python3
"""教师工作台文本格式合规检查（一次性辅助脚本）。

按 docs/guides/development.md §8 与根目录 .gitattributes 的约定检查文本格式。
两类检查对象含义不同：

- 仓库 blob（提交态）：git 规范化后的入库形式，一律 LF（.gitattributes
  `* text=auto eol=lf`），ps1 保留 UTF-8 BOM，bat 保持纯 ASCII；
- 磁盘工作区（§8 面向编辑器与工具产出）：源码/文档/配置 UTF-8 无 BOM + LF，
  .bat 纯 ASCII + CRLF，.ps1 UTF-8 BOM + CRLF。

默认检查仓库 blob（提交态），这是仓库格式契约的权威依据，不受 Windows 本地
core.autocrlf 检出转换影响；--working-tree 改按磁盘实际内容检查，并把
core.autocrlf 检出转换与真实违规区分开报告。未跟踪的新文件按工作区内容检查。

用法:
    python tools/py/repo-format-check.py
    python tools/py/repo-format-check.py --working-tree
"""

import argparse
import subprocess
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table

ROOT = Path(__file__).resolve().parents[2]
BINARY_SUFFIXES = {".png", ".jar", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"}


def ls_files(extra_args: list[str]) -> set[Path]:
    """git ls-files 结果转成仓库相对路径集合。"""
    result = subprocess.run(
        ["git", "ls-files", *extra_args, "-z"], cwd=ROOT, capture_output=True, text=True, check=True
    )
    return {Path(p) for p in result.stdout.split("\0") if p}


def classify(path: Path) -> str:
    """按扩展名分类：bat / ps1 / text（与 .gitattributes 一致）。"""
    if path.suffix == ".bat":
        return "bat"
    if path.suffix == ".ps1":
        return "ps1"
    return "text"


def decode_ok(data: bytes) -> bool:
    try:
        data.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def canonical_problems(path: Path, data: bytes) -> list[str]:
    """仓库 blob 应满足的规范形式：入库 LF；ps1 带 BOM；bat 纯 ASCII。"""
    if not data:
        return []
    if not decode_ok(data):
        return ["不是有效的 UTF-8 文本"]
    bom = data.startswith(b"\xef\xbb\xbf")
    crlf = data.count(b"\r\n")
    lf = data.count(b"\n") - crlf
    bare_cr = data.count(b"\r") - crlf

    problems: list[str] = []
    kind = classify(path)
    if kind == "ps1":
        if not bom:
            problems.append("应有 UTF-8 BOM")
    elif bom:
        problems.append("不应有 BOM")
    if kind == "bat" and any(b >= 128 for b in data):
        problems.append("应纯 ASCII")
    if crlf:
        problems.append(f"含 {crlf} 个 CRLF 行尾（入库应 LF）")
    if bare_cr:
        problems.append(f"含 {bare_cr} 个孤立 CR")
    return problems


def disk_problems(path: Path, data: bytes) -> list[str]:
    """磁盘工作区应满足 §8：.bat 纯 ASCII + CRLF；.ps1 BOM + CRLF；其余 LF 无 BOM。"""
    if not data:
        return []
    if not decode_ok(data):
        return ["不是有效的 UTF-8 文本"]
    bom = data.startswith(b"\xef\xbb\xbf")
    crlf = data.count(b"\r\n")
    lf = data.count(b"\n") - crlf
    bare_cr = data.count(b"\r") - crlf

    problems: list[str] = []
    kind = classify(path)
    if kind == "bat":
        if bom:
            problems.append("不应有 BOM")
        if any(b >= 128 for b in data):
            problems.append("应纯 ASCII")
        if lf:
            problems.append(f"含 {lf} 个 LF 行尾（应 CRLF）")
    elif kind == "ps1":
        if not bom:
            problems.append("应有 UTF-8 BOM")
        if lf:
            problems.append(f"含 {lf} 个 LF 行尾（应 CRLF）")
    else:
        if bom:
            problems.append("不应有 BOM")
        if crlf:
            problems.append(f"含 {crlf} 个 CRLF 行尾（应 LF）")
    if bare_cr:
        problems.append(f"含 {bare_cr} 个孤立 CR")
    return problems


def blob_bytes(path: Path) -> bytes | None:
    """读取 HEAD blob 原始字节；不存在时返回 None。"""
    try:
        result = subprocess.run(
            ["git", "show", f"HEAD:{path.as_posix()}"],
            cwd=ROOT, capture_output=True, check=True,
        )
        return result.stdout
    except subprocess.CalledProcessError:
        return None


def is_checkout_artifact(path: Path, data: bytes) -> bool:
    """工作区差异是否仅为 core.autocrlf 检出转换（blob 规范、工作区仅多 \r\n）。"""
    if classify(path) != "text":
        return False
    blob = blob_bytes(path)
    if blob is None or not blob or blob.startswith(b"\xef\xbb\xbf"):
        return False
    return data.replace(b"\r\n", b"\n") == blob


def main() -> int:
    ap = argparse.ArgumentParser(description="教师工作台文本格式合规检查")
    ap.add_argument("--working-tree", action="store_true", help="按磁盘实际内容检查（默认检查仓库 blob）")
    args = ap.parse_args()

    tracked = ls_files([])
    untracked = ls_files(["--others", "--exclude-standard"])
    files = sorted(tracked | untracked)
    console = Console()

    ok_count = 0
    violations: list[tuple[Path, str]] = []
    artifacts = 0
    skipped = 0
    for path in files:
        if path.suffix.lower() in BINARY_SUFFIXES:
            skipped += 1
            continue
        use_blob = path in tracked and not args.working_tree
        data = blob_bytes(path) if use_blob else path.read_bytes()
        problems = canonical_problems(path, data) if use_blob else disk_problems(path, data)
        if problems:
            if not use_blob and is_checkout_artifact(path, data):
                artifacts += 1
            else:
                violations.extend((path, p) for p in problems)
        else:
            ok_count += 1

    if violations:
        table = Table(title="格式违规")
        table.add_column("文件")
        table.add_column("问题")
        for path, problem in violations:
            table.add_row(path.as_posix(), problem)
        console.print(table)

    mode = "工作区磁盘内容" if args.working_tree else "仓库 blob（提交态）"
    violation_files = len({path for path, _ in violations})
    console.print(
        f"按{mode}检查 {len(files)} 个文件：合规 {ok_count}、违规 {violation_files}、"
        f"检出转换提示 {artifacts}、二进制跳过 {skipped}、未跟踪 {len(untracked)}。"
    )
    if artifacts and args.working_tree:
        console.print("[yellow]检出转换提示：工作区行尾与规范 blob 仅差 CRLF，属 core.autocrlf 检出产物，不计入违规。[/]")
    if violations:
        console.print("[red]存在格式违规，见上方列表。[/]")
        return 1
    console.print("[green]全部文本文件符合格式约定。[/]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
