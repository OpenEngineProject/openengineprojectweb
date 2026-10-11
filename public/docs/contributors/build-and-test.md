# Build and Test Guide

This guide provides detailed instructions for building the engine, running tests, and working with the various samples and examples.

## Quick Setup (New Users)

**IMPORTANT**: If you're setting up the repository for the first time, you need to create the C# project files that were previously excluded from git.

### Prerequisites

- **Windows 10/11** (primary platform)
  - Visual Studio 2019/2022 with C++ development tools
- **Linux/macOS** (C++ builds)
  - Recent Clang or GCC (Linux) / Xcode or Clang (macOS)
  - CMake 3.20+ (command-line)
- **.NET 9.0 SDK** - [Download here](https://dotnet.microsoft.com/download/dotnet/9.0)
  - Required for C# scripting on Windows
  - Optional on Linux/macOS (C++-only builds; scripting currently Windows‑first)
- **Git**
- **Vulkan shader compiler (`glslc`)**

  - Automatically provided via vcpkg `shaderc` when using the built-in CMake/vcpkg setup
  - Alternatively from the Vulkan SDK or your system package manager

	    ### Linux-specific Vulkan & windowing requirements

	    On Linux, Vulkan and GLFW rely on system windowing libraries that are not provided by vcpkg. Make sure you have:

	    - A working Vulkan driver + loader from your distro (Mesa or vendor packages, e.g. `mesa-vulkan-drivers`, `vulkan-tools`, `vulkan-validationlayers` on Ubuntu).
	    - X11 development libraries (default in this repo):
	      - `sudo apt install libxinerama-dev libxcursor-dev xorg-dev libglu1-mesa-dev pkg-config`
	      - These match the requirements printed by the vcpkg `glfw3` port.
	    - Our `vcpkg.json` enables `vulkan-loader[wayland,xcb,xlib]` so the Vulkan loader exports XCB/Xlib/Wayland surface extensions needed by `glfwCreateWindowSurface` on Linux. This is installed automatically via manifest mode when you configure the project with CMake; you do not need to run a separate `vcpkg install` command.

	    If you run a pure Wayland session (no XWayland), you may also want to enable the `glfw3[wayland]` feature in `vcpkg.json` and ensure the corresponding Wayland dev packages are installed; see the GLFW documentation for details.

	    ### macOS Vulkan / MoltenVK notes

	    On macOS, vcpkg's `vulkan` port installs Vulkan headers and the cross-platform loader, but it does **not** provide MoltenVK itself.
	    To enable the Vulkan backend on macOS:

	    - Install the official Vulkan SDK for macOS (which bundles MoltenVK and a Vulkan loader).
	    - If `VULKAN_SDK` is not set, CMake will attempt to auto-detect the newest SDK under common install locations (like `~/VulkanSDK/<version>/macOS`). If it still can’t find it, set `VULKAN_SDK` in your shell before running CMake.

	    #### Temporary MoltenVK PR build for `VK_KHR_draw_indirect_count`

	    Until official MoltenVK releases include [KhronosGroup/MoltenVK#2740](https://github.com/KhronosGroup/MoltenVK/pull/2740), macOS users who need GPU-driven counted indirect draws should build that PR locally and point CMake at the resulting dylib and ICD manifest:

	    ```bash
	    # Pick a persistent location outside the GameEngine build directory.
	    export MOLTENVK_PR_DIR="$HOME/src/MoltenVK-pr2740"

	    git clone --recursive https://github.com/KhronosGroup/MoltenVK.git "$MOLTENVK_PR_DIR"
	    cd "$MOLTENVK_PR_DIR"
	    git fetch origin pull/2740/head:pr-2740
	    git switch pr-2740
	    ./fetchDependencies --macos
	    make macos MVK_CONFIG_LOG_LEVEL=1
	    ```

	    Then configure GameEngine with the PR build outputs:

	    ```bash
	    cmake -S . -B build-macos \
	      -DGE_MOLTENVK_SOURCE_LIB="$MOLTENVK_PR_DIR/Package/Release/MoltenVK/dynamic/dylib/macOS/libMoltenVK.dylib" \
	      -DGE_MOLTENVK_SOURCE_ICD="$MOLTENVK_PR_DIR/Package/Release/MoltenVK/dynamic/dylib/macOS/MoltenVK_icd.json"
	    ```

	    For Xcode builds, use the same variables with the Xcode generator or your existing `build-xcode` directory:

	    ```bash
	    cmake -S . -B build-xcode -G Xcode \
	      -DGE_MOLTENVK_SOURCE_LIB="$MOLTENVK_PR_DIR/Package/Release/MoltenVK/dynamic/dylib/macOS/libMoltenVK.dylib" \
	      -DGE_MOLTENVK_SOURCE_ICD="$MOLTENVK_PR_DIR/Package/Release/MoltenVK/dynamic/dylib/macOS/MoltenVK_icd.json"
	    ```

	    The Editor post-build step stages that dylib into `Editor.app/Contents/Resources/vulkan/icd.d/` and writes an ICD JSON that points at the bundled copy. At runtime, the macOS Editor forces both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` to the bundled ICD so a globally installed Vulkan SDK cannot accidentally override the PR build.

	    If the SDK is missing, CMake's Vulkan detection will typically fail and the build will log a warning like:

	    - `Vulkan not found - Vulkan backend disabled`

	    This is acceptable for initial C++ engine/Editor bring-up on macOS; you can still build and run the Editor without Vulkan, it will just skip Vulkan-backed rendering paths.

### Scripts Setup (Assets + ScriptAssemblies)

The engine no longer uses a root `Scripts/` project or a `setup-scripts` helper. Instead:

- C# scripts live under `Assets/` (for example: `Assets/Scripts/*.cs`).
- The engine/editor automatically generates a `GameEngine.Scripts.csproj` into:
  - `build/bin/<Config>/ScriptAssemblies/GameEngine.Scripts.csproj`
- Building the engine or editor will also build `GameEngine.Scripts.dll` into:
  - `build/bin/<Config>/ScriptAssemblies/GameEngine.Scripts.dll`

This means there is **no manual setup step** for scripts anymore:

1. Place your C# files in `Assets/`.
2. Configure and build the C++ project as described below.
3. The ScriptAssemblies pipeline will emit `GameEngine.Scripts.dll` automatically.

> **Note:** Older docs and examples may still mention a `Scripts/` folder and `setup-scripts.ps1/.sh`. Those are now fully removed and should be treated as historical only.

## Building the Engine

### Prerequisites Verification

Before building, verify you have all prerequisites:

```bash
# Check .NET SDK
dotnet --version
# Should show 8.0.x or later

# Check CMake
cmake --version
# Should show 3.20 or later

# Check Visual Studio
# Open Visual Studio Installer and verify C++ workload is installed
```

### Build Process

#### 1. Initial Setup (all platforms)

```bash
# Clone and navigate to the repository
git clone https://github.com/Lunarsong/GameEngine.git
cd GameEngine
```

#### 2. Generate Build Files (Windows)

```bash
# For Visual Studio 2022 (recommended)
cmake -B build -G "Visual Studio 17 2022" -A x64

# For Visual Studio 2019
cmake -B build -G "Visual Studio 16 2019" -A x64

# For other generators, see: cmake --help
```

#### 2b. Generate Build Files (Linux/macOS, C++ only)

On Linux/macOS, you can build the C++ engine, examples, and tests with scripting disabled. For macOS, there is also a scripting + Editor flow described in the dedicated section below.

````bash
# Ninja (recommended)
cmake -S . -B build \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DBUILD_EXAMPLES=ON \
  -DBUILD_TESTING=ON \
  -DENABLE_SCRIPTING=OFF

# Non-Ninja users (Unix Makefiles)
cmake -S . -B build \
  -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Debug \
  -DBUILD_EXAMPLES=ON \
  -DBUILD_TESTING=ON \
  -DENABLE_SCRIPTING=OFF

		# macOS users who prefer Xcode
		cmake -S . -B build -G Xcode -DENABLE_SCRIPTING=OFF
		```

		### Troubleshooting: Vulkan surface creation on Linux

	If the Editor or examples log messages like:

	- `Failed to create window surface! Error: -7`
	- `Editor: Failed to create window surface (main window)`

	this usually means the Vulkan loader does not expose any Linux WSI surface
	extensions (e.g. `VK_KHR_xcb_surface`, `VK_KHR_xlib_surface`, `VK_KHR_wayland_surface`)
	or they are not enabled on the Vulkan instance.

	To fix:

	1. Configure the project with CMake so vcpkg installs dependencies from `vcpkg.json`
	   (this will install `vulkan-loader[wayland,xcb,xlib]` automatically on Linux).
	2. Install the X11 development packages listed in the Linux prerequisites above.
	3. If you run a pure Wayland session (no XWayland), consider enabling the
	   `glfw3[wayland]` feature in `vcpkg.json` and installing the required Wayland
	   development packages.

	Reconfigure with CMake and rebuild the `Editor` target after adjusting packages.

	For a streamlined Linux build, you can also use the helper script:

```bash
chmod +x Tools/Scripts/build-linux.sh
./Tools/Scripts/build-linux.sh
````

#### 2c. Linux Build via Docker (from Windows)

If you don't have a native Linux environment, you can run a Linux build inside a Docker container from Windows. This uses a separate build directory so it will not disturb your existing Windows CMake configuration.

**Prerequisites:**

- Docker Desktop installed and running
- The repository checked out on your Windows machine

From the repository root in **PowerShell**:

```powershell
.\Tools\Scripts\run-linux-build.ps1
```

What this does:

- Builds a Linux dev Docker image using `Dockerfile.linux-dev`
- Mounts your checkout into the container at `/src`
- Configures a Ninja build in `build-linux-docker` with:
  - `-DCMAKE_BUILD_TYPE=Debug`
  - `-DBUILD_EXAMPLES=ON`
  - `-DBUILD_TESTING=ON`
  - `-DENABLE_SCRIPTING=OFF` (current Linux state; scripting will be enabled in later roadmap phases)
- Builds the `Editor` target inside the container

As we implement Phases 0-2 of `docs/CrossPlatformScriptingRoadmap.md`, this Docker setup will also be the place where we run the cross-platform CoreCLR/scripting tests on Linux from Windows.

#### 3. Build C++ Engine

```bash
# Windows multi-config generators (Visual Studio)
cmake --build build --config Debug
cmake --build build --config Release

# Single-config generators (Ninja, Unix Makefiles, etc.)
cmake --build build -- -j$(nproc)   # Linux
cmake --build build -- -j$(sysctl -n hw.ncpu)   # macOS
```

### Build Outputs

After a successful Windows build with Visual Studio, you'll have:

```
build/<preset>/
├── bin/
│   └── Debug/
│       ├── Apps/
│       │   └── Editor/
│       │       └── Editor.exe          # Editor
│       └── Tests/                     # Test executables (when enabled)
└── lib/
    └── Debug/
        └── Engine.lib              # Engine library
```

On Linux/macOS, the exact binary names and configuration subfolders depend on the generator:

- Single-config (Ninja/Unix Makefiles): typically `build/bin/Editor`, `build/bin/RenderingWindowPBR_RG_Demo`, etc.
- Multi-config (Xcode): similar layout to Visual Studio under `build/<preset>/bin/Debug` / `build/<preset>/bin/Release`.

## Running Tests

### Integration Tests

The main executable includes comprehensive integration tests:

```bash
cd build
.\bin\Debug\GameEngine.exe
```

**What the tests do**:

1. **Asset System Test**

   - Discovers assets in `Assets/` directory
   - Tests GUID assignment and metadata generation
   - Loads texture assets
   - Verifies asset registry functionality

2. **Script System Test**

   - Initializes CoreCLR host
   - Tests C# script compilation framework
   - Attempts C# method calling (currently debugging)
   - Verifies .NET integration

3. **Hot-Reloading Test**

   - Creates a test C# script dynamically
   - Monitors file changes with Windows ReadDirectoryChangesW
   - Modifies the script after 5 seconds
   - Demonstrates real-time change detection

4. **C++ to C# Interop Test**
   - Tests 6 registered engine functions
   - Verifies P/Invoke interface
   - Demonstrates bidirectional communication

### Expected Test Output

```
[INFO] === Running Engine Integration Tests ===
[INFO] === Testing Asset System ===
[INFO] Discovered 3 assets:
[INFO]   - README (Unknown): Assets\README.md
[INFO]   - test_texture (Texture): Assets\test_texture.png
[INFO]   - test_texture (Unknown): Assets\test_texture.txt
[INFO] Successfully loaded texture asset!
[INFO] Texture dimensions: 2x2
[INFO] === Asset System Test Complete ===

[INFO] === Testing Script System ===
[INFO] CoreCLR host is initialized
[INFO] Assembly loaded successfully!
[INFO] === Script System Test Complete ===

[INFO] === Testing Hot-Reloading System ===
[INFO] Creating initial test script...
[DEBUG] Windows file change detected: Scripts\HotReloadTest.cs (1)
[INFO] Hot-reload test initialized. Script will be modified after 5 seconds.
[INFO] === Hot-Reloading Test Setup Complete ===

# ... 60 FPS main loop for 15 seconds ...

[INFO] === Hot-Reload Test: Modifying Script ===
[DEBUG] Windows file change detected: Scripts\HotReloadTest.cs (1)
[INFO] Test run complete, exiting...
```

## macOS: C++ Engine, Editor, and Scripting

This section describes how to build and run the engine + Editor with C# scripting on macOS.

### Prerequisites (macOS-specific)

In addition to the general prerequisites above, macOS users should have:

- **Xcode command-line tools / Clang**
  - Install via: `xcode-select --install`
- **CMake 3.20+** (command-line)
- **.NET 9.0 SDK for macOS**
  - Download from https://dotnet.microsoft.com/download/dotnet/9.0
  - Verify:

    ```bash
    dotnet --info
    ```

- **(Optional but recommended) Vulkan SDK for macOS (MoltenVK)**
  - vcpkg installs Vulkan headers and the cross-platform loader via the `vulkan` port. Validation layers are picked up at runtime from the installed Vulkan SDK (registered via OS config); install the SDK if you want validation messages.
  - It does **not** install MoltenVK itself on macOS.
  - To enable the Vulkan backend on macOS:

    - Install the official Vulkan SDK for macOS (which bundles MoltenVK and a Vulkan loader).
    - If `VULKAN_SDK` is not set, CMake will attempt to auto-detect the newest SDK under common install locations (like `~/VulkanSDK/<version>/macOS`). If it still can’t find it, set `VULKAN_SDK` in your shell (the SDK installer usually does this for you).

  - For `VK_KHR_draw_indirect_count` before official MoltenVK support lands, build [KhronosGroup/MoltenVK#2740](https://github.com/KhronosGroup/MoltenVK/pull/2740) locally and pass the resulting artifacts to CMake:

    ```bash
    export MOLTENVK_PR_DIR="$HOME/src/MoltenVK-pr2740"

    git clone --recursive https://github.com/KhronosGroup/MoltenVK.git "$MOLTENVK_PR_DIR"
    cd "$MOLTENVK_PR_DIR"
    git fetch origin pull/2740/head:pr-2740
    git switch pr-2740
    ./fetchDependencies --macos
    make macos MVK_CONFIG_LOG_LEVEL=1

    cd /path/to/GameEngine
    cmake -S . -B build-macos \
      -DGE_MOLTENVK_SOURCE_LIB="$MOLTENVK_PR_DIR/Package/Release/MoltenVK/dynamic/dylib/macOS/libMoltenVK.dylib" \
      -DGE_MOLTENVK_SOURCE_ICD="$MOLTENVK_PR_DIR/Package/Release/MoltenVK/dynamic/dylib/macOS/MoltenVK_icd.json"
    ```

    The Editor bundle stages that dylib and forces both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` to the bundled ICD at runtime, so the global Vulkan SDK cannot replace the PR build.

  - If the SDK is missing, CMake's Vulkan detection will typically fail and the build will log a warning like:

    - `Vulkan not found - Vulkan backend disabled`

    This is acceptable for initial C++ engine/Editor + scripting bring-up on macOS; you can still build and run the Editor, it will just skip Vulkan-backed rendering paths.

All other third-party C/C++ dependencies (GLFW, shaderc, VMA, etc.) are handled automatically by CMake + vcpkg when you configure the project.

### Step 1: Configure a macOS build with scripting enabled

From the repository root on macOS:

```bash
CONFIG=Debug

# Ninja (recommended)
cmake -S . -B build-macos \
  -G Ninja \
  -DCMAKE_BUILD_TYPE="${CONFIG}" \
  -DENABLE_SCRIPTING=ON \
  -DBUILD_TESTING=ON

# Non-Ninja users (Unix Makefiles)
cmake -S . -B build-macos \
  -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE="${CONFIG}" \
  -DENABLE_SCRIPTING=ON \
  -DBUILD_TESTING=ON
```

This will:

- Clone + bootstrap vcpkg (under `cmake/dependencies/vcpkg`) if needed.
- Install manifest dependencies for the appropriate `*-osx` triplet (e.g. `x64-osx`, `arm64-osx`).
- Configure the engine and scripting modules with CoreCLR hosting enabled.

### Step 2: Run macOS scripting smoke tests

To validate CoreCLR hosting and the compile server on macOS, use the helper script:

```bash
chmod +x Tools/Scripts/run-macos-scripting-smoke-tests.sh

./Tools/Scripts/run-macos-scripting-smoke-tests.sh
```

This script will:

- Re-configure (or reuse) `build-macos` with `ENABLE_SCRIPTING=ON` and `BUILD_TESTING=ON`.
- Build the `EngineCoreClrSmokeTests` and `EngineCompileServerSmokeTests` targets.
- Run the corresponding ctest entries via:

  ```bash
  ctest --test-dir build-macos -C Debug \
    -R "Engine(CoreClr|CompileServer)SmokeTests" --output-on-failure
  ```

If tests fail, check the console output and ctest logs under `build-macos/Testing` and include them when reporting issues.

### Step 3: Build the Editor with scripting enabled

Once scripting smoke tests are passing (or at least configured), build the Editor in the same macOS build tree:

```bash
cmake --build build-macos --config Debug \
  --target Editor -- -j"$(sysctl -n hw.ncpu)"
```

On macOS, this typically produces:

- `build-macos/bin/Debug/Editor`

(For other configurations, replace `Debug` with `Release`, etc.)

### Troubleshooting (macOS)

#### Vulkan surface creation (`Failed to create window surface! Error: -7`)

If the Editor (or any Vulkan windowed example) logs:

- `Failed to create window surface! Error: -7`
- `Editor: Failed to create window surface (main window)`

this usually means the Vulkan instance is missing a macOS WSI surface extension
(`VK_EXT_metal_surface` or the legacy `VK_MVK_macos_surface`), or GLFW could not
use a Vulkan loader to create a window surface.

To fix:

- Ensure the **Vulkan SDK for macOS** is installed (it bundles MoltenVK).
- Ensure `VULKAN_SDK` is set in the shell you run CMake/builds from.
- If you’re using an older GLFW (< 3.4), update it: GLFW 3.4+ supports `glfwInitVulkanLoader`,
  which helps GLFW use non-standard Vulkan loader locations (like vcpkg install trees).

#### CompileServer socket path too long / compile server can’t connect

If you see logs like:

- `[PipeTransport] Socket path too long: '...'`
- `[CompileServerClient] Timeout waiting for CompileServerHost to accept connections`

ensure the compile-server Unix socket directory is short enough for macOS.
You can override it explicitly:

```bash
export GE_PIPE_PATH=/tmp/gameengine-compile-server
```

### Step 4: Run the macOS Editor IoL + HotReload harness

To exercise InitializeOnLoad and hot-reload behavior in the Editor on macOS, use the dedicated test harness:

```bash
chmod +x Tools/Scripts/run-macos-editor-hotreload-iol-test.sh

./Tools/Scripts/run-macos-editor-hotreload-iol-test.sh
```

This script will:

- Verify that `build-macos/bin/Debug/Editor` exists and is executable.
- Create/update `build-macos/bin/Debug/Assets/TestInit.cs` with a simple `[InitializeOnLoad]` C# script.
- Set `GE_HOTRELOAD_IOL_TRACE_FILE` and `GE_HOTRELOAD_VERBOSE` to capture hot-reload traces.
- Launch the Editor with a log file under `Logs/Editor-macOS-IoL-HotReload.log`.
- Wait for an initial `InitializeOnLoad Boot() called v1` marker.
- Modify `TestInit.cs` to a `v2` version and wait for `InitializeOnLoad Boot() called v2` to confirm hot reload.

On success, you should see:

- `Logs/Editor-macOS-IoL-HotReload.log` containing Editor logs.
- `Logs/Editor-macOS-IoL-HotReload-ioltrace.log` containing at least two lines:

  - `InitializeOnLoad Boot() called v1 ...`
  - `InitializeOnLoad Boot() called v2 ...`

If the script times out or exits early, inspect both log files and report:

- The full terminal output from the script.
- The contents of the two log files under `Logs/`.
- Any CMake configuration or build errors from `build-macos`.

### Performance Metrics

During the test run, monitor these metrics:

- **Frame Rate**: Should maintain stable 60 FPS
- **File Detection**: Sub-millisecond change detection
- **Memory Usage**: Clean startup and shutdown
- **Asset Loading**: Fast asset discovery and loading

## Running Examples

### NEW: Amazing Example Games (Recommended!)

We now have 4 incredible example games that showcase the engine's full capabilities:

#### Option 1: Space Shooter (Action/Arcade)

```bash
# Copy Space Shooter to Scripts directory
copy Examples\SpaceShooter\SpaceShooter.cs Scripts\

# Build the scripts
cd Scripts
dotnet build --configuration Debug
cd ..

# Run the engine
cd build
.\bin\Debug\GameEngine.exe
```

**Features**: Player movement, enemy spawning, bullet physics, collision detection, scoring, wave progression

#### Option 2: Comprehensive Game Demo (All Games!)

```bash
# Copy all example games to Scripts directory
copy Examples\GameDemo.cs Scripts\
copy Examples\SpaceShooter\SpaceShooter.cs Scripts\
copy Examples\Platformer\Platformer.cs Scripts\
copy Examples\RPG\RPGGame.cs Scripts\

# Build the scripts
cd Scripts
dotnet build --configuration Debug
cd ..

# Run the engine
cd build
.\bin\Debug\GameEngine.exe
```

**Features**: Automatic game switching every 30 seconds, showcases all engine capabilities

#### Option 3: Platformer Game

```bash
copy Examples\Platformer\Platformer.cs Scripts\
cd Scripts
dotnet build --configuration Debug
cd ..\build
.\bin\Debug\GameEngine.exe
```

**Features**: Physics simulation, gravity, jumping, platform collision, collectibles

#### Option 4: RPG Game

```bash
copy Examples\RPG\RPGGame.cs Scripts\
cd Scripts
dotnet build --configuration Debug
cd ..\build
.\bin\Debug\GameEngine.exe
```

**Features**: Character stats, inventory, quest system, NPC interactions, turn-based combat

### Basic Game Example (Legacy)

The `Examples/BasicGame/` directory contains a complete game example.

#### Setup

```bash
# Copy example files to Scripts directory
copy Examples\BasicGame\*.cs Scripts\

# Build the scripts
cd Scripts
dotnet build --configuration Debug
cd ..

# Run the engine
cd build
.\bin\Debug\GameEngine.exe
```

#### What You'll See

The Basic Game example demonstrates:

- **Player** class with movement and health
- **Enemy** AI with pathfinding toward player
- **GameManager** coordinating game state
- **Combat system** with damage and health
- **Win/lose conditions**

#### Example Output

```
[INFO] === Basic Game Example Initializing ===
[INFO] Player created at position (0, 0)
[INFO] Enemy 'Enemy_0' spawned at (0, 0)
[INFO] Enemy 'Enemy_1' spawned at (10, 5)
[INFO] Enemy 'Enemy_2' spawned at (20, 10)
[INFO] Spawned 3 enemies
[INFO] Basic Game initialized successfully!

# During gameplay:
[INFO] Enemy_0 attacks for 15 damage!
[INFO] Player took 15 damage. Health: 85
[INFO] Enemy_0 took 25 damage. Health: 25
[INFO] Enemy_0 was defeated!
[INFO] Enemy defeated! Score: 100
```

### Scripting Demo Example

The `Examples/ScriptingDemo/` directory shows C# scripting features.

#### Setup

```bash
# Copy scripting demo files
copy Examples\ScriptingDemo\*.cs Scripts\

# Build and run
cd Scripts
dotnet build --configuration Debug
cd ..\build
.\bin\Debug\GameEngine.exe
```

#### Features Demonstrated

1. **Inter-Script Communication**

   - `GameLogic.cs` calls methods from `MathUtilities.cs`
   - Demonstrates static method calling between scripts

2. **C++ to C# Interop**

   - `NativeInterop.cs` calls engine functions
   - Shows how to access engine features from C#

3. **Engine Integration**
   - Logging from C# to engine console
   - Asset count and loading from C#
   - Math operations using engine functions

## Development Workflow

### Typical Development Session

1. **Start with clean build**:

   ```bash
   cd Scripts
   dotnet build --configuration Debug
   cd ..\build
   cmake --build . --config Debug
   ```

2. **Run and test**:

   ```bash
   .\bin\Debug\GameEngine.exe
   ```

3. **Make changes to C# scripts**:

   - Edit files in `Scripts/` directory
   - Hot-reloading will detect changes automatically

4. **For C++ changes**:

   ```bash
   cmake --build . --config Debug
   ```

5. **Test again**:
   ```bash
   .\bin\Debug\GameEngine.exe
   ```

### Hot-Reloading Workflow

1. **Run the engine**
2. **Keep it running**
3. **Edit C# scripts** in `Scripts/` directory
4. **Save the file**
5. **Watch console** for change detection messages
6. **See changes** reflected immediately (when C# method calling is fixed)

### Adding New Assets

1. **Add files** to `Assets/` directory
2. **Run the engine** - assets are discovered automatically
3. **Check console** for asset registration messages
4. **Use assets** in C# scripts via `NativeInterop.LoadAsset()`

## Troubleshooting

### Build Issues

**"CMake Error: Could not find .NET hosting library"**

- Install .NET 9.0 SDK
- Restart command prompt to refresh PATH

**"MSBuild Error: Project file not found"**

- Make sure you're in the `build` directory
- Re-run `cmake ..` to regenerate build files

**"C# compilation failed"**

- Check that .NET 9.0 SDK is installed: `dotnet --version`
- Verify you're in the `Scripts` directory when running `dotnet build`

### Runtime Issues

**"CoreCLR initialization failed"**

- Build C# scripts first: `dotnet build Scripts/`
- Check that `Scripts/bin/Debug/net9.0/` directory exists

**"Assembly not found"**

- Ensure C# scripts are built successfully
- Check for compilation errors in `dotnet build` output

**"No assets found"**

- Add some files to the `Assets/` directory
- Check that the `Assets/` directory exists

### Performance Issues

**Low frame rate**

- Check for Debug vs Release build
- Monitor CPU usage in Task Manager
- Look for error messages in console

**File changes not detected**

- Verify you're editing files in the correct directory
- Check console for file watcher initialization messages
- Ensure Windows file watching is enabled

## Performance Benchmarks

### Expected Performance

- **Frame Rate**: 60 FPS stable
- **File Change Detection**: <1ms
- **Asset Discovery**: <10ms for typical projects
- **Engine Startup**: <200ms
- **Memory Usage**: <100MB for basic projects

### Monitoring Performance

Watch the console output for:

```
[DEBUG] Frame: 60, Time: 1.00s, FPS: 60.0
[DEBUG] Windows file change detected: Scripts\test.cs (1)
[INFO] Asset Registry initialized with X assets
```

## Advanced Usage

### Custom Build Configurations

Create custom CMake configurations:

```bash
# Custom configuration
cmake .. -DCMAKE_BUILD_TYPE=RelWithDebInfo -G "Visual Studio 17 2022" -A x64
```

### Batch Building

Use the provided batch files:

```bash
# Windows batch file
build.bat

# PowerShell script
.\build.ps1
```

### Continuous Integration

For automated builds:

```bash
# CI-friendly build
cmake .. -G "Visual Studio 17 2022" -A x64
cd Scripts && dotnet build --configuration Release && cd ..
cmake --build . --config Release --parallel
```

---

**This guide should get you building and testing successfully!**
