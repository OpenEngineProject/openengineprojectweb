# Editor UI Component Library

This catalog describes the UI components that already exist in the editor. It is a documentation-first library: use it to choose existing controls, CSS classes, and panel patterns before adding new UI behavior.

**Publishing:** A browsable HTML reader lives in [`ui_component_library.html`](ui_component_library.html) and is linked from [`docs/index.html`](../index.html). GitHub Pages can serve the whole `docs/` tree via `.github/workflows/docs-site.yml`. When you change this Markdown file, update the HTML page in the **same commit or PR** so the site stays accurate (the HTML layout is hand-maintained). CI enforces pairing via `docs-ui-library-sync.yml`; for Markdown-only edits that do not require HTML updates, add `[ui-lib-md-only]` to a commit message in the PR.

## Foundations

The editor UI is built on `UIElement`, registered native controls, UXML layouts, and CSS-style theme assets.

- Native controls live under `Engine/Modules/UI/Include/UI/Controls` and `Engine/Modules/UI/Source/Controls`.
- Editor-specific controls and helpers live under `Apps/Editor/Source/UI` and `Apps/Editor/Source/Panels`.
- Editor UI assets live under `Apps/Editor/Assets/UI`.
- The master editor theme is `Apps/Editor/Assets/UI/theme.css`, which imports token, core, view, inspector, widget, and panel styles.
- Controls that own local styling call `RequestSubtreeStyleAssetPath("UI/controls/<Control>.css")` so their CSS follows the control subtree.
- UXML tag names come from `ControlRegistration.cpp`; common aliases include `button`, `checkbox`, `toggle`, `dropdown`, `slider`, `textfield`, `floatfield`, `intfield`, `vector3field`, `textarea`, `scrollview`, `treeview`, `gridview`, and `dockspace`.

Prefer UXML for stable layout structure and C++ for dynamic state, event wiring, data binding, virtualization, or editor services.

## Status And Diagnostic Colors

The editor uses a small set of diagnostic colors in addition to the core blue/green accent tokens. Orange, amber, and yellow appear today as warning or GPU/status accents rather than as a single formal theme token.

Current orange/amber usage:

- Log and Script Errors warning text use `#dcdcaa` via `log-warning` and `.error-type.warning`.
- Visual Profiler GPU-bound labels and chart borders use orange `#f08040`.
- Version control warning state returns `#FFAA00`.
- Animation window yellow tags use `#f0c850`.
- Search dialog category chips include orange/yellow families such as `#FF9800`, `#FFC107`, and `#FF5722`.
- Some inspector warnings use amber inline values such as `0xFFE0C840`.

Guidance:

- Use amber/yellow for warnings, validation-in-progress, and cautionary non-error states.
- Use orange for GPU/profiler distinctions or existing category colors where the panel already uses it.
- Do not use orange as a generic primary accent; use `--ui_color_accent` / blue for normal selection and focus.
- If orange/amber starts appearing across multiple shared controls, promote it into `tokens.css` as a named warning token instead of adding more one-off hex values.

## Buttons

Use `Button` for command actions and text buttons. The control adds the `button` class and loads `UI/controls/Button.css`.

Preferred classes:

- `primary` for the main affirmative action.
- `secondary` for lower-emphasis actions.
- `cancel-button` for cancel/dismiss actions.
- `small` for compact toolbar or dense panel actions.
- `inspector-button` for inspector-local commands.

Expected states are `:hover`, `:active`, `:focus`, `.active`, `.pressed`, `.disabled`, and `:disabled`.

Sizing:

- Default buttons are at least 32 px tall.
- Dense panel buttons should keep labels short and avoid changing size between states.
- Layout preset buttons use the specialized `layout-button` class and should not be reused as generic buttons.

Example:

```xml
<Button id="ApplySettings" class="primary" text="Apply" />
<Button id="CancelSettings" class="cancel-button" text="Cancel" />
```

