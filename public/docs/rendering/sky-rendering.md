# Sky Rendering & Dynamic Environment Lighting

## 1. Goals & Scope

This document describes the design of a flexible, high‑quality sky rendering and dynamic image‑based lighting (IBL) system for the GameEngine rendering pipeline.

Goals:
- Physically‑based sky and atmosphere with high visual quality (Hillaire‑style model).
- Time‑of‑day and weather‑driven appearance, with support for fantasy worlds (multiple suns/moons).
- Dynamic IBL (diffuse irradiance + specular prefilter) generated from the sky and distant environment.
- Clean integration with the existing RenderGraph, PBR, shadows, and HDR/tonemapping.
- A small, authorable C++ API and data model that tools and games can drive and serialize deterministically.

Target platforms: modern PCs and GPUs with compute support. Future fallbacks are out of scope for this initial design but should be enabled by clear abstraction boundaries.


## 2. High‑Level Architecture

The sky system is split into three layers:

1. **Data & API layer**
   - Holds sky parameters, celestial bodies, and derived state (sun/moon directions, etc.).
   - Provides a simple, deterministic C++ API for engines/tools.

2. **Rendering & IBL layer**
   - RenderGraph passes that render the sky to the main view and to a cubemap, then convolve to diffuse and specular IBL.
   - Integrates with the existing PBR pipeline by supplying dynamic irradiance and prefiltered environment maps.

3. **Atmosphere & clouds model layer**
   - GPU shaders and LUTs implementing a Hillaire‑style physically‑based atmosphere model.
   - Optional cloud and weather effects layered on top.

The architecture is designed so that we can start with a simpler sky model (analytic/Tier 0) and progressively reach a full Hillaire implementation without changing public APIs or RenderGraph structure.


## 3. Data Model & API

### 3.1 Core Types

**SkySettings** (CPU + UBO):
- `float timeOfDay;`  // 0–24 hours, optional convenience parameter
- `float latitude, longitude;`
- `float exposureEV;`
- `float turbidity;`
- `float rayleighScaleHeight;`
- `float mieScaleHeight;`
- `float mieAnisotropy;`
- `float ozoneThickness;`
- `glm::vec3 groundAlbedo;`
- Weather knobs: `cloudCoverage`, `cloudType`, `fogDensity`, etc.

**CelestialBodyDesc**:
- `std::string name;`
- `float angularRadius;`  // degrees
- `glm::vec3 color;`
- `float intensity;`
- `float inclination;`
- `float azimuthOffset;`
- `float orbitPeriodHours;`
- Flags: `isEmitter`, `isPrimarySun`, `isMoon`, `isRingSystem`, etc.
- Optional texture handle for rings/asteroid belts.

**SkyEnvironmentState** (derived each frame):
- `glm::vec3 primarySunDirectionWS;`
- `glm::vec3 primaryMoonDirectionWS;`
- `std::vector<glm::vec3> celestialDirectionsWS;`  // for multiple suns/moons, rings.
- Resolved intensities/colors per body.


### 3.2 Time vs Directions & Determinism

We support both **time‑based** and **direction‑based** control:

- High‑level: `timeOfDay`, `latitude`, `longitude` drive an internal astronomical model that computes sun/moon directions for “Earth‑like” worlds.
- Low‑level: games can override and specify arbitrary celestial bodies and directions explicitly (e.g., multiple suns on custom orbits).

For **determinism and save/load**:
- We treat `SkySettings` + the list of `CelestialBodyDesc` + any random seeds as the canonical serialized state.
- The system does *not* read system clock; time progression is driven by the game.
- Recreating the same `SkySettings` and body list yields the same sky and IBL, regardless of frame count.

In the initial implementation we will focus on one primary sun and one primary moon, but the data model is designed to extend to multiple suns and moons without breaking the API.


### 3.3 C++ API Sketch

Example high‑level usage:

```cpp
SkyHandle sky = SkySystem::CreateSky(world);

SkySystem::SetProfile(sky, SkyProfile::EarthDefault());
SkySystem::SetTimeOfDay(sky, 14.5f); // or directly SkySystem::SetSunDirection(...)
SkySystem::SetWeather(sky, SkyWeather::Clear());

CelestialBodyDesc moon = CelestialBodyDesc::CreateMoon();
SkySystem::AddCelestialBody(sky, moon);

SkySystem::EnableDynamicIBL(sky, true);
```

The API should expose:
- Set/Get `SkySettings`.
- Add/Remove/Update celestial bodies.
- Control time progression (advance by delta hours, or set absolute time).
- Enable/disable dynamic IBL and configure update frequency.


## 4. RenderGraph Integration

We introduce the following RG resources and passes:

### 4.1 Textures

- `RGTextureHandle skyViewTex`  (R16G16B16A16_FLOAT, camera resolution)
- `RGTextureHandle skyEnvCube`  (R16G16B16A16_FLOAT, cubemap, e.g. 256–512 per face)
- `RGTextureHandle skyIrradianceCube` (R16G16B16A16_FLOAT or R11G11B10)
- `RGTextureHandle skySpecularCube`   (R16G16B16A16_FLOAT, mipmapped)

