; Aud.io Chat Interface - NSIS Installer with Engine Download
; This installer downloads and installs the llama.cpp engine during installation

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Installer Configuration
Name "Aud.io Chat Interface"
OutFile "Aud.io-Setup.exe"
InstallDir "$LOCALAPPDATA\Aud.io Chat Interface"
RequestExecutionLevel user

; Modern UI Configuration
; Use absolute path from build directory - Tauri copies the icon to resources
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_HEADERIMAGE
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_NOAUTOCLOSE

; Pages
!insertmacro MUI_PAGE_WELCOME
; License page removed - not required
; !insertmacro MUI_PAGE_LICENSE "..\..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; Version Information
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "Aud.io Chat Interface"
VIAddVersionKey "CompanyName" "Aud.io"
VIAddVersionKey "FileDescription" "Aud.io Chat Interface Installer"
VIAddVersionKey "FileVersion" "0.1.0"

; Global Variables
Var EngineDownloadUrl
Var EngineFilename
Var EngineDestPath
Var AppDataPath

; Installation Section
Section "Install" SecInstall
  SetOutPath "$INSTDIR"

  DetailPrint "Installing Aud.io Chat Interface..."

  ; Copy application files - Tauri will inject the correct File commands here
  ; The build process replaces this section with actual file paths
  ; For now, we need to manually specify the executable from the release build
  File /oname=offline-intelligence-desktop.exe "${NSISDIR}\..\..\..\release\offline-intelligence-desktop.exe"

  ; Copy resources if they exist
  IfFileExists "${NSISDIR}\..\..\..\release\resources\*.*" 0 +2
    File /r "${NSISDIR}\..\..\..\release\resources"

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
    NSISdl::download_quiet /TIMEOUT=1800000 /TRANSLATE "Downloading" "Connecting" "second" "seconds" "minute" "minutes" "hour" "hours" "$EngineDownloadUrl" "$TEMP\Aud.io-Install\$EngineFilename"
    Pop $0

    ${If} $0 == "success"
      DetailPrint "Download completed successfully"

      ; Extract the engine
      DetailPrint "Extracting engine to $EngineDestPath..."
      CreateDirectory "$EngineDestPath"

      ; Use 7zip to extract (assuming engine is .zip file)
      nsExec::ExecToLog '"$SYSDIR\tar.exe" -xf "$TEMP\Aud.io-Install\$EngineFilename" -C "$EngineDestPath"'
      Pop $0

      ${If} $0 == 0
        DetailPrint "Engine extracted successfully"

        ; Create engine registry file
        DetailPrint "Registering engine..."
        Call CreateEngineRegistry

        ; Clean up temporary files
        Delete "$TEMP\Aud.io-Install\$EngineFilename"
        RMDir "$TEMP\Aud.io-Install"

        Goto EngineReady
      ${Else}
        DetailPrint "ERROR: Failed to extract engine (error code: $0)"
        MessageBox MB_ICONEXCLAMATION|MB_OK "Failed to extract llama.cpp engine. The application will start but offline mode may not work. Error code: $0"
        Goto EngineReady
      ${EndIf}
    ${Else}
      DetailPrint "ERROR: Failed to download engine: $0"
      MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "Failed to download llama.cpp engine. This is required for offline mode.$\n$\nError: $0$\n$\nClick Retry to try again, or Cancel to continue without offline mode." IDRETRY DownloadEngine
      Goto EngineReady
    ${EndIf}

  EngineExists:
    DetailPrint "Engine already exists, skipping download"

  EngineReady:
    ; Create desktop shortcut
    CreateShortCut "$DESKTOP\Aud.io.lnk" "$INSTDIR\Aud.io.exe"

    ; Create start menu shortcuts
    CreateDirectory "$SMPROGRAMS\Aud.io"
    CreateShortCut "$SMPROGRAMS\Aud.io\Aud.io.lnk" "$INSTDIR\Aud.io.exe"
    CreateShortCut "$SMPROGRAMS\Aud.io\Uninstall.lnk" "$INSTDIR\uninstall.exe"

    ; Create uninstaller
    WriteUninstaller "$INSTDIR\uninstall.exe"

    ; Write registry keys for uninstaller
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aud.io" "DisplayName" "Aud.io Chat Interface"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aud.io" "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aud.io" "DisplayIcon" "$INSTDIR\Aud.io.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aud.io" "Publisher" "Aud.io"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aud.io" "DisplayVersion" "0.1.0"

    DetailPrint "Installation completed successfully!"
