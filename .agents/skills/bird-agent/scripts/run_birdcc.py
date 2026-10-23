# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///

"""Run birdcc lint or fmt with structured JSON output.

Safety defaults:
- fmt defaults to --check; --write requires an additional --confirmed flag.
- The config path must resolve to a regular file inside --root.
- Paths starting with "-" are rejected to avoid being parsed as flags.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

VALID_SUBCOMMANDS = {"lint", "fmt"}
MAX_OUTPUT_BYTES = 2 * 1024 * 1024


def fail(message: str, hint: str | None = None, code: int = 1) -> int:
    """Emit a JSON error and return a non-zero exit code."""
    payload: dict[str, object] = {"error": message}
    if hint:
        payload["hint"] = hint
    json.dump(payload, sys.stderr, indent=2, ensure_ascii=False)
    sys.stderr.write("\n")
    return code


def validate_config_path(config: str, root: Path) -> Path:
    """Validate that the user-supplied config path is safe to pass to birdcc."""
    if config.startswith("-"):
        raise ValueError("config path must not start with '-'")

    raw = Path(config)
    if not raw.is_absolute():
        raw = root / raw

    try:
        resolved = raw.resolve(strict=True)
    except FileNotFoundError as exc:
        raise ValueError(f"config file not found: {config}") from exc
    except OSError as exc:
        raise ValueError(f"cannot access config file: {config}") from exc

    root_resolved = root.resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise ValueError(
            f"config path must be inside root ({root_resolved}): {config}"
        ) from exc

    if not resolved.is_file():
        raise ValueError(f"config path is not a regular file: {config}")

    return resolved


def build_command(args: argparse.Namespace) -> list[str]:
    """Build the birdcc command from parsed arguments."""
    cmd = [args.birdcc, args.subcommand, str(args.config)]
    if args.subcommand == "lint":
        cmd.extend(["--format", "json"])
        if args.bird:
            cmd.append("--bird")
        if args.validate_command:
            cmd.extend(["--validate-command", args.validate_command])
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
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Project root used to contain allowed config paths (default: current directory).",
    )
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
        "--confirmed",
        action="store_true",
        help="Required alongside --write to actually modify files. Without this flag fmt uses --check.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the command that would run without executing it.",
    )
    args = parser.parse_args(argv)

    if shutil.which(args.birdcc) is None:
        return fail(
            "birdcc not found",
            "Install with: npm install -g @birdcc/cli  (or npx @birdcc/cli)",
            code=127,
        )

    try:
        args.config = validate_config_path(args.config, args.root)
    except ValueError as exc:
        return fail(str(exc), code=2)

    if args.subcommand == "fmt" and args.write and not args.confirmed:
        return fail(
            "fmt --write requires --confirmed to modify files",
            "Run with --confirmed only after the user explicitly approves modifying the file.",
            code=2,
        )

    cmd = build_command(args)

    if args.dry_run:
        json.dump({"dry_run": True, "command": cmd}, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
        timeout=300,
    )

    stdout = result.stdout
    stderr = result.stderr
    if len(stdout.encode("utf-8")) > MAX_OUTPUT_BYTES:
        stdout = stdout[:MAX_OUTPUT_BYTES] + "\n[truncated]\n"
    if len(stderr.encode("utf-8")) > MAX_OUTPUT_BYTES:
        stderr = stderr[:MAX_OUTPUT_BYTES] + "\n[truncated]\n"

    output: dict[str, object] = {
        "command": cmd,
        "returncode": result.returncode,
        "stdout": stdout,
        "stderr": stderr,
    }

    if args.subcommand == "lint" and stdout.strip():
        try:
            output["diagnostics"] = json.loads(stdout)
        except json.JSONDecodeError:
            pass

    json.dump(output, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
