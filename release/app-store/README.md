# App Store creative package

The `iphone-6.9` set is 1290 x 2796 pixels and the `ipad-13` set is 2064 x 2752.
Both are rendered by
`scripts/render-app-store-screenshots.py` from deterministic, real QA fixtures.
Every frame carries the approved brain-tile icon and makes only a capability
claim present in the build.

Before submission, replace the files in `source/` with captures from the exact
archived release candidate, rerun the renderer, and compare the output to the
design lock. Browser fixtures prove composition and copy, not native archive
identity, StoreKit availability, ad fill, or App Review readiness.

Current sequence:

1. A board you can read
2. Match. Clear. Keep moving.
3. A hint you can actually see
4. Make every board yours
5. Progress at your pace
6. Set the mood
