"""CPU-only request contract shared by disposable Studio engines."""
import math

QWEN_MODEL = 'qwen-image-2.1'
REFERENCE_CAPS = {'flux2-klein-fp8':2, 'realvis-dynamic':1, 'realistic-sd15':1, 'zimage-nvfp4':1, QWEN_MODEL:10}

def dimensions(model, references):
    if model == QWEN_MODEL and references:
        ratio = references[0]['width'] / references[0]['height']
        return (max(32, round(math.sqrt(1048576*ratio)/32)*32), max(32, round(math.sqrt(1048576/ratio)/32)*32))
    return (512, 768) if references else (768, 1024)

def validate_request(job):
    model, schema = job.get('model'), job.get('schemaVersion')
    references = job.get('references', [])
    if model not in REFERENCE_CAPS or schema not in (2,3,4) or job.get('recordType') is not None:
        raise ValueError('invalid-job')
    if model == QWEN_MODEL and schema != 4:
        raise ValueError('invalid-job')
    if not isinstance(references, list) or len(references) > REFERENCE_CAPS[model]:
        raise ValueError('invalid-reference')
    if schema == 2 and any(key in job for key in ('references','inputsReady','parentJobId')):
        raise ValueError('invalid-job')
    if schema in (3,4) and (not isinstance(job.get('inputsReady'), bool) or (references and not job['inputsReady'])):
        raise ValueError('invalid-reference')
    if schema == 3 and len(references) > 2:
        raise ValueError('invalid-reference')
    prompt = job.get('prompt')
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 6000 or job.get('consent') is not True:
        raise ValueError('invalid-job')
    if type(job.get('seed')) is not int or not 0 <= job['seed'] <= 2147483647:
        raise ValueError('invalid-job')
    hashes, drive_ids = set(), set()
    for index, reference in enumerate(references):
        if reference.get('index') != index or reference.get('role') not in (None,'subject','pose'):
            raise ValueError('invalid-reference')
        if schema < 4 and 'role' in reference:
            raise ValueError('invalid-reference')
        if schema == 4:
            if model == QWEN_MODEL and (reference['width'] > reference['height']*8 or reference['height'] > reference['width']*8):
                raise ValueError('invalid-reference-aspect-ratio')
            digest, source = reference.get('sha256'), reference.get('source', {})
            drive_id = source.get('id') if source.get('kind') == 'drive' else None
            if digest in hashes or (drive_id and drive_id in drive_ids):
                raise ValueError('invalid-reference')
            hashes.add(digest)
            if drive_id:
                drive_ids.add(drive_id)
    if (job.get('width'), job.get('height')) != dimensions(model, references):
        raise ValueError('invalid-job')
    if schema < 4:
        if 'pose' in job or 'effectivePrompt' in job:
            raise ValueError('invalid-job')
        return prompt
    pose = job.get('pose')
    if pose is not None:
        allowed = {'referenceIndex','catalogId','fileId','category','label','instruction','mode'}
        if not isinstance(pose, dict) or set(pose) != allowed:
            raise ValueError('invalid-pose')
        for key, limit in {'catalogId':160,'fileId':160,'category':80,'label':160,'instruction':1200}.items():
            if not isinstance(pose[key], str) or not pose[key].strip() or len(pose[key]) > limit:
                raise ValueError('invalid-pose')
        index = pose['referenceIndex']
        if pose['mode'] == 'image':
            if type(index) is not int or not 1 <= index < len(references):
                raise ValueError('invalid-pose')
            reference = references[index]
            if reference.get('role') != 'pose' or reference['source'].get('kind') != 'drive' or reference['source'].get('id') != pose['fileId']:
                raise ValueError('invalid-pose')
        elif pose['mode'] != 'text' or index != -1:
            raise ValueError('invalid-pose')
        if sum(reference.get('role') == 'pose' for reference in references) != (1 if pose['mode'] == 'image' else 0):
            raise ValueError('invalid-pose')
    elif 'pose' in job or any(reference.get('role') == 'pose' for reference in references):
        raise ValueError('invalid-pose')
    effective = prompt + '\n\n' + pose['instruction'] if pose else prompt
    if job.get('effectivePrompt') != effective or len(effective) > 8000:
        raise ValueError('invalid-effective-prompt')
    return effective
