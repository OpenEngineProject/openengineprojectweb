# GPU Debugging and Profiling

The engine integrates with the major GPU capture and profiling tools used for Vulkan development.

## Debugging and profiling tools

- **RenderDoc** — programmatic frame captures straight from the editor's debug server: one command launches the editor under RenderDoc, triggers a capture, and lands the `.rdc` in a deterministic location. Headless capture analysis is included.
- **NVIDIA Nsight Graphics** — in-app capture through the NGFX SDK, so the engine can request its own captures while running under Nsight's injection.
- **NVIDIA Nsight Systems** — every engine profiling scope emits NVTX ranges. Attach `nsys` to any build and get the full frame structure on the timeline, with named zones and no special build required.
- **AMD Radeon GPU Profiler** — capture orchestration is wired and vendor-gated, ready for Radeon hardware.

GPU debug labels live in every build configuration, including optimized builds where performance investigations actually happen. Use the one-call GPU tooling preflight to report which tools are attached, so measurements never silently run through a capture layer.

The rule is simple: measure, then optimize. At 110K instances the engine was CPU main-thread bound; halving GPU frame time moved frame rate by only 0.1%. Honest measurement redirected weeks of potential shader tuning in one afternoon.

## RenderDoc

Run `launch_editor renderdoc=true` to launch the staged editor under RenderDoc. After the editor is ready, call `trigger_capture`; it returns the capture path once RenderDoc has finished writing. Captures land at `<editor exe dir>/Captures/editor_frameN.rdc`, unless `GE_RENDERDOC_CAPTURE_DIR` or the launch command's `captureDir` overrides the location.

For headless analysis, drive `qrenderdoc --python <script>` over the `.rdc`. On a fresh profile, dismiss or pre-seed qrenderdoc's analytics dialog before running scripted analysis.

## Radeon GPU Profiler

The RGP capture path is AMD-only and refuses on non-Radeon hardware. It requires an AMD Radeon GPU, a developer-mode driver, and the Radeon Developer Tool Suite. Use the GPU tooling preflight before invoking a capture so the detected vendor and debug-label state are visible.

See the [GPU debugging guide source](https://github.com/Lunarsong/GameEngine/blob/main/Tools/ai/specs/gpu-debugging-guide.md) for the complete workflow and troubleshooting notes.
