# Humanoid Retargeting — Architecture

This is the implementation-light architecture overview. For the full design
rationale and per-phase deliverables, see
[`HumanoidRetargetingPlan.md`](HumanoidRetargetingPlan.md). For the high-
level vision, see [`HumanoidRetargeting.md`](HumanoidRetargeting.md).

---

## The 6-stage pipeline (plus Stage 7 palette emit)

The retargeter runs once per character per frame:

```
0. Sample             AnimationClip -> source SkeletonData -> AnimationPose
1. Encode             qSrcDelta = bake * sourceClipKey (Formulation A bake-
                      with-parent-shift; baked once at session-build)
2. FK transport       Mode A (one-to-one, fast path), Mode B (transport-
                      then-slerp, unequal chains), Mode C (none, hold target
                      retarget pose), Mode D (world-rotation slerp-along-arc,
                      spine)
3. Translation        Hip translation scaled by tgtHipHeight / srcHipHeight;
                      non-translation bones forced to retarget pose
4. IK goals           Per-chain end-effector goals computed in chain-root-
                      local frame (uniform per-chain length ratio)
5. IK solve           TwoBoneIK (closed-form analytical) for limbs; FABRIK
                      (fixed 10-iter for determinism) for spine
6. Op stack           AttachmentPassthrough -> LookAt -> [BodyIntersect v2]
                      -> FootLock; canonical order, user-reorderable
7. Pose-to-palette    Per-bone parent-walk -> mat4 skin = meshRootInverse *
                      world * inverseBind; written into SkinPaletteAtlas
```

Stages 1-3 fix bind-orientation differences. Stages 4-5 fix proportion
mismatches. Stage 6 handles game-specific behaviors and accessories. Stage 7
is the consumer-side emit that lets the existing instanced rasterization path
read retargeted skin matrices unchanged.

---

## GPU residency table

Each stage in the shipped pipeline:

| Stage | GPU-resident? | Compute shader | Render-graph pass |
|---|---|---|---|
| 0 (sample) | Yes (existing) | `animation_compute.comp` | `AnimationComputePass` |
| 1 (encode) | Yes | `retarget_encode.comp` | `RetargetEncodePass` |
| 2 (FK transport) | Yes | `retarget_fk_transport.comp` (Modes A+B), `retarget_fk_world_arc.comp` (Mode D) | `RetargetFKPass` |
| 3 (translate) | Yes | `retarget_translate.comp` | `RetargetTranslatePass` |
| 4 (IK goals) | Yes | `retarget_ik_goal.comp` | `RetargetIKGoalPass` |
| 5 (IK solve) | Yes | `retarget_two_bone_ik.comp`, `retarget_fabrik.comp` | `RetargetIKSolvePass` |
| 6 (op stack) | Mixed | `retarget_op_attachment.comp`, `retarget_op_lookat.comp`, `retarget_op_foot_lock.comp` | `RetargetOpStackPass` (orchestrator) |
| 7 (palette emit) | Yes | `retarget_pose_to_palette.comp` | `RetargetPoseToPalettePass` |

CPU fallback (`r.RetargetCPU=1` / `GE_RETARGET_CPU=1`) runs the whole
pipeline through `RetargetNode` and `OpStackNode` subclasses. CI runs both
paths and cross-validates within tiered tolerance bands:

- FK transport (Stages 1-3): 1e-4 deg per bone
- IK-active chains (Stage 5): 1e-2 deg per bone
- Op-stack outputs: 1e-3 deg per bone
- Pose-to-palette: 1e-5 element-wise (no transcendentals)

Cross-driver tests use the same bands times 10x looser to account for
vendor-specific FMA orderings.

---

## SSBO layout (GPU-resident path)

Three SSBOs allocated by `RetargetGPUDataStore` at session-bake time. Per
character, one slot in each.

### `RetargetMapDataSSBO` (immutable until asset reload)

```
MapHeader (128 bytes)
  - bone count, chain count, attachment count
  - parentIndices offset, srcRestPos offset
  - per-canonical bone source/target indices
  - srcRetargetPose / tgtRetargetPose / M_src / M_tgt quaternions
  - per-chain dispatch table (solverKind, chainKind, blendToSource,
    extension, srcChainRoot/Tip, tgtChainRoot/Tip)
  - per-attachment passthrough config
  - tgtInverseBindOffset, tgtJointNodesOffset, tgtSkinJointCount,
    tgtMeshRootInverseOffset, attachmentTableOffset, attachmentCount,
    footTgtIndicesPacked, footSrcIndicesPacked, headTgtBoneIndex,
    leftEye/rightEyeTgtBoneIndex, footLockSpeedThresholdSq,
    footLockBlend
```

