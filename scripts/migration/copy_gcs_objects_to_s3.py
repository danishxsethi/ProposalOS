#!/usr/bin/env python3
"""Copy current ProposalOS GCS objects into private AWS S3 with checksums.

This copies current object generations only. GCP object versioning is disabled
for the inventoried buckets. Source objects are never deleted or modified.
The Terraform state object is archived in the encrypted AWS state bucket, not
in the application data bucket.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


APP_OBJECTS = {
    "proposal-487522-audit-snapshots": "audit-snapshots",
    "proposal-487522-logs": "logs/gcp-archive",
    "proposal-487522-outreach-assets": "outreach-assets",
    "proposal-487522-proposals": "proposals",
}
TERRAFORM_STATE_BUCKET = "proposal-487522-terraform-state"


class MigrationError(RuntimeError):
    pass


def run_json(args: list[str], *, environment: dict[str, str] | None = None) -> Any:
    completed = subprocess.run(
        args,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=environment,
    )
    if completed.returncode != 0:
        raise MigrationError("A metadata or checksum query failed; command output is suppressed.")
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise MigrationError("A cloud CLI returned invalid JSON; command output is suppressed.") from error


def run_quiet(
    args: list[str],
    *,
    operation: str,
    environment: dict[str, str] | None = None,
) -> None:
    completed = subprocess.run(
        args,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=environment,
    )
    if completed.returncode != 0:
        codes = (
            "AccessDenied",
            "PERMISSION_DENIED",
            "NotFound",
            "NoSuchKey",
            "InvalidArgument",
            "InvalidUrl",
            "404",
            "403",
            "400",
        )
        diagnostic = next((code for code in codes if code in completed.stderr), "")
        safe_stderr = completed.stderr
        redact_next = False
        for argument in args:
            if redact_next:
                safe_stderr = safe_stderr.replace(argument, "<redacted>")
                redact_next = False
            elif argument in {"--key", "--body", "--metadata"}:
                redact_next = True
            elif argument.startswith(("gs://", "s3://", "fileb://")):
                safe_stderr = safe_stderr.replace(argument, "<redacted>")
        safe_stderr = re.sub(r"(?:gs|s3)://[^\s'\"]+", "<cloud-object>", safe_stderr)
        lines = [line.strip() for line in safe_stderr.splitlines() if line.strip()]
        detail = lines[-1] if lines else "no diagnostic returned"
        if len(detail) > 240:
            detail = detail[:240]
        label = diagnostic or detail
        raise MigrationError(f"{operation} failed ({label}); object identifiers are redacted.")


def sha256_file(path: Path) -> tuple[bytes, str]:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    raw = digest.digest()
    return raw, base64.b64encode(raw).decode("ascii")


def md5_base64(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return base64.b64encode(digest.digest()).decode("ascii")


def gcloud_prefix() -> list[str]:
    if os.name != "nt":
        return ["gcloud"]
    local_app_data = os.environ.get("LOCALAPPDATA")
    powershell = shutil.which("pwsh") or shutil.which("pwsh.exe")
    if not local_app_data or not powershell:
        raise MigrationError("The Windows Google Cloud CLI launcher is unavailable.")
    script = Path(local_app_data) / "Google" / "Cloud SDK" / "google-cloud-sdk" / "bin" / "gcloud.ps1"
    if not script.is_file():
        raise MigrationError("The Windows Google Cloud CLI launcher is unavailable.")
    return [powershell, "-NoProfile", "-File", str(script)]


def storage_objects(gcloud: list[str], project: str, bucket: str) -> list[dict[str, Any]]:
    response = run_json(
        gcloud
        + [
            "storage",
            "ls",
            "--recursive",
            "--json",
            f"gs://{bucket}",
            f"--project={project}",
        ]
    )
    if not isinstance(response, list):
        raise MigrationError("The GCS object inventory has an unexpected format.")
    objects: list[dict[str, Any]] = []
    for item in response:
        if item.get("type") != "cloud_object":
            continue
        metadata = item.get("metadata")
        url = item.get("url")
        if not isinstance(metadata, dict) or not isinstance(url, str):
            raise MigrationError("The GCS object inventory is missing object metadata.")
        name = metadata.get("name")
        size = metadata.get("size")
        if not isinstance(name, str) or not name or size is None:
            raise MigrationError("A GCS object is missing its name or size metadata.")
        if not metadata.get("md5Hash") or not metadata.get("generation"):
            raise MigrationError("A GCS object is missing its MD5 checksum or generation.")
        objects.append({"metadata": metadata, "url": f"gs://{bucket}/{name}", "name": name, "size": int(size)})
    return objects


def destination_key(prefix: str, source_name: str) -> str:
    cleaned = source_name.lstrip("/")
    if not cleaned or "\\" in cleaned or "\x00" in cleaned:
        raise MigrationError("A GCS object name is not a valid S3 key.")
    if prefix in {"audit-snapshots", "outreach-assets", "proposals"} and cleaned.startswith(prefix + "/"):
        return cleaned
    return f"{prefix.rstrip('/')}/{cleaned}"


def object_head(
    *, bucket: str, key: str, region: str, profile: str, environment: dict[str, str]
) -> dict[str, Any] | None:
    completed = subprocess.run(
        [
            "aws",
            "s3api",
            "head-object",
            "--bucket",
            bucket,
            "--key",
            key,
            "--checksum-mode",
            "ENABLED",
            "--region",
            region,
            "--profile",
            profile,
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=environment,
    )
    if completed.returncode == 0:
        return json.loads(completed.stdout)
    if "404" in completed.stderr or "Not Found" in completed.stderr or "NoSuchKey" in completed.stderr:
        return None
    raise MigrationError("The S3 destination preflight failed; command output is suppressed.")


def verify_existing(
    *,
    head: dict[str, Any],
    expected_size: int,
    expected_sha256: str,
    expected_content_type: str,
    bucket: str,
    key: str,
    region: str,
    profile: str,
    temp_file: Path,
    environment: dict[str, str],
) -> None:
    if int(head.get("ContentLength", -1)) != expected_size:
        raise MigrationError("A destination key already exists with different content; no overwrite was made.")
    if head.get("ContentType", "application/octet-stream") != expected_content_type:
        raise MigrationError("A destination key already exists with different content type; no overwrite was made.")
    existing_checksum = head.get("ChecksumSHA256")
    if existing_checksum is None:
        run_quiet(
            [
                "aws",
                "s3api",
                "get-object",
                "--bucket",
                bucket,
                "--key",
                key,
                "--checksum-mode",
                "ENABLED",
                "--region",
                region,
                "--profile",
                profile,
                str(temp_file),
            ],
            operation="S3 existing-object download",
            environment=environment,
        )
        _, existing_checksum = sha256_file(temp_file)
    if existing_checksum != expected_sha256:
        raise MigrationError("A destination key already exists with different content; no overwrite was made.")


def copy_one(
    *,
    item: dict[str, Any],
    source_bucket: str,
    target_bucket: str,
    target_key: str,
    region: str,
    profile: str,
    project: str,
    gcloud: list[str],
    temp_dir: Path,
    environment: dict[str, str],
    execute: bool,
) -> tuple[int, str]:
    metadata: dict[str, Any] = item["metadata"]
    temp_file = temp_dir / f"{hashlib.sha256((source_bucket + metadata['name']).encode()).hexdigest()}.object"
    run_quiet(
        gcloud + ["storage", "cp", "--quiet", f"--project={project}", item["url"], str(temp_file)],
        operation="GCS object download",
        environment=environment,
    )
    if not temp_file.is_file() or temp_file.stat().st_size != item["size"]:
        raise MigrationError("A downloaded GCS object failed its size check.")
    if md5_base64(temp_file) != metadata["md5Hash"]:
        raise MigrationError("A downloaded GCS object failed its source MD5 check.")

    _, sha_b64 = sha256_file(temp_file)
    content_type = metadata.get("contentType") or "application/octet-stream"
    head = object_head(
        bucket=target_bucket,
        key=target_key,
        region=region,
        profile=profile,
        environment=environment,
    )
    if head is not None:
        verify_existing(
            head=head,
            expected_size=item["size"],
            expected_sha256=sha_b64,
            expected_content_type=content_type,
            bucket=target_bucket,
            key=target_key,
            region=region,
            profile=profile,
            temp_file=temp_file,
            environment=environment,
        )
        return item["size"], "already-present-verified"

    if not execute:
        return item["size"], "planned"

    user_metadata = metadata.get("metadata") or {}
    if user_metadata:
        raise MigrationError("Custom GCS metadata is present; review the mapping before copying.")
    preserved_metadata = {
        "gcs-source-bucket": source_bucket,
        "gcs-generation": str(metadata["generation"]),
        "gcs-md5-hash": str(metadata["md5Hash"]),
        "gcs-crc32c": str(metadata.get("crc32c", "")),
    }
    command = [
        "aws",
        "s3api",
        "put-object",
        "--bucket",
        target_bucket,
        "--key",
        target_key,
        "--body",
        str(temp_file),
        "--content-type",
        content_type,
        "--server-side-encryption",
        "AES256",
        "--checksum-algorithm",
        "SHA256",
        "--checksum-sha256",
        sha_b64,
        "--metadata",
        json.dumps(preserved_metadata, separators=(",", ":")),
        "--region",
        region,
        "--profile",
        profile,
    ]
    for source_name, cli_flag in (
        ("cacheControl", "--cache-control"),
        ("contentDisposition", "--content-disposition"),
        ("contentEncoding", "--content-encoding"),
        ("contentLanguage", "--content-language"),
    ):
        value = metadata.get(source_name)
        if value:
            command.extend([cli_flag, str(value)])

    run_quiet(command, operation="S3 object upload", environment=environment)
    verified = object_head(
        bucket=target_bucket,
        key=target_key,
        region=region,
        profile=profile,
        environment=environment,
    )
    if verified is None or int(verified.get("ContentLength", -1)) != item["size"]:
        raise MigrationError("An uploaded S3 object failed its size verification.")
    if verified.get("ContentType") != content_type or verified.get("ChecksumSHA256") != sha_b64:
        raise MigrationError("An uploaded S3 object failed its content-type or SHA-256 verification.")
    return item["size"], "copied-and-verified"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="proposal-487522")
    parser.add_argument("--region", default="us-east-2")
    parser.add_argument("--aws-profile", default="default")
    parser.add_argument("--app-data-bucket", default="proposalos-data-production-410432886960-us-east-2")
    parser.add_argument("--state-bucket", default="proposalos-terraform-state-410432886960-us-east-2")
    parser.add_argument("--execute", action="store_true", help="Upload after preflight; otherwise only inventory and verify conflicts.")
    args = parser.parse_args()

    environment = os.environ.copy()
    total_objects = 0
    total_bytes = 0
    copied = 0
    skipped = 0
    temp_root = Path(tempfile.gettempdir()).resolve()
    temp_path: Path | None = None

    try:
        gcloud = gcloud_prefix()
        with tempfile.TemporaryDirectory(prefix="proposalos-gcs-to-s3-") as temporary_directory:
            temp_path = Path(temporary_directory).resolve()
            if temp_root not in temp_path.parents:
                raise MigrationError("The temporary transfer directory is outside the OS temp folder.")

            mappings = [
                (source, args.app_data_bucket, prefix)
                for source, prefix in APP_OBJECTS.items()
            ]
            mappings.append(
                (
                    TERRAFORM_STATE_BUCKET,
                    args.state_bucket,
                    "legacy-gcp/proposal-487522/terraform-state",
                )
            )

            for source_bucket, target_bucket, prefix in mappings:
                objects = storage_objects(gcloud, args.project, source_bucket)
                bucket_bytes = 0
                for item in objects:
                    target_key = destination_key(prefix, item["name"])
                    size, outcome = copy_one(
                        item=item,
                        source_bucket=source_bucket,
                        target_bucket=target_bucket,
                        target_key=target_key,
                        region=args.region,
                        profile=args.aws_profile,
                        project=args.project,
                        gcloud=gcloud,
                        temp_dir=temp_path,
                        environment=environment,
                        execute=args.execute,
                    )
                    bucket_bytes += size
                    total_objects += 1
                    total_bytes += size
                    if outcome == "copied-and-verified":
                        copied += 1
                    elif outcome == "already-present-verified":
                        skipped += 1
                print(f"{source_bucket}: objects={len(objects)} bytes={bucket_bytes}")

            mode = "executed" if args.execute else "dry-run"
            print(f"mode={mode} source_objects={total_objects} source_bytes={total_bytes} copied={copied} already_present={skipped}")
        if temp_path is None or temp_root not in temp_path.parents:
            raise MigrationError("Refusing cleanup because the temporary path could not be verified.")
    except MigrationError as error:
        print(f"migration failed: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(
            f"migration failed unexpectedly ({type(error).__name__}); object identifiers and CLI output are suppressed.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
