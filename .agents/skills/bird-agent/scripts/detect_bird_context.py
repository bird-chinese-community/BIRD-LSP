# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///

"""Detect BIRD configuration context in the current working directory."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

VERSION_RE = re.compile(r"bird(\d+|6)?\.conf$")

# Do not read files larger than this when sampling for BIRD keywords.
MAX_SAMPLE_BYTES = 10 * 1024 * 1024


def version_from_filename(path: Path) -> str | None:
    """Infer BIRD version from a config filename."""
    match = VERSION_RE.search(path.name)
    if not match:
        return None
    hint = match.group(1)
    if hint == "6":
        return "2"  # bird6.conf is typically BIRD2 IPv6
    return hint


def _is_within_root(path: Path, root: Path) -> bool:
    """Return True if path is the same as or inside root after resolving symlinks."""
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def find_bird_configs(root: Path, max_depth: int = 3) -> list[dict[str, object]]:
    """Find BIRD config files under root up to max_depth."""
    configs: list[dict[str, object]] = []
    seen: set[Path] = set()

    for depth in range(max_depth + 1):
        pattern = "*/" * depth + "*.conf"
        for path in root.glob(pattern):
            if path in seen:
                continue
            seen.add(path)
            if not path.is_file():
                continue
            if path.name in {"nginx.conf", "haproxy.conf", "my.cnf"}:
                continue
            # Guard against symlink escapes and unusual filesystem entries.
            if not _is_within_root(path, root):
                continue
            try:
                st = path.stat(follow_symlinks=True)
            except OSError:
                continue
            if st.st_size > MAX_SAMPLE_BYTES:
                continue
            # Heuristic: require at least one BIRD keyword in the first 2 KB.
            try:
                sample = path.read_text(errors="ignore")[:2048]
            except OSError:
                continue
            if not re.search(
                r"\b(protocol|filter|function|router\s+id|local\s+as|neighbor|define|table)\b",
                sample,
                re.IGNORECASE,
            ):
                continue
            configs.append(
                {
                    "path": str(path.relative_to(root)),
                    "version_hint": version_from_filename(path),
                }
            )

    return configs


def find_bird_config_json(root: Path) -> str | None:
    """Find bird.config.json or bird2.config.json near the root."""
    for name in ("bird.config.json", "bird2.config.json"):
        candidate = root / name
        if candidate.is_file() and _is_within_root(candidate, root):
            return str(candidate.relative_to(root))
    return None


def birdcc_info() -> dict[str, object]:
    """Check whether birdcc is available and get its version."""
    executable = shutil.which("birdcc")
    if not executable:
        return {"available": False, "version": None, "path": None}
    try:
        result = subprocess.run(
            [executable, "--version"],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        output = result.stdout.strip() or result.stderr.strip()
        version = output.splitlines()[0] if output else None
    except (OSError, subprocess.TimeoutExpired):
        version = None
    return {"available": True, "version": version, "path": executable}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Detect BIRD configuration files and toolchain availability."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Project root to scan (default: current directory).",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=3,
        help="Maximum directory depth to scan for config files (default: 3).",
    )
    args = parser.parse_args(argv)

    root = args.root.resolve()
    result = {
        "root": str(root),
        "bird_config_json": find_bird_config_json(root),
        "config_files": find_bird_configs(root, max_depth=args.max_depth),
        "birdcc": birdcc_info(),
    }

    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
