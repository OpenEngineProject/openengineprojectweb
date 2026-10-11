# GameEngine Scripting and Hot Reload: Architecture Overview

This document describes how the Scripting, CoreBridge, and HotReload subsystems fit together after the recent cleanup. It is intended as an up‑to‑date, high‑level guide for contributors and reviewers.

## Quick mental model
- Native Engine embeds the .NET runtime (CoreCLR) using hostfxr and exposes a stable C ABI (Scripting ABI)
- Managed CoreBridge exposes UnmanagedCallersOnly entry points consumed by native
- Managed HotReload is a core, always‑loaded assembly that orchestrates loading/unloading the user Scripts assembly
- Scripts is the user code assembly that is hot‑reloadable via a collectible AssemblyLoadContext

```
Engine (C++) ── hostfxr  CoreCLRHost ── CoreBridge (C#) ─ HotReload (C# core)
                                               │                     │
                                               └─────── Scripts (C# user, collectible)
```

## Repos and paths
- Managed/CoreBridge/ … GameEngine.CoreBridge.dll (managed façade and ABI surface)
- Managed/HotReload/  … GameEngine.HotReload.dll (core infrastructure; never unloaded)
- Assets/             … Authoring source for user scripts (copied next to the editor/runtime under build/bin/<Config>/Assets)
- build/bin/<Config>/ScriptAssemblies/ … Auto-generated GameEngine.Scripts.csproj and GameEngine.Scripts.dll (user scripts; hot‑reloaded)
- Tests/ManagedTestAssemblies/DomainRoutingTest/ … Canonical test assembly for domain isolation and ABI exercises

Path resolution at runtime is centralized in Engine/Source/Scripting/PathResolver.cpp and falls back to:
- build tree bin dirs, then source tree managed bin dirs
- configurable overrides via project/native context when needed

## Key components
- CoreCLRHost (C++):
  - Initializes CoreCLR via hostfxr
  - Loads CoreBridge and resolves UCO entry points
  - Calls into HotReload pipeline to load/unload Scripts
  - Provides token path (QueryExport, InvokeByToken) and helpers
- Scripting ABI (C++): stable C interface shared with managed side; thin wrapper around CoreBridge UCOs
- CoreBridge (C#):
  - UnmanagedCallersOnly functions: Initialize, AcceptPackage, LoadUserScriptsAssembly, QueryExport, InvokeByToken, UnloadDomain, perf/diagnostics helpers, etc.
  - Delegates to HotReloadManager for actual work
- HotReloadManager (C#):
  - Maintains stable AppDomain/ALC for core and collectible ALC for Scripts
  - Implements preload/swap/unload; maintains per‑domain token caches and perf counters
- Scripts assembly (C#, GameEngine.Scripts.dll):
  - User code compiled from Assets/**/*.cs into build/bin/<Config>/ScriptAssemblies/GameEngine.Scripts.dll
  - Standard entry point type is GameEngine.Scripts.ScriptsEntryPoint with OnAssemblyLoaded/OnAssemblyUnloading defined in user/test code (e.g., Assets or a dedicated test assembly), not in engine-owned source
  - Any public static methods can be invoked by name or token

## Hot reload lifecycle (runtime)
1) Engine starts CoreCLRHost with a .runtimeconfig.json (resolved via PathResolver)
2) CoreCLRHost resolves CoreBridge and calls CoreBridge.Initialize
3) When asked to load Scripts, CoreCLRHost calls CoreBridge.LoadUserScriptsAssembly(pathUtf8)
4) CoreBridge hands off to HotReloadManager which loads the DLL into a collectible ALC, calls ScriptsEntryPoint.OnAssemblyLoaded()
5) Engine invokes methods by token or name via CoreBridge; tokens are stable within a managed domain
6) On swap/unload, HotReloadManager unloads the collectible ALC, calls OnAssemblyUnloading(), and clears caches

## Error/result codes (aligned across native/managed)
- 0 … Ok
- -1 … Generic failure (unspecified)
- -2 … InvalidArg
- -3 … NotFound (e.g., method not found)
- -4 … NotInitialized (e.g., swap without prior preload)

