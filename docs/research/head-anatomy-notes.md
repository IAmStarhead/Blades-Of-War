# Head and jaw study notes

Visual references: files uploaded to `origin/main` in commit `7086119`: `bbab7a6b1c147d66bd4a91754a9b1f4c.jpg` (female front/profile), `edaf5653e52c24ed1dbf9ebad7fbd3a2.jpg` (female three-quarter/profile), `i (6).webp` (male front/three-quarter/profile), and `i (7).webp` (anatomical forms and topology). Also reviewed the other three images in that commit. They are guides, not licensed meshes or claims of exact likeness.

## Observations to carry into the next model

- From profile, the chin projects ahead of the front of the neck. Its underside travels back and rises toward the jaw angle below the ear; the neck then continues down smoothly. The side of the head above this line is not a swollen continuation of the underside.
- From the front, the chin has a rounded, finite-width lower edge and flows into the two sides of the jaw. It must not terminate in the narrow, downward central spike visible in the previous trials. The male example has a stronger, wider jaw; the female example is softer and less broad without becoming a point.
- In three-quarter view, the jaw edge, cheek, area around the mouth and chin form connected planes; matching the profile silhouette alone is insufficient. The mouth has its own volume in profile. The examples have integrated ears, but they remain intentionally omitted from the current trial at the user's request.
- These are high-detail anatomical guides, not the target render style. Keep forms legible at game scale, avoid transferring skin detail or photographic shading, and preserve the previous characters and their head size.

## Technical finding

The original game head uses latitude rings with a shared bottom pole (`buildSculptedHeadGeometry`): see `node tools/head-profile-audit.mjs` for section widths, depth and height. A jaw edge that runs from chin to angle is not an existing mesh edge. The previous experiments displaced these rings but left the original topology and a separate intersecting neck. In the last screenshot the resulting contour still has an unnatural central point, and the side still has excess volume. A finite geometry test cannot establish anatomical success.

The next implementation needs a coherent surface with deliberately placed chin, jaw-angle and underside landmarks, a controlled transition to the existing neck, and visual inspection from all three views for both sexes. Do not integrate or present a new version until it looks convincing in those views. Avoid silently swapping in the previously rejected realistic attached head. Actual animation, hair and neck fitting need separate validation before game integration.
