"""One native Qwen-Image 2.1 inference in its existing, isolated environment.

No server, downloads, warm model, prompt enhancer or alternative-model fallback.
Importing this file performs no filesystem mutation, model import or inference.
"""
import gc, hashlib, json, os, subprocess, sys, threading, time
from pathlib import Path
from inference_contract import validate_request, QWEN_MODEL

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
OUT = HERE / '.runtime/qwen21'
ENGINE = Path(r'H:\AI-ImageGen\velum-qwen21-research-20261103')
RUNTIME = Path(r'F:\Workspace\Support\LocalCodexBridge\scratch\qwen21-quality-20261103\ComfyUI')
REVISION = '426f5eea52a7ece1dd599fff4cb6cd1f352ddd24'
LOCK = Path(r'H:\AI-ImageGen\portrait-pilot\velum-studio\inference.lock')
WEIGHTS = {
    'diffusion_models/qwen_image_2.1_int8_convrot.safetensors':7256783064,
    'text_encoders/qwen3vl_8b_w4a8.safetensors':6312105364,
    'vae/qwen_image_2.1_vae_bf16.safetensors':675509688,
}
GIB = 1024**3
TIMEOUT_SECONDS = 7200
STOP = threading.Event()
START = None
MM = None
REASON = None
WORK = None

def emit(**value):
    print(json.dumps(value), flush=True)

def check_assets():
    for relative, size in WEIGHTS.items():
        if (ENGINE/'models'/relative).stat().st_size != size:
            raise ValueError('model-unavailable')
    head = (RUNTIME/'.git/HEAD').read_text().strip()
    revision = (RUNTIME/'.git'/head[5:]).read_text().strip() if head.startswith('ref: ') else head
    if revision != REVISION:
        raise ValueError('runtime-revision-mismatch')

def assert_encoder(clip):
    if 'QwenImage21' not in type(clip.cond_stage_model).__name__:
        raise RuntimeError('unexpected-qwen-encoder-family')

def assert_diffusion(model):
    if type(model.model).__name__ != 'QwenImage21' or type(model.model.diffusion_model).__name__ != 'QwenImage21Transformer2DModel':
        raise RuntimeError('unexpected-qwen-diffusion-family')

def encode_native(node, clip, vae, prompt, images):
    # Autogrow slots are the native model inputs. Every accepted distinct image,
    # including pose, is passed once; no contact sheet, truncation or display-only ref.
    if len(images) > 10:
        raise ValueError('invalid-reference')
    encoded = node.execute(clip=clip, prompt=prompt, negative_prompt='', vae=vae,
                          resolution=1024, images={f'image_{i+1}':image for i, image in enumerate(images)})
    if images:
        for conditioning in encoded[:2]:
            if not conditioning or any(len(entry[1].get('reference_latents', [])) != len(images) for entry in conditioning):
                raise RuntimeError('reference-conditioning-incomplete')
    return encoded[0], encoded[1], encoded[2]

def configure_environment():
    for key, relative in {'TEMP':'tmp','TMP':'tmp','TMPDIR':'tmp','HF_HOME':'cache/hf',
        'TORCH_HOME':'cache/torch','TORCH_EXTENSIONS_DIR':'cache/torch-extensions',
        'TORCHINDUCTOR_CACHE_DIR':'cache/inductor','TRITON_CACHE_DIR':'cache/triton',
        'CUDA_CACHE_PATH':'cache/cuda','XDG_CACHE_HOME':'cache','MPLCONFIGDIR':'cache/matplotlib',
        'NUMBA_CACHE_DIR':'cache/numba'}.items():
        directory = OUT / relative
        directory.mkdir(parents=True, exist_ok=True)
        os.environ[key] = str(directory)
    os.environ.update(PYTHONDONTWRITEBYTECODE='1',PYTHONNOUSERSITE='1',CUDA_CACHE_DISABLE='1',
        HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',DO_NOT_TRACK='1',
        OMP_NUM_THREADS='4',MKL_NUM_THREADS='4',OPENBLAS_NUM_THREADS='4',TOKENIZERS_PARALLELISM='false')

def offline_guard():
    def permitted(file):
        return isinstance(file, int) or str(file).lower() in ('nul',r'\\.\nul') or Path(file).resolve().is_relative_to(OUT.resolve())
    def audit(event, args):
        if event in ('socket.bind','socket.connect'):
            raise PermissionError('offline-inference-only')
        if event == 'open' and len(args) > 2 and isinstance(args[2], int):
            if args[2] & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND) and not permitted(args[0]):
                raise PermissionError('output-path-denied')
        if event in ('os.mkdir','os.remove','os.rmdir','os.truncate','os.chmod','os.utime') and not permitted(args[0]):
            raise PermissionError('output-path-denied')
        if event in ('os.rename','os.link','os.symlink') and not all(permitted(file) for file in args[:2]):
            raise PermissionError('output-path-denied')
    sys.addaudithook(audit)

