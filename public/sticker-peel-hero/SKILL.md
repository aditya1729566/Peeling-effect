---
name: sticker-peel-hero
description: Build or adapt a web hero so any supplied image peels away on scroll as one physically coherent sticker flap. Use for tactile sticker-peel, adhesive-lift, or single-sheet hero interactions; do not use for book-page turns or cylindrical page curls.
---

# Sticker Peel Hero

Create the effect from the supplied hero image while preserving the surrounding site's design and stack. The peel must behave as one sheet, not a rolling tube.

## Start from the bundled implementation

For a new standalone demo, copy `assets/template/` into the target directory, install dependencies, and run `npm run dev`. Replace its sample art with:

```bash
scripts/set_hero_image.sh /absolute/path/to/image.png /absolute/path/to/project
```

For an existing site, port the shader and render setup from `assets/template/src/main.js` instead of replacing unrelated application structure. Keep the effect in a client-only component when the framework server-renders pages.

## Prepare the image

- Prefer a transparent PNG or WebP for a die-cut silhouette. Preserve its native aspect ratio and alpha channel.
- If the supplied image is opaque and the user expects a cutout sticker, remove the background with the available image-editing tool before installing it. Do not fake a cutout with a rectangular CSS clip.
- An opaque JPEG is valid when the user wants a rectangular sticker; the swap script supports it.
- Keep meaningful alt text and update the hero container's accessible label.

## Preserve these physical invariants

- Begin at one corner and move a single diagonal hinge across the sticker.
- Keep the unpeeled front pinned in place.
- Reflect each already-peeled source point exactly once over the hinge and show its warm-white adhesive backside.
- Render the flap over the stuck portion. Never sample both branches of a curl cylinder: that creates mirrored rolls.
- Use foreshortening, a narrow fold highlight, contact shadow, and minimal paper grain for depth.
- At completion, move the flap out and release it cleanly. Leave no curl, tube, duplicate silhouette, or isolated pixels.
- Reverse scrolling must reseal the same flap continuously.

The essential implementation is the `ahead`, `linePoint`, `sourceDistance`, and `flapPoint` mapping in the fragment shader. Do not replace it with a generic page-curl shader.

## Tune without breaking the illusion

- Change peel direction through the shader's normalized `normal` vector.
- Change fold tightness through `foldWidth`; keep it narrow enough to read as adhesive vinyl.
- Change airborne perspective through `perspective`; values near `1.7–2.4` keep the flap compact.
- Change scroll duration through the hero section height and ScrollTrigger mapping, not by adding extra curl cycles.
- Keep the WebGL canvas oversized so the flap can leave the image bounds without clipping.

## Verify

Run and visually inspect the start, first corner lift, midpoint, near-complete state, completed state, and reverse motion. Confirm:

- the peeled portion stays visible;
- only one connected flap exists;
- the fold does not become symmetrical;
- the sticker is crisp at rest;
- completion leaves no residual roll;
- mobile framing, reduced motion, keyboard links, and browser console remain clean.

Do not deploy, publish, or replace remote assets unless the user asks.
