# HDR Post-Processing User Guide

This guide covers how to use the HDR post-processing system in the Editor: setting up tonemapping, bloom, and exposure through PostProcessVolume components and the render pipeline inspector.

---

## Quick Start

1. Select any entity in the Hierarchy (or create a new empty entity)
2. In the Inspector, click **Add Component** and choose **PostProcessVolume**
3. Adjust the settings:
   - **Exposure**: controls scene brightness (1.0 = default, 2.0 = double brightness)
   - **Bloom Threshold / Strength**: controls glow on bright areas
   - **Tonemap Mode**: choose between ACES, Reinhard, AgX, Filmic, or Neutral

Changes take effect immediately in the viewport.

---

## PostProcessVolume Component

The PostProcessVolume is an ECS component that controls how the final image looks. Add it to any entity in the scene.

### Properties

| Property | Default | Range | Description |
|----------|---------|-------|-------------|
| **Priority** | 0 | any int | Higher priority volumes override lower ones |
| **Weight** | 1.0 | 0.0 - 1.0 | Blend strength when overriding lower-priority volumes |
| **Exposure** | 1.0 | 0.01+ | Multiplier applied to the HDR image before tonemapping. Higher = brighter |
| **Bloom Threshold** | 1.0 | 0.0+ | Luminance level above which pixels contribute to bloom. Lower = more bloom |
| **Bloom Knee** | 0.1 | 0.0 - 1.0 | Softness of the bloom threshold transition |
| **Bloom Intensity** | 1.0 | 0.0+ | Brightness of the extracted bloom |
| **Bloom Strength** | 1.0 | 0.0+ | How much bloom is blended into the final image |
| **Tonemap Mode** | ACES | dropdown | Which tonemapping curve to use |
| **Dither Mode** | Bayer 8x8 | dropdown | Dithering method to reduce color banding |

### Multiple Volumes

You can have multiple PostProcessVolume entities in a scene. They are blended by Priority and Weight:

- Volumes are sorted by **Priority** (lowest first, highest last)
- Each volume blends into the accumulated result using its **Weight**
- Float properties are linearly interpolated
- Enum properties (tonemap mode, dither mode) use the highest-priority volume's value

**Example**: A "base" volume at priority 0 with ACES tonemapping, and a "cinematic" volume at priority 10 with AgX and lower exposure. When the cinematic volume is enabled, it overrides the base.

---

## Tonemap Modes

| Mode | Best For | Character |
|------|----------|-----------|
| **ACES** | General purpose | Warm, filmic look with good contrast. Industry standard |
| **Reinhard** | Soft, natural look | Simple, preserves color ratios. Can look washed out |
| **AgX** | High contrast scenes | Excellent hue preservation. Similar to Blender's default |
| **Filmic** | Cinematic look | Strong contrast, deep blacks. Uncharted 2 style |
| **Neutral** | Debugging | Simple clamp, no curve. Shows raw LDR values |

---

## Bloom Controls

Bloom adds a glow effect around bright areas of the image.

### How to Set Up Bloom

1. Ensure a light source or emissive material creates HDR values > 1.0
2. On the PostProcessVolume, set **Bloom Threshold** to control what's "bright enough" to glow
3. Adjust **Bloom Strength** to control the glow intensity

### Tips

- **Threshold = 0.0**: Everything blooms (artistic choice, can look dreamy)
- **Threshold = 1.0**: Only super-bright pixels bloom (default, subtle)
- **Threshold = 2.0+**: Only extremely bright areas bloom (realistic)
- **Knee** controls the softness of the threshold edge. 0.0 = hard cutoff, 0.5 = very soft transition
- **Strength = 0.0**: Bloom is off (the passes still run but contribute nothing)

---

## Render Pipeline Inspector

The post-processing passes are defined in the render pipeline asset (`ForwardPlus.rendergraph`). You can edit pass parameters directly:

1. Select the `.rendergraph` asset in the Project panel
2. In the Inspector, expand the FullscreenShader passes (BloomThreshold, BloomCombine, Tonemap)
3. Edit the **pushConstants** section to change default values

These defaults are the base values used when no PostProcessVolume exists in the scene. When a PostProcessVolume is present and the pass has `ppOverrides: true`, the volume's values override the JSON defaults.

### Disabling Bloom

To disable bloom entirely (saves GPU bandwidth):

1. Open the `.rendergraph` asset
2. Set the `BloomThreshold`, `BloomBlurH`, `BloomBlurV`, and `BloomCombine` passes to `enabled: false`
3. Change the Tonemap pass's input from `"HDRCombined"` to `"View.Resolve"`

### Disabling Tonemapping

Set the Tonemap pass to `enabled: false`. The viewport will show raw HDR values clamped by the display, which will look washed out but can be useful for debugging.

---

## Debug Modes

The tonemap shader supports debug modes via the `ditherMode` push constant:

| ditherMode | Effect |
|------------|--------|
| 0 | Normal (Bayer 8x8 dithering) |
| 1 | Normal (Blue noise dithering) |
| 97 | Show tonemapped output without sRGB encoding or dithering |
| 98 | Show raw HDR values (no tonemapping, exposure only) |
| 99 | Solid magenta (shader execution test) |

To use a debug mode, set the `ditherMode` push constant in the Tonemap pass via the Render Pipeline Inspector.

---

## Custom Render Pipelines

The post-processing system works with any `.rendergraph` pipeline, not just ForwardPlus. To add post-processing to a custom pipeline:

1. Declare the bloom texture resources in the `resources` section:
   ```json
   "BloomA": {
     "kind": "Texture",
     "scope": "PerView",
     "format": "R16G16B16A16_FLOAT",
     "extent": { "scale": [0.5, 0.5] }
   }
   ```

2. Add FullscreenShader passes in the `passes` array after your world render pass

3. Set `"ppOverrides": true` on passes that should respond to PostProcessVolume

4. Reference the shader packages by name (e.g., `"Shaders/tonemap.shaderpkg"`)

The system is fully modular. You can use just tonemapping without bloom, or add additional custom fullscreen passes.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Scene looks too dark | Exposure too low | Increase PostProcessVolume Exposure |
| Scene looks washed out | No tonemapping | Ensure Tonemap pass is enabled |
| No bloom visible | Threshold too high or no bright pixels | Lower Bloom Threshold or increase light intensity |
| Bloom everywhere | Threshold too low | Increase Bloom Threshold |
| Banding artifacts | Dithering disabled or insufficient | Ensure ditherMode is 0 (Bayer) or 1 (Blue noise) |
| Colors look wrong | Wrong tonemap mode | Try ACES (default) or check outEncoding matches swapchain format |
