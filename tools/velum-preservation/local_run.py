"""Explicit private experiment CLI. Never imports Studio's queue or credentials.

Configuration and all generated files belong outside the public checkout.
Uses installed inference math read-only; no default Studio behavior is changed.
"""
import argparse
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request

HERE = Path(__file__).resolve().parent
WORKER = HERE.parent/'velum-worker'
GIB = 1024**3


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        while chunk := f.read(8*1024**2): h.update(chunk)
    return h.hexdigest()


def write_new(path, value):
    with Path(path).open('x', encoding='utf-8') as f:
        json.dump(value, f, indent=2, ensure_ascii=False, allow_nan=False)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def request(port, route, payload=None, timeout=30):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{port}'+route, data=data,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=timeout) as f:
        return json.load(f)


@contextlib.contextmanager
def gpu_mutex(path='H:/AI-ImageGen/portrait-pilot/velum-studio/inference.lock'):
    import msvcrt
    # The same lock used by every production Studio engine; never remove it.
    with open(path, 'a+b') as lock:
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        try: yield
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def resources():
    import psutil
    raw = subprocess.check_output(['nvidia-smi', '--query-gpu=memory.used,temperature.gpu,utilization.gpu',
                                  '--format=csv,noheader,nounits'], text=True, timeout=5,
                                 creationflags=subprocess.CREATE_NO_WINDOW)
    vram, temp, util = map(int, raw.strip().split(','))
    return {'time': time.time(), 'vram_mib': vram, 'temp_c': temp, 'gpu_percent': util,
            'ram_available': psutil.virtual_memory().available,
            'H_free': psutil.disk_usage('H:/').free, 'F_free': psutil.disk_usage('F:/').free}


def violation(sample, start=False):
    for key, bad in [('ram', sample['ram_available'] < (6 if start else 5)*GIB),
                     ('vram', sample['vram_mib'] > 7500), ('temperature', sample['temp_c'] >= 78),
                     ('disk_H', sample['H_free'] < 20*GIB), ('disk_F', sample['F_free'] < 10*GIB)]:
        if bad: return key
    return None


def stop_owned(process):
    import psutil
    try:
        parent = psutil.Process(process.pid)
        # Popen still running means this PID cannot have been recycled.
        if process.poll() is not None: return
        children = parent.children(recursive=True)
        for child in reversed(children):
            try: child.terminate()
            except psutil.NoSuchProcess: pass
        process.terminate()
        process.wait(timeout=15)
    except (psutil.NoSuchProcess, ProcessLookupError): pass


@contextlib.contextmanager
def monitored(config, name):
    initial = resources()
    reason = violation(initial, start=True)
    if reason: raise RuntimeError('preflight-'+reason)
    status = json.loads((WORKER/'.runtime/status.json').read_text())
    if status.get('activeJob') or status.get('state') != 'idle': raise RuntimeError('worker-active')
    samples, failures, owned = [initial], [], []
    stop = threading.Event()
    started = time.monotonic()
    def watch():
        while not stop.wait(1):
            try:
                sample = resources()
                samples.append(sample)
                reason = violation(sample)
                status = json.loads((WORKER/'.runtime/status.json').read_text())
                if status.get('activeJob'): reason = 'production-job-active'
                if time.monotonic()-started > 1800: reason = 'timeout'
            except Exception: reason = 'telemetry-query-failed'
            if reason:
                failures.append(reason)
                for child in owned: stop_owned(child)
                return
    thread = threading.Thread(target=watch, daemon=True)
    with gpu_mutex():
        thread.start()
        try: yield owned
        finally:
            for child in owned: stop_owned(child)
            stop.set()
            thread.join(timeout=8)
            write_new(Path(config['root'])/'outputs'/f'{name}-telemetry.json', {
                'seconds': round(time.monotonic()-started, 3), 'failures': failures,
                'samples': samples, 'peak_vram_mib': max(s['vram_mib'] for s in samples),
                'peak_temp_c': max(s['temp_c'] for s in samples),
                'min_ram_available': min(s['ram_available'] for s in samples)})
    if failures: raise RuntimeError('resource-guard:'+failures[0])


