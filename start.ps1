param(
  [switch]$Dev,       # режим разработки (vite dev на 5173)
  [switch]$ResetDb    # сбросить БД перед запуском
)

$ErrorActionPreference = "Stop"
function Info($t){ Write-Host " $t" -ForegroundColor Cyan }
function Ok($t){ Write-Host " $t" -ForegroundColor Green }
function Warn($t){ Write-Host "! $t" -ForegroundColor Yellow }

# --- 0. подготовка
Set-Location "$PSScriptRoot"
$root = Resolve-Path "$PSScriptRoot"
$fe = Join-Path $root "frontend"
$be = Join-Path $root "backend"

# --- 1. установка зависимостей (если нужно)
function Ensure-Npm($path){
  Push-Location $path
  if (-not (Test-Path "node_modules")) {
    Info "npm install  $path"
    npm i --no-audit --no-fund
  }
  Pop-Location
}

Ensure-Npm $be
Ensure-Npm $fe

# --- 2. опциональный сброс БД
if ($ResetDb) {
  Info "reset DB"
  node "$be\scripts\reset-db.js"
}

# --- 3. гарантируем наличие/обновление админа
Info "ensure admin user"
node -e "
(async()=>{
  const Database=(await import('better-sqlite3')).default;
  const bcrypt=(await import('bcryptjs')).default;
  const db=new Database('$be\\data\\app.db');
  const email='admin@site.local', pass='Admin#2025', hash=bcrypt.hashSync(pass,10);
  const row=db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if(row){ db.prepare('UPDATE users SET password_hash=?, role=\"admin\" WHERE email=?').run(hash,email); }
  else   { db.prepare('INSERT INTO users (email,password_hash,role) VALUES (?,?,\"admin\")').run(email,hash); }
  console.log('Admin ready:', email, pass);
})();
"

# --- 4. фронтенд: dev или prod
if ($Dev) {
  Info "DEV режим: запущу vite dev на 5173"
  Start-Process -WindowStyle Minimized powershell -ArgumentList "Set-Location `"$fe`"; npm run dev"
  $openUrl = "http://localhost:5173"
}
else {
  Info "BUILD фронтенда"
  Push-Location $fe
  npm run build
  Pop-Location
  $openUrl = "http://localhost:5050"
}

# --- 5. старт бэкенда
Info "Запуск backend (Express)"
# закрываем старый сервер, если есть
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -match '\\node.exe$' } | ForEach-Object {
  try {
    $cmdline = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
    if ($cmdline -match 'server\.js') { Stop-Process -Id $_.Id -Force }
  } catch {}
}

Start-Process -WindowStyle Minimized powershell -ArgumentList "Set-Location `"$be`"; node server.js"

# --- 6. ждём, пока API поднимется, и открываем браузер
function Wait-Http($url, $sec=30){
  $deadline = (Get-Date).AddSeconds($sec)
  while( (Get-Date) -lt $deadline ){
    try{
      $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    }catch{}
    Start-Sleep -Milliseconds 500
  }
  return $false
}
$health = "http://localhost:5050/api/health"
if (Wait-Http $health 25) { Ok "API готово: $health" } else { Warn "Не дождался /api/health, открываю сайт всё равно" }

# --- 7. открыть сайт
Start-Process $openUrl
Ok ("Готово. Открыт: {0}" -f $openUrl)
