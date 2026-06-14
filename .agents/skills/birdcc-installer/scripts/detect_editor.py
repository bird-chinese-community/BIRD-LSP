# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///

"""Detect which editor the user is likely working with from workspace signals."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

EDITOR_SIGNALS: list[tuple[str, str]] = [
    # Workspace-level signals
    (".vscode/settings.json", "vscode"),
    (".vscode/extensions.json", "vscode"),
    (".vscode/launch.json", "vscode"),
    (".cursorrules", "cursor"),
    (".cursor/settings.json", "cursor"),
    (".idea", "jetbrains"),
    (".idea/misc.xml", "jetbrains"),
    (".idea/vcs.xml", "jetbrains"),
    # Neovim/Vim config files (often in project root or home)
    ("init.lua", "neovim"),
    ("init.vim", "neovim"),
    (".vimrc", "vim"),
    ("_vimrc", "vim"),
    (".gvimrc", "vim"),
    (".nvimrc", "neovim"),
    # Windsurf / Trae / Kiro (OpenVSX-based forks)
    (".windsurf/settings.json", "windsurf"),
    (".trae/settings.json", "trae"),
]

HOME_EDITOR_FILES: dict[str, str] = {
    ".config/nvim/init.lua": "neovim",
    ".config/nvim/init.vim": "neovim",
    ".vimrc": "vim",
    ".vsvimrc": "vscode",
}


def detect_workspace_signals(root: Path) -> dict[str, str]:
    """Return a mapping of detected signal paths to editor names."""
    signals: dict[str, str] = {}
    for rel_path, editor in EDITOR_SIGNALS:
        candidate = root / rel_path
        if candidate.exists():
            signals[rel_path] = editor
    return signals


def detect_home_signals() -> dict[str, str]:
    """Return editor signals found in the user's home directory."""
    home = Path.home()
    signals: dict[str, str] = {}
    for rel_path, editor in HOME_EDITOR_FILES.items():
        candidate = home / rel_path
        if candidate.exists():
            signals[str(candidate)] = editor
    return signals


def compute_confidence(editors: list[str]) -> str:
    """Return high/medium/low based on signal diversity."""
    unique = set(editors)
    if len(unique) == 1 and editors:
        return "high"
    if len(unique) <= 2 and editors:
        return "medium"
    return "low"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Detect the user's editor from workspace and home-directory signals."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Project root to scan (default: current directory).",
    )
    parser.add_argument(
        "--include-home",
        action="store_true",
        help="Also scan the user's home directory for editor config files.",
    )
    args = parser.parse_args(argv)

    root = args.root.resolve()
    if not root.is_dir():
        json.dump(
            {"error": f"root is not a directory: {root}"},
            sys.stderr,
            indent=2,
            ensure_ascii=False,
        )
        sys.stderr.write("\n")
        return 2

    workspace_signals = detect_workspace_signals(root)
    home_signals = detect_home_signals() if args.include_home else {}

    all_signals = {**workspace_signals, **home_signals}
    editors = list(all_signals.values())
    detected = sorted(set(editors))

    result = {
        "root": str(root),
        "detected_editors": detected,
        "signals": all_signals,
        "confidence": compute_confidence(editors),
    }

    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