Sources: `Button.h`, `Button.cpp`, `Button.css`, `layout.uxml`.

## Icon Buttons

Use icon buttons for toolbars, panel chrome, and repeatable compact actions. Existing editor chrome uses `Button` with `small secondary icon-button <icon-class>`.

Preferred classes:

- `icon-button` for fixed icon hit areas.
- Icon classes such as `save-icon`, `settings-icon`, `play-icon`, `pause-icon`, `fullscreen-icon`, `alert-circle-icon`, and other classes defined in `theme/core.css`.
- Panel-local icon variants such as `inspector-header-history-icon` where panel CSS defines the exact size.

Expected states are hover, active, pressed, dragging, and disabled. Icons should use `background-image-tint` or tokenized tint values instead of opacity when the whole control should remain visually stable.

Sizing:

- Standard toolbar icon buttons are 24 x 24 px.
- Center playback controls are 32 x 32 px.
- Inspector history buttons use a 36 x 36 px hit area with a 24 x 24 px glyph.

Example:

```xml
<Button id="TopToolbarSettings" class="small secondary icon-button settings-icon" />
```

Sources: `layout.uxml`, `EditorTopToolbar.cpp`, `core.css`, `Button.css`.

## Editor Icon Assets

Toolbar, tree, inspector, and panel chrome sprites live under **`Apps/Editor/Assets/Icons`**. The editor runtime primarily references **`*.png`** paths from CSS; a small set of **`*.svg`** companions exists (for example **`Lock.svg`**, **`LockOpen.svg`**, **`ArrowUp.svg`**, **`ArrowDown.svg`**) alongside matching PNGs where both exist.

**Referencing icons in stylesheet assets**

- Theme code commonly uses the virtual **`editor:`** bundle:  
  `background-image: url("editor:Icons/save.png");`
- Panel styles under **`Apps/Editor/Assets/UI/panels/`** sometimes shorten to **`url("Icons/…")`**; both conventions resolve against **`Apps/Editor/Assets/Icons`**.

**Where icon URLs are wired**

| Area | Typical CSS asset |
|------|-------------------|
| Global playback, save, folds, diagnostics, dock layout presets | `Apps/Editor/Assets/UI/theme/core.css` |
| Trees, expandable rows, project/hierarchy glyphs, entity creation thumbnails | `theme/views.css` |
| Dropdown carets, reorder handles, code/shader/outline affordances | `theme/widgets.css` |
| Inspector add menus, reorder controls, locks, arrows | `theme/inspector.css` |
| Todo / bookmarks / smartfolders / scene overlays | `theme/todos.css`, `theme/bookmarks.css`, `theme/smartfolders.css`, `theme/scene-view.css`, … |
| Panel-specific strips | **`panels/`** (`AnimationWindowPanel.css`, `SceneViewPanel.css`, `SettingsPanel.css`, `BuildPanel.css`, …) |

Guidance:

- Prefer reusing an existing glyph from **`core.css`** before adding a parallel asset.
- Preserve stable filenames: **`url(...)`** bindings are plain string literals in packaged UI assets.
- When adding raster art, keep dimensions consistent with neighbouring toolbar or row icons unless the stylesheet sets **`background-size`**.

Sources: **`Apps/Editor/Assets/Icons/**/*`**, **`Apps/Editor/Assets/UI/theme/`** (including **`node-graph.css`**), **`Apps/Editor/Assets/UI/panels/`**, **`Apps/Editor/Assets/UI/controls/AssetField.css`**.

**Browsable gallery:** On the catalog HTML served from **`Lunarsong/openengine-web`**, section **Icon file preview** thumbnails every file under **`public/icons/editor/`** after `npm run sync:editor-icons:png` followed by `npm run sync:engine-docs`.

## Labels

Use `Label` for static text, row labels, headings, empty states, and status text. Labels are registered as `label` and accept both inner text and a `text` attribute.

