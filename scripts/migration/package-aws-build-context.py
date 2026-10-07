#!/usr/bin/env python3
"""Create a sanitized ZIP source context for the ProposalOS AWS app build.

The archive is local by default. Review its manifest before uploading it to the
private AWS build-source bucket. The script intentionally excludes local state,
credentials, generated proposal/audit artifacts, documentation, and Terraform.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[2]
EXCLUDED_ROOTS = {
    "artifacts",
    "backups",
    "build-artifacts",
    "coverage",
    "docker",
    "docs",
    ".github",
    ".kiro",
    ".vscode",
    "infra",
    "scratch",
    "scripts",
    "terraform",
    "tests",
    "tools",
}
EXCLUDED_DIRS = {
    ".aws",
    ".git",
    ".next",
    ".terraform",
    "__tests__",
    "coverage",
    "node_modules",
    "playwright-report",
    "test-results",
}
EXCLUDED_SUFFIXES = {".bak", ".ini", ".key", ".md", ".p12", ".pdf", ".pem", ".pfx"}
SECRET_JSON_NAMES = {
    "credentials.json",
}


def excluded(path: PurePosixPath) -> bool:
    parts = path.parts
    lower_parts = tuple(part.lower() for part in parts)
    if not parts or lower_parts[0] in EXCLUDED_ROOTS:
        return True
    if any(part in EXCLUDED_DIRS for part in lower_parts):
        return True

    name = lower_parts[-1]
    if any(part.startswith(".env") for part in lower_parts):
        return True
    if name == ".npmrc":
        return True
    if any(part.startswith("id_rsa") or part.startswith("id_ed25519") for part in lower_parts):
        return True
    if any(name.endswith(suffix) for suffix in EXCLUDED_SUFFIXES):
        return True
    if re.search(r"\.tfstate(?:\.|$)", name) or re.search(r"\.log(?:\.|$)", name):
        return True
    if name in SECRET_JSON_NAMES or name.startswith("firebase-adminsdk"):
        return True
    if "service-account" in name or "service_account" in name:
        return True
    if "postman" in name or name in {"has_auth.txt", "no_auth.txt"}:
        return True
    if name in {
        "claraud-build-config.yaml",
        "claraud-api.postman_collection.json",
        "cron.yaml",
        "dockerfile.importer",
        "dockerfile.importer.production",
        "setup-secrets.sh",
        "dockerfile.migrate",
        "remediation_findings.json",
    } or name.startswith("cloudbuild"):
        return True
    if name.startswith(".tmp-") or name.endswith((".log", ".log.1", ".log.old")):
        return True
    return False


def git_output(*args: str) -> bytes:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, stdout=subprocess.PIPE
    ).stdout


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default="build-artifacts/proposalos-production-source.zip",
        help="ZIP destination relative to the repository root",
    )
    args = parser.parse_args()

    output = (ROOT / args.output).resolve()
    try:
        relative_output = output.relative_to(ROOT.resolve())
    except ValueError as error:
        raise SystemExit("output must remain inside the repository") from error
    if not relative_output.parts or relative_output.parts[0].lower() != "build-artifacts":
        raise SystemExit("output must remain under build-artifacts/")
    if output.suffix.lower() != ".zip":
        raise SystemExit("output must have a .zip extension")

    candidates = [
        entry.decode("utf-8")
        for entry in git_output("ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0")
        if entry
    ]
    included: list[tuple[str, Path, str, int]] = []
    excluded_count = 0
    for name in sorted(set(candidates)):
        relative = PurePosixPath(name)
        source = ROOT.joinpath(*relative.parts)
        if excluded(relative) or not source.is_file() or source.is_symlink():
            excluded_count += 1
            continue

        digest = hashlib.sha256()
        size = 0
        with source.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                size += len(chunk)
                digest.update(chunk)
        included.append((name, source, digest.hexdigest(), size))

    if not included:
        raise SystemExit("no source files selected; refusing to create an empty archive")

    commit = git_output("rev-parse", "HEAD").decode("ascii").strip()
    dirty = bool(git_output("status", "--porcelain"))
    manifest = {
        "format": 1,
        "base_git_commit": commit,
        "worktree_dirty": dirty,
        "file_count": len(included),
        "files": [
            {"path": name, "size_bytes": size, "sha256": digest}
            for name, _, digest, size in included
        ],
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, source, _, _ in included:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            with source.open("rb") as input_file, archive.open(info, "w") as output_file:
                for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                    output_file.write(chunk)
        info = zipfile.ZipInfo("migration-source-manifest.json", date_time=(1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, manifest_bytes)

    archive_digest = hashlib.sha256()
    with output.open("rb") as archive_file:
        for chunk in iter(lambda: archive_file.read(1024 * 1024), b""):
            archive_digest.update(chunk)
    print(f"created={output}")
    print(f"base_git_commit={commit}")
    print(f"worktree_dirty={str(dirty).lower()}")
    print(f"included_files={len(included)}")
    print(f"excluded_or_nonfiles={excluded_count}")
    print(f"archive_bytes={output.stat().st_size}")
    print(f"archive_sha256={archive_digest.hexdigest()}")


if __name__ == "__main__":
    main()
