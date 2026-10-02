---
"@birdcc/parser": patch
---

Give filter expressions BIRD's operator precedence: `*` and `/` bind tighter than `+` and `-`, which bind tighter than comparisons and `~`. Previously all of them shared one level and were grouped left to right, so `a + 1 > b * 2` was parsed as `((a + 1) > b) * 2`.
