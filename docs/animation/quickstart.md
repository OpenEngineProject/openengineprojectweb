# Humanoid Retargeting — Quickstart

Drop a Mixamo clip onto a custom character in five steps.

This walks the auto-bootstrap path: the editor detects a clip-skeleton
mismatch, auto-imports `HumanoidRig`s for both rigs, auto-creates a
`RetargetMap`, attaches `HumanoidRetargeterComponent`, and shows a one-
click confirmation banner. Hit Play; the character walks.

---

## Step 1 — Drop the character into the project

Copy your character FBX / glTF into `Assets/Models/` (project mount).
Example: `Assets/Models/MyCharacter.glb`.

The asset pipeline imports the mesh, skeleton, and bind pose. The first
time the editor sees the file, `Animation::AutoImportHumanoidRig`
runs:

1. The bone-name regex matcher (`Animation::HumanoidNameMatcher`) maps
   each source-rig bone name onto a `HumanBone` canonical slot. Mixamo
   (`mixamorig:` prefix), Synty, MetaHuman, Maya, VRM, glTF — all covered.
2. Body proportions (hip height, shoulder width, leg / arm length) are
   computed from world-rest positions.
3. Canonical chains (LeftArm = Shoulder -> Hand, etc.) are derived.
4. Per-bone retarget-pose rotations are baked from rest-pose deltas. Synty
   A-pose binds get non-identity rotations on shoulders / upper arms;
   Mixamo / MetaHuman T-pose binds get identity (no fix-up needed).

The result lands at `Assets/Models/MyCharacter.humanoidrig.json`.

If required-bone coverage drops below `kAutoImportCoverageThreshold`
(0.8), the import fails and the editor prompts you to fix the mapping in
`HumanoidRigInspector`. Otherwise: silent success.

---

## Step 2 — Drop the animation clip

Copy the Mixamo (or Synty, MetaHuman, glTF, VRM) clip into
`Assets/Animations/`. Example:
`Assets/Animations/Mixamo_Walk_Y.glb`.

The clip's source skeleton triggers a second `AutoImportHumanoidRig`
pass — one rig per skeleton, even if many clips share a skeleton. The
result lands at `Assets/Animations/Mixamo_Walk_Y.humanoidrig.json`.

---

## Step 3 — Place the character in a scene

Open or create a scene. Drop your character onto a transform entity. The
entity now carries:

