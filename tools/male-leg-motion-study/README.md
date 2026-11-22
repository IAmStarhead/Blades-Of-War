# Leg-motion study (research only)

This study investigates the user's observation of twitch-like leg movement in the previously delivered uphill/volume trial. It does not replace the delivered viewer, alter the GLB, install a game controller, approve the earlier volume correction, or claim a complete fix. The Russian summary and synchronized video are in `work/male-leg-motion-study/`.

## Findings and candidate

The delivered controller hard-limits reach and derives a knee plane from a small projected vector. On the tested 15° run, release of the reach clamp causes a rapid reversal in the right knee; at 20° the plane estimate can cause a separate lateral sweep. Both are present without the volume morph, which changes mesh vertices but not the skeleton. The flat source clip also has abrupt motion. The user did not provide a recording of their exact instance, so correspondence with the observed screen cannot be proven.

`experimental-uphill-controller.mjs` is an isolated candidate: it uses a grade-dependent soft reach transition with bounded optional shortening, and regularises the projected knee-plane direction. It intentionally changes some stride targets and does not plant the feet. A naïve soft clamp was rejected during the study because, when an early target was unreachable, the 20° ramp-shoulder test produced a roughly 5.5° leg-joint rotation over one centimetre. The candidate tapers the optional amount against available reach instead.

The finite-difference checks are deliberately accompanied by counterexamples: among 480 sampled reversal cases, five had a >5 mm larger **case maximum** than the delivered version; the largest was about +15.1 mm. Case maxima may occur at different times. The candidate is therefore evidence for further work, not an approved solution. The source run, level-ground sharpness, foot sliding, untested motions and continuous collision behaviour remain open.

## Reproduce

The existing Three.js/esbuild dependencies in `tools/male-library-motion/node_modules` and Puppeteer/Chromium dependencies in `tools/character-showcase/node_modules` are required; as usual `node_modules` is not stored in the repository. Set `CHROME_BIN` as necessary. The optional video requires FFmpeg (`FFMPEG_BIN` can point to it); collision checks additionally require NumPy and python-fcl.

```sh
# Scratch only. Refuses repository paths and checks the original model/viewer hashes.
node tools/male-leg-motion-study/build-candidate.mjs /dev/shm/bow-leg-motion-candidate

# Poses at the same phase, with the volume switch sampled both ways.
node tools/male-leg-motion-study/qa-key-moments.mjs /dev/shm/bow-leg-motion-candidate /dev/shm/key-moments.json

# 48 complete routes and 480 reversible transition cases, at 16 ms.
node tools/male-leg-motion-study/qa-temporal.mjs /dev/shm/bow-leg-motion-candidate /dev/shm/temporal-report.json

# Existing broader terrain, floor, boundary and 1 ms checks.
node tools/male-uphill/qa-motion.mjs /dev/shm/bow-leg-motion-candidate
node tools/male-leg-volume/qa-volume.mjs /dev/shm/bow-leg-motion-candidate /dev/shm/volume-report.json

# Selected knee and body surface intersections; output can be tens of MB.
node tools/male-leg-volume/qa-knee-export.mjs /dev/shm/knee-poses.json /dev/shm/bow-leg-motion-candidate
python tools/male-leg-volume/qa-knee-contacts.py /dev/shm/knee-poses.json --report /dev/shm/knee-report.json
node tools/male-uphill/qa-export-poses.mjs /dev/shm/body-poses.json /dev/shm/bow-leg-motion-candidate
python tools/male-rig-rebuild/qa-deform.py /dev/shm/body-poses.json
python tools/male-gait-transition/qa-blend-regions.py /dev/shm/body-poses.json --strict-hands

# 6-second comparison: old vs experimental, then volume off vs on.
node tools/male-leg-motion-study/record.mjs /dev/shm/bow-leg-motion-candidate /dev/shm/motion-comparison.mp4
```

For the tested candidate, the existing terrain QA passed 10,080 grid poses, 32 routes, 320 transition trajectories, 256 shoulder crossings and 1 ms sampling on the specified test course. The 577 paired knee poses had no new non-neighbour triangle contacts, and the 144 regional samples retained the two previously observed right-foot contact poses. These are finite selected-surface tests, not proof of collision freedom. The volume test still passed its sampled ring and toggle checks. The scratch-tested candidate and reproducible build matched exactly across 2,880 sampled poses, skeleton values, selected vertices and terrain statistics.

`qa-key-moments.mjs` reports the magnitude of `p(t+h) - 2p(t) + p(t-h)` with `h = 16 ms`, after subtracting actor translation. It describes a change between adjacent displacement vectors, not an instantaneous jump, measured mass, ground reaction, or subjective realism. Recorded video is a fixed-position diagnostic on a 15° ramp at one-quarter speed, not a full moving route.
