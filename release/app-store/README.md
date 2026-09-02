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

## In-app purchase review evidence

The deterministic `S20-remove-ads` and `S20-shuffle-store` fixtures render the
two StoreKit product surfaces with their App Store Connect prices. Browser
proofs live in `iap-review/browser/`. They verify layout and copy only. Before
attaching review evidence to either product, capture the matching screen from
the exact native release candidate after StoreKit returns its localized price,
and store it in `iap-review/native/` with the build number in the filename.

Current sequence:

1. A board you can read
2. Match. Clear. Keep moving.
3. A hint you can actually see
4. Make every board yours
5. Progress at your pace
6. Set the mood