- `Transform`
- `MeshRenderer` (with the character's skin mesh)
- `SkeletonRef` (target skeleton runtime)

No `AnimatorRef` yet; the character holds rest pose.

---

## Step 4 — Assign the clip

Drag `Mixamo_Walk_Y.glb` from the Asset browser onto the entity. The
editor detects the skeleton mismatch
(`clip.skeletonGUID != entity.SkeletonRef.runtimeId`) and runs the auto-
bootstrap:

```
HumanoidRetargetBootstrap::TrySetupAutomatically(inputs, &record)
```

Behind the scenes:

1. Resolves the source `HumanoidRig` (next to `Mixamo_Walk_Y.glb`).
2. Resolves the target `HumanoidRig` (next to your character mesh).
3. Looks for `Assets/Animations/Retargeting/<Source>_to_<Target>.retargetmap.json`.
4. If absent, calls `Animation::AutoCreateRetargetMap` to synthesize one
   with default chain pairings (FK rotation OneToOne, translation None,
   IK off; op-stack empty, falls back to canonical order).
5. Adds `Components::HumanoidRetargeterComponent` to the entity with
   `Map = <map GUID>`, `SourceClipIndex = <clip store index>`, defaults
   for the rest.

The editor pops the `RetargetBootstrapBanner`:

> Clip 'Mixamo_Walk_Y' uses a different skeleton. Setting up
> retargeting via 'Mixamo_Walk_Y_to_MyCharacter.retargetmap.json'.
> [Customize] [Dismiss] [Don't show again for this folder]

Click anywhere outside or "Dismiss" to accept; the component is already
set up. "Don't show again for this folder" silences the banner per-folder
(stored in editor prefs via
`RetargetBootstrapBannerPrefs`). "Customize" opens
`RetargetMapInspector` for tweaking before commit.

---

## Step 5 — Hit Play

The character walks. Per-frame, `HumanoidRetargetSystem`:

1. Drains hot-reload events at the top of `Update()` (so no character
   reads a torn pointer mid-frame).
2. Iterates entities with `HumanoidRetargeterComponent`.
3. Resolves the map and rigs (cached after first lookup).
4. Samples the source clip at `ClipTimeSeconds` onto the source
   skeleton.
5. Either runs the GPU pipeline (default) — `RetargetEncodePass` ->
   `RetargetFKPass` -> `RetargetTranslatePass` -> `RetargetWorldPosePass`
   -> `RetargetIKGoalPass` -> `RetargetIKSolvePass` ->
   `RetargetOpStackPass` -> `RetargetPoseToPalettePass` — writing skin
   matrices straight into `SkinPaletteAtlas`. The existing instanced
   rasterization path consumes the palette unchanged.
6. Or runs the CPU fallback (`r.RetargetCPU=1`) and writes into
   `SkeletonRuntimeState::CompactSkinMatrices`;
   `SkinningUploadSystem` ships them to the atlas.

`ClipTimeSeconds` advances by `deltaTime * Speed`. If `Loop = true`,
wraps at clip duration. If `Paused = true`, holds.

---

## Verifying it worked

If the character is in T-pose with arms splayed: the source rig's
retarget pose didn't bake correctly. Check `HumanoidRigInspector` —
shoulder / upper-arm rotations should be ~15-30 deg for Synty A-pose
binds, identity for Mixamo / MetaHuman T-pose binds. Use the "Force bind
= retarget pose" button if the source rig was authored canonically.

If the feet slide: enable FootLock on the appropriate
`ChainPairing.FootLock` in `RetargetMapInspector`. Default is off.

If the character drifts off-screen: the source clip has hip translation;
this is correct retargeting behavior. Use `Components::HumanoidRetargeter
Component::Loop` + a Position component to handle world placement.

If hot-reload regresses retargeting: edit the rig / map JSON and save.
The watcher fires `RetargetAssetWatcher`'s reload callback;
`HumanoidRetargetSystem::DrainHotReloadEvents` clears caches; next frame
re-resolves. No editor restart needed.

---

## Power-user path

Skip auto-bootstrap and add `HumanoidRetargeterComponent` manually:

```cpp
auto& retargeter = entity.AddComponent<Components::HumanoidRetargeterComponent>();
retargeter.Map = mapGuid;
retargeter.SourceClipIndex = clipStoreIndex;
retargeter.Enabled = true;
retargeter.IKEnabled = true;
retargeter.AutoBootstrap = false; // banner suppressed
```

Use this for:
- Custom op-stack ordering (combat rigs, special effects).
- Hand-edited retarget pose.
- Multiple sources through `AnimationGraphPlayer`.
- Programmatic spawning (crowd scenes, replays).

For full custom anim graphs, drive a `RetargetNode` directly from your
graph; see [`Reference.md`](Reference.md) for the API.

---

## Drop in a VRM avatar

VRM 1.0 and Khronos KHR_humanoid avatars carry their humanoid bone map
in a glTF extension on disk. Drop one into `Assets/Models/`, e.g.
`Assets/Models/AvatarSampleA.vrm`, and the auto-import flow probes
three paths in order:

1. **VRM 1.0** (`extensions.VRMC_vrm`) — the bone map is read directly
   from `humanoid.humanBones` (object form, camelCase keys). Phase 10
   also captures `firstPerson`, `lookAt`, and expression clip names
   into a `VRM1Metadata` struct for downstream consumers (face,
   look-at, first-person culling). The retarget pipeline itself uses
   only the bone map.
2. **VRM 0.x** (legacy `VRM` extension name) — same bone-name list, but
   wire format is `humanBones[]` array of `{ bone, node }` records and
   the avatar faces -Z (VRM 1.0 faces +Z). The importer logs a warning,
   converts the array to the 1.0 object shape, and Y-axis-flips the
   source skeleton's rest rotations on a working copy. The on-disk
   skeleton is not modified.
3. **KHR_humanoid** (`extensions.KHR_humanoid`) — same bone map shape
   as VRM 1.0; standalone Khronos-track extension. Used when you have
   non-VRM avatars that pre-declare humanoid bindings (e.g., bespoke
   pipeline output, future Khronos sample assets).

Path 4 (the heuristic regex matcher from Step 1 above) is the fallback
when none of the extensions are present (FBX assets, plain glTF
exports without the extension). Editor log line tells you which path
ran:

```
[Info] HumanoidRig auto-imported via VRM 1.0 (specVersion=1.0, legacyVRM0=0)
[Info] HumanoidRig auto-imported via KHR_humanoid
[Info] HumanoidRig auto-imported via heuristic name matcher
```

The output `HumanoidRig` is identical in shape regardless of which
path produced it; downstream retarget evaluation doesn't change.

Real VRM 1.0 sample assets live at
[vrm-c/UniVRM-1_0](https://github.com/vrm-c/UniVRM-1_0/tree/master/Tests/Models)
and the [VRoid Hub](https://hub.vroid.com/) gallery (CC-BY licensed
avatars). Engine-shipped tests use synthetic glTF JSON fixtures
(no third-party asset dependency) — see
`Engine/Modules/Animation/Tests/{KHRHumanoidImporter,VRM1Importer,AutoImportDispatch}Tests.cpp`.

---

## Same-skeleton case

If you drop a clip whose skeleton matches the entity's target skeleton,
no `HumanoidRetargeterComponent` is added. The existing `AnimationSystem`
same-rig sample path runs zero-config. The component's overhead is paid
only when actual retargeting is needed.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Auto-import didn't run | Skeleton coverage < 80% required bones | Open `HumanoidRigInspector`, fix red bone slots manually |
| Character T-poses with splayed arms | Synty A-pose source, retarget pose not baked | Verify shoulder / upper-arm `RetargetPoseRotation` are non-identity in `HumanoidRigInspector` |
| Foot sliding | FootLock disabled | Enable `ChainPairing.FootLock.Enabled` in `RetargetMapInspector` |
| Cloak / sword / hair doesn't follow | No `AttachmentBone` declared, or wrong parent | Add via `HumanoidRigInspector` with parent canonical bone |
| Banner won't go away | Auto-bootstrap re-fires every assign | Click "Don't show again for this folder"; recorded per-folder via `RetargetBootstrapBannerPrefs` |
| Clip plays once and stops | `Loop = false` | Toggle `Loop` on the component |
| Character locks at first frame | `Enabled = false` or `Paused = true` | Toggle on the component |

---

## Next steps

- [`Architecture.md`](Architecture.md) — full GPU residency table, SSBO
  layout, hot-reload chain.
- [`Reference.md`](Reference.md) — every public type, function, asset.
- [`MigrationNotes.md`](MigrationNotes.md) — coming from the old
  `HumanoidAvatar` path? Equivalences here.
- [`HumanoidRetargeting.md`](HumanoidRetargeting.md) — high-level vision
  document.
- [`HumanoidRetargetingPlan.md`](HumanoidRetargetingPlan.md) — full
  comprehensive plan (12 phases).
