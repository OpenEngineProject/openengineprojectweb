# Humanoid Retargeting — API Reference

Every public type, function, asset, ECS component, system, op, and shader
shipped by the humanoid retargeting redesign. Each entry includes a brief
description and a minimal usage sketch. For the architecture overview see
[`Architecture.md`](Architecture.md); for the full plan see
[`HumanoidRetargetingPlan.md`](HumanoidRetargetingPlan.md).

---

## Asset types

### `Animation::SkeletonProfile`

Header: `Engine/Modules/Animation/Include/Animation/SkeletonProfile.h`

Canonical humanoid skeleton: which `HumanBone` slots are populated, their
hierarchy, rest pose, and reference axes. Every `HumanoidRig` retargets to
one. The engine ships `HumanoidStandard.profile.json` (60-bone humanoid);
custom profiles for stylized characters (e.g., `HumanoidElf.profile.json`)
live in the project mount.

```cpp
auto profile = std::make_shared<Animation::SkeletonProfile>(guid, path);
profile->Load();
const Animation::ProfileBone* hipsBone = profile->FindBone(Animation::HumanBone::Hips);
```

### `Animation::HumanoidRig`

Header: `Engine/Modules/Animation/Include/Animation/HumanoidRig.h`

Per-mesh metadata that binds a specific source skeleton to a
`SkeletonProfile`. Owns the canonical bone map, retarget pose deltas, chain
definitions, body proportions, and attachment bones. One per FBX/glTF
character (e.g., `BusinessMale.humanoidrig.json`).

```cpp
Animation::HumanoidRig rig(guid, path);
rig.Load();
// Auto-import path from a SkeletonData + SkeletonProfile:
Animation::AutoImportHumanoidRig(skel, profile, rig);
rig.SaveToPath(path);
```

### `Animation::RetargetMap`

Header: `Engine/Modules/Animation/Include/Animation/RetargetMap.h`

Source-rig -> target-rig pairing with per-chain FK / translation / IK
settings and the op-stack list. One per directional source-target pair
(e.g., `BusinessMale_to_YBot.retargetmap.json`).

```cpp
Animation::RetargetMap map(guid, path);
map.SetSourceRigRef(srcRig.GetGUID());
map.SetTargetRigRef(tgtRig.GetGUID());
Animation::AutoCreateRetargetMap(srcRig, tgtRig, map);
map.SaveToPath(path);
```

`map.IsBroken()` returns true when either rig reference is null
(inspector surfaces a "BROKEN" banner).

---

## Enums

### `Animation::HumanBone`

Header: `Engine/Modules/Animation/Include/Animation/HumanBone.h`

Canonical humanoid bone identity. 56 entries: `None` (sentinel) + 24 body
anatomical (Hips, Spine, Chest, UpperChest, Neck, Head, [Left|Right]
{Shoulder, UpperArm, LowerArm, Hand, UpperLeg, LowerLeg, Foot, Toes, Eye},
Jaw) + 30 finger bones (Thumb / Index / Middle / Ring / Little x Proximal /
Intermediate / Distal x Left / Right) + `Count`. Stable values; never
reorder.

```cpp
const char* name = Animation::HumanBoneToString(Animation::HumanBone::Hips);
auto bone = Animation::HumanBoneFromString("LeftFoot");
```

### `Animation::ChainKind`

Drives chain solver selection and op-stack defaults. Values:
`LeftArm`, `RightArm`, `LeftLeg`, `RightLeg`, `Spine`, `Head`,
`LeftFingers`, `RightFingers`, `Tail`, `Other`.

### `Animation::FKRotationMode`

Per-chain FK rotation transport mode. Values:
- `OneToOne` — same-profile fast path (one quat copy per bone).
- `Transport` — transport-then-slerp for unequal chain lengths (e.g., 3-
  bone source spine -> 5-bone target spine).
- `SlerpAlongArc` — world-rotation-slerp-along-arc; closed-form, used for
  stylized spine cases.

### `Animation::FKTranslationMode`

