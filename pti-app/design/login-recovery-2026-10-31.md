# PTI login feedback repair

Mechanical UI repair; retain the current PTI login composition, imagery, typography and warm-light identity. The owner reported that tapping Google sign-in on mobile appeared inert. Browser-key restrictions were the backend cause; console-only error handling concealed it.

Central source snapshot: `Wolfrine/Central` main `d5843add82f4379a0fd305691299ac2b616e10f5`, Visual Design Director mechanical-repair lane. The compatibility protocol/routing/review pointers and current Home design memory were read. UI Visual Verifier supplies focused state QA; no new visual direction or aesthetic acceptance is claimed.

Required dimensions: feedback must be legible immediately beside the action, errors must offer a safe retry without raw diagnostics, and busy/error text must fit desktop and narrow/mobile layouts. The real `LoginComponent` and SCSS were rendered through a Git-ignored local Angular entry with a synthetic AuthService boundary, never imported by production. No actual owner sign-in was simulated.

Checked ready, busy and browser-configuration-error states at 1440x1000, 390x844 and 320x640. A Playwright browser check exercised ready -> busy -> visible popup-blocked error and re-enabled retry at each size, with no horizontal overflow. Parent visually inspected desktop/mobile error and narrow busy PNGs: the action remains clear, messages wrap within the content column, and the existing image/header/footer composition is retained. The fixture label is explicit. All 107 Angular tests pass, including popup/One Tap errors, repeat-operation suppression, and accessible rendered feedback.

Local evidence: `.codex-usage-qa/login-visual-checks.json` and `login-{desktop,mobile,narrow}-{ready,busy,error}.png`. Verdict: focused rendered QA passed for the repair. Production deployment, live browser-origin probes and the owner's mobile Google login are separate acceptance evidence; a fixture does not establish them.