12-16 KB per character. Uploaded once on `HumanoidRig` / `RetargetMap` /
`SkeletonProfile` reload.

### `RetargetCharacterStateSSBO` (mutable per frame)

```
StateHeader (96 bytes)
  - srcWorldPoseOffset, tgtWorldPoseOffset (post-Stage-2 world poses)
  - ikGoalsOffset, ikPrevPoleOffset, ikScratchOffset
  - paletteAtlasOffsetMat4, skinJointCount (Stage 7 palette emit)
  - prevFootPosOffset (FootLock prev-frame double buffer)
  - lookAtTargetOffset, opScratchOffset
```

~8 KB per character. Source-pose snapshot lives in a persistent slot, not
a transient render-graph buffer (the `PerFrameWritePool` was the wrong
fit — 4-slot host-visible CPU-write ring). Per round-3 audit.

### Output: `SkinPaletteAtlas`

Existing engine SSBO. Stage 7 writes the final 4x4 skin matrices for the
target skeleton at the character's allocated slot. The existing
`WorldDrawBuilder` -> `DrawBatchCompactor` -> Forward+ rasterization path
consumes the palette unchanged — retargeted instances batch identically to
non-retargeted ones.

---

## Hot-reload chain

Three asset types feed the retargeter. Hot-reload propagates as follows:

```
SkeletonProfile.profile.json
   |
   |  AssetReloadInvalidator (per-asset event)
   v
RetargetAssetWatcher (one per HumanoidRetargetSystem)
   |
   |  marks all matching HumanoidRig / RetargetMap dirty
   v
HumanoidRetargetSystem::DrainHotReloadEvents()  <-- runs at top of Update,
                                                   before parallel iter
   |
   |  per CharacterEntry: clears CpuNode, sets MapDirty
   v
Next frame: PrimeGPU re-uploads MapData SSBO; CPU node is rebuilt lazily
```

The drain runs at the top of `Update()` BEFORE the parallel iteration so
no character processes a torn pointer mid-frame (the deferred-since-Phase-1
design fence).

```
HumanoidRig.humanoidrig.json
   |
   v  (same path; both rigs that reference this rig invalidate together)
[same as profile]

RetargetMap.retargetmap.json
   |
   v  (only the entries that hold this map's GUID invalidate)
[same as profile]

AnimationClip.glb / .anim
   |
   v  AssetReloadInvalidator -> ClipStore -> sample-time reads new keys
[no rig rebuild needed]
```

The `.cache/retarget/<SourceRigGUID>/<ClipGUID>.cache.bin` Formulation A
bake is rebuilt lazily on next Sample when:
- the source rig reloads,
- the clip reloads, or
- the source rig's retarget pose is edited.

---

## Auto-bootstrap data flow

When the editor (or runtime) detects a clip-skeleton mismatch:

```
User assigns AnimationClip to entity -> AnimatorRef
   |
   |  detect: clip.skeletonGUID != entity.SkeletonRef.runtimeId
   v
HumanoidRetargetBootstrap::TrySetupAutomatically(inputs, &record)
   |
   |  resolve / auto-import HumanoidRig for source and target
   |  resolve / auto-create RetargetMap (default OneToOne pairings)
   |  build banner string
   v
record.SourceRigGUID, record.TargetRigGUID, record.MapGUID, record.BannerText
   |
   |  editor: show RetargetBootstrapBanner (silenceable per-folder)
   |  user clicks OK -> AddComponent(HumanoidRetargeterComponent)
   v
HumanoidRetargetSystem picks up the entity on next Update
```

Same-skeleton case: no component added, the existing same-rig sample path
runs unchanged.

---

## ECS placement

| System | Order | Wave |
|---|---|---|
| `AnimationSystem` | base anim wave | reads `AnimatorRef`; produces same-rig pose |
| `HumanoidRetargetSystem` | base anim wave + 1 | reads `HumanoidRetargeterComponent` + `SkeletonRef`; produces cross-rig pose |
| `SkinningUploadSystem` | next wave (depends on anim wave) | reads `SkeletonRuntimeState::CompactSkinMatrices`; uploads to atlas |

Same-rig and cross-rig characters coexist. An entity that carries
`HumanoidRetargeterComponent` should NOT carry `AnimatorRef` — the two
paths route to different runtimes and would race on the same skin matrices.

