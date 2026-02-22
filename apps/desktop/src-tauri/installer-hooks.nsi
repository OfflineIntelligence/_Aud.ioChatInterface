; Aud.io Engine Download Hook
; This script runs AFTER Tauri's default NSIS installer completes application file installation
; It downloads and installs the llama.cpp engine to AppData

!include "FileFunc.nsh"

; Global Variables for Engine Download
Var EngineDownloadUrl
Var EngineFilename
Var EngineDestPath
Var AppDataPath

; Hook: Called after main installation section
!macro customInstall
  DetailPrint "Setting up Aud.io engine environment..."

  ; Set AppData path for engine storage
  StrCpy $AppDataPath "$APPDATA\Aud.io"

  DetailPrint "Creating application data directories..."
  CreateDirectory "$AppDataPath"
  CreateDirectory "$AppDataPath\engines"
  CreateDirectory "$AppDataPath\models"
  CreateDirectory "$AppDataPath\data"

  ; Detect hardware and set appropriate engine download URL
  DetailPrint "Detecting hardware capabilities..."
  Call DetectHardwareAndSetEngine

  ; Check if engine already exists (for upgrade scenarios)
  IfFileExists "$EngineDestPath\llama-server.exe" EngineExists DownloadEngine

  DownloadEngine:
    DetailPrint "Downloading llama.cpp engine (this may take 5-15 minutes)..."
    DetailPrint "Engine: $EngineFilename"
    DetailPrint "Source: $EngineDownloadUrl"
    DetailPrint "Destination: $EngineDestPath"

    ; Create temporary download directory
    CreateDirectory "$TEMP\Aud.io-Install"

    ; Download with NSISdl plugin (supports large files and timeouts)
    NSISdl::download /TIMEOUT=1800000 "$EngineDownloadUrl" "$TEMP\Aud.io-Install\$EngineFilename"
    Pop $0

    ${If} $0 == "success"
      DetailPrint "Download completed successfully"

      ; Extract the engine
      DetailPrint "Extracting engine files..."
      nsisunz::Unzip "$TEMP\Aud.io-Install\$EngineFilename" "$EngineDestPath"
      Pop $0

      ${If} $0 == "success"
        DetailPrint "Engine extraction completed"

        ; Create engine registry JSON
        Call CreateEngineRegistry

        DetailPrint "Engine setup completed successfully!"
        Goto EngineSetupComplete
      ${Else}
        MessageBox MB_ICONEXCLAMATION|MB_OK "Engine extraction failed. You can download it later from the application."
        Goto EngineSetupComplete
      ${EndIf}
    ${Else}
      MessageBox MB_ICONEXCLAMATION|MB_OK "Engine download failed or was cancelled. You can download it later from the application."
      Goto EngineSetupComplete
    ${EndIf}

  EngineExists:
    DetailPrint "Engine already installed, skipping download"

  EngineSetupComplete:
    ; Cleanup temporary files
    Delete "$TEMP\Aud.io-Install\$EngineFilename"
    RMDir "$TEMP\Aud.io-Install"
!macroend

; Function to detect hardware and set engine URL
Function DetectHardwareAndSetEngine
  ; Default to CPU engine
  StrCpy $EngineFilename "llama-cpu-windows-x64.zip"
  StrCpy $EngineDownloadUrl "https://github.com/ggerganov/llama.cpp/releases/download/b4313/llama-b4313-bin-win-cpu-x64.zip"
  StrCpy $EngineDestPath "$AppDataPath\engines\llama-cpu-windows-x64-b4313"

  ; Check for NVIDIA GPU
  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\NVIDIA Corporation\Installer2" "Version"
  IfErrors CheckComplete

  ; NVIDIA GPU detected, use CUDA engine
  DetailPrint "NVIDIA GPU detected, using CUDA-enabled engine"
  StrCpy $EngineFilename "llama-cuda-windows-x64.zip"
  StrCpy $EngineDownloadUrl "https://github.com/ggerganov/llama.cpp/releases/download/b4313/llama-b4313-bin-win-cuda-cu12.2.0-x64.zip"
  StrCpy $EngineDestPath "$AppDataPath\engines\llama-cuda-windows-x64-b4313"

  CheckComplete:
    DetailPrint "Selected engine: $EngineFilename"
FunctionEnd

; Function to create engine registry JSON
Function CreateEngineRegistry
  DetailPrint "Creating engine registry..."

  ; Determine engine type for registry
  StrCpy $1 "cpu"
  ${If} $EngineFilename == "llama-cuda-windows-x64.zip"
    StrCpy $1 "cuda"
  ${EndIf}

  ; Determine engine ID
  StrCpy $2 "llama-cpu-windows-x64-b4313"
  ${If} $EngineFilename == "llama-cuda-windows-x64.zip"
    StrCpy $2 "llama-cuda-windows-x64-b4313"
  ${EndIf}

  ; Create registry file
  FileOpen $0 "$AppDataPath\engines\registry.json" w
  FileWrite $0 '{$\r$\n'
  FileWrite $0 '  "installed_engines": {$\r$\n'
  FileWrite $0 '    "$2": {$\r$\n'
  FileWrite $0 '      "id": "$2",$\r$\n'
  FileWrite $0 '      "name": "llama.cpp",$\r$\n'
  FileWrite $0 '      "version": "b4313",$\r$\n'
  FileWrite $0 '      "engine_type": "$1",$\r$\n'
  FileWrite $0 '      "binary_path": "$EngineDestPath\\bin\\llama-server.exe",$\r$\n'
  FileWrite $0 '      "install_path": "$EngineDestPath",$\r$\n'
  FileWrite $0 '      "capabilities": {$\r$\n'
  FileWrite $0 '        "formats": ["gguf"],$\r$\n'
  FileWrite $0 '        "features": ["chat", "embeddings", "completion"]$\r$\n'
  FileWrite $0 '      }$\r$\n'
  FileWrite $0 '    }$\r$\n'
  FileWrite $0 '  },$\r$\n'
  FileWrite $0 '  "default_engine": "$2",$\r$\n'
  FileWrite $0 '  "version": 1$\r$\n'
  FileWrite $0 '}$\r$\n'
  FileClose $0

  DetailPrint "Engine registry created at: $AppDataPath\engines\registry.json"
FunctionEnd