Preferred classes:

- `inspector-label` for property names.
- `inspector-text` for descriptive or read-only inspector content.
- `inspector-header` for entity/component headers.
- `button-text` for button-owned label children.

Expected states are usually inherited from the parent. Keep labels single-purpose; avoid using labels as buttons when a clickable `Button` or `UIElement` with a clear hit area is more appropriate.

Sizing:

- Inspector labels align inside `inspector-row`.
- Headers should use tokenized font sizes and truncate with ellipsis where the panel can narrow.

Example:

```xml
<Label class="inspector-label" text="Roughness" />
```

Sources: `Label.h`, `ControlRegistration.cpp`, `inspector.css`.

## Boolean Controls

Use `Checkbox` for explicit on/off choices with a visible box and label. Use `Toggle` for switch-like state changes, especially in inspector or settings rows.

Preferred classes:

- `checkbox` and `toggle` are added by the native controls.
- `inspector-toggle` and `inspector-entity-toggle` are used for inspector-specific placement.
- `inspector-field-toggle` controls alignment inside property rows.

Expected states are `:checked`, `.checked`, hover, pressed, focus, and disabled.

Sizing:

- Checkbox boxes are 18 x 18 px.
- Toggles should live in stable-width row cells so the row does not reflow when toggled.

Example:

```xml
<Checkbox id="EnableShadows" text="Enable shadows" checked="true" />
<Toggle id="EntityEnabled" checked="true" />
```

Sources: `Checkbox.h`, `Toggle.h`, `ControlRegistration.cpp`, `widgets.css`, `inspector.css`.

## Dropdowns

Use `Dropdown` for a bounded option set. The control supports UI and native/OS modes through the `mode` attribute.

Preferred classes:

- `dropdown` for the root control.
- `inspector-dropdown` for property rows.
- `inspector-add-component-dropdown` for the Inspector bottom action.
- `dropdown-ui` and `dropdown-native` only for demos or comparison surfaces.

Expected states are `.open`, selected item, hover item, and focus.

Sizing:

- Inspector dropdowns should stretch to the field column.
- Add Component dropdowns use a centered min-width and open upward from the bottom bar.
- Popup rows should keep a stable height and enough horizontal padding for scanability.

Example:

```xml
<Dropdown id="LightType" class="inspector-dropdown" options="Directional,Point,Spot" />
```

Sources: `Dropdown.h`, `Dropdown.cpp`, `ControlRegistration.cpp`, `widgets.css`, `inspector.css`.

## Text And Numeric Fields

Use `TextField` for single-line text, `TextArea` for multi-line text, and typed fields for values: `FloatField`, `IntField`, and `Vector3Field`.

Preferred classes:

- `inspector-field` for the field cell in a property row.
- `float-field-input` and `int-field-input` are internal input classes styled by the theme.
- `inspector-vector3` or `vector3-field` for X/Y/Z groups.
- `settings-row-value` for settings panel value cells.

Expected states are focus, hover, read-only, disabled, and active edit. Inspector refresh code should avoid overwriting focused fields.

Sizing:

- Standard inspector numeric inputs are 27 px tall.
- Standalone numeric inputs use a 70 px minimum width.
- Vector components shrink to 40 px minimum and must keep `min-width: 0` on flex children.

Example:

```xml
<TextField id="EntityName" class="inspector-header" value="Camera" />
<Vector3Field id="Position" class="inspector-vector3" />
```

Sources: `TextField.h`, `TextArea.h`, `FloatField.h`, `IntField.h`, `Vector3Field.h`, `widgets.css`, `inspector.css`.

## Sliders

Use `Slider` for continuous or stepped numeric values where scrubbing is useful. It supports `min`, `max`, `value`, `step`, `ticks`, `valuebubble`, `centered`, `range`, and `rangestart`.

Preferred classes:

