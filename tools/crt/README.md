# CRT

A green phosphor terminal: scanlines, a soft bloom and a faint 60 Hz flicker over a black-on-green command line.

## Apply it

Open [jonkum.in/os?skin=crt](https://www.jonkum.in/os?skin=crt) and NextOS installs the skin and puts it on. The first time, it asks you to approve the code it runs - see "What the code does" below - then it stays with the rest of your skins, so you can switch back whenever you like.

## The palette

| Surface | Colour |
| --- | --- |
| Ground | `#020805` |
| Panel | `#03170c` |
| Ink | `#7cff9e` |
| Accent | `#39ff14` |
| Window chrome | `rgba(3, 20, 10, 0.95)` |
| App body | `#020805` |

## Type and layout

Typeface: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`, at the medium text size.

- Strip at the bottom
- flat chrome
- compact spacing
- square glyphs
- grid sky

## What the code does

Tokens and CSS get the palette and the layout right, but not the scanlines, the phosphor bloom or the flicker a real CRT has - so this skin also ships a small program (`skin/src/index.ts`) that runs with full, unsandboxed access to the OS, the same trust a native app already has. It does exactly three things: adds one fixed, `pointer-events: none` overlay `<div>` painted with scanlines and a radial bloom, drives a ~60 Hz brightness wobble on that overlay with `requestAnimationFrame`, and removes both completely the moment the skin is turned off. It reads no data, calls no other API, and touches nothing outside that one element. NextOS asks you to approve this the first time the skin is applied - to your own copy or a community one - and shows you this same description when it does.

See [the skins guide](https://www.jonkum.in/docs/skins) for what a skin is, and "Skins that run code" in this repository's own README for the format `skin/src`, `skin/build/skin.js` and `skin/skin.zip` follow.

Published by Kumin Consulting on 2026-09-18, released under CC0-1.0.
