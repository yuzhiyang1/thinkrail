# IntelliJ Islands themes

These selectable themes project the default Islands appearance from **IntelliJ IDEA 2026.2.3**
(build 262.10968.63). They use official source values, not colors sampled from screenshots.
Select **Settings → Appearance → Theme → IntelliJ Islands Dark / Light**. To follow the OS, select
System mode and choose these two entries for its light and dark pair. Existing saved themes remain
unchanged; installing the fork does not overwrite a user's appearance preference.

## Pinned source

Repository: [JetBrains/intellij-community](https://github.com/JetBrains/intellij-community).
Release tag: `idea/262.10968.63`.
Commit: `8062c061ff33e22041d9f1844db5b8b8a6b5e4d7`.
All paths below are under `platform/platform-resources/src/`:

- [Islands Dark UI](https://github.com/JetBrains/intellij-community/blob/8062c061ff33e22041d9f1844db5b8b8a6b5e4d7/platform/platform-resources/src/themes/islands/ManyIslandsDark.theme.json)
- [Islands Light UI](https://github.com/JetBrains/intellij-community/blob/8062c061ff33e22041d9f1844db5b8b8a6b5e4d7/platform/platform-resources/src/themes/islands/ManyIslandsLight.theme.json)
- [Islands Dark editor scheme](https://github.com/JetBrains/intellij-community/blob/8062c061ff33e22041d9f1844db5b8b8a6b5e4d7/platform/platform-resources/src/themes/islands/IslandSchemeDark.xml)
- [Light editor scheme](https://github.com/JetBrains/intellij-community/blob/8062c061ff33e22041d9f1844db5b8b8a6b5e4d7/platform/platform-resources/src/themes/expUI/expUI_lightScheme.xml)
- [Default/Darcula parent schemes, including inherited ANSI colors](https://github.com/JetBrains/intellij-community/blob/8062c061ff33e22041d9f1844db5b8b8a6b5e4d7/platform/platform-resources/src/DefaultColorSchemesManager.xml)

The build-only [source records](../../scripts/intellij-islands.sources.json) include each original
resource's Git blob hash and the file/key supplying **every** manifest value. XML parent-scheme values
are resolved before projection; an attribute without a foreground falls back to that scheme's TEXT
foreground. Language-specific font weights, effects and semantic classifications are not projected.

| Role | Official source key | Dark | Light |
| --- | --- | --- | --- |
| Header | `main-window-bg` | `#26282c` | `#e9eaee` |
| Workspace / editor background | `editor-bg` | `#191a1c` | `#ffffff` |
| Tool window background | `tool-window-bg` | `#191a1c` | `#ffffff` |
| Primary button fill | `control-brand-bg` | `#3871e1` | `#3871e1` |
| Code keyword | `DEFAULT_KEYWORD.FOREGROUND` | `#cf8e6d` | `#0033b3` |
| Code string | `DEFAULT_STRING.FOREGROUND` | `#6aab73` | `#067d17` |
| Code number | `DEFAULT_NUMBER.FOREGROUND` | `#2aacb8` | `#1750eb` |

## Explicit adaptations

ThinkRail uses fewer shared color roles than IntelliJ. The following differences are intentional and
are recorded beside the affected values; the source colors above are never silently approximated.

- Its one opaque hover/selected fill uses official `control-bg-small` (Dark) / `gray-130` (Light).
  IntelliJ uses contextual alpha overlays and separate selected/hover states.
- Dark hints use official `gray-90`; Light link/tint text uses `blue-60`, success text `green-70`, and
  destructive fills `red-70`. These official palette steps meet the existing ThinkRail contrast floors
  across every place its shared roles appear. No contrast tests are disabled or weakened.
- Destructive hover follows ThinkRail's existing 88% sRGB derivation. Its label uses the existing
  readable text/background rule. These generated values are explicitly labeled adaptations.
- Selected text keeps the native foreground. Chat bubbles use a neutral official inactive-selection
  color because IntelliJ does not supply a chat bubble role.
- Terminal ANSI colors inherit the official Default/Darcula console scheme where not overridden by
  the selected editor scheme. Shell applications can still emit their own true-color sequences.
- Layout, island gaps/rounded panes, toolbar geometry, icons, UI fonts, syntax font styles, project
  gradients and IntelliJ's semantic code analysis are not supplied by this palette. This is not a
  pixel-identical port of IntelliJ's Swing UI. ThinkRail keeps its existing editor and rendering stack.

## Regenerate / customize

From `apps/web`, run `bun run intellij-themes:generate`; `intellij-themes:check` rejects drift during
ordinary web builds. The generator is offline and ships only two complete manifests, never provenance
records or upstream resources. To update the reference version, re-read the pinned resources and their
parent schemes, update the source paths/hashes/values, review adaptations, regenerate, and run the
normal theme contrast tests and browser suite. Do not hand-edit a generated bundled theme.

To customize without changing the fork, copy a bundled manifest to `~/.thinkrail/themes`, change its
`id` and `label`, edit colors, and select it in Appearance. That remains a user theme and survives app
updates without being overwritten by generation.

## Attribution

Theme and editor-scheme data derived from IntelliJ Platform, Copyright JetBrains s.r.o. and
contributors, under the Apache License 2.0. The fork's [Apache license](../../../../LICENSE)
also covers these adaptations. Product names identify the upstream reference; these are ThinkRail
adaptations and do not imply a separate official JetBrains theme plugin.
