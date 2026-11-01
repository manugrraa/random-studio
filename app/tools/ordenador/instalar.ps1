# Instalador de RandomStudio para el ordenador de sobremesa (v3.31).
# Lo ejecuta Instalar.bat. Deja:
#   C:\RandomStudio\App                      la aplicación (con acceso directo en el escritorio)
#   C:\RandomStudio\Datos\RandomHistorias    el motor de historias (kit, herramientas, modelos, música y efectos)
# e instala lo que hace falta para hacer historias aquí: Blender 4.5, Python 3.12 (+ librerías) y FFmpeg.
# No guarda tus vídeos: con «Este equipo no guarda los Shorts» activado, cada Short va a tu Drive y se borra de aquí.

$ErrorActionPreference = "Stop"
$origen = Split-Path -Parent $MyInvocation.MyCommand.Path
$base = "C:\RandomStudio"
function Paso($t) { Write-Host ""; Write-Host "== $t ==" -ForegroundColor Yellow }

Paso "1/6 Copiando RandomStudio"
New-Item -ItemType Directory -Force "$base\App", "$base\Datos" | Out-Null
Get-Process RandomStudio -ErrorAction SilentlyContinue | Stop-Process -Force
robocopy "$origen\RandomStudio" "$base\App" /MIR /XD versiones /NFL /NDL /NJH /NJS /NP | Out-Null

Paso "2/6 Copiando el motor de historias"
robocopy "$origen\RandomHistorias" "$base\Datos\RandomHistorias" /E /XO /NFL /NDL /NJH /NJS /NP | Out-Null
[Environment]::SetEnvironmentVariable("RANDOMSTUDIO_BASE", "$base\Datos", "User")

Paso "3/6 Memoria de Claude (nuestro criterio de siempre)"
$mem = Join-Path $env:USERPROFILE ".claude\projects\C--RandomStudio-Datos-RandomHistorias\memory"
New-Item -ItemType Directory -Force $mem | Out-Null
Copy-Item "$origen\memoria\*" $mem -Force

Paso "4/6 Instalando Blender 4.5, Python 3.12 y FFmpeg (puede tardar)"
foreach ($id in @("BlenderFoundation.Blender.LTS.4.5", "Python.Python.3.12", "Gyan.FFmpeg")) {
  Write-Host "  - $id"
  winget install -e --id $id --silent --accept-package-agreements --accept-source-agreements | Out-Null
}
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

Paso "5/6 Librerías de Python"
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" }
& $py -m pip install --upgrade pip --quiet
& $py -m pip install pillow numpy scipy soundfile faster-whisper --quiet

Paso "6/6 Acceso directo"
$w = New-Object -ComObject WScript.Shell
$a = $w.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "RandomStudio.lnk"))
$a.TargetPath = "$base\App\RandomStudio.exe"; $a.WorkingDirectory = "$base\App"; $a.Save()

Write-Host ""
Write-Host "Listo. Abre RandomStudio desde el escritorio, inicia sesión con Google y apruébalo desde el portátil." -ForegroundColor Green
Write-Host "Cada Short que haga este equipo irá a tu Drive y se borrará de aquí." -ForegroundColor Green
# Claude Code (el de la línea de comandos: la app de escritorio sola no basta para que RandomStudio trabaje aquí)
if (-not (Get-Command claude -ErrorAction SilentlyContinue) -and -not (Test-Path "$env:USERPROFILE\.local\bin\claude.exe")) {
  Paso "Instalando Claude Code"
  try { Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression } catch { Write-Host "No se pudo instalar Claude Code: $_" -ForegroundColor Red }
  Write-Host "Ahora abre una ventana nueva de PowerShell, escribe  claude  y entra con tu cuenta de Claude (la del plan Max)." -ForegroundColor Yellow
}
Read-Host "Pulsa Intro para cerrar"
