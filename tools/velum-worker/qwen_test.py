"""CPU-only contract tests. Native conditioning here uses explicit fixtures;
these tests do not establish image quality or successful GPU execution.
"""
import copy, importlib.util, unittest, sys, os
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
from inference_contract import validate_request, dimensions, QWEN_MODEL

spec = importlib.util.spec_from_file_location('qwen_adapter',Path(__file__).with_name('infer-qwen.py'))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

def reference(index):
    return dict(index=index,mime='image/png',bytes=1000,sha256=f'{index:064x}',width=512,height=768,chunks=1,
                source=dict(kind='drive',id=f'reference-{index}',name=f'Reference {index}'),role='subject')

def job(count=1):
    references = [reference(index) for index in range(count)]
    width,height = dimensions(QWEN_MODEL,references)
    return dict(model=QWEN_MODEL,schemaVersion=4,prompt='  Original words.\nKeep whitespace.  ',
        effectivePrompt='  Original words.\nKeep whitespace.  ',seed=42,consent=True,
        references=references,parentJobId='',inputsReady=True,width=width,height=height)

class QwenContract(unittest.TestCase):
    def test_partial_torch_import_does_not_become_a_guard_failure(self):
        diagnostics=SimpleNamespace(observe=lambda sample,startup=False:sample)
        with patch.dict(sys.modules,{'torch':SimpleNamespace(),'psutil':SimpleNamespace()}), \
             patch.dict(os.environ,VELUM_PARENT_PID='123',VELUM_PARENT_CREATED='456'), \
             patch.object(adapter,'DIAGNOSTICS',diagnostics), \
             patch.object(adapter,'collect',return_value={'safe':True}) as collect_sample:
            self.assertEqual(adapter.observe_resources(),{'safe':True})
            self.assertIsNone(collect_sample.call_args.kwargs['cuda'])

    def test_exact_prompt_and_zero_one_ten_native_canvas_contract(self):
        for count in (0,1,10):
            request = job(count)
            self.assertEqual(validate_request(request),request['prompt'])
            self.assertEqual((request['width'],request['height']),(832,1248) if count else (768,1024))
        with self.assertRaises(ValueError):
            validate_request(job(11))
        narrow = job()
        narrow['references'][0].update(width=1,height=1024)
        with self.assertRaisesRegex(ValueError,'aspect-ratio'):
            validate_request(narrow)
        for change in (dict(width=512),dict(effectivePrompt='hidden rewrite'),dict(schemaVersion=3),dict(recordType='historical-import')):
            with self.assertRaises(ValueError):
                validate_request({**job(),**change})

    def test_distinctness_and_pose_binding(self):
        request = job(2)
        request['references'][1]['role'] = 'pose'
        pose = dict(referenceIndex=1,catalogId='standing',fileId='reference-1',category='standing',
                    label='Standing',instruction='Use image 2 as the pose reference.',mode='image')
        request.update(pose=pose,effectivePrompt=request['prompt']+'\n\n'+pose['instruction'])
        self.assertEqual(validate_request(request),request['effectivePrompt'])
        for change in (dict(fileId='wrong'),dict(referenceIndex=0),dict(referenceIndex=-1),dict(mode='text')):
            with self.assertRaises(ValueError):
                validate_request({**request,'pose':{**pose,**change}})
        duplicate = job(2)
        duplicate['references'][1]['sha256'] = duplicate['references'][0]['sha256']
        with self.assertRaises(ValueError):
            validate_request(duplicate)
        duplicate = job(2)
        duplicate['references'][1]['source'] = duplicate['references'][0]['source']
        with self.assertRaises(ValueError):
            validate_request(duplicate)

    def test_native_encoder_receives_every_input_once_and_exact_effective_prompt(self):
        for count in (0,1,10):
            images = [object() for _ in range(count)]
            seen = []
            class NativeFixture:
                @staticmethod
                def execute(**kwargs):
                    seen.append(kwargs)
                    conditioning = [[object(),{'reference_latents':list(kwargs['images'].values())}]]
                    return conditioning,conditioning,{'samples':'fixture-latent'}
            result = adapter.encode_native(NativeFixture,'clip','vae','  Exact\nwords.  ',images)
            self.assertEqual(len(seen),1)
            self.assertEqual(seen[0]['prompt'],'  Exact\nwords.  ')
            self.assertEqual(seen[0]['negative_prompt'],'')
            self.assertEqual(seen[0]['resolution'],1024)
            self.assertEqual(list(seen[0]['images']),[f'image_{index+1}' for index in range(count)])
            self.assertEqual(list(seen[0]['images'].values()),images)
            self.assertEqual(result[2]['samples'],'fixture-latent')
        with self.assertRaises(ValueError):
            adapter.encode_native(NativeFixture,'clip','vae','prompt',[object()]*11)
        class MissingFixture:
            @staticmethod
            def execute(**kwargs):
                return [[None,{}]],[[None,{}]],{}
        with self.assertRaisesRegex(RuntimeError,'reference-conditioning-incomplete'):
            adapter.encode_native(MissingFixture,'clip','vae','prompt',[object()])

    def test_model_family_assertions_refuse_fallback(self):
        class ModelFixture:
            pass
        wrong = ModelFixture()
        wrong.model = ModelFixture()
        wrong.model.diffusion_model = ModelFixture()
        wrong.cond_stage_model = ModelFixture()
        with self.assertRaisesRegex(RuntimeError,'encoder-family'):
            adapter.assert_encoder(wrong)
        with self.assertRaisesRegex(RuntimeError,'diffusion-family'):
            adapter.assert_diffusion(wrong)
        inner = type('QwenImage21',(),{})()
        inner.diffusion_model = type('QwenImage21Transformer2DModel',(),{})()
        wrapper = ModelFixture()
        wrapper.model = inner
        wrapper.cond_stage_model = type('QwenImage21TEModel_',(),{})()
        adapter.assert_encoder(wrapper)
        adapter.assert_diffusion(wrapper)

    def test_other_model_caps_and_raw_legacy_prompt_remain_unchanged(self):
        for model,cap in {'flux2-klein-fp8':2,'realvis-dynamic':1,'realistic-sd15':1,'zimage-nvfp4':1}.items():
            request = job(cap)
            request['model'] = model
            request['width'],request['height'] = (512,768)
            self.assertEqual(validate_request(request),request['prompt'])
            request['references'].append(reference(cap))
            with self.assertRaises(ValueError):
                validate_request(request)
        request = job(0)
        request.update(model='realvis-dynamic',schemaVersion=2)
        for key in ('references','effectivePrompt','parentJobId','inputsReady'):
            del request[key]
        self.assertEqual(validate_request(request),request['prompt'])

if __name__ == '__main__':
    unittest.main()
