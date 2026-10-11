### Customizable Render Pipeline Guide (RenderGraph Asset)

This guide explains how to **use** the new data-driven render pipeline system and how to **extend** it with new pass types.

---

### What you get

- **A new asset type**: `RenderPipeline` (`.rendergraph`)
- **A runtime pipeline system** in `RenderServices` that:
  - Loads + compiles the pipeline asset into persistent `RenderGraph` passes/resources
  - Only rebuilds when the pipeline content changes (hash-based)
- **Editor SceneView integration**:
  - Scene renders through the active pipeline
  - Editor gizmos render **after** the pipeline, on top of its **`FinalColor`** output
- **MVP pass types**:
  - `WorldRender` (wraps world/entity rendering)
  - `FullscreenShader` (generic fullscreen graphics shader node)
  - `ComputeShader` (generic compute dispatch node)

---

### Where the default pipeline lives

- Default pipeline asset path (relative to asset root):
  - `RenderPipelines/Default.rendergraph`

In the repo, it exists at:
- `Assets/RenderPipelines/Default.rendergraph`

For the Editor, this folder is staged into the Editor's runtime `Assets/` folder on build.

---

### How the pipeline is used at runtime

#### How it is invoked each frame (ECS)

`RenderGraphBuildSystem` now calls:
- `RenderServices::EnsureActiveRenderPipelineBuilt(*rg)`

That ensures the pipeline's passes/resources exist in the current `RenderGraph` before `rg->Compile()/Execute()`.

#### How to switch the active pipeline

Call:
- `RenderServices::SetActiveRenderPipelinePath("RenderPipelines/MyPipeline.rendergraph");`

**Notes**
- This forces a rebuild on the next `EnsureActiveRenderPipelineBuilt(...)`.
- The path can be relative to the asset root (recommended) or absolute.
- The Editor also reads `rendering.activeRenderPipeline` from `<ProjectRoot>/.Editor/ProjectSettings.json` on startup.

---

### How SceneView (Editor) composes with gizmos

SceneView does:
- Allocate logical targets (`SceneView.ColorMSAA`, `SceneView.Color`, `SceneView.Depth`)
- `SetViewTargetsFromRefs(...)`
- `EnsureActiveRenderPipelineBuilt(rg)` schedules pipeline passes
- Gizmo overlay attaches:
  - **Color**: pipeline output `FinalColor` (falls back to `SceneView.Color`)
  - **Depth**: `SceneView.Depth` read-only (depth-testing against the scene)

Pipeline passes default to `kWorldRender` phase (100). The gizmo overlay is at `kOverlay` (300), UI at `kUI` (400), sRGB encode at `kFinalize` (500), and Present at `kPresent` (600). This phase ordering guarantees "world first, gizmos on top, UI last" without relying on pass creation order.

---

### RenderPipeline asset format (schemaVersion 2)

The asset is JSON. Minimal example that reproduces current behavior:

```json
{
  "schemaVersion": 2,
  "pipelineName": "Default",
  "passes": [
    { "id": "World", "type": "WorldRender", "enabled": true }
  ],
  "outputs": {
    "FinalColor": "View.Resolve"
  }
}
```

#### Required fields

- **`schemaVersion`**: must be `2`
- **`passes`**: array of pass objects

#### Recommended fields

- **`pipelineName`**: used for stable pass/resource naming and debugging
- **`outputs`**: name -> resource reference mapping (see below)

#### Pass ordering fields (optional)

Each pass entry supports optional ordering fields that control how the pass is scheduled relative to other passes:

- **`phase`**: string or integer. Controls coarse categorical ordering. Named values: `"EarlySetup"` (0), `"WorldRender"` (100, default), `"PostProcess"` (200), `"Overlay"` (300), `"UI"` (400), `"Finalize"` (500), `"Present"` (600). Custom integer values are accepted for intermediate phases (e.g., 150 for a pass between WorldRender and PostProcess).
- **`tags`**: array of strings. Tags this pass carries. Other passes can declare ordering dependencies on these tags.
- **`after`**: array of strings. Tag names this pass should run after. Creates ordering edges to all enabled passes carrying those tags.

Example with ordering:

```json
{
  "id": "LightCull",
  "type": "ComputeShader",
  "phase": "EarlySetup",
  "tags": ["light_culling"],
  "cs": "clustered_light_cull.comp.spv"
}
```

```json
{
  "id": "World",
  "type": "WorldRender",
  "after": ["light_culling"]
}
```

For details on the three-layer ordering system (phases, explicit edges, resource dependencies), see `Engine/Modules/Rendering/docs/RenderGraph_Architecture.md`.

---

### Resource references

Many node fields refer to textures/buffers via a string "ref".

#### Built-in view refs

- **`View.Color`**: view's color attachment
- **`View.Depth`**: view's depth attachment
- **`View.Resolve`**: view's resolve attachment (or `View.Color` if no explicit resolve)

#### Pipeline-defined resources

You can declare textures/buffers in `resources` and reference them by name. The pipeline runtime creates them as **logical RenderGraph resources**.

**MVP resource schema** (minimal; validation is intentionally light right now):

