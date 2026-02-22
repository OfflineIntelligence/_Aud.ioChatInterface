@echo off
:: Complete rebuild script for Aud.io
:: Uses `npx tauri build` to properly embed frontend assets into the binary

setlocal EnableDelayedExpansion

echo ==========================================
echo Aud.io - Complete Rebuild
echo ==========================================
echo.
echo This will rebuild everything using Tauri CLI:
echo   - Frontend built automatically (beforeBuildCommand)
echo   - Backend compiled with embedded frontend assets
echo   - Then run the application
echo.
echo Press any key to start...
pause >nul

:: Store the root directory
set "ROOT_DIR=%CD%"

:: Step 1: Clean old builds
echo.
echo ==========================================
echo [1/3] Cleaning old builds...
echo ==========================================
echo.

if exist "%ROOT_DIR%\apps\desktop\dist" (
    echo Cleaning frontend dist folder...
    rmdir /s /q "%ROOT_DIR%\apps\desktop\dist"
)

echo [SUCCESS] Cleaned old builds
echo.

:: Step 2: Build with Tauri CLI (handles frontend + backend + embedding)
echo ==========================================
echo [2/3] Building with Tauri CLI...
echo ==========================================
echo.
echo This runs: npx tauri build
echo   - Automatically runs "npm run build" (frontend)
echo   - Compiles Rust backend
echo   - Embeds frontend assets into the binary
echo   - Creates installer/bundle
echo.
echo This may take 3-5 minutes on first build...
echo.

cd /d "%ROOT_DIR%\apps\desktop"
if errorlevel 1 (
    echo [ERROR] Cannot find apps\desktop directory
    pause
    exit /b 1
)

call npx tauri build
if errorlevel 1 (
    echo.
    echo [ERROR] Tauri build failed!
    echo Check the error messages above.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Tauri build completed!
echo.

:: Step 3: Run Application
echo ==========================================
echo [3/3] Running Application...
echo ==========================================
echo.

:: Tauri build outputs to target/release/ in workspace root
set "EXE_PATH=%ROOT_DIR%\target\release\offline-intelligence-desktop.exe"

:: Also check the bundle output location
if not exist "%EXE_PATH%" (
    set "EXE_PATH=%ROOT_DIR%\apps\desktop\src-tauri\target\release\offline-intelligence-desktop.exe"
)

:: Check if executable exists
if not exist "%EXE_PATH%" (
    echo [ERROR] Executable not found!
    echo Searched locations:
    echo   - %ROOT_DIR%\target\release\offline-intelligence-desktop.exe
    echo   - %ROOT_DIR%\apps\desktop\src-tauri\target\release\offline-intelligence-desktop.exe
    echo.
    echo Searching entire project for executable...
    dir /s /b "%ROOT_DIR%\offline-intelligence-desktop.exe" 2>nul
    pause
    exit /b 1
)

echo [SUCCESS] Found executable: %EXE_PATH%
echo.
echo Starting Aud.io Chat Interface...
echo.
echo ==========================================
echo WHAT TO EXPECT:
echo ==========================================
echo.
echo 1. A window will open with a loading screen
echo    (Black background with spinner)
echo.
echo 2. Backend initializes in background:
echo    - Database setup
echo    - Thread pool creation
echo    - Model manager initialization
echo    - This takes 2-5 seconds
echo.
echo 3. When backend is ready:
echo    - Health check passes
echo    - Loading screen disappears
echo    - Main chat interface appears
echo.
echo 4. You can then:
echo    - Chat using OpenRouter (online)
echo    - Or download local models for offline use
echo    - Models save to: %%APPDATA%%\Aud.io\models\
echo.
echo Starting now...
echo.

:: Copy .env to exe directory (backend needs it at runtime)
for %%F in ("%EXE_PATH%") do set "EXE_DIR=%%~dpF"
copy /Y "%ROOT_DIR%\.env" "%EXE_DIR%.env" >nul 2>&1

:: Run the application
start "" "%EXE_PATH%"

timeout /t 2 /nobreak >nul

cd /d "%ROOT_DIR%"

echo ==========================================
echo [DONE] Application launched!
echo ==========================================
echo.
echo If you see a loading screen with "Initializing backend..."
echo then everything is working correctly!
echo.
pause