- `inspector-slider` for component properties.
- Panel-local slider classes may be used for specialized graph/timeline controls.

Expected states are hover, drag/active, focus, disabled, and optional value bubble.

Sizing:

- Pair sliders with a numeric field when precise entry matters.
- Keep row height stable during value bubble or drag feedback.

Example:

```xml
<Slider id="Exposure" class="inspector-slider" min="0" max="10" value="1" step="0.01" />
```

Sources: `Slider.h`, `Slider.cpp`, `ControlRegistration.cpp`, `widgets.css`.

## Foldout And Accordion

Use `Foldout` for a collapsible section. Use `Accordion` when a group of collapsible sections should share behavior, including exclusive expansion.

Preferred classes:

- `foldout` for the control root and local child classes from `Foldout.css`.
- `accordion` and `accordion-item` for grouped disclosure.
- `inspector-section` for editor inspector sections; use `InspectorSection` rather than hand-building inspector disclosure where possible.

Expected states are expanded/collapsed, hover header, focus, selected, and disabled.

Sizing:

- Foldout headers should remain one row tall.
- Hidden bodies should use `display: none` and mark layout/visual dirty when toggled.

Example:

```xml
<Foldout id="RenderSettings" title="Render Settings" />
<Accordion id="SettingsGroups" mode="exclusive" />
```

Sources: `Foldout.h`, `Accordion.h`, `AccordionItem.h`, `Foldout.css`, `Accordion.css`, `InspectorSection.cpp`.

## Search Dialog

Use `SearchDialog` for command/search pickers, asset selection, and filtered lists. It owns its search field and result list, and loads `UI/controls/SearchDialog.css`.

Preferred classes:

- Use the control-provided classes for the dialog shell, search row, results, and items.
- Panel-specific callers may add contextual classes only at the host/root level.

Expected states are open/closed, focused search input, highlighted result, selected result, empty state, and dismissal.

Sizing:

- Anchor the dialog to the invoking field or a predictable panel region.
- Keep result rows dense and virtualizable when data sets are large.

Example:

```cpp
auto dialog = std::make_unique<SearchDialog>();
dialog->SetPlaceholder("Search assets");
```

Sources: `SearchDialog.h`, `SearchDialog.cpp`, `SearchDialog.css`, `AssetField.cpp`.

## Asset Field

Use `AssetField` for selecting assets by GUID in inspector/property surfaces. It handles accepted asset types, drag/drop, clear behavior, thumbnails, and search dialog integration.

Preferred classes:

- `asset-field` for the root.
- `asset-field-icon`, `asset-field-preview`, `asset-field-name`, and `asset-field-clear` for internal structure.
- Add `inspector-field` on the containing cell when used in property rows.

Expected states are empty, populated, hover, clear-visible, drag-hover, accepted/denied drop, and preview thumbnail available.

Sizing:

- Keep the field inside a flexible inspector row cell.
- Do not replace the clear control with a text glyph; the current implementation uses an image for optical centering.

Example:

```cpp
auto field = std::make_unique<AssetField>();
field->SetAcceptedTypes({AssetType::Material, AssetType::Texture});
field->AddClass("inspector-field");
```

Sources: `AssetField.cpp`, `AssetField.css`, `AssetSearchProvider`, `InspectorPanel.cpp`.

## Tree, Grid, List, And Scroll Views

Use `TreeView` for hierarchy or folder trees, `GridView` for asset thumbnails, `ListView` for dense row lists, and `ScrollView` for scroll ownership.

Preferred classes:

- `tree`, `tree-item`, `tree-foldout`, and `tree-scroll` for tree views.
- `grid`, `grid-virtual-content`, `grid-cell`, `thumb`, and `grid-title` for grids.
- `list-item` for list rows.
- `scroll-content` for ScrollView content.

Expected states are hover, selected, drag/drop valid/invalid, missing asset, expanded/collapsed tree item, and virtualized row/cell recycling.

