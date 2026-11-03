"""Bounded private-image validation and archive thumbnails; no model/network use."""
import hashlib, io, json, sys, warnings
from pathlib import Path
from PIL import Image, ImageOps

MAX_PIXELS = 1048576
MAX_QWEN_OUTPUT_PIXELS = 1150000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
warnings.simplefilter('error', Image.DecompressionBombWarning)

def read_reference(path, manifest, inference_pixels=262144):
    file = Path(path)
    if file.stat().st_size != manifest['bytes'] or not 100 <= manifest['bytes'] <= 2097152:
        raise ValueError('invalid-reference')
    data = file.read_bytes()
    if hashlib.sha256(data).hexdigest() != manifest['sha256']:
        raise ValueError('invalid-reference')
    expected = {'image/png':'PNG', 'image/jpeg':'JPEG'}[manifest['mime']]
    with Image.open(io.BytesIO(data)) as image:
        if image.format != expected or image.size != (manifest['width'], manifest['height']) or max(image.size) > 1024 or image.width*image.height > MAX_PIXELS or getattr(image, 'n_frames', 1) != 1:
            raise ValueError('invalid-reference')
        image.load()
        image = ImageOps.exif_transpose(image).convert('RGB')
    # Fixed safe reference token budget; source bytes remain untouched on H.
    if inference_pixels is None:
        return image
    scale = min(1., (inference_pixels/(image.width*image.height))**.5)
    size = tuple(max(16, int(edge*scale)//16*16) for edge in image.size)
    return image.resize(size, Image.Resampling.LANCZOS) if image.size != size else image

def read_qwen_output(path, expected_size=None):
    """Read a bounded native canvas without weakening the stricter input cap.

    The native 32px rounding can place output slightly above 1024 squared. Only
    this output-only call suppresses Pillow's lower input warning; dimensions,
    pixel count, format and byte budget are checked before decoding pixels.
    """
    file = Path(path)
    if not 100 <= file.stat().st_size <= 7200000:
        raise ValueError('invalid-output')
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', Image.DecompressionBombWarning)
        with Image.open(file) as image:
            if image.format != 'PNG' or getattr(image, 'n_frames', 1) != 1:
                raise ValueError('invalid-output')
            if any(edge < 32 or edge > 3072 or edge % 32 for edge in image.size) or image.width*image.height > MAX_QWEN_OUTPUT_PIXELS:
                raise ValueError('invalid-output')
            if expected_size is not None and image.size != tuple(expected_size):
                raise ValueError('invalid-output')
            image.load()
            return image.copy()

def thumbnail(image, directory):
    image = image.convert('RGB')
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    for quality in (82, 72, 60, 45, 30):
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG', quality=quality, optimize=True)
        data = buffer.getvalue()
        if len(data) <= 65536:
            break
    else:
        raise ValueError('invalid-thumbnail')
    file = Path(directory)/'thumbnail.jpg'
    if file.exists():
        if file.read_bytes() != data:
            raise ValueError('thumbnail-conflict')
    else:
        with file.open('xb') as output:
            output.write(data)
    return dict(width=image.width, height=image.height, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())

if __name__ == '__main__':
    directory = Path(sys.argv[2]).resolve()
    roots = (Path(r'H:\AI-ImageGen\portrait-pilot\velum-studio').resolve(), Path(__file__).resolve().parent/'.runtime/qwen21')
    if directory.parent not in roots or sys.argv[1] != 'thumbnail':
        raise ValueError('output-path-denied')
    source = read_qwen_output(directory/'image.png') if directory.parent == roots[1] else Image.open(directory/'image.png')
    with source:
        source.load()
        print(json.dumps(thumbnail(source, directory)))