def environment(root):
    env = os.environ.copy()
    for key, relative in {'TEMP': 'tmp', 'TMP': 'tmp', 'TMPDIR': 'tmp', 'CUDA_CACHE_PATH': 'cache/cuda',
                          'HF_HOME': 'cache/hf', 'OLLAMA_TMPDIR': 'tmp', 'XDG_CACHE_HOME': 'cache',
                          'USERPROFILE': 'profile', 'APPDATA': 'profile/AppData/Roaming',
                          'LOCALAPPDATA': 'profile/AppData/Local'}.items():
        directory = Path(root)/'work'/relative
        directory.mkdir(parents=True, exist_ok=True)
        env[key] = str(directory)
    env.update(PYTHONDONTWRITEBYTECODE='1', CUDA_CACHE_DISABLE='1', DO_NOT_TRACK='1',
               HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', OMP_NUM_THREADS='4', MKL_NUM_THREADS='4',
               OLLAMA_NO_CLOUD='1', OLLAMA_MAX_LOADED_MODELS='1', OLLAMA_NUM_PARALLEL='1',
               OLLAMA_CONTEXT_LENGTH='4096', OLLAMA_GPU_OVERHEAD=str(GIB), OLLAMA_FLASH_ATTENTION='1',
               OLLAMA_KV_CACHE_TYPE='q8_0', NO_PROXY='127.0.0.1,localhost')
    for key in list(env):
        if key.upper() in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'): del env[key]
    return env


PROFILE_INSTRUCTION = '''Describe only visible properties of the single adult reference subject.
Return JSON with exactly these keys: face, hair, skin_tone, shoulders, upper_torso,
waist_hips, proportions, pose_camera, uncertain. Values are concise factual strings.
Describe facial outline/features, hair, visible skin tone under this lighting,
shoulders and clothed torso silhouette, visible waist/hips and proportions, pose
and camera viewpoint. Say unknown when occluded. Do not guess hidden anatomy,
measurements, ethnicity, identity, age, personality or what clothing conceals.
Do not recommend changing the subject or describe background objects.'''


def image64(path):
    from PIL import Image, ImageOps
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((768, 768))
        data = io.BytesIO()
        image.save(data, format='JPEG', quality=92)
    return base64.b64encode(data.getvalue()).decode()


