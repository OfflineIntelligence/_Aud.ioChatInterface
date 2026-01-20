@echo off
echo ========================================
echo Starting Voice Engine Service
echo ========================================
echo.

cd /d "%~dp0"

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found!
    echo Please install Python 3.8+ and add it to PATH
    pause
    exit /b 1
)

:: Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
)

:: Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

:: Install/upgrade dependencies
echo.
echo Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

:: Check if models are downloaded
if not exist "silero_models\vad\silero_vad.jit" (
    echo.
    echo ========================================
    echo Models not found! Downloading...
    echo ========================================
    python download_models.py
    if errorlevel 1 (
        echo ERROR: Failed to download models
        pause
        exit /b 1
    )
)

:: Start voice engine
echo.
echo ========================================
echo Starting Voice Engine on port 8002...
echo ========================================
echo Press Ctrl+C to stop
echo.

python voice_engine.py

pause
