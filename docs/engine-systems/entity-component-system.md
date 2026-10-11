# Entity Component System

Open Engine uses a data-oriented Entity Component System as its default runtime model. Entities
identify objects, components hold data, and systems process matching component sets.

## Core model

- Components are registered by type and stored in archetype-oriented data structures.
- Queries select the component combinations a system needs.
- Structural changes can be queued through command buffers.
- Batch creation and reservation APIs are available for workloads that create many entities.
- C++20 templates provide type-safe component access without requiring a central hand-written
  switch for every component type.

## Typical use

```cpp
struct Position {
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
};

world.registerComponent<Position>();
auto entity = world.create();
entity.set(Position{1.0f, 2.0f, 3.0f});

world.query<Position>().each([](auto, Position& position) {
    position.y += 1.0f;
});
```

## Performance guidance

Use batch APIs, reserve expected capacity, and measure representative project workloads before
choosing an optimization. Benchmark results depend on platform, build configuration, component
layout, and workload, so this public reference intentionally does not publish unversioned headline
numbers.

## Development status

The ECS is an active part of the engine and continues to evolve with the editor, rendering,
physics, audio, input, and gameplay systems. Consult the current source and tests for exact API
availability before relying on a specific method in production code.
