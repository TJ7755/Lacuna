from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download

from .io import ensure_fresh_directory, sha256_file


DATASET_ID = "open-spaced-repetition/anki-revlogs-10k"
DATASET_REVISION = "75299740cff05894ef42d7ad990666691efdd2da"


def acquire_revlogs(
    destination: Path,
    user_ids: list[int],
    *,
    revision: str = DATASET_REVISION,
    token: str | None = None,
) -> dict[str, object]:
    if not user_ids or any(user_id < 1 or user_id > 10_000 for user_id in user_ids):
        raise ValueError("user IDs must be between 1 and 10000")
    ensure_fresh_directory(destination)

    resolved_revision = HfApi(token=token).dataset_info(DATASET_ID, revision=revision).sha
    files: list[dict[str, object]] = []
    for user_id in sorted(set(user_ids)):
        filename = f"revlogs/user_id={user_id}/data.parquet"
        cached = Path(
            hf_hub_download(
                DATASET_ID,
                filename,
                repo_type="dataset",
                revision=resolved_revision,
                token=token,
            )
        )
        target = destination / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(cached, target)
        files.append(
            {
                "path": filename,
                "bytes": target.stat().st_size,
                "sha256": sha256_file(target),
            }
        )

    manifest: dict[str, object] = {
        "dataset": DATASET_ID,
        "revision": resolved_revision,
        "doi": "10.57967/hf/3435",
        "acquired_at": datetime.now(UTC).isoformat(),
        "files": files,
    }
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return manifest