Per-chain translation mode. `None` (default; non-translation bones forced
to retarget pose), `PerBoneScale`, `UniformChainScale`.

### `Animation::AttachmentPassthroughMode`

How an attachment bone (cloak, sheath, hair anchor) is driven during
retargeting. `CopyLocal` (drive from source local rotation; default for
cosmetic bones), `Procedural` (driven by a runtime op), `Static` (hold
local pose unchanged).

### `Components::HumanoidRetargetLOD`

Phase 8 LOD enum. `Full` (Stages 1-7 + op stack), `NoOps` (skip op stack),
`FKOnly` (skip Stage 5 IK + ops), `PoseHold` (reuse last frame's pose).

---

## ECS components

### `Components::HumanoidRetargeterComponent`

Header:
`Engine/Include/Components/Animation/HumanoidRetargeterComponent.h`

Declarative POD for entities driven by humanoid retargeting. Carries the
`RetargetMap` GUID, source clip index, time / speed / loop / pause flags,
master / IK enable, IK blend alpha, auto-bootstrap marker, optional LOD
override. State-free — `HumanoidRetargetSystem` owns the runtime tables.

```cpp
auto& retargeter = entity.AddComponent<Components::HumanoidRetargeterComponent>();
retargeter.Map = mapGuid;
retargeter.SourceClipIndex = clipStoreIndex;
retargeter.Enabled = true;
```

Coexists with `SkeletonRef` (target skeleton). An entity that carries
`HumanoidRetargeterComponent` should NOT also carry `AnimatorRef`.

---

## ECS systems

### `Engine::Rendering::HumanoidRetargetSystem`

Header:
`Engine/ECSModules/Rendering/Include/ECSModules/Rendering/Systems/HumanoidRetargetSystem.h`

Per-frame system: drains hot-reload events at the top of `Update()`,
iterates entities with `HumanoidRetargeterComponent` + `SkeletonRef`,
resolves the map and rigs, samples the source clip, runs either the GPU
pass chain (default) or the CPU fallback (`r.RetargetCPU=1` /
`GE_RETARGET_CPU=1`), and writes the result into
`SkeletonRuntimeState::CompactSkinMatrices` (CPU) or `SkinPaletteAtlas`
(GPU).

The system replaces cross-rig dispatch in `AnimationSystem`; same-rig
sampling stays in `AnimationSystem` and is unchanged.

```cpp
auto* renderServices = engine.GetRenderServices();
auto retargetSystem =
    std::make_unique<Engine::Rendering::HumanoidRetargetSystem>(renderServices);
ecsWorld.AddSystem(std::move(retargetSystem));
```

Test seam: `TestHooks::RunCPUEvaluateForTest` /
`TestHooks::RunCPUEvaluateAtLODForTest` mirror the per-character path
without spinning up a full ECS world.

---

## Anim graph nodes

### `Animation::AnimGraphNode`

Base class. `virtual void Evaluate(EvaluationContext&, AnimationPose&)`.
Subclasses produce a pose; the graph composes them.

### `Animation::RetargetNode`

Header: `Engine/Modules/Animation/Include/Animation/Nodes/RetargetNode.h`

Runs Stages 1-3 of the 6-stage pipeline (encode + FK transport + translate)
on CPU. Auto-instantiated by `HumanoidRetargetSystem` for component-driven
entities; usable directly via `AnimationGraphPlayer` for power-user custom
graphs.

```cpp
Animation::RetargetNode node;
node.Configure(&sourceProvider, &srcRig, &tgtRig, &map);
node.Build(*srcSkel, *tgtSkel);
node.Evaluate(ctx, outPose);
```

`Build()` is idempotent. Subsequent rig / map mutations (asset reload)
require a fresh `Build()` call.

### Other graph nodes

Stock animation graph primitives reused by retarget chains:
- `ClipPlayerNode` — leaf; samples one `AnimationClip`.
- `LayeredBlendNode` — base + overlay + per-bone mask.
- `AdditiveBlendNode` — base + additive layer (delta transforms).
- `Blend2Node`, `BlendSpace1DNode`, `BlendSpace2DNode` — parametric blends.
- `MontageSlotNode` — anim montage instance.
- `StateMachineNode` — finite state machine; transitions between sub-graphs.
- `TwoBoneIKNode`, `FABRIKNode`, `FootIKNode`, `LookAtNode` — IK leaves.

---

## Op stack

### `Animation::OpStackNode`

Header: `Engine/Modules/Animation/Include/Animation/OpStackNode.h`

Base class for Stage 6 ops. Each op subclass parses its JSON params at
construction and applies a deterministic mutation to the post-IK pose.

```cpp
auto op = Animation::OpStackNode::CreateFromName("AttachmentPassthrough", params);
op->Execute(opCtx, outPose);
```

`CanonicalOrderForName("AttachmentPassthrough") == 0`,
`"LookAt" == 1`, `"BodyIntersect" == 2` (v2),
`"FootLock" == 3`. RetargetMap.OpStack is reordered to canonical when
empty; the inspector emits a warning when the user authors an out-of-
canonical-order list. Call `EnsureOpStackRegistrations()` once before
resolving an op by name.

### v1 ops

| Op | File | Purpose |
|---|---|---|
| `AttachmentPassthroughOp` | `Animation/Ops/AttachmentPassthroughOp.h` | Drive cloak / sheath / hair from source local rotation. |
| `LookAtOp` | `Animation/Ops/LookAtOp.h` | Aim Head + Eye bones at a world target. |
| `FootLockOp` | `Animation/Ops/FootLockOp.h` | Eliminate foot sliding when source-foot planar speed < threshold. CPU fallback double-buffers prev-frame foot positions inside the op instance; GPU path uses prev-frame state SSBO. |

### v2 ops (deferred)

`BodyIntersectOp` (SDF push-out), `HandLockOp` (combat hold),
`TwistRedistributeOp` (parent-twist redistribution).

---

## Editor primitives

### `Animation::HumanoidNameMatcher`

Header: `Engine/Modules/Animation/Include/Animation/HumanoidNameMatcher.h`

Bone-name regex matcher. Maps a source-rig bone name onto a `HumanBone`
canonical slot. Covers Mixamo (`mixamorig:` prefix), Synty, MetaHuman,
Maya, VRM, glTF.

```cpp
Animation::HumanoidNameMatcher matcher;
auto result = matcher.MatchSkeleton(skel.BoneNames);
const auto* hipsMapping = result.Find(Animation::HumanBone::Hips);
```

`HumanoidNameMatcher::IsRequiredBone(bone)` returns true for the body
bones that drive the auto-import coverage gate (`kAutoImportCoverageThreshold`
= 0.8).

### `Animation::HumanoidImport`

Header: `Engine/Modules/Animation/Include/Animation/HumanoidImport.h`

One-shot import helpers. Free functions; no state.

- `DetectAPose(skel, mapping)` -> `APoseDetectionResult` — does the rest
  pose look like a Synty A-pose? Walks parent-rest-translation chains.
- `BakeRetargetPoseFromAPose(skel, profile, outRig)` — for each canonical
  bone where source rest differs from profile T-pose, computes the per-
  bone fix-up rotation. Within-5-deg deltas snap to identity.
- `AutoImportHumanoidRig(skel, profile, outRig)` — runs the matcher,
  computes body proportions, derives canonical chains, bakes per-bone
  retarget pose. Returns true when required-bone coverage clears
  `kAutoImportCoverageThreshold`.
- `AutoCreateRetargetMap(srcRig, tgtRig, outMap)` — populates default
  `ChainPairing` entries for every canonical chain present on both rigs.

```cpp
Animation::HumanoidRig rig(guid, path);
if (Animation::AutoImportHumanoidRig(skel, profile, rig))
{
    rig.SaveToPath(path);
}
```

### `Animation::HumanoidRetargetBootstrap`

Header:
`Engine/Modules/Animation/Include/Animation/HumanoidRetargetBootstrap.h`

Plumbing for the editor's "Clip uses different skeleton; setting up
retargeting." UX. Editor calls `TrySetupAutomatically(inputs, &record)`;
the function validates inputs and produces a `HumanoidRetargetBootstrap`
record (banner text, GUIDs). The editor wraps with banner UI in Phase 7b.

```cpp
Animation::AutoBootstrapInputs inputs{ &srcRig, &tgtRig, &map, mapWasNew };
Animation::HumanoidRetargetBootstrap record;
if (Animation::TrySetupAutomatically(inputs, &record))
{
    editor.ShowBootstrapBanner(record.BannerText, record.MapGUID);
}
```

### `Animation::HumanoidRigEdit`

Header: `Engine/Modules/Animation/Include/Animation/HumanoidRigEdit.h`

Phase 7b retarget-pose authoring helpers. Pure data; the inspector calls
them and writes back via the existing Save path.

- `ForceRetargetPoseToIdentity(rig)` — collapse every retarget delta to
  identity. Used when source rig is canonical T-pose.
- `CaptureRetargetPoseFromPreview(rig, localRotations, epsilonDeg)` —
  capture per-bone local rotations from an editor-supplied snapshot;
  near-identity collapses to identity.
- `BakeRetargetPoseFromClipFrame(rig, clip, skel, timeSeconds, epsilonDeg)`
  — sample a clip at a given time and write per-bone rotations into the
  rig's retarget pose. Returns the number of mappings updated.

---

## Engine primitives (Phase 0)

### `Animation::EvaluationContext`

Header: `Engine/Modules/Animation/Include/Animation/EvaluationContext.h`

Per-`Evaluate` context. Carries source / target profiles, source / target
skeletons, the per-thread scratch `PoseStack`, and `DeltaTime`. All
pointers are non-owning; the caller (typically the ECS animation system)
owns lifetime for the duration of the call tree.

### `Animation::PoseStack`

Header: `Engine/Modules/Animation/Include/Animation/PoseStack.h`

Pre-allocated stack of `AnimationPose` scratch buffers. Use with the RAII
`Frame` handle to allocate scratch poses inside `Evaluate()`:

```cpp
void Foo::Evaluate(EvaluationContext& ctx, AnimationPose& outPose) {
    Animation::PoseStack::Frame scratch(*ctx.ScratchStack);
    AnimationPose& tmp = scratch.Pose();
    // ...
}
```

`kMaxDepth = 8`. Resize once via `Reserve(boneCount)`; subsequent
`Evaluate` calls reuse capacity without allocating.

### `Animation::AllocationGuard`

Header: `Engine/Modules/Animation/Include/Animation/AllocationGuard.h`

RAII per-thread allocation counter for tests. Asserts zero allocations
after warm-up:

```cpp
TEST(IK, ZeroAllocsAfterWarmup) {
    DoWork();                        // warm-up
    Animation::AllocationGuard g;    // start counting
    DoWork();
    EXPECT_EQ(g.Count(), 0u);
}
```

Live in DebugFast; no-op in NDEBUG.

### `Animation::QuaternionConvert`

Header: `Engine/Modules/Animation/Include/Animation/QuaternionConvert.h`

Explicit `glm::quat <-> Mathematics::Quaternion` conversions. Module-
boundary use only — pipeline code is `Mathematics::Quaternion` exclusively
per Appendix A.

```cpp
glm::quat g = Animation::GlmFromMathematics(q);
auto m = Animation::MathematicsFromGlm(g);
```

### `Animation::QuaternionMath`

Header: `Engine/Modules/Animation/Include/Animation/QuaternionMath.h`

Header-only helpers. **Every slerp / lerp call in retarget code routes
through `SlerpShort` / `LerpShortNormalized`** — Appendix A mandates the
antipode flip at every site. Calling `glm::slerp` or
`Mathematics::Quaternion::Slerp` directly is forbidden.

```cpp
auto q = Animation::SlerpShort(a, b, 0.5f);
float deg = Animation::AngleBetweenDegrees(a, b);
```

### `Animation::PoseUtilities`

Header: `Engine/Modules/Animation/Include/Animation/PoseUtilities.h`

Free functions: `ComputeWorldSpace(localPose, parentIndices, outWorld)`
(out-param overload preferred on hot paths), `WorldToLocalRotation`,
`WorldToLocalPosition`. The out-param overload only resizes its vectors
when smaller than required.

### `Animation::PoseToSkinMatrices`

Header: `Engine/Modules/Animation/Include/Animation/PoseToSkinMatrices.h`

`BuildPoseToSkinMatrices(skeleton, outNodeWorldMats, outCompactSkinMats, ws)`
walks the target hierarchy and emits the compact skin palette consumed by
`SkinningUploadSystem`. Both regular and retargeted sample paths call
this; no rendering deps.

### `Animation::AnimationPose`

Header: `Engine/Modules/Animation/Include/Animation/AnimationPose.h`

Snapshot of all bone local transforms. SoA: `Positions`, `Rotations`,
`Scales`, `BoneCount`. Static helpers: `Blend(a, b, weight, result)` and
`BlendAdditive(base, additive, weight, result)`.

### `Animation::SkeletonData`

Header: `Engine/Modules/Animation/Include/Animation/SkeletonData.h`

Per-skeleton authored data. Bone hierarchy, rest pose (TRS + 4x4 local
matrix), bind / inverse-bind matrices, world anchors, hashed bone names
for sample-time channel resolution, topological order for hierarchy walk.
Phase 0b moved this from `Engine::Rendering::SkeletonData` into the
Animation module; the legacy symbol still resolves via a `using` alias in
`SkeletonStore.h`.

---

## Render-graph passes (GPU path)

All under `Engine/Modules/Rendering` / `Engine/Source/Engine/Rendering/`.
Each consumes the `RetargetMapDataSSBO` + `RetargetCharacterStateSSBO`
slots allocated by `RetargetGPUDataStore`.

| Pass | Purpose |
|---|---|
| `AnimationSampleSourcePass` | Stage 0; existing engine pass. |
| `RetargetEncodePass` | Stage 1; runs `retarget_encode.comp`. |
| `RetargetFKPass` | Stage 2; runs `retarget_fk_transport.comp` (Modes A+B) and `retarget_fk_world_arc.comp` (Mode D). |
| `RetargetTranslatePass` | Stage 3; runs `retarget_translate.comp`. |
| `RetargetWorldPosePass` | Builds source + target world poses for IK. |
| `RetargetIKGoalPass` | Stage 4; runs `retarget_ik_goal.comp`. |
| `RetargetIKSolvePass` | Stage 5; runs `retarget_two_bone_ik.comp` + `retarget_fabrik.comp`. |
| `RetargetOpStackPass` | Stage 6 orchestrator; emits `RetargetOpAttachmentPass`, `RetargetOpLookAtPass`, `RetargetOpFootLockPass` in canonical order. |
| `RetargetPoseToPalettePass` | Stage 7; runs `retarget_pose_to_palette.comp`; writes into `SkinPaletteAtlas`. |

---

## GPU compute shaders

All under `Engine/Modules/Rendering/Shaders/Animation/`:

`retarget_encode.comp`, `retarget_fk_transport.comp`,
`retarget_fk_world_arc.comp`, `retarget_translate.comp`,
`retarget_world_pose_build.comp`, `retarget_ik_goal.comp`,
`retarget_two_bone_ik.comp`, `retarget_fabrik.comp`,
`retarget_op_attachment.comp`, `retarget_op_lookat.comp`,
`retarget_op_foot_lock.comp`, `retarget_pose_to_palette.comp`.

---

## GPU data store

### `Engine::Rendering::RetargetGPUDataStore`

Header: `Engine/Include/Engine/Rendering/RetargetGPUDataStore.h`

Owns persistent device-local SSBOs (`RetargetMapDataSSBO`,
`RetargetCharacterStateSSBO`). Modeled on `GPUAnimationDataStore`. Per-
character slot allocation, lazy upload on asset reload,
`IsDispatchScheduledThisFrame` guard for multi-view dispatch dedup.

Hooks:
- `ReserveCharacter(slotOut)` / `ReleaseCharacter(slot)`
- `UploadMap(slot, MapUpload)` — re-upload on rig / map / profile change
- `WriteSourcePose(slot, srcPose)` — per-frame
- `WritePrevFootPosition(slot, footIdx, pos)`
- `WriteLookAtTarget(slot, target)`
- `WritePaletteAtlasOffset(slot, offsetMat4, skinJointCount)`
- Resident byte tracking via `Memory::AllocationCategory::Animation`.

---

## Editor inspectors

| Inspector | Phase | Purpose |
|---|---|---|
| `SkeletonProfileInspector` | 1 (read-only) | View profile bones, reference pose, axis frames. |
| `HumanoidRigInspector` | 1 (read-only) -> 7b (body-diagram-style slot list) | View / edit canonical bone map, retarget pose, chains, attachments, body proportions. Three retarget-pose authoring buttons. Drag-drop bone re-binding (Phase 7c). |
| `RetargetMapInspector` | 1 (read-only) -> 7b (chain + op editor) | View / edit per-chain FK / translation / IK settings; op-stack reorder + add / remove with canonical-order warnings. |
| `RetargetBootstrapBanner` | 7b | One-click "Clip uses different skeleton" UX; silenceable per-folder via `RetargetBootstrapBannerPrefs`. |

---

## Engine-shipped assets

Repo source: `Apps/Editor/Assets/SkeletonProfiles/`

| File | Purpose |
|---|---|
| `HumanoidStandard.profile.json` | Canonical 60-bone humanoid profile shipped with the engine; auto-import default. Resolved via `editor:` URL alias. |

Runtime (editor mount): `build/<preset>/bin/<config>/Apps/Editor/Assets/`.

User-authored profiles live in the project mount:
`Assets/SkeletonProfiles/<Custom>.profile.json`. Same schema; pointed at
via `HumanoidRig.ProfileRef`.

---

## Cache files

Path: `<projectDir>/.cache/retarget/<SourceRigGUID>/<ClipGUID>.cache.bin`

Formulation A bake (per-bone parent-shift-corrected rotation keys). Lazy-
rebuilt on rig / clip / retarget-pose change. Not source-controlled.

---

## Env-var toggles

| Var | Effect |
|---|---|
| `r.RetargetCPU=1` / `GE_RETARGET_CPU=1` | Force CPU fallback path (editor preview / debugging). |
| `GE_RETARGET_BASELINE_REFRESH=1` | Refresh `Tools/ai/retarget-redesign/baselines/humanoid_retarget_100char_Debug.json` on next bench run. |

---

## Test-only seams

| Seam | Purpose |
|---|---|
| `HumanoidRig::*Mutable()`, `RetargetMap::*Mutable()` | Direct edit access for test fixtures. |
| `SkeletonProfile::Set*ForTest` | Bypass JSON parser for test fixtures. |
| `RetargetNode::BakeRewriteForTest`, `ParentShiftForTest` | Inspect Stage 1 caches. |
| `FootLockOp::HasPrevAnchor`, `PrevAnchor` | Inspect prev-frame state. |
| `LookAtOp::HasTarget`, `Target` | Inspect parsed params. |
| `RetargetAssetWatcher::Fire*ForTest` | Synthesize hot-reload events. |
| `HumanoidRetargetSystem::ResetForTest` | Drop per-character cache between tests. |
| `HumanoidRetargetSystem::GetLastLODForRuntime` | Read most recent LOD selection. |
| `Engine::Rendering::TestHooks::RunCPUEvaluateForTest` | Run one CPU evaluate without a full ECS world. |
| `Engine::Rendering::TestHooks::RunCPUEvaluateAtLODForTest` | Same, LOD-aware. |

These seams are intentionally narrow. Production code does not call them.
