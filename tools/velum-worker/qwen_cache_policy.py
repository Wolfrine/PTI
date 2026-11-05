"""Lossless Qwen prefix-cache admission within the existing RAM guard.

The native cache reserves RAM before all mapped diffusion weights are resident.
Budget the complete cache, those weights, the unchanged 5 GiB runtime floor and
workspace together. Native 'off' recomputes the same prefix at its original
precision; it is not a reference reduction or cache quantization.
"""
from qwen_diagnostics import GIB, RUNTIME_RAM_FLOOR_BYTES

RAM_FLOOR_BYTES = RUNTIME_RAM_FLOOR_BYTES
WORKSPACE_BYTES = 2*GIB


def plan_cache(*, available_bytes, model_bytes, text_tokens, reference_shapes,
               layers, inner_dim, element_bytes, batch_size=1):
    values=(available_bytes,model_bytes,text_tokens,layers,inner_dim,element_bytes,batch_size)
    if any(type(value) is not int or value<0 for value in values):
        raise ValueError('invalid-cache-budget')
    if min(model_bytes,layers,inner_dim,element_bytes,batch_size)<1:
        raise ValueError('invalid-cache-budget')
    if not isinstance(reference_shapes,(tuple,list)):
        raise ValueError('invalid-cache-shape')
    prefix_tokens=text_tokens
    for shape in reference_shapes:
        if not isinstance(shape,(tuple,list)) or len(shape)!=2 or any(type(n) is not int or n<1 for n in shape):
            raise ValueError('invalid-cache-shape')
        prefix_tokens+=shape[0]*shape[1]
    cache_bytes=2*layers*batch_size*prefix_tokens*inner_dim*element_bytes
    required=cache_bytes+model_bytes+RAM_FLOOR_BYTES+WORKSPACE_BYTES
    fits=available_bytes>=required
    return dict(policy='ram-budget-v1',device='cpu' if fits else 'off',precision='default',
        reason='fits-with-reserve' if fits else 'recompute-to-preserve-ram',
        prefixTokens=prefix_tokens,estimatedCacheBytes=cache_bytes,modelBytes=model_bytes,
        ramFloorBytes=RAM_FLOOR_BYTES,workspaceBytes=WORKSPACE_BYTES,
        requiredAvailableBytes=required,availableRamBytes=available_bytes)


def configure_cache(model,positive,*,node,available_bytes,element_bytes,diagnostics):
    """Read only tensor dimensions; never serialize conditioning content."""
    # This adapter uses one static positive condition and CFG 1.0 (the native
    # CFG1 optimization omits the negative sampling branch). Unexpected extra
    # branches use recomputation rather than underestimating multiple cache slots.
    if len(positive)!=1 or model.model_options.get('disable_cfg1_optimization',False):
        plan=dict(policy='ram-budget-v1',device='off',precision='default',reason='multiple-cache-slots')
    else:
        context,metadata=positive[0]
        diffusion=model.model.diffusion_model
        references=metadata.get('reference_latents',[])
        plan=plan_cache(available_bytes=available_bytes,model_bytes=int(model.model_size()),
            text_tokens=int(context.shape[1]),reference_shapes=[tuple(int(n) for n in ref.shape[-2:]) for ref in references],
            layers=len(diffusion.transformer_blocks),inner_dim=diffusion.inner_dim,
            element_bytes=element_bytes,batch_size=int(context.shape[0]))
    diagnostics.write('prefix-cache-plan',**plan)
    return node.execute(model,plan['device'],plan['precision'])[0],plan
