# Separate unarmed combat trial

This trial starts from `work/male-stealth-posture-trial`, not from either
subsequent movement experiment. It reads the pinned 52-bone GLB and the
previous well, does not modify earlier versions, removes crouching, preserves
ordinary walk/run and their phase transition, and adds an experimental guard,
combat walking, two punches and one mirrored kick. The viewer remains a scene
at the well, not an opponent or hit simulation. See the delivery's
[README](../../work/male-unarmed-combat-trial/README.md) and
[credits](../../work/male-unarmed-combat-trial/CREDITS.md).

`author.mjs` verifies inputs, transfers Quaternius jab/cross and the separately
retargeted GKEET kick from their own rest orientations onto the accepted rig,
forms a shared guard, blends the action endpoints, lowers and retimes the kick,
and mirrors it. Combat walking uses the accepted walking legs and root with a
guard upper body and stabilized torso; ordinary walk/run are untouched. The
controller blends normal, combat and attack poses, uses a shared phase clock,
slower interrupt fades for an extended kick and a vertical floor guard. A new
movement command cancels a strike. This is not horizontal foot locking, enemy
targeting, damage or physically simulated contact. Retargeting, skinning and
blending may still cause deformation and sliding.

## Rebuild and checks

Node.js 22 and npm are required; the browser tests use Puppeteer/Chromium.
The build writes only this trial and verifies SHA-256 inputs. `--output` can
write the scene to a separate scratch directory outside the repository.

```sh
npm ci --prefix tools/male-unarmed-combat-trial
npm run build --prefix tools/male-unarmed-combat-trial
npm test --prefix tools/male-unarmed-combat-trial
node tools/male-unarmed-combat-trial/qa-video.mjs
PORT=4367 node tools/male-unarmed-combat-trial/serve.mjs
# In another terminal:
node tools/male-unarmed-combat-trial/qa.mjs http://127.0.0.1:4367/
node tools/male-unarmed-combat-trial/qa-video.mjs http://127.0.0.1:4367/
node tools/male-unarmed-combat-trial/measure-gait-contact.mjs
node tools/male-unarmed-combat-trial/export-collision.mjs /tmp/combat-samples.json
python3 tools/male-unarmed-combat-trial/qa-collision.py /tmp/combat-samples.json --report /tmp/combat-collision.json --strict
python3 tools/male-unarmed-combat-trial/package.py
node tools/male-unarmed-combat-trial/qa-package.mjs
```

Set `CHROME_BIN` if necessary. The collision checker requires NumPy and
`python-fcl`. The optional fixed-step video can be regenerated with
`FFMPEG_BIN=/path/to/ffmpeg node tools/male-unarmed-combat-trial/record.mjs`.
`package.py` verifies that reports, embedded model and video refer to the
exact current scene, that local links resolve and that earlier scenes are
unchanged; it outputs only a compact trial archive.

The browser checks compare 80 ordinary gait poses and 20 poses after combat to
the requested earlier scene, sample entry/exit reversals, strikes and interruptions, test actual
keyboard/mouse and emulated touch, paths and video playback offline/HTTP.
The gait/triangle reports are limited to selected vertices and poses. None of
these establish naturalness, all-pose collision freedom, full foot contact,
or performance or `content://` behaviour on a physical Android device.
