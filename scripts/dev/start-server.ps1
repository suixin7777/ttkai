# Start the fiora backend (socket.io + koa) on port 9200.
# Run this in its own PowerShell window; it stays in the foreground.
$ErrorActionPreference = "Stop"
# 环境根目录可以用 TTKAI_ENV_ROOT 覆盖, 默认是本机 conda 环境的位置
$EnvRoot = if ($env:TTKAI_ENV_ROOT) { $env:TTKAI_ENV_ROOT } else { "D:\ttkai\.conda\ttkai" }
# 仓库根目录: 本脚本在 <repo>/scripts/dev/ 下
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path


if (-not (Test-Path "$EnvRoot\node.exe")) {
    Write-Host "conda env not found at $EnvRoot" -ForegroundColor Red
    exit 1
}

# MongoDB must already be listening; the server exits on a failed connection.
$mongo = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
if (-not $mongo) {
    Write-Host "MongoDB is not running on 27017 - start start-mongo.ps1 first" -ForegroundColor Red
    exit 1
}

$env:PATH = "$EnvRoot;$EnvRoot\Scripts;$EnvRoot\Library\bin;$env:PATH"
$env:NODE_ENV = "development"
$env:DOTENV_CONFIG_PATH = "../../.env"

Set-Location "$Repo\packages\server"
Write-Host "backend -> http://localhost:9200" -ForegroundColor Green
npx ts-node --transpile-only -r dotenv/config src/main.ts
