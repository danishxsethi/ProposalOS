#!/usr/bin/env python3
"""Package only the production importer Dockerfile and guarded SQL loader."""

from __future__ import annotations

import hashlib
import json
import subprocess
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = (
    "Dockerfile.importer.production",
    "scripts/migration/import-production-export.sh",
)
OUTPUT = ROOT / "build-artifacts" / "proposalos-production-importer-context.zip"


def git_output(*args: str) -> bytes:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, stdout=subprocess.PIPE
    ).stdout


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    manifest_files = []
    for name in FILES:
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            raise SystemExit(f"required regular source file is missing: {name}")
        manifest_files.append(
            {"path": name, "size_bytes": path.stat().st_size, "sha256": sha256(path)}
        )

    manifest = {
        "format": 1,
        "base_git_commit": git_output("rev-parse", "HEAD").decode("ascii").strip(),
        "worktree_dirty": bool(git_output("status", "--porcelain")),
        "file_count": len(FILES),
        "files": manifest_files,
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name in FILES:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            with (ROOT / name).open("rb") as source, archive.open(info, "w") as destination:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    destination.write(chunk)

        info = zipfile.ZipInfo("migration-source-manifest.json", date_time=(1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, manifest_bytes)

    print(f"created={OUTPUT}")
    print(f"archive_bytes={OUTPUT.stat().st_size}")
    print(f"archive_sha256={sha256(OUTPUT)}")
    print(f"base_git_commit={manifest['base_git_commit']}")
    print(f"worktree_dirty={str(manifest['worktree_dirty']).lower()}")


if __name__ == "__main__":
    main()
