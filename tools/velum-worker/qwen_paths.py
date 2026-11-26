"""Shared, source-controlled Qwen storage contract; no model or media access."""
import json
from pathlib import Path, PureWindowsPath

def output_root():
    value = json.loads(Path(__file__).with_name('qwen-paths.json').read_text(encoding='utf-8'))['outputRoot']
    if not isinstance(value, str):
        raise ValueError('invalid-qwen-output-root')
    win = PureWindowsPath(value)
    if not win.is_absolute() or win.drive.lower() != 'h:' or str(win) != value or '..' in win.parts:
        raise ValueError('invalid-qwen-output-root')
    return Path(value)
