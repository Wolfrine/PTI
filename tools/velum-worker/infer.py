"""One offline inference; disposable process, no ComfyUI listener or prompt rewriting."""
import os, sys, json, time, gc, threading, subprocess, hashlib
from pathlib import Path
sys.dont_write_bytecode = True
DATA = Path(r'H:\AI-ImageGen\portrait-pilot')
OUT = DATA / 'velum-studio'
RUNTIME = Path(r'F:\Workspace\Support\tools\local-image-gen\ComfyUI')
GIB = 1024**3
STOP = threading.Event()
START = time.monotonic()
MM = None
REASON = None
WORK = None

def emit(**value):
    print(json.dumps(value), flush=True)

def guard():
    global REASON
    import psutil, _thread
    while not STOP.wait(1):
        try:
            parent = psutil.Process(int(os.environ['VELUM_PARENT_PID']))
            bad = parent.create_time() != float(os.environ['VELUM_PARENT_CREATED'])
            bad |= psutil.virtual_memory().available < 5*GIB or psutil.disk_usage('H:\\').free < 20*GIB
            bad |= time.monotonic()-START > 1800
            raw = subprocess.check_output(['nvidia-smi', '--query-gpu=memory.used,temperature.gpu', '--format=csv,noheader,nounits'],
                creationflags=subprocess.CREATE_NO_WINDOW, text=True, timeout=5)
            vram, temp = [int(value.strip()) for value in raw.strip().split(',')]
            bad |= vram > 7500 or temp >= 78
            if not bad:
                continue
        except Exception:
            pass
        REASON = 'resource-guard'
        if MM:
            MM.interrupt_current_processing(True)
        _thread.interrupt_main()
        if not STOP.wait(3):
            os._exit(3)
        return

