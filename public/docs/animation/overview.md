# Humanoid Retargeting — High-Level Overview

> **Status:** The CPU retargeting path is available in the editor. GPU orchestration and broader importer coverage remain under active development.

> **Goal:** A unified runtime humanoid retargeting system for different rig layouts, attachments, and IK workflows.

---

## What is humanoid retargeting?

Animation data on one character (the **source rig**) gets played on another character (the **target rig**) without manual rework — even when the two rigs differ in:

- Bone naming conventions (`mixamorig:LeftArm` vs `LeftShoulder` vs `Bip001 L Shoulder`).
- Bone hierarchy (3-bone spine vs 5-bone spine).
- Body proportions (tall thin character receiving short stocky character's clip).
- Bind pose orientation (Mixamo's T-pose bind vs Synty's A-pose bind).

A correct retargeter makes "play this Mixamo walk on my Synty character" a one-line operation. Done well, this is invisible: the artist clicks Play and the character walks. Done poorly, characters end up frozen in T-pose, splayed sideways, with feet sliding above the ground.


## The new architecture in 60 seconds

Three asset types, one ECS component/system, one animation graph node:

```
SkeletonProfile     ← reusable canonical schema (HumanoidStandard.profile, HumanoidElf.profile, ...)
       ↑
HumanoidRig         ← per-skeletal-mesh: bone map, retarget pose, chains, attachments, body proportions
       ↑
RetargetMap         ← source→target pairing: per-chain settings, IK config, op stack
       ↑
HumanoidRetargeterComponent + HumanoidRetargetSystem + RetargetNode  ← runtime evaluator
```

(v2/v3 renamed `RetargetSource` → `HumanoidRig` and `RetargetSession` → `RetargetMap`; both source and target are HumanoidRigs, and the Map is a static authored mapping not runtime state.)

The architecture separates the authored retarget pose from the imported bind pose, stores reusable canonical skeleton profiles, and evaluates retargeting at runtime so a source clip can be reused across compatible target characters.

## The pipeline (6 stages)

For each character, every frame:

1. **Sample** the source animation onto the source skeleton (existing path).
2. **Encode** as deltas relative to the *retarget pose* (not bind pose).
3. **Apply FK** to the target via canonical-axis-frame transport, with `OneToOne` for matching chains and `Interpolated` for unequal lengths.
4. **Generate IK goals** from source chain-tip world positions, scaled by per-axis body proportion ratios.
5. **Run IK** — TwoBoneIK for limbs (analytical), FABRIK for spine (iterative).
6. **Op stack** — FootLock, LookAt, AttachmentPassthrough, BodyIntersect, HandLock; user-orderable, extensible.

Stages 1-3 fix bind-orientation differences. Stage 4-5 fix proportion mismatches. Stage 6 handles game-specific behaviors and accessories.


## When is `HumanoidRetargeterComponent` needed?

**Implicit (default UX)** — the editor adds it automatically when a clip's skeleton doesn't match the entity's. The user clicks "OK" on a one-time banner ("Clip 'X' uses a different skeleton; setting up retargeting via 'X_to_Y.retargetmap.json'") and from then on it Just Works. Silenceable per-folder for trusted asset libraries.

**Explicit (power users)** — add the component directly when you want fine control: custom op stack ordering, hand-edited retarget pose, multiple sources through `AnimationGraphPlayer`, peer-entity source mode (v2). Same component, no different schema.

**Same-skeleton** — no component. The component's overhead is paid only when actual retargeting is needed.

## GPU-resident pipeline (v4)

Stages 0-5 of the 6-stage pipeline are GPU-resident by default. The engine's existing infrastructure (`MeshGPURegistry`, `DrawBatchCompactor`, `SkinPaletteAtlas` SSBO, `AnimationComputePass`) is built around GPU-resident skinning; CPU-only retargeting would force a readback that breaks instanced batching.

Output writes directly to `SkinPaletteAtlas`. The existing instanced draw path (`WorldDrawBuilder + DrawBatchCompactor`) consumes the palette unchanged — retargeted instances batch identically to non-retargeted ones, no rasterization-side divergence.

Stage 6 op stack is split: GPU-friendly ops (`AttachmentPassthroughOp`, `LookAtOp`) ship as compute kernels. CPU-resident ops (`FootLockOp` needs terrain query, `BodyIntersectOp` needs SDF) run after a partial readback for the bones they touch.

CPU path stays as a fallback for editor preview, debugging, and the Phase 3 visual-fix ship gate (deterministic + debuggable). Selected via `r.RetargetCPU=1`. CI runs both paths and cross-validates within ≤1e-4° per bone.


## What this gets the user

- **Visual correctness:** Mixamo, Synty, MetaHuman, VRM clips all play correctly on any humanoid target — including the long-broken Synty A-pose-source case.
- **Foot contact:** No more sliding feet across body-proportion mismatches.
- **Attachments:** Cloaks, sheaths, quivers, hair anchors animate correctly on retargeted characters.
- **Open-spec interop:** glTF KHR_humanoid and VRM 1.0 imports work without plugins.
- **Composability:** Retarget is one anim graph node; layered blends and montages compose around it.
- **Authoring workflow:** Body-diagram editor handles the fallback when auto-import gets a corner case wrong.
- **Performance:** Crowd-scene-friendly; ECS-parallel; future-proof for GPU compute.
- **Extensibility:** Op stack registers custom game-specific behaviors without engine recompile.

## What this does *not* do

- Non-humanoid rigs (quadrupeds, tentacles, vehicles). Generic skeleton animation handles those.
- Cloth simulation. Separate Chaos-Cloth-style pass.
- Facial blendshape retargeting. Separate face system; schema reserved.
- Authored Control-Rig-style runtime rigs. Out of scope; retarget is the contract.

## Inventory: new assets, components, files

### Asset types (JSON, GUID-keyed, hot-reload-watched)

| Type | Filename pattern | Where it lives | Purpose |
|---|---|---|---|
| `SkeletonProfile` (default) | `HumanoidStandard.profile.json` | Editor mount: `Apps/Editor/Assets/SkeletonProfiles/HumanoidStandard.profile.json` (repo) → `build/<preset>/bin/<config>/Apps/Editor/Assets/SkeletonProfiles/...` (runtime), resolved via `editor:` alias | Engine-available canonical 60-bone humanoid profile; auto-import default |
| `SkeletonProfile` (custom) | `*.profile.json` | Project mount: `Assets/SkeletonProfiles/<Custom>.profile.json` | User-authored profiles for stylized characters (e.g., `HumanoidElf.profile.json`) |
| `HumanoidRig` | `*.humanoidrig.json` | next to each FBX/glTF, e.g., `Assets/Models/FBXTest/BusinessMale.humanoidrig.json` | Per-mesh metadata: profile ref, bone map, retarget pose, chains, attachments, body proportions |
| `RetargetMap` | `*.retargetmap.json` | `Assets/Animations/Retargeting/<Source>_to_<Target>.retargetmap.json` | Source→target pairing: chain map (per-chain rotation/translation/IK), op stack |

### Cache files (derived; not source-controlled)

| File | Path |
|---|---|
| Baked clip cache | `<projectDir>/.cache/retarget/<SourceRigGUID>/<ClipGUID>.cache.bin` (Formulation A baked rotation keys; rebuilt on rig/clip/retarget-pose change) |

### ECS components

| Component | Purpose |
|---|---|
| `HumanoidRetargeterComponent` | Pure declarative config: `{ Map, SourceClip, ClipTimeSeconds, Enabled, IKEnabled, IKBlendAlpha, AutoBootstrap }`. |

### ECS systems

| System | Purpose |
|---|---|
| `HumanoidRetargetSystem` | Owns runtime retarget state; replaces cross-rig dispatch in `AnimationSystem`; enqueues GPU compute work into render graph; handles CPU-resident op readback. |

### Anim graph nodes

| Node | Purpose |
|---|---|
| `RetargetNode` | Extends `AnimGraphNode`; runs the 6-stage pipeline. Used directly by `AnimationGraphPlayer` for custom graphs; auto-instantiated by the system for component-driven entities. |

### Op stack classes

| Op | Phase | Residency |
|---|---|---|
| `FootLockOp` | 5 (v1) | CPU (terrain query) |
| `AttachmentPassthroughOp` | 5 (v1) | GPU |
| `LookAtOp` | 5b | GPU |
| `BodyIntersectOp` | v2 | CPU (SDF query) |
| `HandLockOp` | v2 | CPU |
| `TwistRedistributeOp` | v2 | GPU |

### Engine primitives (Phase 0)

`EvaluationContext`, `PoseStack`, `AllocationGuard`, `QuaternionConvert`, `Memory::AllocationCategory::Animation`.

### Editor inspectors / panels

Default path is zero manual editing — auto-import + auto-bootstrap cover Mixamo, Synty, MetaHuman, glTF, VRM. Inspectors handle the long tail:

- `RetargetBootstrapBanner` (Phase 2a) — one-click "Clip uses different skeleton" setup; silenceable per-folder.
- `SkeletonProfileInspector`, `HumanoidRigInspector`, `RetargetMapInspector` — Phase 1 read-only (diagnose auto-import output, broken-Map states) → Phase 7b full edit:
  - **`HumanoidRigInspector` (Phase 7b)**: 2D body-diagram with drag-drop bone re-binding; three retarget-pose mode buttons (capture from preview / bake from clip frame N / force bind = retarget pose); attachment authoring dialog; live cross-rig preview.
  - **`RetargetMapInspector` (Phase 7b)**: per-chain mode toggles, IK sliders, op-stack drag-drop with canonical-order warnings.
- Hand-edit JSON always works (hot-reload picks up changes).

When manual editing is needed:
| Situation | Tool |
|---|---|
| Auto-import maps bone wrong | Phase 7b drag-drop in `HumanoidRigInspector` |
| Retarget pose looks off | Phase 7b three-button override |
| Custom op-stack ordering | Phase 7b op-stack editor or JSON |
| Cloak/sheath/quiver anchors | Phase 7b "Add Attachment" dialog or JSON |
| Custom profile for stylized family | Author new `SkeletonProfile` JSON |

### GPU compute shaders (Phase 4)

Under `Engine/Modules/Rendering/Shaders/Animation/`: `retarget_encode.comp`, `retarget_fk_transport.comp` (Mode A+B), `retarget_fk_world_arc.comp` (Mode D), `retarget_translate.comp`, `retarget_ik_goal.comp`, `retarget_two_bone_ik.comp`, `retarget_fabrik.comp`, `retarget_op_attachment.comp`, `retarget_op_lookat.comp`, `retarget_pose_to_palette.comp`.

### Render graph passes (Phase 4)

`AnimationSampleSourcePass`, `RetargetEncodePass`, `RetargetFKPass`, `RetargetIKGoalPass`, `RetargetIKSolvePass`, `RetargetOpStackPass`, `RetargetPoseToPalettePass`.

## Status

**Plan v4 ready for implementation.** Builds on v3's two rounds of Opus 4.7 audits (`audits/round{1,2}-{math,architecture,perf-test}.md`); v4 adds GPU-first pipeline + auto-bootstrap UX + full inventory in response to user feedback.

- Authoritative plan: `Tools/ai/retarget-redesign/plan-v4.md` (diff over v3; reads with v3 + v2 for context on unchanged sections).
- Research: `Tools/ai/retarget-redesign/research/01-04`.
- Audits: `Tools/ai/retarget-redesign/audits/round{1,2}-*.md`.
- Convergent verdict from round-2 audits: **Phase 0 is unblocked TODAY**. Recommended: feature branch + pre-merge diff review.
- Phase 3 (visual fix ship gate) is gated on the v3 math fixes (parent-shift bake, Mode D derivation, Stage 4 character-orientation, Appendix A) — all closed in plan-v3 and inherited by v4.
- Phase 4 (GPU lift) is the new phase that integrates with the existing instanced rendering path via `SkinPaletteAtlas`.