Sizing:

- A virtualized `GridView` root must be a single-column flex container; do not turn `.grid` into a wrapping row flex box.
- Scrollable panel content must have `min-height: 0` and an explicitly constrained parent.
- Tree icon and foldout sizing should use the tree tokens from `tokens.css`.

Example:

```xml
<scrollview id="InspectorScroll" class="inspector-scrollview">
  <UIElement class="inspector-section-body" />
</scrollview>
```

Sources: `TreeView.h`, `GridView.h`, `ListView.h`, `ScrollView.h`, `views.css`, `inspector.css`.

## Layout Primitives

Use low-level layout primitives when a panel needs runtime panes, mounted content, or split resizing.

Preferred controls and tags:

- `WeightedPane` / `pane` for weighted flex regions.
- `Splitter` / `splitter` for draggable split handles between panes.
- `SplitView` / `splitview` for split layouts.
- `Mount` for displaying non-owned panel/content subtrees inside a host element.
- `Scrollbar` / `scrollbar` as an internal scroll primitive, usually owned by `ScrollView`.

Expected states are drag active, hover handle, mounted/unmounted target, and layout dirty after weight changes.

Sizing:

- Splitter handles are styled as narrow visual lines with a larger hit area.
- Pane and mount hosts should have `min-width: 0` and `min-height: 0` when hosting flexible panel content.
- Avoid using `Scrollbar` directly unless implementing a scroll-owning control.

Example:

```xml
<pane id="LeftPane" weight="0.35" />
<splitter id="MainSplitter" class="splitter row" />
<pane id="RightPane" weight="0.65" />
```

Sources: `WeightedPane.h`, `Splitter.h`, `SplitView.h`, `Mount.h`, `Scrollbar.h`, `core.css`, `AnimationWindowPanel.uxml`.

## Charts, Logs, And Status Surfaces

Use chart and log/status surfaces for diagnostics-heavy panels such as Log, Visual Profiler, CPU/VRAM/RenderGraph tools, and Script Errors.

Preferred patterns:

- `ChartView` for profiler-style time series and bound charts.
- `LogView` for virtualized log lines with severity classes.
- `log-debug`, `log-info`, `log-warning`, `log-error`, and `log-critical` for severity text.
- Panel-specific status rows and metric cards in profiler/monitor panels.

Expected states are filtered/unfiltered, selected row, hover row, warning/error severity, scrubbed chart sample, empty state, and active capture/pause.

Sizing:

- Diagnostic rows should stay dense and virtualized where data can grow.
- Charts should reserve stable height so labels and scrub feedback do not move surrounding controls.
- Warning/error colors should follow the documented status colors rather than inventing local variants.

Example:

```cpp
auto chart = std::make_unique<ChartView>();
auto log = std::make_unique<LogView>();
```

Sources: `ChartView.h`, `LogView.h`, `VisualProfilerPanel.cpp`, `LogPanel.cpp`, `widgets.css`, `VisualProfilerPanel.css`, `ScriptErrorsPanel.css`.

## Color Picker

Use the editor color picker family for color values instead of rebuilding HSV/RGB controls in inspectors or settings.

Preferred controls:

- `ColorPicker` for the full picker surface.
- `ColorPickerPopup` for anchored picker popups.
- Color picker internals include `ColorWheelElement`, `ColorSVBoxElement`, `HueBarElement`, and `ValueBarElement`.
- Inspector integrations should use `OpenColorPickerWindowFn` / `ColorPickerCallbacks` where available.

Expected states are live value changing, apply, cancel, anchored popup, hosted window, and initial/current color preview.

Sizing:

- Keep color swatches stable and large enough to read.
- Use preview/commit semantics: live preview while dragging or editing, commit only on apply/final change.

Example:

```cpp
ColorPickerCallbacks callbacks;
ctx.OpenColorPickerWindow(initialColor, intensity, std::move(callbacks));
```

