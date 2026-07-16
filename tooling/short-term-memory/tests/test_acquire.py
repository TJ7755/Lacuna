import hashlib
import json
from pathlib import Path

import pytest

import stm_harness.acquire as acquire


class FakeApi:
    def __init__(self, token=None):
        self.token = token

    def dataset_info(self, dataset_id, revision):
        assert dataset_id == acquire.DATASET_ID
        return type("Info", (), {"sha": "resolved-revision"})()


def test_acquisition_records_resolved_revision_and_hashes(tmp_path: Path, monkeypatch):
    cached = tmp_path / "cached.parquet"
    cached.write_bytes(b"parquet bytes")
    monkeypatch.setattr(acquire, "HfApi", FakeApi)
    monkeypatch.setattr(acquire, "hf_hub_download", lambda *args, **kwargs: str(cached))

    destination = tmp_path / "data"
    manifest = acquire.acquire_revlogs(destination, [2, 1, 2], token="secret")

    assert manifest["revision"] == "resolved-revision"
    assert [item["path"] for item in manifest["files"]] == [
        "revlogs/user_id=1/data.parquet",
        "revlogs/user_id=2/data.parquet",
    ]
    assert manifest["files"][0]["sha256"] == hashlib.sha256(b"parquet bytes").hexdigest()
    assert json.loads((destination / "manifest.json").read_text())["doi"] == "10.57967/hf/3435"

    with pytest.raises(FileExistsError, match="new or empty"):
        acquire.acquire_revlogs(destination, [1], token="secret")
