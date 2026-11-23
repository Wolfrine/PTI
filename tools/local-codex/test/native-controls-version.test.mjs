import assert from 'node:assert/strict';
import {test} from 'node:test';
import {supportsNativeControls} from '../src/common.mjs';

test('recognizes compatible stable and prerelease Codex CLI versions', () => {
  for (const version of [
    'codex-cli 0.169.1',
    'codex-cli 0.169.2-beta.1',
    'codex-cli 0.171.0-alpha.13',
    'codex-cli 0.171.0',
    'codex-cli 0.171.0-alpha.13+desktop.007',
    'codex-cli 1.0.0',
  ]) {
    assert.equal(supportsNativeControls(version), true, version);
  }
});

test('keeps the stable 0.169.1 minimum and rejects malformed version output', () => {
  for (const version of [
    'codex-cli 0.168.99',
    'codex-cli 0.169.0',
    'codex-cli 0.169.1-alpha.13',
    'codex-cli 0.171',
    'codex-cli 0.0171.0',
    'codex-cli 0.171.0-alpha.013',
    'codex-cli 0.171.0-',
    'codex-cli 0.171.0+',
    'codex-cli 0.171.0 unexpected',
    'codex-cli 0.171.0-alpha..13',
    'not-codex 0.171.0',
    null,
  ]) {
    assert.equal(supportsNativeControls(version), false, String(version));
  }
});