These map to GE_Result_* in native and ScriptingOpResult in managed.

## Token API
- QueryExport(domain, "MethodName") → uint64 token
- InvokeByToken(domain, token) → int32 result
- Name invoke path exists primarily for tests and bootstrap; production code should prefer tokens

## Diagnostics and metrics
- CoreBridge exposes counters and diagnostics subscriptions (compilation events, reload events)
- Tests read these via UnmanagedCallersOnly methods: GetPerfCounters, ResetPerfCounters, packed counters, etc.

## What we removed or deprecated
- ComponentEntryPoint: legacy string‑based command path, fully removed from managed. Native leftovers cleaned up; CoreCLRHost no longer caches any ComponentEntryPoint delegates.
- Earlier shadow-copying and bootstrap hot-reload documentation is historical; the collectible AssemblyLoadContext and ScriptAssemblies pipeline described here is the current path.
- Sandbox and legacy demo folders were deleted; examples moved to Examples/ScriptingDemo.

## Building and testing
- CMake options
  - ENABLE_SCRIPTING=ON … build scripting features (default ON in scripting builds)
  - BUILD_TESTING=ON … enable tests
  - BUILD_MANAGED_HOTRELOAD=ON … ensure CoreBridge/HotReload managed projects are built before tests
- Primary native tests:
  - ScriptingAbiIntegrationTests (gtest) – end‑to‑end ABI and HotReload coverage.
  - EngineCoreClrSmokeTests (gtest) – **cross‑platform CoreCLR hosting smoke test** that boots `CoreCLRHost`, resolves `CoreBridge.SanityPing`, and verifies a simple call into managed code. See `Docs/CrossPlatformScriptingRoadmap.md` for exact commands on Windows and Linux (Docker).
- DomainRoutingTest.dll is built from Tests/ManagedTestAssemblies/DomainRoutingTest and copied into the build tree; tests expect it under ${CMAKE_BINARY_DIR}/Tests/ManagedTestAssemblies/…

## Common pitfalls
- Working directory matters for path lookups in tests; CTest sets it to ${CMAKE_BINARY_DIR}
- Ensure the correct TFM (net9.0) and configuration (Debug/Release) are used consistently across copy steps
- If CoreBridge.Initialize fails, verify PathResolver can find both CoreBridge.dll and HotReload.dll next to the test exe (the test CMake target copies them)

## Where to look in code
- Engine/Source/Scripting/CoreCLRHost.cpp … runtime host, CoreBridge UCO resolution, hot reload load path
- Engine/Source/Scripting/ScriptingABI.cpp … native ABI bridge to managed UCOs
- Engine/Source/Scripting/PathResolver.cpp … managed assembly/runtimeconfig discovery
- Managed/CoreBridge/CoreBridge.cs … UCO entry points and thin façade
- Managed/HotReload/HotReloadManager.cs … business logic for reloads, tokens, counters
- Assets/**/*.cs … user scripts compiled into GameEngine.Scripts.dll at build/runtime (see docs/Scripting/InitializeOnLoadAndLogging.md for the detailed layout)

## Cross-platform status (Phase 0)
- CoreCLRHost uses the official `nethost + hostfxr` bootstrap and is wired for **Windows and Linux** (and future macOS) via the `NETHOST_AVAILABLE` CMake define. When `NETHOST_AVAILABLE` is missing (no .NET host packs), `CoreCLRHost::Initialize` returns `false` and EngineCoreClrSmokeTests will skip with a clear message instead of pretending hosting works.
- CompileServer and the async hot‑reload transport are still **Windows‑only** today; the cross‑platform transport and compile server work are covered in `Docs/CrossPlatformScriptingRoadmap.md` (Phase 1 / Phase 2).

## Examples
- Examples/ScriptingDemo … simple managed demo of the reload flow

## Status
This document reflects the current state after:
- HotReload moved to Managed/HotReload
- ComponentEntryPoint removed
- Demos relocated under Examples
- Result codes aligned

If anything here drifts, please update this document alongside the code changes.