These map naturally onto the existing IBLSet concept and can either extend IBLSet or be wrapped into a `DynamicIBL` struct used by PBR.


### 4.2 Passes

1. **SkyViewPass**
   - Inputs: camera matrices, `SkySettings`, `SkyEnvironmentState`, atmosphere LUTs.
   - Output: `skyViewTex`.
   - Renders the sky for the main camera view (optionally directly into the main HDR color target).

2. **SkyEnvironmentCapturePass**
   - Renders the sky (and optionally far static geometry) into `skyEnvCube` via 6 cube faces.
   - Uses the same atmosphere and celestial shaders, with view directions derived from cube face orientations.

3. **SkyDiffuseConvolutionPass**
   - Reads `skyEnvCube`, writes `skyIrradianceCube`.
   - Computes diffuse irradiance via Lambertian convolution (importance sampling or pre‑tiled integration).

4. **SkySpecularPrefilterPass**
   - Reads `skyEnvCube`, writes `skySpecularCube` mips.
   - Uses GGX prefilter (split‑sum approach) consistent with the existing pre‑baked IBL workflow.

5. **(Optional, later) AerialPerspectivePass**
   - Computes a low‑res aerial perspective LUT or full‑screen in‑scattering, used in the main PBR pass.

Environment capture + convolution runs at a configurable frequency (e.g. every N frames or when time/weather change exceeds thresholds). We can optionally blend old and new cubes to avoid popping.


## 5. Atmospheric Model (Hillaire‑Style)

We target a Hillaire‑style physically‑based sky model, with a clear path from a simpler initial implementation to full multi‑scattering:

### 5.1 Tiers

- **Tier 0 – Analytic sky (prototype / fallback)**
  - Simple analytic sky (e.g., Hosek–Wilkie / Preetham‑like) implemented directly in the sky shaders.
  - Sun and moon added as analytic disk emitters.

- **Tier 1 – LUT‑based single scattering**
  - Precompute 2D transmittance LUT and 3D single‑scattering LUTs for Rayleigh and Mie.
  - Approximate multi‑scattering via simple empirical factors.

- **Tier 2 – Full multi‑scattering (Hillaire)**
  - Multi‑pass LUT precomputation (transmittance, single/multi‑scattering, optional aerial perspective).
  - Supports complex atmospheres and very high‑quality twilight and horizon gradients.

The public API and RenderGraph remain stable across tiers; only the internal LUT generation shaders and sky sampling code change.


## 6. Clouds, Weather, and Celestial Bodies

- **Clouds (initial)**: 2D procedural cloud layer sampled in the sky shader, controlled by `cloudCoverage`, `cloudType`, `cloudSpeed`, etc.
- **Clouds (later)**: layered volumetric clouds with limited raymarching, temporal reprojection, and integration with sun/light.
- **Weather**: presets defined as parameter sets over `SkySettings` + cloud parameters (Clear, Overcast, Storm, Hazy Sunset, etc.).
- **Celestial bodies**: moons, rings, and asteroid belts represented by `CelestialBodyDesc` with analytic or texture‑mapped geometry, rendered in the sky shaders.


## 7. Dynamic IBL & PBR Integration

The PBR forward pass will be extended to bind:
- `skyIrradianceCube` (diffuse IBL)
- `skySpecularCube` (specular prefiltered env)

These replace or augment pre‑baked IBLs in existing demos. The BRDF LUT and shading conventions remain as they are today; we only change the source of the environment lighting.


## 8. Implementation Roadmap & Status

1. Implement data model and APIs (SkySettings, CelestialBodyDesc, SkySystem service).
   - **Status**: Implemented in `Engine/Modules/Rendering/Include/Rendering/Sky/SkySettings.h` and `SkySystem.h` for the WindowPBR_RG_Demo.
2. Add SkyViewPass and integrate background rendering into WindowPBR_RG_Demo.
   - **Status**: Implemented. The analytic sky is rendered into the main HDR buffer in `WindowPBR_RG_Demo.cpp` before PBR.
3. Add SkyEnvironmentCapturePass + diffuse/specular convolution, wire to PBR as dynamic IBL.
   - **Status**: Implemented for the demo using:
     - `SkyEnvCube_*` passes (6 faces) rendering the analytic sky into a cube texture.
     - `sky_diffuse_convolve.comp` → `SkyIrradiance_Cube` (diffuse IBL).
     - `sky_specular_prefilter.comp` → `SkySpecular_Cube` (specular IBL with mips).
     - PBR pass binding the dynamic cubes (with baked IBL as fallback).
4. Implement Tier 0 analytic sky for fast end‑to‑end validation.
   - **Status**: Implemented via `sky_analytic.frag`, `sky_analytic_env.frag`, and `sky_analytic_cube.frag`.