---

## Performance budget (GPU-resident, 60 FPS)

| Workload | GPU cost | CPU cost | Notes |
|---|---|---|---|
| 1 character | ~50 us GPU | ~10 us CPU | Dispatch overhead dominates |
| 100 characters | ~500 us GPU | ~1 ms CPU | LOD selection + dispatch submission |
| 500 characters (stretch) | ~1.5 ms GPU | ~3 ms CPU | LOD strips IK off-screen; FK-only crowd |

CPU fallback (`r.RetargetCPU=1`):

| Workload | CPU cost (Debug) |
|---|---|
| 1 character | ~315 us |
| 100 characters | ~13.6 ms median (Debug, 24-bone synthetic) |
| 500 characters | ~68 ms median (Debug, 24-bone synthetic) |

Phase 8 ships a CI gate that compares the 100-character median against
`Tools/ai/retarget-redesign/baselines/humanoid_retarget_100char_Debug.json`
at 20% tolerance; refresh with `GE_RETARGET_BASELINE_REFRESH=1`.

---

## LOD policy (Phase 8)

`HumanoidRetargetLOD` enum on `HumanoidRetargeterComponent`:

| Level | Stages run | Saves vs Full | Use case |
|---|---|---|---|
| `Full` | 1-7 + op stack | 0 | Close, on-screen, gameplay-relevant |
| `NoOps` | 1-7, no op stack | ~50 us / char | Mid-distance crowd |
| `FKOnly` | 1-3, 7 | ~200 us / char | Far crowd; IK + ops invisible |
| `PoseHold` | none; reuse last frame's pose | full pipeline | Off-screen / behind-camera |

Selection heuristic in `RetargetSubmission::SelectRetargetLOD(LODInputs)`:
distance + on-screen flag. Per-character override via
`HumanoidRetargeterComponent::LODOverride` + `LODOverrideEnabled = true`.

---

## What's NOT in the GPU-resident path

- **Editor preview / debugging.** `r.RetargetCPU=1` env-var force-routes a
  single character through the CPU `RetargetNode` for inspector preview.
- **CPU-only ops (v2).** `BodyIntersectOp` (SDF query) and `HandLockOp`
  (combat hold) need a 1-frame-delayed CPU readback. Not shipped in v1.
- **Peer-entity source mode.** v2; current source is via
  `HumanoidRetargeterComponent::SourceClipIndex` only.

---

## Auto-import dispatch (Phase 10)

When the asset pipeline imports a glTF / glb / VRM file, the auto-import
flow probes three paths in order and uses the first that produces a
usable `HumanoidRig`:

| Stage | Trigger | Bone-binding source |
|---|---|---|
| 1. VRM 1.0 | `extensions.VRMC_vrm` (or legacy `VRM`) | `humanoid.humanBones` map (object form in 1.0; array form in 0.x) |
| 2. KHR_humanoid | `extensions.KHR_humanoid` | `humanBones` map (camelCase keys) |
| 3. Heuristic | always (FBX, plain glTF, manual import) | `HumanoidNameMatcher` regex priority table |

Entry point: `Animation::AutoImportHumanoidRigDispatch(gltf, skel,
profile, outRig, outPath)`. The path taken is reported via the
`HumanoidImportPath` enum (`VRM1` / `KHRHumanoid` / `Heuristic` /
`None`) and logged at INFO level. The same retarget-pose bake runs
on every path so an A-pose VRM avatar still produces non-identity
shoulder/upper-arm `RetargetPoseRotation` deltas.

VRM 0.x detection: when the legacy `VRM` extension is present (rather
than `VRMC_vrm`), the importer logs a warning about the forward-axis
flip (VRM 0.x uses -Z forward; VRM 1.0 uses +Z forward) and applies a
180-degree Y-axis rotation to the source skeleton's rest rotations on
a working copy. The bone-name list (`hips`, `leftUpperArm`, ...) is
identical between 0.x and 1.0; only the wire format differs (array vs
object) and the forward-axis convention.

Phase 10 v1 does NOT import VRM-specific runtime systems — spring
bones (`VRMC_springBone`), blendshape clips (`VRMC_vrm.expressions`),
and look-at metadata (`VRMC_vrm.lookAt`) are captured in
`VRM1Metadata` for downstream consumers but treated as
ImportableButIgnored by the retarget pipeline itself. The face /
expression / spring-bone runtimes are out-of-scope; when they ship,
they read the metadata struct produced by `ImportFromVRM1`.
