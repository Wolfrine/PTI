# Visible-only FLUX preservation research

An explicit local experiment, separate from Studio Create and the worker queue.
Native FLUX ReferenceLatent remains the actual image conditioning. A reviewed
description supplies fallible textual guidance; it cannot lock identity or infer
body details hidden by clothing, hair, pose or camera.

No module is imported by the production UI/worker. No Firebase credentials,
Firestore listeners, polling, queue writes or default prompt changes are added.
Existing `tools/velum-worker` source is loaded read-only for inference math and
its safety guard. The shared OS inference mutex is held by the research parent.
Only owned child trees are terminated on guard/error/cleanup. Avoid submitting
another job while a research run holds the single-GPU mutex. An active production
claim stops the experiment; this harness does not claim, cancel or recover jobs.

## Private run

Keep the configuration, source images, VLM responses, verified traits, original
and derived prompts, PNG metadata and output manifests **outside this public
checkout**, in an owner-restricted F-drive directory. New model downloads belong
on H: under the owner's explicit storage instruction. Existing installed models
are read-only. Use only pre-existing owner photographs verified inside Drive
References `1yDt_5NSv8fDYhZvOdsihdJwKQJuTzx66`. Verify an owner-authenticated
upload/readback route before inference. Every generated PNG/revision must be
saved to Private `1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA` and downloaded bytes rehashed.
Local success alone is not delivery. Preserve original source photos.

`local_run.py --config <private-config.json> describe baseline|heretic` starts a
dedicated loopback server using explicit installed binary/model paths. It never
pulls models. Baseline expects the existing `qwen3-vl:2b` Ollama store; Heretic
requires both its language GGUF **and matching vision projector**. A text-only
GGUF is insufficient. Servers are stopped before returning. Proposed traits
must undergo separate direct visible review; never copy VLM text automatically.
The reference/model/version hash key binds the manually reviewed cache.

`local_run.py --config <private-config.json> render A|B|C` performs one exclusive
attempt per label: A original string verbatim; B original plus reviewed profile;
C B plus at most one short, evidence-bound correction (or unchanged B). First
render seals source, original prompt, seed, dimensions, settings and adapter
fingerprints. B seals the profile used by C. Failed attempts are preserved and
not automatically retried. Generated images never become source references.
Original and effective prompts are separate in private request/result records.

The private config supplies `root`, `source`, `source_drive_id`,
`source_sha256`, `original_prompt`, `seed`, `baseline_models`, `ollama`, `llama`,
`heretic_model`, `heretic_projector`; B/C additionally require `profile` and
`profile_model_sha256`, and C optionally `correction`. See the pure contract for
the profile shape. This is a trusted local CLI, not an exposed API or security
sandbox. Runtime logs may contain private paths and must remain private.

`cv_check.py --source <photo> --output <private-json> A=<png> B=<png> ...` records
installed OpenCV Haar/HOG detections and ORB scene-registration diagnostics.
These cannot establish likeness, silhouette fidelity or pose fidelity. Missing
measurements remain null with uncertainty 1; background matches do not prove a
person was preserved. Direct qualitative review and owner acceptance are
separate. No numerical personal-fidelity ratings are invented.

## Safety and checks

BelowNormal children; FLUX retains CPU2/inter-op1, 62% Torch allocator and 2.5GiB
reserve. VLM uses four CPU threads and one GPU workload at a time. Start requires
6GiB available RAM; stop below 5GiB, above 7500MiB GPU allocation, at 78C, below
20GiB H:/10GiB F: free, conflicting active job or 30 minutes. The reused FLUX
child additionally retains its parent PID/creation-time guard.
Telemetry/query failures are explicit fail-closed reasons. No power changes or
guard removal. Resource telemetry samples whole-PC use, not just this process.
Normal/error exits clean up owned VLM servers; a forced controller termination
can bypass that cleanup. Confirm isolated servers and GPU allocations are gone
before another run. This research CLI is not an unattended production service.

Run `python -B -m unittest discover -s tools/velum-preservation -v` with the
installed image runtime. Contract/guard tests perform no inference or cloud
writes; their mutex uses an isolated F-drive fixture. Keep private acceptance
records out of Git. Any optional Studio integration requires actual improvement
evidence, schema/Firestore regression checks and separate rendered mobile QA.