def describe(config, model):
    root = Path(config['root'])
    port = 11441 if model == 'baseline' else 11442
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) == 0: raise RuntimeError('isolated-port-busy')
    output = root/'private'/f'{model}-proposal.json'
    if output.exists(): raise RuntimeError('existing-description')
    env = environment(root)
    if model == 'baseline':
        env.update(OLLAMA_HOST=f'127.0.0.1:{port}', OLLAMA_MODELS=config['baseline_models'])
        command = [config['ollama'], 'serve']
        route = '/api/tags'
    else:
        command = [config['llama'], '-m', config['heretic_model'], '--mmproj', config['heretic_projector'],
                   '--host', '127.0.0.1', '--port', str(port), '-ngl', '99', '-c', '4096',
                   '-t', '4', '--parallel', '1', '--jinja', '--no-webui']
        route = '/health'
    with monitored(config, model) as owned:
        with (root/'private'/f'{model}-runtime.log').open('xb') as log:
            server = subprocess.Popen(command, cwd=root/'work', env=env, stdin=subprocess.DEVNULL,
                                      stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
            owned.append(server)
            import psutil
            psutil.Process(server.pid).nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
            for _ in range(300):
                if server.poll() is not None: raise RuntimeError('server-exited')
                try:
                    request(port, route, timeout=2)
                    break
                except Exception: time.sleep(1)
            else: raise RuntimeError('server-timeout')
            start = time.monotonic()
            encoded = image64(config['source'])
            if model == 'baseline':
                info = request(port, '/api/show', {'model': 'qwen3-vl:2b'})
                if 'vision' not in info.get('capabilities', []): raise RuntimeError('not-vision')
                result = request(port, '/api/chat', {'model': 'qwen3-vl:2b', 'stream': False, 'think': False,
                    'messages': [{'role': 'user', 'content': PROFILE_INSTRUCTION, 'images': [encoded]}],
                    'format': 'json', 'keep_alive': 0,
                    'options': {'num_ctx': 4096, 'num_predict': 700, 'num_thread': 4, 'temperature': 0, 'seed': 7}}, timeout=900)
                text = result['message']['content']
            else:
                result = request(port, '/v1/chat/completions', {'messages': [{'role': 'user', 'content': [
                    {'type': 'text', 'text': PROFILE_INSTRUCTION},
                    {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,'+encoded}}]}],
                    'temperature': 0, 'seed': 7, 'max_tokens': 700, 'stream': False,
                    'chat_template_kwargs': {'enable_thinking': False},
                    'response_format': {'type': 'json_object'}}, timeout=900)
                text = result['choices'][0]['message']['content']
            write_new(output, {'model': model, 'seconds': round(time.monotonic()-start, 3),
                               'text': text, 'raw_response': result})
            print(json.dumps({'described': model, 'seconds': round(time.monotonic()-start, 3)}), flush=True)


def render(config, label, config_path):
    from subject_profile import effective_prompt
    root = Path(config['root'])
    if label not in ('A', 'B', 'C'): raise ValueError('variant')
    if sha(config['source']) != config['source_sha256']: raise ValueError('source-changed')
    locked = {'source_sha256': config['source_sha256'], 'original_prompt_sha256': hashlib.sha256(config['original_prompt'].encode()).hexdigest(),
              'seed': config['seed'], 'width': 512, 'height': 768, 'steps': 4, 'cfg': 1,
              'sampler': 'euler', 'scheduler': 'Flux2Scheduler', 'denoise': 1, 'batch': 1,
              'adapter_sha256': sha(WORKER/'infer.py'), 'media_sha256': sha(WORKER/'media.py')}
    seal = root/'private/experiment-lock.json'
    if seal.exists():
        if json.loads(seal.read_text()) != locked: raise ValueError('controlled-parameters-changed')
    else: write_new(seal, locked)
    effective = effective_prompt(config['original_prompt'], label, config.get('profile'),
        [config['source_sha256']], config.get('profile_model_sha256'), config.get('correction') if label == 'C' else None)
    if label != 'A':
        profile_seal = root/'private/profile-lock.json'
        profile_binding = {'profile': config['profile'], 'model_sha256': config['profile_model_sha256']}
        if profile_seal.exists():
            if json.loads(profile_seal.read_text()) != profile_binding: raise ValueError('controlled-profile-changed')
        else: write_new(profile_seal, profile_binding)
    path = root/'private/renders'/label
    if path.exists(): raise ValueError('existing-attempt')
    path.mkdir(parents=True)
    write_new(root/'private'/f'{label}-request.json', {'original': config['original_prompt'], 'effective': effective})
    with monitored(config, label) as owned:
        import psutil
        env = environment(root)
        env.update(VELUM_PARENT_PID=str(os.getpid()), VELUM_PARENT_CREATED=str(psutil.Process().create_time()))
        with (root/'private'/f'{label}-stderr.PRIVATE.log').open('xb') as err:
            child = subprocess.Popen([sys.executable, '-B', str(Path(__file__).resolve()), '--config', str(config_path),
                'render-child', label], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=err,
                cwd=WORKER, env=env, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
            owned.append(child)
            psutil.Process(child.pid).nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
            for line in child.stdout:
                print(line.strip(), flush=True)
            if child.wait(timeout=20) != 0: raise RuntimeError('render-failed')


def render_child(config, label):
    # Reuse the installed adapter read-only. Override only private I/O and the
    # explicit derived prompt, after validating its original Studio contract.
    sys.path.insert(0, str(WORKER))
    import inference_contract
    from PIL import Image
    root = Path(config['root'])
    target = root/'private/renders'/label
    started = json.loads((root/'private'/f'{label}-request.json').read_text(encoding='utf-8'))
    inputs = target/'inputs'
    inputs.mkdir()
    shutil.copyfile(config['source'], inputs/'0.jpg')
    with Image.open(config['source']) as image: width, height = image.size
    refs = [{'index': 0, 'role': 'subject', 'mime': 'image/jpeg', 'bytes': Path(config['source']).stat().st_size,
             'sha256': config['source_sha256'], 'width': width, 'height': height,
             'source': {'kind': 'drive', 'id': config['source_drive_id']}}]
    job = {'schemaVersion': 4, 'model': 'flux2-klein-fp8', 'prompt': started['original'],
           'effectivePrompt': started['original'], 'references': refs, 'inputsReady': True,
           'width': 512, 'height': 768, 'seed': config['seed'], 'consent': True}
    original_validator = inference_contract.validate_request
    def validated(value):
        original_validator(value)
        if value['prompt'] != started['original']: raise ValueError('prompt-changed')
        return started['effective']
    inference_contract.validate_request = validated
    adapter = load_module(WORKER/'infer.py', 'research_infer')
    adapter.OUT = root/'private/renders'
    adapter.WORK = None
    original_main = adapter.main
    def emit(**event):
        safe = {key: event[key] for key in ('event', 'stage', 'step', 'total', 'seconds') if key in event}
        print(json.dumps(safe), flush=True)
    adapter.emit = emit
    sys.stdin = io.StringIO(json.dumps({'id': label, 'job': job}))
    original_main()
    result = json.loads((target/'result.json').read_text(encoding='utf-8'))
    if result['prompt'] != started['original'] or result['effectivePrompt'] != started['effective']:
        raise ValueError('result-prompt-binding')
    print(json.dumps({'variant': label, 'sha256': sha(target/'image.png'), 'seconds': result['seconds']}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('operation', choices=['describe', 'render', 'render-child'])
    parser.add_argument('label')
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding='utf-8-sig'))
    root = Path(config['root']).resolve()
    if root.drive.lower() != 'f:' or root.is_relative_to(HERE.parents[1]):
        raise ValueError('private-output-must-be-outside-repository-on-F')
    if args.operation == 'describe': describe(config, args.label)
    elif args.operation == 'render': render(config, args.label, Path(args.config).resolve())
    else: render_child(config, args.label)