def guard():
    global REASON
    import psutil, _thread
    while not STOP.wait(1):
        try:
            parent = psutil.Process(int(os.environ['VELUM_PARENT_PID']))
            bad = parent.create_time() != float(os.environ['VELUM_PARENT_CREATED'])
            bad |= psutil.virtual_memory().available < 5*GIB or psutil.disk_usage('H:\\').free < 20*GIB
            bad |= psutil.disk_usage('F:\\').free < 10*GIB or time.monotonic()-START > TIMEOUT_SECONDS
            raw = subprocess.check_output(['nvidia-smi','--query-gpu=memory.used,temperature.gpu','--format=csv,noheader,nounits'],
                creationflags=subprocess.CREATE_NO_WINDOW,text=True,timeout=5)
            vram, temperature = [int(value.strip()) for value in raw.strip().split(',')]
            bad |= vram > 7500 or temperature >= 78
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
    global START, MM, WORK
    START = time.monotonic()
    request = json.load(sys.stdin)
    job, identifier = request['job'], request['id']
    if not isinstance(identifier,str) or not 1 <= len(identifier) <= 80 or not all(c.isascii() and (c.isalnum() or c in '_-') for c in identifier):
        raise ValueError('invalid-job')
    prompt = validate_request(job)
    if job['model'] != QWEN_MODEL:
        raise ValueError('invalid-model')
    check_assets()
    OUT.mkdir(parents=True,exist_ok=True)
    import msvcrt
    # Same existing cross-checkout GPU mutex. The H asset/runtime tree is read-only.
    inference_lock = LOCK.open('rb')
    inference_lock.seek(0)
    msvcrt.locking(inference_lock.fileno(),msvcrt.LK_NBLCK,1)
    work = OUT/identifier
    work.mkdir(exist_ok=True)
    if any(file.name != 'inputs' for file in work.iterdir()):
        raise ValueError('existing-job-output')
    WORK = work
    from media import read_reference, thumbnail
    references = job['references']
    source_images = []
    for index, manifest in enumerate(references):
        extension = 'png' if manifest['mime'] == 'image/png' else 'jpg'
        source_images.append(read_reference(work/'inputs'/f'{index}.{extension}',manifest,inference_pixels=None))
    with (work/'inference-started.json').open('x',encoding='utf-8') as marker:
        json.dump(dict(jobId=identifier,model=job['model'],prompt=job['prompt'],effectivePrompt=prompt,
                       pose=job.get('pose'),seed=job['seed'],references=references),marker,ensure_ascii=False)
    configure_environment()
    offline_guard()
    import psutil
    if psutil.virtual_memory().available < 6*GIB or psutil.disk_usage('F:\\').free < 10*GIB:
        raise RuntimeError('resource-guard')
    psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
    threading.Thread(target=guard,daemon=True).start()
    sys.path.insert(0,str(RUNTIME))
    sys.argv = ['velum-qwen-offline','--base-directory',str(OUT/'comfy-data'),
        '--disable-all-custom-nodes','--disable-api-nodes','--lowvram','--disable-dynamic-vram',
        '--reserve-vram','2.0','--disable-async-offload','--disable-pinned-memory','--cache-none',
        '--preview-method','none','--disable-auto-launch','--use-pytorch-cross-attention','--cpu-vae','--fp32-vae']
    stages = []
    def stage(name):
        stages.append(dict(stage=name,seconds=round(time.monotonic()-START,2)))
        emit(event='stage',**stages[-1])
    try:
        import comfy.options
        comfy.options.enable_args_parsing()
        import torch, numpy as np
        torch.set_num_threads(4)
        torch.set_num_interop_threads(1)
        torch.cuda.set_per_process_memory_fraction(.67)
        import nodes,folder_paths,comfy.model_management as mm,comfy.utils
        from comfy_extras.nodes_qwen import TextEncodeQwenImage21,QwenImage21Cache
        MM = mm
        for category in ('diffusion_models','text_encoders','vae'):
            folder_paths.add_model_folder_path(category,str(ENGINE/'models'/category),is_default=True)
        def progress(value,total,preview,**kwargs):
            if REASON:
                raise InterruptedError(REASON)
            emit(event='progress',step=value,total=total)
        comfy.utils.set_progress_bar_global_hook(progress)
        with torch.inference_mode():
            stage('encoding-references')
            vae = nodes.VAELoader().load_vae('qwen_image_2.1_vae_bf16.safetensors')[0]
            tensors = [torch.from_numpy(np.asarray(image,dtype=np.float32)/255.).unsqueeze(0) for image in source_images]
            class LazyClip:
                inner = None
                def tokenize(self,*args,**kwargs):
                    if self.inner is None:
                        stage('encoding-prompt')
                        self.inner = nodes.CLIPLoader().load_clip('qwen3vl_8b_w4a8.safetensors','qwen_image','cpu')[0]
                        assert_encoder(self.inner)
                    return self.inner.tokenize(*args,**kwargs)
                def encode_from_tokens_scheduled(self,*args,**kwargs):
                    return self.inner.encode_from_tokens_scheduled(*args,**kwargs)
            clip = LazyClip()
            positive,negative,latent = encode_native(TextEncodeQwenImage21,clip,vae,prompt,tensors)
            # Native edit canvas must match image1; text-only has no reference canvas.
            if references:
                if latent['samples'].shape[-2:] != (job['height']//16,job['width']//16):
                    raise RuntimeError('native-canvas-mismatch')
            else:
                latent = {'samples':torch.zeros([1,64,job['height']//16,job['width']//16],device=mm.intermediate_device())}
            emit(event='references-encoded',count=len(tensors),method='TextEncodeQwenImage21')
            encoder_class = type(clip.inner.cond_stage_model).__name__
            mm.unload_all_models()
            del clip,tensors,vae
            gc.collect()
            mm.cleanup_models()
            mm.soft_empty_cache()
            stage('loading-diffusion')
            model = nodes.UNETLoader().load_unet('qwen_image_2.1_int8_convrot.safetensors','default')[0]
            assert_diffusion(model)
            dtype = str(model.model.get_dtype())
            model = QwenImage21Cache.execute(model,'cpu','default')[0]
            stage('sampling')
            samples = nodes.KSampler().sample(model,job['seed'],40,1.,'euler','simple',positive,negative,latent,denoise=1.)[0]
            mm.unload_all_models()
            del model,positive,negative,latent
            gc.collect()
            mm.cleanup_models()
            mm.soft_empty_cache()
            stage('decoding')
            vae = nodes.VAELoader().load_vae('qwen_image_2.1_vae_bf16.safetensors')[0]
            pixels = vae.decode(samples['samples'])[0].detach().cpu().numpy()
            if not np.isfinite(pixels).all():
                raise RuntimeError('invalid-output')
            from PIL import Image,PngImagePlugin
            image = Image.fromarray((pixels.clip(0,1)*255).round().astype(np.uint8))
            if image.size != (job['width'],job['height']):
                raise RuntimeError('invalid-output')
            settings = dict(model=job['model'],seed=job['seed'],width=image.width,height=image.height,
                steps=40,cfg=1.,sampler='euler',scheduler='simple',negativePrompt='',denoise=1.,
                referenceMethod='qwen21-native-multireference',referenceCount=len(references),
                referencePixels=[dict(width=source.width,height=source.height) for source in source_images],
                referenceResolution=1024,encoderDevice='cpu',vaeDevice='cpu',vaePrecision='fp32',
                referenceCacheDevice='cpu',referenceCachePrecision='default',diffusionDtype=dtype,
                encoderClass=encoder_class,diffusionClass='QwenImage21Transformer2DModel',
                runtimeRevision=REVISION,timeoutSeconds=TIMEOUT_SECONDS,batchSize=1)
            provenance = dict(prompt=job['prompt'],effectivePrompt=prompt,settings=settings,
                parentJobId=job['parentJobId'],references=references)
            if 'pose' in job:
                provenance['pose'] = job['pose']
            meta = PngImagePlugin.PngInfo()
            meta.add_text('velum',json.dumps(provenance,ensure_ascii=False))
            file = work/'image.png'
            with file.open('xb') as output:
                image.save(output,format='PNG',pnginfo=meta)
            with Image.open(file) as decoded:
                decoded.load()
                if decoded.size != (job['width'],job['height']):
                    raise RuntimeError('invalid-output')
            thumb = thumbnail(image,work)
            result = dict(**provenance,localPath=str(file),thumbnail=thumb,stages=stages,
                seconds=round(time.monotonic()-START,2),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
            with (work/'result.json').open('x',encoding='utf-8') as metadata:
                json.dump(result,metadata,ensure_ascii=False)
            emit(event='saved',**result)
    finally:
        STOP.set()
        if MM:
            MM.unload_all_models()
            gc.collect()
            MM.soft_empty_cache()

if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        import traceback
        traceback.print_exc(file=sys.stderr)
        code = REASON or ('resource-guard' if str(error) == 'resource-guard' else 'inference-failed')
        if WORK:
            try:
                with (WORK/'failure.json').open('x',encoding='utf-8') as failure:
                    json.dump(dict(error=code,traceback=traceback.format_exc()),failure)
            except FileExistsError:
                pass
        emit(event='failed',error=code)
        sys.exit(2)
