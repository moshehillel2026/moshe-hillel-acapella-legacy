"""Check that the Pages artifact contains the approved catalog and original media."""

import hashlib
import json
import re
import sys
from pathlib import Path


def check(site, inventory_file):
    songs = json.loads((site / "songs.json").read_text(encoding="utf-8"))["songs"]
    inventory = json.loads(inventory_file.read_text(encoding="utf-8"))
    for filename in ("index.html", "style.css", "player.js"):
        if not (site / filename).is_file():
            raise ValueError(f"Missing site asset: {filename}")
    if any(path.is_symlink() or path.suffix.lower() in {".odt", ".zip"} for path in site.rglob("*")):
        raise ValueError("The deployment directory contains a source document, archive, or symlink.")

    by_path = {item["path"]: item for item in inventory}
    if not songs or len(songs) != len(by_path) or len(by_path) != len(inventory):
        raise ValueError("Every song must have one matching inventory entry.")
    if len({song["order"] for song in songs}) != len(songs):
        raise ValueError("Playback order values must be unique.")

    expected = set()
    for song in songs:
        song_id = song["id"]
        path = song["audio"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", song_id):
            raise ValueError(f"Invalid song ID: {song_id}")
        if path != f"media/{song_id}.mp3" or path in expected or path not in by_path:
            raise ValueError(f"Invalid or missing audio path in catalog: {song_id}")
        expected.add(path)
        lyrics = song["lyrics"]
        if not lyrics["sections"] and lyrics["status"] != "pending":
            raise ValueError(f"Missing lyrics in release catalog: {song_id}")
        recording = site / path
        with recording.open("rb") as file:
            if hashlib.file_digest(file, "sha256").hexdigest() != by_path[path]["sha256"]:
                raise ValueError(f"Original recording checksum mismatch: {path}")

    if expected != {p.relative_to(site).as_posix() for p in site.rglob("*.mp3")}:
        raise ValueError("The site contains audio outside the release catalog.")
    print(f"OK: {len(songs)} catalog entries, original MP3 files and lyric entries.")


if __name__ == "__main__":
    try:
        check(Path(sys.argv[1]), Path(sys.argv[2]))
    except (ValueError, KeyError, TypeError, OSError) as error:
        sys.exit(str(error))
