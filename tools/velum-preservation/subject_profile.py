"""Pure, opt-in research contracts. No network, model, Firestore or UI imports."""
import hashlib
import json

VERSION = 'visible-profile-v1'
FIELDS = ('face', 'hair', 'skin_tone', 'shoulders', 'upper_torso', 'waist_hips',
          'proportions', 'pose_camera')


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def cache_key(reference_hashes, model_hash):
    if not 1 <= len(reference_hashes) <= 2 or len(set(reference_hashes)) != len(reference_hashes):
        raise ValueError('reference-bounds')
    for value in [*reference_hashes, model_hash]:
        if not isinstance(value, str) or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
            raise ValueError('invalid-hash')
    return digest(json.dumps([VERSION, reference_hashes, model_hash], separators=(',', ':')))


def validate_profile(profile, reference_hashes, model_hash):
    """A VLM proposal cannot approve itself: a separate review record is required."""
    if not isinstance(profile, dict) or set(profile) != {'version', 'cache_key', 'review', 'traits', 'uncertain'}:
        raise ValueError('profile-shape')
    if profile['version'] != VERSION or profile['cache_key'] != cache_key(reference_hashes, model_hash):
        raise ValueError('profile-binding')
    if profile['review'] != {'method': 'direct-visible-review', 'verified': True}:
        raise ValueError('unverified-profile')
    if not isinstance(profile['traits'], dict) or set(profile['traits']) != set(FIELDS):
        raise ValueError('profile-fields')
    for value in [*profile['traits'].values(), profile['uncertain']]:
        if not isinstance(value, str) or not value.strip() or len(value) > 420 or '\x00' in value:
            raise ValueError('trait-bounds')
    return profile


def effective_prompt(original, variant, profile=None, reference_hashes=None, model_hash=None, correction=None):
    if not isinstance(original, str) or not original.strip() or len(original) > 6000:
        raise ValueError('prompt-bounds')
    if variant not in ('A', 'B', 'C'):
        raise ValueError('variant')
    if variant == 'A':
        if correction is not None:
            raise ValueError('baseline-correction')
        return original
    validate_profile(profile, reference_hashes, model_hash)
    suffix = '\n\nVisible source observations (descriptive guidance, not an identity lock):\n'
    suffix += '\n'.join(f'{key}: {profile["traits"][key]}' for key in FIELDS)
    suffix += '\nOccluded or uncertain: ' + profile['uncertain']
    suffix += '\nUse only supported visible features; do not infer hidden anatomy or measurements.'
    if correction is not None:
        if variant != 'C' or not isinstance(correction, dict) or set(correction) != {'text', 'evidence', 'uncertainty'}:
            raise ValueError('correction-shape')
        if not isinstance(correction['text'], str) or not 1 <= len(correction['text']) <= 450:
            raise ValueError('correction-bounds')
        if not isinstance(correction['evidence'], list) or not correction['evidence'] or any(
            not isinstance(x, str) or len(x) != 64 or any(c not in '0123456789abcdef' for c in x)
            for x in correction['evidence']
        ):
            raise ValueError('correction-evidence')
        if type(correction['uncertainty']) not in (int, float) or not 0 <= correction['uncertainty'] <= .5:
            raise ValueError('correction-uncertain')
        suffix += '\nSingle evidence-backed correction: ' + correction['text']
    result = original + suffix
    if len(result) > 8000:
        raise ValueError('effective-prompt-bounds')
    return result


def evaluation(score=None, uncertainty=1., hard_failure=None):
    """Approximate CV geometry is never a personal identity or acceptance score."""
    if score is None:
        if uncertainty != 1 or hard_failure is not None:
            raise ValueError('unknown-evaluation')
    elif type(score) not in (int, float) or not 0 <= score <= 10 or type(uncertainty) not in (int, float) or not 0 <= uncertainty < 1 or type(hard_failure) is not bool:
        raise ValueError('evaluation-bounds')
    return {'score': score, 'uncertainty': uncertainty, 'hard_failure': hard_failure,
            'owner_accepted': False, 'biometric_identity_measured': False}
