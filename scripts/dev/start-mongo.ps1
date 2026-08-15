# Start MongoDB 4.2 from the conda env on port 27017.
# Version 4.2 is deliberate: the project pins mongodb node driver 3.6.10,
# which only speaks to server <= 4.4. MongoDB 6/7/8 will fail to connect.
$ErrorActionPreference = "Stop"
# 环境根目录可以用 TTKAI_ENV_ROOT 覆盖, 默认是本机 conda 环境的位置
$EnvRoot = if ($env:TTKAI_ENV_ROOT) { $env:TTKAI_ENV_ROOT } else { "D:\ttkai\.conda\ttkai" }
# 仓库根目录: 本脚本在 <repo>/scripts/dev/ 下
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$DbPath = if ($env:TTKAI_DB_PATH) { $env:TTKAI_DB_PATH } else { "D:\ttkai\.mongodata" }

$existing = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "MongoDB already listening on 27017 (PID $($existing[0].OwningProcess))" -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Path $DbPath)) { New-Item -ItemType Directory -Force -Path $DbPath | Out-Null }

Write-Host "mongodb -> 127.0.0.1:27017  (data in $DbPath)" -ForegroundColor Green
& "$EnvRoot\Library\bin\mongod.exe" --dbpath $DbPath --port 27017 --bind_ip 127.0.0.1
