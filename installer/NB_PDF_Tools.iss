; Inno Setup 6 — compile after PyInstaller produces dist\NB_PDF_TOOLS.exe
; Install: https://jrsoftware.org/isinfo.php
; Command-line: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\NB_PDF_TOOLS.iss

#define MyAppName "NB PDF TOOLS"
#define MyAppVersion "1.0.0"
#define MyPublisher "NB Global Studio"
#define MyExeName "NB_PDF_TOOLS.exe"

[Setup]
AppId={{B5F3A2C1-9D8E-4F7A-B6C5-D4E3F2A1B0C9}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist_installer
OutputBaseFilename=NB_PDF_TOOLS_Setup_{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
SetupIconFile=..\assets\nb_pdf_TOOLS_icon.ico
UninstallDisplayIcon={app}\{#MyExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\{#MyExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
