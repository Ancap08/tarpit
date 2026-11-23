"""Local tool and scratch paths shared by the Blender art scripts."""

import os
import shutil
from pathlib import Path

SCRATCH_ROOT = Path(
    os.environ.get("TARPIT_ART_SCRATCH", "/private/tmp/tarpit-art-scratch")
).expanduser().resolve()

MAC_BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
BLENDER = shutil.which("blender") or str(MAC_BLENDER if MAC_BLENDER.is_file() else "blender")

MAC_FFMPEG = Path("/opt/homebrew/bin/ffmpeg")
FFMPEG = shutil.which("ffmpeg") or str(MAC_FFMPEG if MAC_FFMPEG.is_file() else "ffmpeg")
