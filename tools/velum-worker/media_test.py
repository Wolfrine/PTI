import hashlib, tempfile, unittest
from pathlib import Path
from PIL import Image
from media import read_reference, thumbnail

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

if __name__ == '__main__':
    unittest.main()