def main():
    global MM, WORK
    request = json.load(sys.stdin)
    job, jid = request['job'], request['id']
    if not 1 <= len(jid) <= 80 or not all(c.isascii() and (c.isalnum() or c in '_-') for c in jid):
        raise ValueError('invalid-job')
    if job['width'] != 768 or job['height'] != 1024 or job.get('consent') is not True:
        raise ValueError('invalid-job')
    if not isinstance(job['prompt'], str) or not job['prompt'].strip() or len(job['prompt']) > 6000:
        raise ValueError('invalid-job')
    OUT.mkdir(parents=True, exist_ok=True)
    # An OS lock is shared by every Studio inference process, including other checkouts.
    import msvcrt
    inference_lock = (OUT/'inference.lock').open('a+b')
    inference_lock.seek(0)
    msvcrt.locking(inference_lock.fileno(), msvcrt.LK_NBLCK, 1)
    work = OUT / jid
    work.mkdir(exist_ok=False)
    WORK = work
    for key, relative in {'TEMP':'tmp', 'TMP':'tmp', 'TMPDIR':'tmp', 'HF_HOME':'cache/hf', 'TORCH_HOME':'cache/torch',
        'TORCH_EXTENSIONS_DIR':'cache/torch-extensions', 'TORCHINDUCTOR_CACHE_DIR':'cache/inductor',
        'TRITON_CACHE_DIR':'cache/triton', 'CUDA_CACHE_PATH':'cache/cuda', 'XDG_CACHE_HOME':'cache',
        'MPLCONFIGDIR':'cache/matplotlib', 'NUMBA_CACHE_DIR':'cache/numba'}.items():
        directory = OUT / relative
        directory.mkdir(parents=True, exist_ok=True)
        os.environ[key] = str(directory)
    os.environ.update(PYTHONDONTWRITEBYTECODE='1', PYTHONNOUSERSITE='1', CUDA_CACHE_DISABLE='1',
        HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1',
        OMP_NUM_THREADS='2', MKL_NUM_THREADS='2', OPENBLAS_NUM_THREADS='2', TOKENIZERS_PARALLELISM='false')
    def permitted(path):
        return isinstance(path, int) or str(path).lower() in ('nul', r'\\.\nul') or Path(path).resolve().is_relative_to(OUT.resolve())
    def audit(event, args):
        if event in ('socket.bind', 'socket.connect'):
            raise PermissionError('offline-inference-only')
        if event == 'open' and len(args) > 2 and isinstance(args[2], int):
            if args[2] & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND) and not permitted(args[0]):
                raise PermissionError('output-path-denied')
        if event in ('os.mkdir','os.remove','os.rmdir','os.truncate','os.chmod','os.utime') and not permitted(args[0]):
            raise PermissionError('output-path-denied')
        if event in ('os.rename','os.link','os.symlink') and not all(permitted(path) for path in args[:2]):
            raise PermissionError('output-path-denied')
    sys.addaudithook(audit)
    import psutil
    if psutil.virtual_memory().available < 6*GIB:
        raise RuntimeError('resource-guard')
    psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
    threading.Thread(target=guard, daemon=True).start()
    sys.path.insert(0, str(RUNTIME))
    sys.argv = ['velum-offline', '--base-directory', str(DATA), '--disable-all-custom-nodes', '--disable-api-nodes',
        '--lowvram', '--reserve-vram', '2.5', '--disable-async-offload', '--disable-pinned-memory', '--cache-none',
        '--preview-method', 'none', '--disable-auto-launch', '--use-pytorch-cross-attention', '--fp32-vae']
    try:
        import comfy.options
        comfy.options.enable_args_parsing()
        import comfy_aimdo.control as control
        control.init(simple_vram_headroom=int(2.5*GIB))
        import torch
        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)
        torch.cuda.set_per_process_memory_fraction(.62)
        import nodes, comfy.model_management as mm, comfy.model_patcher as mp, comfy.memory_management as memory, comfy.utils
        from comfy.cli_args import args
        MM = mm
        if not control.init_devices((device.index, int(args.vram_headroom*GIB)) for device in mm.get_all_torch_devices()):
            raise RuntimeError('dynamic-loader-unavailable')
        mp.CoreModelPatcher = mp.ModelPatcherDynamic
        memory.aimdo_enabled = True
        def progress(value, total, preview, **kwargs):
            if REASON:
                raise InterruptedError(REASON)
            emit(event='progress', step=value, total=total)
            time.sleep(.2)
        comfy.utils.set_progress_bar_global_hook(progress)
        mode, prompt, seed = job['model'], job['prompt'], job['seed']
        width, height = job['width'], job['height']
        with torch.inference_mode():
            if mode in ('realvis-dynamic', 'realistic-sd15'):
                filename = 'RealVisXL_V5.0_fp16.safetensors' if mode == 'realvis-dynamic' else 'Realistic_Vision_V6.0_NV_B1_fp16.safetensors'
                model, clip, vae = nodes.CheckpointLoaderSimple().load_checkpoint(filename)
                if mode == 'realistic-sd15':
                    del vae
                    gc.collect()
                    vae = nodes.VAELoader().load_vae('vae-ft-mse-840000-ema-pruned.safetensors')[0]
                positive = nodes.CLIPTextEncode().encode(clip, prompt)[0]
                negative = nodes.CLIPTextEncode().encode(clip, '')[0]
                steps, cfg, sampler, scheduler = 28, 5., 'dpmpp_sde', 'karras'
                latent = nodes.EmptyLatentImage().generate(width, height, 1)[0]
                samples = nodes.KSampler().sample(model, seed, steps, cfg, sampler, scheduler, positive, negative, latent, denoise=1.)[0]
            elif mode in ('flux2-klein-fp8', 'zimage-nvfp4'):
                import comfy.sd
                clip = comfy.sd.load_clip(ckpt_paths=[str(DATA/'models/text_encoders/qwen_3_4b_fp8_mixed.safetensors')],
                    clip_type=comfy.sd.CLIPType.FLUX2 if mode == 'flux2-klein-fp8' else comfy.sd.CLIPType.LUMINA2,
                    embedding_directory=[], model_options={})
                positive = nodes.CLIPTextEncode().encode(clip, prompt)[0]
                mm.unload_all_models()
                del clip
                gc.collect()
                mm.soft_empty_cache()
                negative = nodes.ConditioningZeroOut().zero_out(positive)[0]
                cfg = 1.
                if mode == 'flux2-klein-fp8':
                    from comfy_extras.nodes_flux import EmptyFlux2LatentImage, Flux2Scheduler
                    from comfy_extras.nodes_custom_sampler import SamplerCustom
                    import comfy.samplers
                    model = nodes.UNETLoader().load_unet('flux-2-klein-4b-fp8.safetensors', 'default')[0]
                    vae = nodes.VAELoader().load_vae('flux2-vae.safetensors')[0]
                    steps, sampler, scheduler = 4, 'euler', 'Flux2Scheduler'
                    latent = EmptyFlux2LatentImage.execute(width, height, 1)[0]
                    sigmas = Flux2Scheduler.execute(steps, width, height)[0]
                    samples = SamplerCustom.execute(model, True, seed, cfg, positive, negative, comfy.samplers.sampler_object(sampler), sigmas, latent)[0]
                else:
                    from comfy_extras.nodes_sd3 import EmptySD3LatentImage
                    from comfy_extras.nodes_model_advanced import ModelSamplingAuraFlow
                    model = nodes.UNETLoader().load_unet('z_image_turbo_nvfp4.safetensors', 'default')[0]
                    model = ModelSamplingAuraFlow().patch_aura(model, 3.)[0]
                    vae = nodes.VAELoader().load_vae('ae.safetensors')[0]
                    steps, sampler, scheduler = 8, 'res_multistep', 'simple'
                    latent = EmptySD3LatentImage().generate(width, height, 1)[0]
                    samples = nodes.KSampler().sample(model, seed, steps, cfg, sampler, scheduler, positive, negative, latent, denoise=1.)[0]
            else:
                raise ValueError('invalid-model')
            from PIL import Image, PngImagePlugin
            import numpy as np
            pixels = vae.decode_tiled(samples['samples'], tile_x=64, tile_y=64, overlap=16)[0].detach().cpu().numpy()
            if not np.isfinite(pixels).all():
                raise RuntimeError('invalid-output')
            image = Image.fromarray((pixels.clip(0, 1)*255).round().astype(np.uint8))
            settings = dict(model=mode, seed=seed, width=width, height=height, steps=steps, cfg=cfg, sampler=sampler, scheduler=scheduler, negativePrompt='', denoise=1.)
            meta = PngImagePlugin.PngInfo()
            meta.add_text('velum', json.dumps(dict(prompt=prompt, settings=settings), ensure_ascii=False))
            file = work/'image.png'
            image.save(file, pnginfo=meta)
            with Image.open(file) as decoded:
                decoded.load()
                assert decoded.size == (width, height)
            result = dict(settings=settings, seconds=round(time.monotonic()-START, 2), sha256=hashlib.sha256(file.read_bytes()).hexdigest())
            (work/'result.json').write_text(json.dumps(result), encoding='utf-8')
            emit(event='saved', **result)
    finally:
        STOP.set()
        if MM:
            MM.unload_all_models()
            gc.collect()
            MM.soft_empty_cache()
        # Process exit releases remaining Python references and CUDA allocations.

if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        import traceback
        traceback.print_exc(file=sys.stderr)
        code = REASON or ('resource-guard' if str(error) == 'resource-guard' else 'inference-failed')
        if WORK:
            (WORK/'failure.json').write_text(json.dumps(dict(error=code, traceback=traceback.format_exc())), encoding='utf-8')
        emit(event='failed', error=code)
        sys.exit(2)
