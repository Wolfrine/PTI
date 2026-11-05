import unittest
from types import SimpleNamespace as NS
from qwen_cache_policy import plan_cache,configure_cache,RAM_FLOOR_BYTES,WORKSPACE_BYTES
from qwen_diagnostics import GIB


class CacheBudgetTests(unittest.TestCase):
    def plan(self,count=4,**changes):
        args=dict(available_bytes=17*GIB,model_bytes=7256748608,text_tokens=64,
            reference_shapes=[(96,42)]*count,layers=32,inner_dim=4096,element_bytes=2,batch_size=1)
        args.update(changes)
        return plan_cache(**args)

    def test_measured_four_and_five_reference_shapes_recompute_without_changing_precision(self):
        for count in (4,5):
            plan=self.plan(count)
            self.assertEqual(plan['device'],'off')
            self.assertEqual(plan['precision'],'default')
            self.assertEqual(plan['estimatedCacheBytes'],2*32*(64+count*96*42)*4096*2)
            self.assertEqual(plan['ramFloorBytes'],5*GIB)
            self.assertEqual(plan['workspaceBytes'],2*GIB)
            self.assertGreater(plan['requiredAvailableBytes'],plan['availableRamBytes'])

    def test_one_reference_keeps_native_lossless_cache_when_complete_budget_fits(self):
        self.assertEqual(self.plan(1)['device'],'cpu')
        self.assertEqual(self.plan(0)['device'],'cpu')
        # Eligibility changes only at the full budget boundary, never by lowering
        # the runtime floor to the native cache's smaller admission reserve.
        required=self.plan()['requiredAvailableBytes']
        self.assertEqual(self.plan(available_bytes=required)['device'],'cpu')
        self.assertEqual(self.plan(available_bytes=required-1)['device'],'off')
        self.assertEqual(RAM_FLOOR_BYTES,5*GIB)
        self.assertEqual(WORKSPACE_BYTES,2*GIB)

    def test_precision_batch_and_all_reference_grids_are_included(self):
        a=self.plan()
        b=self.plan(element_bytes=4,batch_size=2)
        self.assertEqual(b['estimatedCacheBytes'],4*a['estimatedCacheBytes'])
        mixed=self.plan(reference_shapes=[(32,64),(96,42)])
        self.assertEqual(mixed['prefixTokens'],64+32*64+96*42)
        for change in (dict(available_bytes=None),dict(element_bytes=0),dict(batch_size=True),
                       dict(reference_shapes=[(0,1)]),dict(reference_shapes=[(2,)])):
            with self.assertRaises(ValueError):
                self.plan(**change)

    def test_integration_passes_only_native_cache_options_and_preserves_conditioning(self):
        ref=NS(shape=(1,64,96,42))
        context=NS(shape=(1,64,4096))
        positive=[[context,{'reference_latents':[ref]*4}]]
        model=NS(model=NS(diffusion_model=NS(transformer_blocks=[None]*32,inner_dim=4096)),
            model_options={},model_size=lambda:7256748608)
        calls=[]
        class Native:
            @staticmethod
            def execute(*args):
                calls.append(args)
                return (args[0],)
        records=[]
        out,plan=configure_cache(model,positive,node=Native,available_bytes=17*GIB,element_bytes=2,
            diagnostics=NS(write=lambda event,**values:records.append((event,values))))
        self.assertIs(out,model)
        self.assertEqual(calls,[(model,'off','default')])
        self.assertIs(positive[0][0],context)
        self.assertTrue(all(r is ref for r in positive[0][1]['reference_latents']))
        self.assertEqual(records[0][0],'prefix-cache-plan')
        self.assertNotIn('reference_latents',records[0][1])
        self.assertEqual(records[0][1],plan)
        _,unexpected=configure_cache(model,positive*2,node=Native,available_bytes=100*GIB,element_bytes=2,
            diagnostics=NS(write=lambda *args,**kwargs:None))
        self.assertEqual(unexpected['device'],'off')


if __name__=='__main__':
    unittest.main()