5. Replace Tier 0 with Tier 1 LUT‑based Hillaire‑style atmosphere (single scattering now, with room for approximate multi‑scattering later).
   - **Status**: Implemented for the `WindowPBR_RG_Demo`: a Tier 1 path exists using a shared `AtmosphereUBO`, a `Sky_Transmittance_LUT` computed by `sky_transmittance_lut.comp`, and `sky_tier1.frag`. LUT mapping and optical depth integration are still being refined; multi‑scattering remains future work before Tier 1 can replace Tier 0 by default.
6. Extend with clouds and basic weather presets.
   - **Status**: **Not started**; design hooks exist in `SkySettings` but no rendering yet.
7. Consider Tier 2 multi‑scattering and volumetric effects as a later phase.
   - **Status**: **Not started**.

## 9. Current Implementation Status (WindowPBR_RG_Demo)

The WindowPBR_RG_Demo currently implements a Tier 0 analytic sky with fully wired dynamic IBL:

- **Sky data & time‑of‑day**
  - `SkySettings` and `SkySystem` drive sun/moon directions from a simple time‑of‑day model.
  - The active light (sun vs moon) is chosen automatically based on horizon threshold and feeds both the sky and the main directional light.

- **View rendering (SkyViewPass)**
  - The analytic sky is rendered into the main HDR color target before the PBR pass.
  - The sun disk and halo are aligned with the directional light direction.

- **Dynamic environment capture**
  - A persistent cubemap `SkyEnv_Cube` (256x256, 6 faces) stores the sky rendered from the origin.
  - Six RenderGraph passes (`SkyEnvCube_PosX/NegX/PosY/NegY/PosZ/NegZ`) render each cube face using `sky_analytic_cube.frag`.
  - The RenderGraph infers cube‑compatible textures when `arrayLayers == 6`, `width == height`, and `sampleCount == 1`.

- **Diffuse & specular convolution**
  - `sky_diffuse_convolve.comp` writes a low‑res irradiance cubemap `SkyIrradiance_Cube` (64x64, 6 faces).
  - `sky_specular_prefilter.comp` writes a mip‑mapped specular cubemap `SkySpecular_Cube` (256x256 base, 5 mips) using GGX importance sampling.

- **PBR integration & bindings**
  - PBR uses the dynamic cubes when available:
    - Binding 11: lat‑long dynamic environment (`SkyEnv_LatLong`, 2D) – still available as a debug/fallback path.
    - Binding 12: diffuse IBL cube (dynamic sky or baked IBL set).
    - Binding 13: specular IBL cube (dynamic sky or baked IBL set).
  - If the dynamic cubes are invalid, the demo falls back to a neutral baked IBL set.

- **Known technical notes**
  - Vulkan validation is clean for the new passes; previous `baseArrayLayer == 6` errors were fixed by capturing face indices by value and ensuring proper subresource transitions.
  - The engine still reports some shutdown‑time image‑view leaks (pre‑existing); the sky/IBL path contributes a few more transient views and could benefit from small view‑caching helpers.

- **Short‑term runtime features (implemented)**
  - Runtime IBL mode toggle in the demo (key **I**) to switch between **baked IBL**, **lat‑long dynamic IBL**, and **cubemap‑based dynamic IBL**.
  - Sky IBL update cadence control:
    - The cubemap + convolution chain only runs when the IBL mode is dynamic (LatLong/Cubemap) **and** either a minimum time‑of‑day delta is exceeded or a manual refresh is requested.
    - Time‑of‑day threshold and frame spacing are currently hard‑coded in the demo (good prototypes for future engine‑level policy).
  - Manual sky IBL refresh toggle (key **U**) that forces the environment capture + convolution to run on the next frame.

- **Tier 1 (in progress – prototype wired)**
  - Added a persistent **Sky_Transmittance_LUT** texture (256x64, `R16G16B16A16_FLOAT`, UAV + SRV) and a compute pass `SkyTransmittanceLUT` driven by `sky_transmittance_lut.comp`.
  - Introduced a Tier 1 sky shader `sky_tier1.frag` that samples the transmittance LUT and uses a simple single‑scattering approximation on top of the existing `SkyUBO`.
  - Added a runtime **sky tier toggle** (key **T**) that switches between **Tier 0 analytic** (`sky_analytic.frag`) and **Tier 1 LUT‑based** sky in the main `SkyView` pass.
  - Tier 1 is deliberately approximate right now – it is meant to validate the data flow (LUT resource, compute pass, bindings, toggle) and provide a visual starting point for a proper Hillaire‑style implementation.

- **Next steps (short‑ to mid‑term)**
  - Refine the transmittance LUT encoding/decoding to more closely match Hillaire (better `(mu, r)` mapping, height handling, and optical depth integration), and factor in view zenith vs sun zenith properly.
  - Expose the existing atmosphere parameter block (rayleigh/mie coefficients, scale heights, planet radius, etc.) through a proper engine‑level sky API (profiles/presets) instead of keeping it demo‑local in WindowPBR_RG_Demo.
  - Start planning a follow‑up **inscattering / multi‑scattering** step once the Tier 1 transmittance and direct single‑scattering visuals are solid.


