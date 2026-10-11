# InputSystem Module Design

## Goals

- Centralize input handling for both **editor** and **runtime/game**.
- Support **both polling and callback-based** consumption.
- Provide a flexible **action mapping layer**:
  - Named actions (e.g. `Editor.SceneView.MoveForward`).
  - Bindings to physical inputs (keys, mouse buttons, axes, gamepad controls).
  - Allow **rebinding at runtime** and **persisting** profiles.
- Allow multiple **input contexts** (Editor vs Game, overlays, modal dialogs).
- Live in its own module: `Engine/Modules/Input`, so **UI** and **Engine** can depend on it, and it can depend on **Platform** (for raw events) and **Types**.

---

## Architecture Overview

Layers:

1. **Raw input layer** (device-centric)
   - Feeds key/mouse/gamepad events from `Platform::Window` into the InputSystem.
   - No knowledge of actions or contexts.

2. **State layer** (polling)
   - Tracks per-frame state for keys/buttons and axes:
     - `IsKeyDown`, `WasKeyPressed`, `WasKeyReleased`.
     - Mouse position and wheel.
   - Provides snapshot-style polling APIs for systems that want to read directly.

3. **Action & mapping layer**
   - Defines **named actions** and **axes**.
   - Maps them to one or more physical inputs (with optional scale, deadzones, etc.).
   - Computes per-frame `ActionState` (pressed / justPressed / justReleased / value).

4. **Context & routing layer**
   - Groups actions into **contexts** (e.g. `Editor.SceneView`, `Gameplay`, `DebugOverlay`).
   - At runtime, one or more contexts are **active**; only active contexts produce action events.
   - Supports **stacking/priority** (e.g. modal dialog can block gameplay actions) and **consumption** (higher-priority contexts can "eat" actions so lower-priority ones do not see them).

5. **Consumers**
   - **Editor**: Scene View / EditorCamera, gizmo tools, menus.
   - **Game runtime**: gameplay systems.
   - **UI**: can either:
     - Continue using its own UIEvents (current design), or
     - Subscribe to InputSystem actions where needed (e.g. global shortcuts).

---

## Module Placement and Dependencies

- New module: `Engine/Modules/Input`
  - `Include/Input/*.h` for public API.
  - `Source/*.cpp` for implementation (can be added incrementally).
- Dependencies:
  - Depends on `Engine/Modules/Types` for basic math/types if needed.
  - Depends on `Engine/Modules/Platform` for key codes and window integration.
- Consumers:
  - **Apps/Editor**: owns an `InputSystem` instance and wires it to each `Platform::Window`.
  - **Engine/Modules/UI**: can query or subscribe to input for higher-level features.

We do **not** need to fully switch UI over immediately; we can introduce the module and start using it in the editor first (Scene View, camera controls).

---

## Core Types (Conceptual)

```cpp
namespace GameEngine { namespace Input {

using InputId = std::uint64_t;

// Simple constexpr FNV-1a 64-bit hash for input ids (actions, contexts).
constexpr InputId HashInput(std::string_view sv) {
    constexpr InputId kFnvOffset = 14695981039346656037ull;
    constexpr InputId kFnvPrime  = 1099511628211ull;
    InputId hash = kFnvOffset;
    for (char c : sv) {
        hash ^= static_cast<unsigned char>(c);
        hash *= kFnvPrime;
    }
    return hash;
}

using ActionId  = InputId;   // e.g. HashInput("Editor.SceneView.MoveForward")
using ContextId = InputId;   // e.g. HashInput("Editor.SceneView")

enum class DeviceType { Keyboard, Mouse, Gamepad, Unknown };

// For now we can reuse GLFW key codes and mouse buttons as integers.
using KeyCode   = int;
using MouseCode = int;

// Generic pointer index for multi-touch or mouse pointers (0 = primary mouse).
using PointerId = std::uint32_t;

struct ActionState {
    bool  pressed      = false; // currently down
    bool  justPressed  = false; // pressed this frame
    bool  justReleased = false; // released this frame
    float value        = 0.0f;  // for axes (e.g. -1..1, scroll delta)
};

struct ActionBinding {
    DeviceType device = DeviceType::Keyboard;
    int        code   = 0;      // key/button/axis code (GLFW or engine code)
    float      scale  = 1.0f;   // for analog axes

    // Optional chord requirements (modifier keys).
    // - requiredMods: must be present (e.g. Shift)
    // - forbiddenMods: must NOT be present (e.g. forbid Shift so plain 'A' doesn't
    //   also fire when Shift+A is intended)
    int        requiredMods = 0;
    int        forbiddenMods = 0;
};

struct ActionDesc {
    ActionId                     id;
    std::vector<ActionBinding>   bindings;
    bool                         isAxis = false; // value-based vs boolean
};


// Notes on modifier chords:
// - Bindings are OR'd within an action, but each binding can additionally require
//   a modifier mask (Shift/Ctrl/Alt/Super).
// - This keeps existing single-key bindings working, while allowing shortcuts
//   like Shift+A or Ctrl+Shift+P.
struct ActionEvent {
    ActionId    id;
    ActionState state;
    bool        consumed = false; // listeners can mark to stop propagation
};

using ActionCallback = std::function<void(ActionEvent&)>;

}} // namespace GameEngine::Input
```

---

## InputSystem API (Sketch)

We expose one main class in `InputSystem.h`:

