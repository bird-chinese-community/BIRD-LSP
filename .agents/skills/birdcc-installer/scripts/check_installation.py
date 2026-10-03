# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///

"""Check whether BIRDCC tools are installed without modifying the system."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys

BIRD_VSCODE_EXTENSIONS = [
    "birdcc.vscode-bird2-conf",
    "birdcc.bird2-lsp",
]


def check_executable(name: str, version_flag: str = "--version") -> dict[str, object]:
    """Check whether an executable is on PATH and capture its version."""
    path = shutil.which(name)
    if not path:
        return {"installed": False, "version": None, "path": None}
    try:
        result = subprocess.run(
            [path, version_flag],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        output = result.stdout.strip() or result.stderr.strip()
        version = output.splitlines()[0] if output else None
    except (OSError, subprocess.TimeoutExpired):
        version = None
    return {"installed": True, "version": version, "path": path}


def check_vscode_extensions() -> dict[str, bool] | None:
    """Return installed status for BIRD VSCode extensions if code CLI is available."""
    code = shutil.which("code")
    if not code:
        return None
    try:
        result = subprocess.run(
            [code, "--list-extensions"],
            capture_output=True,
            text=True,
            check=False,
            timeout=15,
        )
        installed = set(result.stdout.strip().splitlines())
        return {ext: ext in installed for ext in BIRD_VSCODE_EXTENSIONS}
    except (OSError, subprocess.TimeoutExpired):
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check whether BIRDCC CLI and editor tools are installed."
    )
    parser.add_argument(
        "--skip-vscode",
        action="store_true",
        help="Skip checking VSCode extensions.",
    )
    args = parser.parse_args(argv)

    result: dict[str, object] = {
        "birdcc": check_executable("birdcc"),
    }

    if not args.skip_vscode:
        vscode_extensions = check_vscode_extensions()
        if vscode_extensions is not None:
            result["vscode_extensions"] = vscode_extensions

    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