Sources: `ColorPicker.h`, `ColorPicker.cpp`, `ColorPickerPopup.h`, `ColorPickerPanel.css`, `ColorPickerWindow.css`, `InspectorRegistry.h`.

## Scene View Widgets

Use scene-view widgets for viewport-specific controls and overlays.

Preferred controls:

- `SceneViewToolbar` / `sceneviewtoolbar` for scene camera/tool controls.
- `CameraBookmarksWidget` / `camerabookmarkswidget` for camera bookmark controls.
- `ViewportRotationGizmo` / `viewportrotationgizmo` for orientation navigation.
- `SceneViewRulerOverlay` / `sceneviewruleroverlay` for viewport ruler/overlay information.

Expected states are active tool, hover tool, pressed tool, overlapped corner placement, hidden overlay, and scene/game view fullscreen transitions.

Sizing:

- Scene view controls should overlay the viewport without covering core content.
- Widgets should move or hide when they overlap more important viewport UI.
- Keep icon buttons aligned with global toolbar icon sizing unless the viewport needs a larger hit target.

Example:

```xml
<SceneViewToolbar id="SceneViewToolbar" class="sceneview-toolbar" />
<ViewportRotationGizmo id="ViewportRotationGizmo" class="viewport-rotation-gizmo" />
```

Sources: `SceneViewPanel.uxml`, `SceneViewPanel.css`, `SceneViewToolbar.cpp`, `ViewportRotationGizmo.cpp`, `SceneViewRulerOverlay.cpp`.

## Animation And Timeline Controls

Use the animation/timeline controls for dopesheet, curve, marker, and clip-editing workflows.

Preferred controls:

- `DopeSheetView` / `dopesheetview` for keyframe sheets.
- `CurvesGraphView` / `curvesgraphview` for curve editing.
- `TimeCompositeView` / `timecompositeview` for clip and track composition.
- `LaneClipEditorView` / `laneclipeditorview` for lane/clip editing.
- `TimelineBarElement`, `TimelineMarkersElement`, `TimelineTimeLabelsElement`, `TimelineFrameLabelsElement`, and `TimeRangeSliderElement` for timeline rulers, labels, markers, and range selection.

Expected states are selected key/clip, hover key/handle, active drag, scrub, region selection, snap enabled, tag color, drop target valid/invalid, and disabled/muted track.

Sizing:

- Timeline controls should keep ruler, labels, playhead, and scrub strips aligned.
- Drag handles need stable hit zones independent of zoom level.
- Color tags should use the existing animation tag colors unless a user-authored color is provided.

Example:

```xml
<DopeSheetView id="AnimationWindowDopeSheetPlaceholder" class="animationwindow-view-placeholder" />
<CurvesGraphView id="AnimationWindowCurvesPlaceholder" class="animationwindow-view-placeholder" />
```

Sources: `AnimationWindowPanel.uxml`, `AnimationWindowPanel.css`, `DopeSheetView.cpp`, `CurvesGraphView.cpp`, `TimeCompositeView.cpp`, `TimelineBarElement.cpp`, `LaneClipEditorView.cpp`.

## Modals

Use modal elements for focused blocking workflows such as project picking, confirmation, save prompts, downloads, and video playback.

Preferred classes:

- Modal-specific root classes such as `project-picker-modal`.
- `cancel-button`, `open-button`, and `browse-button` for project picker actions.
- Shared modal transitions belong in `UI/controls/Modal.css`; modal-specific layout belongs near the modal implementation.

Expected states are hidden, showing, visible, hiding, focused initial control, confirmed, canceled, and dismissed.

Sizing:

- Use stable button rows and fixed header/footer rhythm.
- Prefer the default shipped UI font family for modal surfaces that should not inherit user editor font preferences.

Example:

```cpp
RequestSubtreeStyleAssetPath("UI/controls/Modal.css");
AddClass("project-picker-modal");
```

