"""Create two synthetic, non-private image inputs for one bounded edit proof."""
import hashlib, json, sys
from pathlib import Path
from PIL import Image, ImageDraw

identifier = sys.argv[1]
if not identifier.startswith('reference-smoke-') or not all(c.isascii() and (c.isalnum() or c in '_-') for c in identifier):
    raise ValueError('invalid-job')
directory = Path(r'H:\AI-ImageGen\portrait-pilot\velum-studio')/identifier/'inputs'
directory.mkdir(parents=True, exist_ok=False)
references = []
for index in range(2):
    image = Image.new('RGB', (512, 512), 'white')
    draw = ImageDraw.Draw(image)
    if index == 0:
        draw.rectangle((120, 150, 392, 362), fill='#cf2525', outline='#7e1414', width=8)
    else:
        draw.ellipse((128, 128, 384, 384), fill='#215acb', outline='#123b89', width=8)
    file = directory/f'{index}.png'
    image.save(file)
    data = file.read_bytes()
    references.append(dict(index=index, mime='image/png', bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), width=512, height=512, chunks=1, source=dict(kind='file', id=f'synthetic-{index}', name=f'Synthetic reference {index+1}')))
print(json.dumps(references))
