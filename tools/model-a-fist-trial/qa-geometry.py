#!/usr/bin/env python3
"""Run the previous sampled hand/leg intersection test on the separate trial."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OLD_TOOLS = ROOT / 'tools/model-a-hand-ear'
sys.path.insert(0, str(OLD_TOOLS))
import build  # noqa: E402

# Only the output location/name differ. The source mesh, reference rig, face
# subsets and the four morph-weight formulae are deliberately the same.
build.DEFAULT_OUTPUT = ROOT / 'work/character-model-search/selected-a/fist-refinement-trial'
build.MODEL_NAME = 'female_A_fist_trial.glb'
spec = importlib.util.spec_from_file_location('previous_geometry_qa', OLD_TOOLS / 'qa-geometry.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the previous geometry check')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

if __name__ == '__main__':
    module.main()
