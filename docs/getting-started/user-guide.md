# Game Engine User Guide

Welcome to the Game Engine! This guide will help you get started with building games using our high-performance C++ engine with C# scripting support.

## Quick Start

### Prerequisites

Before you begin, make sure you have:

- **Visual Studio 2022** with C++ workload
- **.NET 8.0 SDK** or later
- **CMake 3.20+**
- **Git** (for cloning the repository)
- **Windows 10/11** (primary supported platform)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Lunarsong/GameEngine.git
   cd GameEngine
   ```

2. **Generate build files**:
   ```bash
   mkdir build
   cd build
   cmake .. -G "Visual Studio 17 2022" -A x64
   ```

3. **Build C# scripts first**:
   ```bash
   cd Scripts
   dotnet build --configuration Debug
   cd ..
   ```

4. **Build the engine**:
   ```bash
   cd build
   cmake --build . --config Debug
   ```

5. **Run the engine**:
   ```bash
   # Run your game
   .\bin\Debug\Runtime.exe

   # Or run engine tests
   .\bin\Debug\GameEngineTests.exe
   ```

You should see the engine start up and be ready for your game development!

## Creating Your First Game

### Step 1: Set Up Your Project Structure

Create your game project alongside the engine:

```
YourGame/
├── Assets/          # Your game assets
├── Scripts/         # Your C# game scripts
├── Config/          # Game configuration
└── YourGame.sln     # Your game solution
```

### Step 2: Create Game Scripts

Create C# scripts in the `Scripts/` directory:

```csharp
// Scripts/Player.cs
using System;

namespace YourGame.Scripts
{
    public class Player
    {
        private float m_x, m_y;
        private float m_health = 100.0f;

        public void Update(float deltaTime)
        {
            // Your game logic here
        }

        public void Move(float deltaX, float deltaY)
        {
            m_x += deltaX;
            m_y += deltaY;
            Console.WriteLine($"Player moved to ({m_x}, {m_y})");
        }
    }
}
```

### Step 3: Use Engine Features

#### Asset Management
```csharp
// Load assets using the engine
int assetCount = NativeInterop.GetAssetCount();
bool loaded = NativeInterop.LoadAsset("player_texture.png");
```

#### Logging
```csharp
// Log to the engine console
NativeInterop.LogInfo("Player initialized!");
NativeInterop.LogWarning("Low health warning");
NativeInterop.LogError("Critical error occurred");
```

#### Inter-Script Communication
```csharp
// Scripts can call each other
public class GameManager
{
    private Player m_player = new Player();

    public void Update(float deltaTime)
    {
        m_player.Update(deltaTime);

        // Use utility functions from other scripts
        int result = MathUtilities.Add(10, 20);
    }
}
```

## Project Structure

### Engine Components

- **Engine/** - Core engine library
  - `Assets/` - Asset management system
  - `Core/` - Engine core (Application, Logger, etc.)
  - `Scripting/` - C# integration and CoreCLR hosting
  - `Memory/` - Memory management
  - `Platform/` - Platform-specific code

- **Runtime/** - Game runtime executable
- **Editor/** - Visual editor (basic structure)
- **Scripts/** - C# game scripts
- **Assets/** - Game assets (textures, audio, etc.)

### Your Game Structure

When creating your own game, organize it like this:

```
YourGame/
├── Assets/
│   ├── Textures/
│   ├── Audio/
│   └── Models/
├── Scripts/
│   ├── Player.cs
│   ├── Enemy.cs
│   └── GameManager.cs
├── Config/
│   └── game_config.json
└── README.md
```

## Building and Running

### Development Workflow

1. **Make changes** to C# scripts or assets
2. **Hot-reloading** automatically detects changes
3. **Test immediately** without rebuilding
4. **Build C# scripts** when adding new files:
   ```bash
   cd Scripts
   dotnet build
   ```

### Build Configurations

- **Debug**: Full debugging, slower performance
  ```bash
  cmake --build . --config Debug
  ```

- **Release**: Optimized release build
  ```bash
  cmake --build . --config Release
  ```

### Running Tests

The engine includes comprehensive tests:

```bash
# Run integration tests (included in main executable)
.\bin\Debug\GameEngine.exe

# The tests will automatically:
# - Test asset system
# - Test C# scripting
# - Test hot-reloading
# - Test C++ to C# interop
```

## Examples and Samples

### Basic Game Example

Located in `Examples/BasicGame/`:

- **Player.cs** - Player character with movement and health
- **Enemy.cs** - AI enemy with pathfinding
- **GameManager.cs** - Game state management

To run this example:
1. Copy files from `Examples/BasicGame/` to `Scripts/`
2. Build and run the engine
3. Watch the console for game simulation

### Scripting Demo

Located in `Examples/ScriptingDemo/`:

- **MathUtilities.cs** - Utility functions
- **GameLogic.cs** - Inter-script communication demo
- **NativeInterop.cs** - C++ to C# interop examples

### Hot-Reloading Demo

The engine automatically demonstrates hot-reloading:

1. **Run the engine**
2. **Watch** as it creates a test script
3. **After 5 seconds**, it modifies the script
4. **Observe** instant change detection

## Engine Features

### Asset System

- **GUID-based references** - Assets never break when moved
- **Hot-reloading** - Changes detected instantly
- **Metadata system** - Automatic .meta file generation
- **Type detection** - Automatic asset type classification

```csharp
// Using assets in C#
int assetCount = NativeInterop.GetAssetCount();
bool loaded = NativeInterop.LoadAsset("my_texture.png");
```

### C# Scripting

- **.NET 8.0 support** - Modern C# features
- **Inter-script communication** - Scripts can call each other
- **Engine integration** - Access engine functions from C#
- **Hot-reloading** - Modify scripts without restart

### Performance

- **60 FPS** stable main loop
- **Sub-millisecond** file change detection
- **Memory efficient** with RAII and smart pointers
- **Clean shutdown** with proper resource cleanup

## Debugging and Troubleshooting

### Common Issues

1. **"Assembly not found"**
   - Make sure to build C# scripts first: `dotnet build Scripts/`

2. **"CoreCLR initialization failed"**
   - Ensure .NET 8.0 SDK is installed
   - Check that `Scripts/bin/Debug/net8.0/` exists

3. **"Asset not found"**
   - Check that assets are in the `Assets/` directory
   - Verify .meta files are generated

### Logging

The engine provides detailed logging:

```
[INFO] - General information
[WARN] - Warnings (non-critical issues)
[ERROR] - Errors (critical issues)
[DEBUG] - Detailed debugging information
```

### Performance Monitoring

Watch the console for performance metrics:
- Frame rate (should be stable 60 FPS)
- Asset loading times
- Memory usage
- File change detection speed

## Next Steps

1. **Explore the examples** in `Examples/`
2. **Read the developer guide** in `DEVELOPER_GUIDE.md`
3. **Check the TODO list** in `TODO.md` for upcoming features
4. **Create your first game** using the engine!

## Support

- **Documentation**: See `DEVELOPER_GUIDE.md` for technical details
- **Examples**: Check `Examples/` directory
- **Issues**: Report bugs and feature requests on GitHub

---

**Happy game development!**