Sources: `ProjectFolderPickerModal.cpp`, `ConfirmActionModal.cpp`, `SaveSceneChangesModal.cpp`, `Modal.css`.

## Docking And Panels

Use dock panels for editor tools and workspace surfaces. The default layout and panel inventory are declared in `Apps/Editor/Assets/UI/layout.uxml`.

Preferred classes:

- `dock-root`, `dockspace`, and `panel` for editor shell and panel surfaces.
- `DockablePanel`, `DockLayout`, `DockSplit`, `DockLeafNode`, and `DockTabNode` in layout configuration.
- Panel-specific CSS belongs in `Apps/Editor/Assets/UI/panels`.

Expected states are active tab, inactive tab, hover tab, drag/reorder, split preview, dock overlay, floating/tear-out window, and hidden/unmounted panel.

Sizing:

- Panels should use `flex-grow: 1`, `min-width: 0`, and `min-height: 0` where they host flexible content.
- Keep panel chrome dense and avoid nested framed surfaces unless the child is a repeated item, modal, or genuinely framed tool.

Example:

```xml
<DockablePanel id="SceneView" type="SceneViewPanel" title="Scene View"
               layout="panels/SceneViewPanel.uxml" style="panels/SceneViewPanel.css" />
```

Sources: `layout.uxml`, `DockspaceElement.cpp`, `EditorDockConfigParser.cpp`, panel CSS files.

## Inspector Sections

Use `InspectorSection` for component/entity sections in the Inspector. It owns header structure, optional icon, enabled dot, collapse state, body root, and selected/drag classes.

Preferred classes:

- `inspector-section`, `inspector-section-header-row`, `inspector-section-header`, `inspector-section-body`.
- `inspector-row`, `inspector-label`, and `inspector-field` for properties.
- `inspector-section-collapsed`, `inspector-section-selected`, drag indicator classes, and hidden-body classes for state.

Expected states are collapsed, expanded, enabled, disabled, selected, dragging, drop indicator above/below, empty body, and icon visible/hidden.

Sizing:

- Property rows should be compact and align labels with fields.
- Avoid overwriting focused field subtrees during refresh.
- Use preview/commit edit semantics for interactive inspector edits.

Example:

```cpp
auto section = std::make_unique<InspectorSection>("Transform");
section->SetHeaderIconClass("gizmo-icon");
section->GetContentRoot()->AddChild(std::move(row));
```

Sources: `InspectorSection.cpp`, `InspectorPanel.cpp`, `InspectorUIHelpers.h`, `InspectorDragHelpers.h`, `inspector.css`.

## Toolbars

Use toolbar controls for global editor commands, playback, layout presets, scene view tools, and panel-local command rows.

Preferred classes:

- `editor-top-toolbar`, `editor-bottom-toolbar`, `top-toolbar-left`, `top-toolbar-center`, `top-toolbar-right`.
- `bottom-toolbar-center` and `layout-button` for layout presets.
- `icon-button` plus icon classes for global toolbar commands.
- `toolbar-gap`, `toolbar-spacer`, and panel-local toolbar classes for specialized panels.

Expected states are hover, active/pressed, selected/toggled, dragging, insertion indicator, disabled, and hidden during fullscreen play mode.

Sizing:

- Top and bottom toolbars are 40 px tall.
- Left and right top toolbar regions share remaining space and clip overflow; center playback controls keep natural width.
- Layout preset controls should not resize during hover/selected states.

Example:

```xml
<UIElement class="editor-top-toolbar">
  <UIElement class="top-toolbar-center">
    <Button id="Play" class="small secondary icon-button play-icon" />
  </UIElement>
</UIElement>
```

Sources: `layout.uxml`, `EditorTopToolbar.cpp`, `LayoutPresetToolbar.cpp`, `SceneViewToolbar.cpp`, `ToolbarDragDrop.cpp`, `core.css`.