SectionEnd

; Function to detect hardware and set engine download URL
Function DetectHardwareAndSetEngine
  ; Default to CPU engine
  StrCpy $EngineFilename "llama-cpu-windows-x64.zip"
  StrCpy $EngineDownloadUrl "https://github.com/ggerganov/llama.cpp/releases/download/b4313/llama-b4313-bin-win-cpu-x64.zip"
  StrCpy $EngineDestPath "$AppDataPath\engines\llama-cpu-windows-x64-b4313"

  ; Check for NVIDIA GPU (CUDA support)
  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\NVIDIA Corporation\Installer2" "Version"
  IfErrors CheckComplete

  ; NVIDIA GPU detected, use CUDA engine
  DetailPrint "NVIDIA GPU detected, using CUDA engine"
  StrCpy $EngineFilename "llama-cuda-windows-x64.zip"
  StrCpy $EngineDownloadUrl "https://github.com/ggerganov/llama.cpp/releases/download/b4313/llama-b4313-bin-win-cuda-cu12.2.0-x64.zip"
  StrCpy $EngineDestPath "$AppDataPath\engines\llama-cuda-windows-x64-b4313"

  CheckComplete:
FunctionEnd

; Function to create engine registry JSON
Function CreateEngineRegistry
  ; Determine engine ID and name based on which engine was installed
  Push $1
  Push $2

  ${If} $EngineFilename == "llama-cuda-windows-x64.zip"
    StrCpy $1 "llama-cuda-windows-x64-b4313"
    StrCpy $2 "llama.cpp CUDA (Windows x64)"
  ${Else}
    StrCpy $1 "llama-cpu-windows-x64-b4313"
    StrCpy $2 "llama.cpp CPU (Windows x64)"
  ${EndIf}

  ; Create registry JSON file
  FileOpen $0 "$AppDataPath\engines\registry.json" w
  FileWrite $0 '{$\n'
  FileWrite $0 '  "installed_engines": {$\n'
  FileWrite $0 '    "$1": {$\n'
  FileWrite $0 '      "id": "$1",$\n'
  FileWrite $0 '      "name": "$2",$\n'
  FileWrite $0 '      "version": "b4313",$\n'
  FileWrite $0 '      "platform": "Windows",$\n'
  FileWrite $0 '      "architecture": "X86_64",$\n'
  ${If} $EngineFilename == "llama-cuda-windows-x64.zip"
    FileWrite $0 '      "acceleration": "CUDA",$\n'
  ${Else}
    FileWrite $0 '      "acceleration": "CPU",$\n'
  ${EndIf}
  FileWrite $0 '      "install_path": "$EngineDestPath",$\n'
  FileWrite $0 '      "executable_path": "$EngineDestPath\\llama-server.exe",$\n'
  FileWrite $0 '      "binary_name": "llama-server.exe",$\n'
  FileWrite $0 '      "is_verified": true$\n'
  FileWrite $0 '    }$\n'
  FileWrite $0 '  },$\n'
  FileWrite $0 '  "default_engine": "$1"$\n'
  FileWrite $0 '}$\n'
  FileClose $0

  Pop $2
  Pop $1
FunctionEnd

; Uninstallation Section
Section "Uninstall"
  ; Remove application files
  Delete "$INSTDIR\Aud.io.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$DESKTOP\Aud.io.lnk"
  Delete "$SMPROGRAMS\Aud.io\Aud.io.lnk"
  Delete "$SMPROGRAMS\Aud.io\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Aud.io"

  ; Remove registry keys
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aud.io"

  ; Ask user if they want to remove data (engines, models, database)
  MessageBox MB_ICONQUESTION|MB_YESNO "Do you want to remove all application data (engines, models, and chat history)? This will free up disk space but cannot be undone." IDNO SkipDataRemoval

  DetailPrint "Removing application data..."
  RMDir /r "$APPDATA\Aud.io"

  SkipDataRemoval:
  DetailPrint "Uninstallation completed"
SectionEnd
