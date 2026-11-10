# Local inner-ear shadow trial

Left is `ear-skin-trial`'s right-hand result (the subsequent failed cavity experiment is not the baseline). Right adds a soft translucent warm shadow projected onto the nearest visible head/ear surface inside each concha. Head, ear, body vertex positions and indices, and prior trials are unchanged. The CC0 MakeHuman-derived ear source is documented in `../head-reference/README.md`; there is no game integration.

This is an artistic, unlit overlay, not actual cavity geometry or a welded surface; it does not react physically to changing light and may create artifacts with movement, other lighting or camera angles. The male scalp-margin fragment and existing ear/head intersection remain. Animation and hair are not tested. The shadow is deliberately restrained at normal scale. PNG comparisons and enlarged crops are in `docs/previews/ear-shadow-trial/`.

Desktop/mobile browser checks exercised controls, confirmed unchanged head/body/ear positions and indices, finite shadow data, valid indices and shared head parent. `npm run verify` passed 232 tests. These tests do not establish visual quality or motion compatibility.