```json
{
  "resources": {
    "SceneColor": {
      "kind": "Texture",
      "scope": "PerView",
      "format": "RGBA8_UNORM",
      "usage": ["RenderTarget", "ShaderResource"],
      "sampleCount": 1,
      "extent": { "scale": [1.0, 1.0] }
    }
  }
}
```

Supported texture `format` strings (MVP):
- `RGBA8_UNORM`, `RGBA8_SRGB`, `BGRA8_UNORM`, `BGRA8_SRGB`, `R16G16B16A16_FLOAT`, `D24_UNORM_S8_UINT`, `D32_FLOAT`

**Important MVP limitation**
- Relative sizing currently uses the graph's backbuffer as the reference. This is good enough for many cases but not yet fully "relative to view target".

---

### Pass types (MVP)

#### `WorldRender`

Schedules world/entity rendering for each active view. Keywords control which shader
variant is used for all draws in the pass.

Optional fields:
- `keywords` (string array) — pass-level shader keywords, e.g. `"ForwardPlus"`, `"Instanced"`

Example:

```json
{ "id": "World", "type": "WorldRender", "enabled": true, "keywords": ["Instanced"] }
```

#### `FullscreenShader`

Generic fullscreen draw that:
- Attaches a color output (`output`)
- Declares input texture reads in RenderGraph (`inputs`)
- Uses `.shaderdesc` (preferred) to bind **set 0** combined image samplers by **binding name**

Example (tonemap-like):

```json
{
  "id": "Tonemap",
  "type": "FullscreenShader",
  "enabled": true,
  "inputs": { "HDRColor": "SceneColor" },
  "output": "View.Resolve",
  "shaderDesc": "tonemap.shaderdesc",
  "stages": {
    "vs": "fullscreen_noinput.vert.spv",
    "fs": "tonemap.frag.spv"
  }
}
```

Notes / limitations:
- Currently binds **only set 0**.
- Currently uses a single built-in sampler preset (linear clamp).
- Push constants are not driven from node JSON yet (future extension point).

#### `ComputeShader`

Generic compute dispatch. Optional targets can be declared so RenderGraph tracks write hazards:
- `targetTexture` (ref)
- `targetBuffer` (ref)

Example:

```json
{
  "id": "MyCompute",
  "type": "ComputeShader",
  "enabled": true,
  "cs": "ubo_copy.comp.spv",
  "shaderDesc": "minimal_compute.shaderdesc",
  "dispatch": { "x": 8, "y": 8, "z": 1 },
  "targetBuffer": "SomeBuffer"
}
```

Notes / limitations:
- Descriptor binding is not yet generalized for compute nodes (works for "no-input" or bindless-style compute).

---

### Extending the system

#### Add a new node type

1) **Create a node class** implementing `IRenderPipelineNode`:
- `Initialize(nodeId, nodeJson, outError)`
- `EnsureBuilt(instance, ctx)`

2) **Register it** in `RenderServices::Initialize()` via the node registry:
- `m_pipelineNodeRegistry->Register("MyNodeType", factory, perView)`

3) **Use the instance helpers** to keep performance stable:
- `RenderPipelineInstance::GetOrCreateGraphicsPass(...)`
- `RenderPipelineInstance::GetOrCreateComputePass(...)`
- `RenderPipelineInstance::ResolveTextureRef(viewId, "SomeRef")`
- `RenderPipelineInstance::ResolveBufferRef(viewId, "SomeRef")`

4) In your pass setup:
- Attach outputs via `b.AttachColor(...)`, `b.AttachDepth(...)`, etc.
- Declare reads/writes via `b.ReadTexture(...)`, `b.WriteTexture(...)`, `b.ReadBuffer(...)`, `b.WriteBuffer(...)`

**Rule of thumb**: do not call `RenderGraph::CreatePass(...)` every frame for stable nodes -- always cache via `GetOrCreate*Pass`.

#### Add a new output name

In the asset:

```json
{
  "outputs": {
    "FinalColor": "View.Resolve",
    "SceneColor": "SceneColor"
  }
}
```

At runtime/editor:
- `RenderServices::GetActivePipelineOutputTextureRef(viewId, "SceneColor")`

#### Add validation for node inputs/materials

The current MVP already:
- Validates `ShaderMeta` (push constant limits, etc.) for `FullscreenShader`
- Warns if `inputs` names don't exist as bindings in the shader's `.shaderdesc`

To extend validation further:
- Prefer `.shaderdesc` (`ShaderDescEnvelope`) and validate via `ValidateShaderMeta`.
- For nodes that reference a `.material`, validate material properties/textures against meta using:
  - `ValidateMaterialAgainstMeta(meta, input)`

---

### Troubleshooting

- **Pipeline not found / doesn't load**:
  - Ensure the file exists under the runtime `Assets/` folder and has a `.meta` with `type: RenderPipeline` (recommended for stable GUIDs).
- **Fullscreen shader inputs don't work**:
  - Ensure your `.shaderdesc` uses matching **binding names** for set 0 (e.g., `HDRColor` in `tonemap.shaderdesc`).
- **No post effect visible**:
  - Confirm your node is `enabled: true` and its `output` is `View.Resolve` (or is referenced by `outputs.FinalColor`).
