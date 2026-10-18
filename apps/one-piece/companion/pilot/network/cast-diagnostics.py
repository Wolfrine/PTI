"""Read-only Cast discovery/status for the approved household playback pilot.

This command never launches an application, loads media, changes volume, or
stops existing playback. Install requirements into an isolated H: tools folder.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
from pathlib import Path
import sys
from datetime import datetime, timezone


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tools", type=Path, default=Path("H:/PTI-OnePiece/pilot/tools/python"))
    parser.add_argument("--name", default="Bedroom TV")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(args.tools.resolve()))
    import pychromecast

    result = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "experiment": "Cast discovery and status only",
        "pychromecast_version": importlib.metadata.version("pychromecast"),
        "requested_name": args.name,
        "devices": [],
        "limitations": [
            "Discovery does not establish media, audio, subtitle or control compatibility.",
            "No receiver application or media was launched by this probe.",
        ],
    }
    devices, browser = pychromecast.get_listed_chromecasts(
        friendly_names=[args.name], discovery_timeout=6, tries=1,
        retry_wait=1, timeout=5,
    )
    try:
        for device in devices:
            entry = {
                "name": device.cast_info.friendly_name,
                "model": device.cast_info.model_name,
            }
            try:
                device.wait(timeout=8)
                status = device.status
                entry.update({
                    "connected": True,
                    "application_id": status.app_id if status else None,
                    "application_name": status.display_name if status else None,
                    "standby": status.is_stand_by if status else None,
                    "active_input": status.is_active_input if status else None,
                })
            except Exception as error:
                entry.update({"connected": False, "error_type": type(error).__name__})
            finally:
                device.disconnect()
            result["devices"].append(entry)
    finally:
        pychromecast.stop_discovery(browser)
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
