import copy
import unittest
from subject_profile import VERSION, FIELDS, cache_key, effective_prompt, evaluation


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.refs = ['a'*64]
        self.model = 'b'*64
        self.profile = {'version': VERSION, 'cache_key': cache_key(self.refs, self.model),
                        'review': {'method': 'direct-visible-review', 'verified': True},
                        'traits': {field: 'Synthetic visible test observation.' for field in FIELDS},
                        'uncertain': 'Occluded details unknown.'}

    def call(self, variant='B', **kw):
        return effective_prompt('  immutable\r\nUnicode é  ', variant, self.profile, self.refs, self.model, **kw)

    def test_original_verbatim(self):
        self.assertEqual(self.call('A'), '  immutable\r\nUnicode é  ')
        self.assertTrue(self.call().startswith('  immutable\r\nUnicode é  \n\n'))

    def test_cache_binds_order_model_and_version(self):
        self.assertNotEqual(cache_key(['a'*64, 'c'*64], self.model), cache_key(['c'*64, 'a'*64], self.model))
        self.assertNotEqual(cache_key(self.refs, self.model), cache_key(self.refs, 'c'*64))
        self.profile['cache_key'] = '0'*64
        with self.assertRaises(ValueError): self.call()

    def test_vlm_cannot_self_approve(self):
        self.profile['review'] = {'method': 'vlm', 'verified': True}
        with self.assertRaises(ValueError): self.call()

    def test_no_mutation(self):
        original = copy.deepcopy(self.profile)
        self.call()
        self.assertEqual(original, self.profile)

    def test_c_without_evidence_is_b(self):
        self.assertEqual(self.call('B'), self.call('C'))

    def test_bounded_single_correction(self):
        value = {'text': 'Preserve the source framing.', 'evidence': ['d'*64], 'uncertainty': .4}
        self.assertIn(value['text'], self.call('C', correction=value))
        for bad in ({**value, 'uncertainty': .9}, {**value, 'evidence': []}, {**value, 'text': 'x'*451}):
            with self.assertRaises(ValueError): self.call('C', correction=bad)
        with self.assertRaises(ValueError): self.call('B', correction=value)
        with self.assertRaises(ValueError): self.call('A', correction=value)

    def test_unknown_is_not_zero_or_acceptance(self):
        self.assertIsNone(evaluation()['score'])
        self.assertFalse(evaluation(8, .4, False)['owner_accepted'])
        for args in [(None, .3, None), (None, 1, False), (8, 1, False), (float('nan'), .3, False)]:
            with self.assertRaises(ValueError): evaluation(*args)

    def test_reject_reference_and_schema_drift(self):
        for refs in ([], self.refs*2, ['x'*64]):
            with self.assertRaises(ValueError): cache_key(refs, self.model)
        self.profile['traits']['hidden_measurement'] = 'unsupported'
        with self.assertRaises(ValueError): self.call()


if __name__ == '__main__': unittest.main()
