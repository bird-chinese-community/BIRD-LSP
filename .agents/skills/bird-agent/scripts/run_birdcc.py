# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///

"""Run birdcc lint or fmt with structured JSON output."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys

VALID_SUBCOMMANDS = {"lint", "fmt"}


def build_command(args: argparse.Namespace) -> list[str]:
    """Build the birdcc command from parsed arguments."""
    cmd = [args.birdcc, args.subcommand, args.config]
    if args.subcommand == "lint":
        cmd.append("--format")
        cmd.append("json")
        if args.bird:
            cmd.append("--bird")
        if args.validate_command:
            cmd.append("--validate-command")
            cmd.append(args.validate_command)
    elif args.subcommand == "fmt":
        if args.write:
            cmd.append("--write")
        else:
            cmd.append("--check")
    return cmd


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run birdcc lint or fmt and return structured output."
    )
    parser.add_argument(
        "subcommand",
        choices=sorted(VALID_SUBCOMMANDS),
        help="birdcc subcommand to run (lint or fmt).",
    )
    parser.add_argument("config", help="Path to the BIRD config file.")
    parser.add_argument(
        "--birdcc",
        default=shutil.which("birdcc") or "birdcc",
        help="Path to the birdcc executable (default: birdcc on PATH).",
    )
    parser.add_argument(
        "--bird",
        action="store_true",
        help="For lint: also run BIRD runtime validation with bird -p.",
    )
    parser.add_argument(
        "--validate-command",
        help="For lint: custom validation command template (e.g., 'docker exec bird bird -p -c {file}').",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="For fmt: write formatted output instead of checking (default: --check).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the command that would run without executing it.",
    )
    args = parser.parse_args(argv)

    if shutil.which(args.birdcc) is None:
        json.dump(
            {
                "error": "birdcc not found",
                "hint": "Install with: npm install -g @birdcc/cli  (or npx @birdcc/cli)",
            },
            sys.stderr,
            indent=2,
            ensure_ascii=False,
        )
        return 127

    cmd = build_command(args)

    if args.dry_run:
        json.dump({"dry_run": True, "command": " ".join(cmd)}, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
        timeout=300,
    )

    output: dict[str, object] = {
        "command": " ".join(cmd),
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }

    if args.subcommand == "lint" and result.stdout.strip():
        try:
            output["diagnostics"] = json.loads(result.stdout)
        except json.JSONDecodeError:
            pass

    json.dump(output, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
