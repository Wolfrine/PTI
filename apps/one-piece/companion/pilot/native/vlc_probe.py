"""Headless real-stream VLC baseline. Decoder/track proof only, not human audiovisual proof."""
import argparse
import json
import os
from pathlib import Path
import sys
import time

RUNTIME = Path(os.environ.get('ONE_PIECE_BROWSER_RUNTIME', 'H:/PTI-OnePiece/pilot/browser-native'))
os.environ['PYTHON_VLC_LIB_PATH'] = 'C:/Program Files/VideoLAN/VLC/libvlc.dll'
os.environ['PYTHON_VLC_MODULE_PATH'] = 'C:/Program Files/VideoLAN/VLC'
sys.path.insert(0, str(RUNTIME / 'python'))
DLL_DIR = os.add_dll_directory('C:/Program Files/VideoLAN/VLC')
import vlc


def descriptions(items):
    return [{'id': item[0], 'description': item[1].decode('utf-8', errors='replace') if isinstance(item[1], bytes) else item[1]} for item in items or []]


def run(episode, relay):
    root = Path(__file__).resolve().parents[5]
    catalog = json.loads((root / 'docs/one-piece/evidence/sources/catalog.json').read_text())
    source = next(c for e in catalog['episodes'] if e['episodeNumber'] == episode for c in e['candidates'] if c['role'] == 'original')
    url = f'http://127.0.0.1:8793/media/{episode}/original' if relay else source['url']
    start = time.monotonic()
    result = {'episode': episode, 'url': url, 'sourceBytes': source['bytes'], 'mode': 'headless dummy outputs', 'vlcVersion': vlc.libvlc_get_version().decode(), 'events': [], 'humanJapaneseAudioVerified': False, 'humanEnglishSubtitlesVerified': False, 'tvVerified': False}

    def log(event, **fields):
        data = {'event': event, 'atMs': round((time.monotonic() - start) * 1000), **fields}
        result['events'].append(data)
        print(json.dumps(data), flush=True)

    instance = vlc.Instance('--intf=dummy', '--vout=dummy', '--aout=dummy', '--avcodec-hw=none', '--network-caching=1000', '--no-video-title-show', '--no-media-library', '--no-snapshot-preview')
    if instance is None:
        raise RuntimeError('Could not initialize libvlc')
    media = instance.media_new(url)
    player = instance.media_player_new()
    player.set_media(media)
    log('starting-source')
    player.play()
    try:
        for _ in range(160):
            if player.get_state() == vlc.State.Error:
                raise RuntimeError('VLC entered error state')
            if player.get_time() > 0 and player.audio_get_track_count() > 0:
                break
            time.sleep(0.125)
        log('ready-for-track-inspection', state=str(player.get_state()), positionMs=player.get_time())
        audios = descriptions(player.audio_get_track_description())
        subtitles = descriptions(player.video_get_spu_description())
        log('candidate-tracks', audio=audios, subtitles=subtitles, inspection='libvlc track descriptions; detailed container metadata independently inspected by libav.js')
        japanese = next((t for t in audios if 'japanese' in t['description'].lower()), None)
        full_english = next((t for t in subtitles if 'english' in t['description'].lower() and not any(w in t['description'].lower() for w in ('sign', 'song', 'forced'))), None)
        if not japanese or not full_english:
            raise RuntimeError('Required Japanese/full-English tracks not identified unambiguously')
        audio_set = player.audio_set_track(japanese['id'])
        subtitle_set = player.video_set_spu(full_english['id'])
        log('explicit-track-selection', japanese=japanese, fullEnglish=full_english, setAudioResult=audio_set, setSubtitleResult=subtitle_set, effectiveAudio=player.audio_get_track(), effectiveSubtitle=player.video_get_spu(), positionMs=player.get_time())
        time.sleep(3)
        stats = vlc.MediaStats()
        media.get_stats(stats)
        initial = {'readBytes': stats.read_bytes, 'demuxReadBytes': stats.demux_read_bytes, 'decodedVideo': stats.decoded_video, 'decodedAudio': stats.decoded_audio, 'displayedPictures': stats.displayed_pictures}
        log('initial-decode', positionMs=player.get_time(), stats=initial)
        player.set_time(600000)
        seek_begin = time.monotonic()
        while time.monotonic() - seek_begin < 15:
            time.sleep(0.25)
            media.get_stats(stats)
            if player.get_time() >= 600500 and stats.decoded_video > initial['decodedVideo'] + 5 and stats.decoded_audio > initial['decodedAudio'] + 5:
                break
        log('seek-600-seconds', seekRecoveryMs=round((time.monotonic() - seek_begin) * 1000), positionMs=player.get_time(), effectiveAudio=player.audio_get_track(), effectiveSubtitle=player.video_get_spu(), stats={'readBytes': stats.read_bytes, 'demuxReadBytes': stats.demux_read_bytes, 'decodedVideo': stats.decoded_video, 'decodedAudio': stats.decoded_audio})
        result['technicalPass'] = player.audio_get_track() == japanese['id'] and player.video_get_spu() == full_english['id'] and player.get_time() >= 600500 and stats.decoded_video > initial['decodedVideo'] + 5 and stats.decoded_audio > initial['decodedAudio'] + 5
    except Exception as error:
        log('error', message=str(error))
        result['technicalPass'] = False
    finally:
        player.stop()
        player.release()
        media.release()
        instance.release()
        output = RUNTIME / 'evidence' / f'vlc-{episode}-{int(time.time())}.json'
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(f'Evidence: {output}', flush=True)
    return result['technicalPass']


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('episode', type=int, choices=[1, 1001])
    parser.add_argument('--relay', action='store_true')
    args = parser.parse_args()
    sys.exit(0 if run(args.episode, args.relay) else 1)
