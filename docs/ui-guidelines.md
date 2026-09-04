# Application UI rules

This is a daily productivity application. The study workflow is the primary interface.

- Make the next action obvious through layout, controls and concise labels.
- Use compact headings, restrained status indicators and flat sections separated by dividers.
- Keep navigation to 1–3 words, buttons to 1–4 words and labels to 1–5 words.
- Add helper text only when necessary, limited to one short sentence.
- Put advanced preferences, provenance and operational details behind progressive disclosure.
- Never add slogans, motivational filler, hero sections or explanatory marketing cards.
- Avoid duplicate metadata, decorative card grids and large KPI blocks.
- Keep secondary text subdued while retaining accessible contrast.
- Use whitespace to separate tasks; leave unused space empty.
- Preserve the technical and ELI5 explanations as actual study content, subject to the user's reveal policy.

## Study Desk

The default action creates a five-question session directly. Category and count controls are on the page. Feedback and unseen-question preferences are under Options. Customize opens the full session configuration.

Unfinished sessions appear first with a Resume action. Progress is a single line containing streak, accuracy and explored questions. Recent activity lists completed sessions only, avoiding duplicate unfinished-session rows. The category selector replaces the previous full category summary section.

These rules supersede the original spacious Study Desk layout described in the roadmap. The charcoal, amber and IBM Plex visual system remains.

## Practice workspace

Active sessions use a dedicated focus layout. The left rail holds Save, Flag, Review and the session map; workspace navigation returns through Study desk. On smaller screens these tools become a compact row and the map collapses.

The session map is an interactive review index. Filter by unanswered, uncertain, flagged or needs-review questions, then jump to a match without losing original question numbering. Needs review includes flagged, uncertain and disclosed incorrect answers. Incorrect-only filtering appears after completion. Unreleased correctness never affects the map.

Previous/Next stays at the top of the reading area. The bottom action dock submits an answer and then offers Continue. Unsaved selections block navigation and finishing; flagging or bookmarking preserves the draft selection and uncertainty state.

Reasoning appears directly beneath the submitted choice (or the correct choice for an unanswered completed question). Technical and ELI5 controls show one explanation at a time. Source and revision details remain expandable. The server still controls whether reasoning may appear.

Use the small shared outline icon vocabulary for actions and state, and a vector score ring in the results rail. The top-right action becomes New session after completion; do not add a second completion banner.
<!-- Capture a cleanup item for ui guidelines documentation -->
