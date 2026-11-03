import hashlib, tempfile, unittest
from pathlib import Path
from PIL import Image
from media import read_reference, read_qwen_output, thumbnail, MAX_PIXELS
from unittest.mock import patch

class MediaValidation(unittest.TestCase):
    def test_private_source_validation_resize_and_non_destructive_thumbnail(self):
        with tempfile.TemporaryDirectory(prefix='.velum-media-test-', dir=Path.cwd()) as directory:
            root = Path(directory)
            file = root/'source.png'
            Image.new('RGB', (1024, 768), '#a22527').save(file)
            original = file.read_bytes()
            manifest = dict(bytes=len(original), sha256=hashlib.sha256(original).hexdigest(), mime='image/png', width=1024, height=768)
            image = read_reference(file, manifest)
            self.assertLessEqual(image.width*image.height, 262144)
            self.assertEqual(image.width % 16, 0)
            self.assertEqual(read_reference(file, manifest, inference_pixels=None).size, (1024,768))
            for change in (dict(mime='image/jpeg'), dict(width=512), dict(bytes=len(original)-1), dict(sha256='0'*64)):
                with self.assertRaises((ValueError, KeyError)):
                    read_reference(file, {**manifest, **change})
            result = thumbnail(image, root)
            self.assertLessEqual(result['bytes'], 65536)
            self.assertEqual(thumbnail(image, root), result)
            self.assertEqual(file.read_bytes(), original)
            self.assertEqual(hashlib.sha256((root/'thumbnail.jpg').read_bytes()).hexdigest(), result['sha256'])

    def test_compressed_oversize_decode_is_rejected_before_model_loading(self):
        with tempfile.TemporaryDirectory(prefix='.velum-media-test-', dir=Path.cwd()) as directory:
            file = Path(directory)/'oversize.png'
            Image.new('RGB', (1100, 1100)).save(file)
            data = file.read_bytes()
            with self.assertRaises((ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError)):
                read_reference(file, dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), mime='image/png', width=1100, height=1100))

    def test_native_qwen_canvas_rounding_is_accepted_without_changing_input_cap_or_original_bytes(self):
        with tempfile.TemporaryDirectory(prefix='.velum-media-test-', dir=Path.cwd()) as directory:
            file = Path(directory)/'native-output.png'
            Image.new('RGB', (896,1184), '#173452').save(file)
            original = file.read_bytes()
            self.assertGreater(896*1184, MAX_PIXELS)
            with read_qwen_output(file,(896,1184)) as output:
                self.assertEqual(output.size,(896,1184))
            self.assertEqual(file.read_bytes(),original)
            self.assertEqual(Image.MAX_IMAGE_PIXELS,MAX_PIXELS)
            with self.assertRaises((ValueError,Image.DecompressionBombWarning)):
                read_reference(file,dict(bytes=len(original),sha256=hashlib.sha256(original).hexdigest(),mime='image/png',width=896,height=1184))
            with self.assertRaises(ValueError):
                read_qwen_output(file,(832,1248))
            Image.new('RGB',(1024,1024),'white').save(file)
            data=file.read_bytes()
            self.assertEqual(read_reference(file,dict(bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),mime='image/png',width=1024,height=1024),inference_pixels=None).size,(1024,1024))

    def test_qwen_output_budget_and_dimensions_reject_before_pixel_decode(self):
        with tempfile.TemporaryDirectory(prefix='.velum-media-test-', dir=Path.cwd()) as directory:
            for index,size in enumerate(((768,1536),(896,1183),(3104,32))):
                file = Path(directory)/f'oversize-{index}.png'
                Image.new('RGB',size,'white').save(file)
                with patch.object(Image.Image,'load',side_effect=AssertionError('must reject before decoding')):
                    with self.assertRaises(ValueError):
                        read_qwen_output(file)

if __name__ == '__main__':
    unittest.main()
