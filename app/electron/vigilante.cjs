/* Vigilante de seguridad (4.2.0, 5-11-2026). Manu, tras un intento de robo de cuentas: «tenemos que activar un método
 * de protección de mis datos por si pasa esto otra vez».
 *
 * Esta parte (proceso principal) mira el propio equipo y se lo da a la vista (src/vigilante.js), que compara con lo
 * visto la vez anterior y avisa al móvil:
 *   - Windows Defender: amenazas detectadas (fecha y archivo);
 *   - TeamViewer: conexiones entrantes (Connections_incoming.txt);
 *   - Tailscale: los dispositivos de tu red;
 *   - Escritorio remoto de Windows: si está activado.
 * Solo lee: no cambia nada del sistema. */
const { ipcMain } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const PS = `
$o = [ordered]@{}
try { $o.defender = @(Get-MpThreatDetection -ErrorAction Stop | Sort-Object InitialDetectionTime -Descending | Select-Object -First 15 | ForEach-Object { [ordered]@{ fecha = $_.InitialDetectionTime.ToString('o'); recurso = (($_.Resources | Select-Object -First 1) -replace '^[a-z]+:_','') } }) } catch { $o.defender = $null }
try { $o.rdp = ((Get-ItemProperty 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -ErrorAction Stop).fDenyTSConnections -eq 0) } catch { $o.rdp = $null }
$o | ConvertTo-Json -Depth 4 -Compress`;

function powershell() {
  return new Promise((ok) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS], { windowsHide: true, timeout: 60000, maxBuffer: 4 << 20 },
      (err, out) => { try { ok(JSON.parse(String(out || "").trim() || "{}")); } catch (e) { ok({}); } });
  });
}

function teamviewer() {
  for (const d of ["C:\\Program Files\\TeamViewer", "C:\\Program Files (x86)\\TeamViewer"]) {
    const f = path.join(d, "Connections_incoming.txt");
    try {
      return fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).slice(-30).map(l => {
        const c = l.split("\t");
        return { id: c[0], quien: c[1] || "", desde: c[2] || "", hasta: c[3] || "", clave: l.trim() };
      });
    } catch (e) {}
  }
  return null;     // sin TeamViewer
}

function tailscale() {
  return new Promise((ok) => {
    const exe = ["C:\\Program Files\\Tailscale\\tailscale.exe"].find(f => fs.existsSync(f));
    if (!exe) return ok(null);
    execFile(exe, ["status", "--json"], { windowsHide: true, timeout: 20000, maxBuffer: 4 << 20 }, (err, out) => {
      try {
        const j = JSON.parse(String(out || "{}"));
        const peers = Object.values(j.Peer || {}).map(p => ({ id: p.ID || p.PublicKey, nombre: p.HostName || p.DNSName || "?", so: p.OS || "" }));
        ok(peers);
      } catch (e) { ok(null); }
    });
  });
}

ipcMain.handle("vigilante-sistema", async () => {
  const [ps, ts] = await Promise.all([powershell(), tailscale()]);
  return { ok: true, defender: ps.defender || null, rdp: ps.rdp, teamviewer: teamviewer(), tailscale: ts };
});
