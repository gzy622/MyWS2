#!/usr/bin/env python3
"""教师工作台 Python 环境自检（一次性辅助脚本）。

验证 Python 解释器与已安装的第三方包均可正常导入，并输出版本信息。
任一项导入失败时以非零退出码结束，供调用方判断环境是否可用。

用法:
    python tools/py/env-check.py
    python tools/py/env-check.py --check-lan   # 额外探测本地 LAN 服务健康端点
"""

import argparse
import importlib
import platform
import sys
from importlib.metadata import PackageNotFoundError, version

from rich.console import Console
from rich.table import Table

# 发行包名 -> (导入模块名, 用途说明)
EXPECTED = {
    "requests": ("requests", "HTTP 客户端"),
    "rich": ("rich", "终端富文本输出"),
    "tqdm": ("tqdm", "进度条"),
    "ipython": ("IPython", "交互式解释器"),
    "python-dotenv": ("dotenv", ".env 文件读取"),
    "pyyaml": ("yaml", "YAML 解析"),
    "fastapi": ("fastapi", "Web 框架"),
    "uvicorn": ("uvicorn", "ASGI 服务器"),
    "flask": ("flask", "Web 微框架"),
    "pytest": ("pytest", "测试框架"),
    "ruff": ("ruff", "代码检查与格式化"),
    "mypy": ("mypy", "静态类型检查"),
}


def check_lan_health(console: Console) -> None:
    """可选：请求 LAN 服务健康端点，验证 requests 的真实网络路径。"""
    url = "http://localhost:8080/__health"
    try:
        import requests
    except ImportError:
        console.print(f"[yellow][跳过][/] requests 不可用，不检查 {url}")
        return
    try:
        resp = requests.get(url, timeout=3)
        ok = resp.ok and "id" in resp.json()
        style = "green" if ok else "red"
        console.print(f"[{style}][{'通过' if ok else '失败'}][/] GET {url} → HTTP {resp.status_code}")
    except requests.RequestException as exc:
        console.print(f"[yellow][跳过][/] LAN 服务未运行（{url}）：{type(exc).__name__}: {exc}")


def main() -> int:
    ap = argparse.ArgumentParser(description="教师工作台 Python 环境自检")
    ap.add_argument("--check-lan", action="store_true", help="额外请求本地 LAN 服务健康端点")
    args = ap.parse_args()

    console = Console()
    console.print(f"[bold]Python[/bold] {sys.version.split()[0]} · {sys.executable}")
    console.print(f"平台: {platform.platform()}")

    rows: list[tuple[str, str, str, str]] = []
    failed: list[str] = []
    for pkg, (import_name, purpose) in EXPECTED.items():
        try:
            mod = importlib.import_module(import_name)
            try:
                ver = version(pkg)
            except PackageNotFoundError:
                ver = getattr(mod, "__version__", "?")
            rows.append((pkg, ver, purpose, "[green]✓[/]"))
        except Exception as exc:
            # 自检需要捕获任意导入失败，统一列进结果表
            rows.append((pkg, "—", purpose, f"[red]✗ {type(exc).__name__}[/]"))
            failed.append(pkg)

    table = Table(title="已装包导入检查")
    table.add_column("包", style="bold")
    table.add_column("版本")
    table.add_column("用途")
    table.add_column("状态", justify="center")
    for row in rows:
        table.add_row(*row)
    console.print(table)

    if args.check_lan:
        check_lan_health(console)

    if failed:
        console.print(f"[red]失败 {len(failed)} 个：{'、'.join(failed)}[/]")
        return 1
    console.print("[green]全部通过，Python 环境可正常使用。[/]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
