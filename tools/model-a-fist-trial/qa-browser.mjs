// Reuse the preceding offline browser QA against the separate trial without
// overwriting the earlier study. Its historical QA expects its original
// filenames, so copy the trial into a disposable directory under those names.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.length > 3) throw new Error('Usage: node qa-browser.mjs [trial-directory]');
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/fist-refinement-trial'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-a-fist-browser-qa-'));
try {
  fs.copyFileSync(path.join(result, 'female_A_fist_trial.glb'), path.join(temp, 'female_A_hands_ears.glb'));
  fs.copyFileSync(path.join(result, 'female_A_fist_trial_and_well.zip'), path.join(temp, 'female_A_hands_ears_and_well.zip'));
  const run = spawnSync(process.execPath, [path.join(root, 'tools/model-a-hand-ear/qa-browser.mjs'), temp], {
    stdio: 'inherit', env: process.env,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) {
    console.error(`Browser QA failed${run.signal ? ` (signal ${run.signal})` : ` (exit ${run.status})`}`);
    process.exitCode = run.status || 1;
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