```cpp
namespace GameEngine { namespace Input {

class IRawInputSink {
public:
    virtual ~IRawInputSink() = default;

    virtual void OnKey(int key, int action, int mods) = 0;
    virtual void OnChar(unsigned int codepoint) = 0;
    virtual void OnMouseButton(int button, bool down) = 0;
    virtual void OnMouseMove(float x, float y) = 0;
    virtual void OnMouseScroll(float dx, float dy) = 0;

    // Generic pointer input (mouse or touch). PointerId 0 is conventionally the mouse.
    virtual void OnPointerDown(PointerId id, float x, float y) {}
    virtual void OnPointerUp(PointerId id, float x, float y) {}
    virtual void OnPointerMove(PointerId id, float x, float y) {}
};

class InputSystem : public IRawInputSink {
public:
    struct ListenerHandle { uint32_t id = 0; }; // opaque

    // Per-frame update (computes justPressed/justReleased, clears transient state)
    void Update(float deltaTime);

    // --- Raw polling layer ---
    bool IsKeyDown(KeyCode key) const;
    bool WasKeyPressed(KeyCode key) const;
    bool WasKeyReleased(KeyCode key) const;

    std::pair<float,float> GetMousePosition() const;
    bool IsMouseButtonDown(MouseCode button) const;

    // --- Action registration & mapping ---
    void RegisterAction(const ContextId& context, const ActionDesc& desc);
    void RemoveAction(const ContextId& context, const ActionId& id);

    void BindKey(const ContextId& context, const ActionId& id, const ActionBinding& binding);
    void ClearBindings(const ContextId& context, const ActionId& id);

    // --- Context management ---
    void PushContext(const ContextId& context);
    void PopContext(const ContextId& context);
    void SetContextEnabled(const ContextId& context, bool enabled);

    // --- Action polling ---
    ActionState GetActionState(const ActionId& id) const; // searches active contexts
    bool IsActionActive(const ActionId& id) const;
    bool WasActionTriggered(const ActionId& id) const; // justPressed or similar

    // --- Callbacks ---
    ListenerHandle AddActionListener(const ActionId& id, ActionCallback cb);
    void RemoveActionListener(ListenerHandle handle);

    // --- Persistence (sketch) ---
    bool SerializeBindingsToJson(std::string& outJson) const;
    bool DeserializeBindingsFromJson(const std::string& json);

    // IRawInputSink implementation (called from Platform::Window)
    void OnKey(int key, int action, int mods) override;
    void OnChar(unsigned int codepoint) override;
    void OnMouseButton(int button, bool down) override;
    void OnMouseMove(float x, float y) override;
    void OnMouseScroll(float dx, float dy) override;
};

}} // namespace GameEngine::Input
```

The **polling** side covers `IsKeyDown` / `IsActionActive`, while the **callback** side lets systems subscribe to specific actions (`AddActionListener`).

---

## Editor Integration (Scene View & EditorCamera)

### Wiring Platform -> InputSystem

Today, `EditorApplication` routes `Platform::Window` events directly into `UIManager`:

- `SetMouseMoveHandler` → `ui->OnMouseMove`
- `SetMouseButtonHandler` → `ui->OnMouseButton`
- `SetCharHandler` → `ui->OnChar`
- `SetKeyHandler` → `ui->OnKey`

With `InputSystem`, the plan is:

- `EditorApplication` owns an `Input::InputSystem` instance per editor process (or per window if needed later).
- Each `Platform::Window` forwards to **both**:
  - `inputSystem.OnKey/OnMouse*` for global action mapping.
  - `ui->OnKey/OnMouse*` for UI-specific behavior (hover, focus, text fields).

This keeps UI behavior unchanged while letting us layer action mapping on top.

### Scene View actions (examples)

Proposed action & context names (string-based for flexibility):

- Context: `"Editor.SceneView"`
- Actions:
  - `"Editor.SceneView.Look"`          → RMB drag
  - `"Editor.SceneView.Orbit"`        → MMB drag
  - `"Editor.SceneView.Pan"`          → Shift+MMB drag (future)
  - `"Editor.SceneView.MoveForward"`  → W
  - `"Editor.SceneView.MoveBackward"` → S
  - `"Editor.SceneView.MoveLeft"`     → A
  - `"Editor.SceneView.MoveRight"`    → D
  - `"Editor.SceneView.Focus"`        → F (future picking integration)
  - `"Editor.SceneView.ToggleGrid"`   → G

`SceneViewPanel` (or an `EditorCameraController` helper) would then:

- On update, poll `InputSystem`:
  - `IsActionActive(HashInput("Editor.SceneView.MoveForward"))` etc.
  - `GetActionState(HashInput("Editor.SceneView.Look"))` for mouse-drag state.
- Optionally register callbacks for one-shot actions:
  - `AddActionListener(HashInput("Editor.SceneView.Focus"), ...)`.

This removes the need for SceneView to hand-roll its own WASD tracking and instead delegates to the shared module.

---

## Rebinding and Persistence

- Input bindings are stored as data (`ActionDesc` + bindings) inside `InputSystem`.
- We expose simple JSON-based serialization for now, so editor tools can:
  - Save current bindings to disk (per-profile, per-project).
  - Load bindings at startup or when the user switches profiles.
- Longer term, bindings can be backed by an asset (`InputProfileAsset`) identified via `GUID`, similar to UI layouts/styles.

---

## Next Steps

1. Create `Engine/Modules/Input/Include/Input/InputSystem.h` with the above API skeleton.
2. Add a minimal `Source/InputSystem.cpp` that implements **no-op or minimal state**, just enough to compile and start threading it into `EditorApplication`.
3. Prototype Scene View integration by replacing the current WASD/drag state with calls into `InputSystem` while keeping UI events for focus/hover.
4. Iterate on details (naming, context semantics, JSON format) once we see this in use in the editor.

