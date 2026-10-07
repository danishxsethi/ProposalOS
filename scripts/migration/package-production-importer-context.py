#!/usr/bin/env python3
"""Create the minimal production importer image context, including Prisma migrations."""

from __future__ import annotations

import hashlib
import json
import subprocess
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[2]
FIXED_FILES = (
    "Dockerfile.importer.production",
    "prisma/schema.prisma",
    "prisma/migrations/migration_lock.toml",
    "scripts/migration/production-legacy-migrations.json",
    "scripts/migration/import-production-export.sh",
)


def git_output(*args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, stdout=subprocess.PIPE).stdout


def main() -> None:
    output = ROOT / "build-artifacts/proposalos-production-importer-context.zip"
    output = output.resolve()
    try:
        output.relative_to(ROOT.resolve())
    except ValueError as error:
        raise SystemExit("output must remain inside the repository") from error
    if output.parts[-2].lower() != "build-artifacts" or output.suffix.lower() != ".zip":
        raise SystemExit("output must be a ZIP under build-artifacts/")

    files = [ROOT / name for name in FIXED_FILES]
    migration_files = sorted((ROOT / "prisma/migrations").glob("*/migration.sql"))
    files.extend(migration_files)
    if not migration_files:
        raise SystemExit("no Prisma migration SQL files found")

    manifest_files = []
    packaged_files: dict[str, bytes] = {}
    for path in sorted(set(files)):
        relative = path.relative_to(ROOT).as_posix()
        if not path.is_file() or PurePosixPath(relative).is_absolute():
            raise SystemExit(f"missing or invalid importer source: {relative}")
        data = path.read_bytes()
        # Windows checkout converts tracked SQL files to CRLF. Prisma hashes
        # the exact migration bytes, so ship the canonical LF form used by Git
        # and by the source database's recorded checksums.
        if path.name == "migration.sql":
            data = data.replace(b"\r\n", b"\n")
        packaged_files[relative] = data
        manifest_files.append(
            {
                "path": relative,
                "size_bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )

    commit = git_output("rev-parse", "HEAD").decode("ascii").strip()
    dirty = bool(git_output("status", "--porcelain"))
    manifest = {
        "format": 1,
        "base_git_commit": commit,
        "worktree_dirty": dirty,
        "migration_count": len(migration_files),
        "file_count": len(manifest_files),
        "files": manifest_files,
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for relative in sorted(packaged_files):
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, packaged_files[relative], compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
        info = zipfile.ZipInfo("migration-source-manifest.json", date_time=(1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, manifest_bytes)

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"created={output}")
    print(f"base_git_commit={commit}")
    print(f"worktree_dirty={str(dirty).lower()}")
    print(f"migration_count={len(migration_files)}")
    print(f"included_files={len(manifest_files)}")
    print(f"archive_bytes={output.stat().st_size}")
    print(f"archive_sha256={digest}")


if __name__ == "__main__":
    main()
