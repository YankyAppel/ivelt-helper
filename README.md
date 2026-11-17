# iVelt Helper — Tampermonkey userscript

A port of [chucem/ivelt-helper](https://github.com/chucem/ivelt-helper) (Chrome extension v2) as a single Tampermonkey userscript, so it works on **iPad/iPhone Safari** (via the Tampermonkey app) and on Android browsers that support userscripts (Kiwi, Firefox).

## Install

1. Install the **Tampermonkey** app (on iPad/iPhone: from the App Store; enable it in Settings → Safari → Extensions).
2. Open this link on the device:  
   **https://raw.githubusercontent.com/YankyAppel/ivelt-helper/main/ivelt-helper.user.js**  
   Tampermonkey will offer to install it — tap **Install**.
3. Visit https://www.ivelt.com/forum — done.

## Voice scripts

The voice features are intentionally split into two independent Tampermonkey scripts:

- `ivelt-reading.user.js` — adds iVelt-styled read buttons and a fixed mobile control bar. It can read one post or play unread posts in sequence.
- `ivelt-talking.user.js` — adds a talk button beside the post box. It inserts the recognized Yiddish text and detects when that inserted text is corrected.

Install both scripts if you want both features. Install only `ivelt-reading.user.js` to turn off talking, or only `ivelt-talking.user.js` to turn off reading.

When recognized text is changed, the talking script shows the original and corrected text. Tapping `שיקן` sends the correction to the existing training endpoint as `ivelt_transcript_fix`; it does not send anything automatically or include unrelated posts.

## Auto-updates

The script's `@updateURL` points at this repo, so Tampermonkey checks GitHub for a newer `@version` automatically (about once a day; or Tampermonkey → script → "Check for updates" to force it). Just bump `@version` on `main` to release.

## Features

- Keyboard shortcuts (arrows, Ctrl+Enter, Alt+V/A/N/M, AltGraph)
- Post buttons: ציטיר לעצטע, דערמאן תגובה, ציטיר אין אנדערע אשכול, ציטיר אינעם קאמענטארן אשכול
- Quote a selection (ציטיר אנגעצייכנט), mention links, profile cards on hover
- Who liked, double-click to like (off by default)
- Drafts — unsent posts are kept and offered back
- Image resizer + paste images + Folder → ZIP; editor opens on the Attachments tab
- Editor undo/redo (Ctrl+Z / Ctrl+Y)
- Spoiler polish (off by default), split notifications, multi-page print, Google search boxes, media embed
- Settings: ⚙ gear bottom-right on the page

Not ported (need real extension APIs): Google Drive/Dropbox upload, toolbar badge notifications, themes, settings sync.
