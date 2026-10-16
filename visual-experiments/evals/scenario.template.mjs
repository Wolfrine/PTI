// Copy into experiments/<slug>/eval-scenario.mjs AFTER selecting a concept.
// The core mechanism and two input variations are your choice, not this suite's.
// Hooks throw on an incorrect outcome. Never return an unverified success flag.
// Prefer auto-waiting visible assertions. Canvas: inspect rendered pixels and
// independently verify their meaning; an internal state flag alone is inadequate.
export default {
  name: 'REPLACE: core experience promise',
  outcomes: {
    a: 'REPLACE: input variation and observable consequence',
    b: 'REPLACE: different input variation and distinct consequence',
  },
  async ready(page) {
    // Wait until core content is actually rendered and usable, not just a loader.
    throw new Error('Implement real rendered readiness');
  },
  async assertInitial(page) {
    throw new Error('Assert observable initial/recovered state');
  },
  async act(page, { input, variant, reducedMotion }) {
    // input: pointer | keyboard | touch; variant: a | b.
    // Use page.mouse, page.keyboard, page.touchscreen / locator.tap as appropriate.
    // Keyboard must enter through normal Tab order, not locator.focus().
    // This hook must accept repeated alternating inputs without reset.
    // Keep any intentional time-dependent observation inside assertOutcome.
    throw new Error('Implement ordinary user input');
  },
  async assertOutcome(page, { input, variant, reducedMotion }) {
    throw new Error('Assert the distinct visible/accessible outcome for a or b');
  },
  async recover(page, { input, reducedMotion }) {
    // Use normal recovery controls, or reload if reloading is the documented reset.
    throw new Error('Implement and document recovery');
  },
};
