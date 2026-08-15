# Start the webpack dev server for the fiora frontend on port 8081.
# Port 8081 (not 8080) because another app on this machine holds IPv4 0.0.0.0:8080.
# NODE_OPTIONS=--openssl-legacy-provider is required: webpack 5.45 still hashes with
# MD4, which OpenSSL 3 (Node 17+) refuses -> ERR_OSSL_EVP_UNSUPPORTED.
$ErrorActionPreference = "Stop"
# 环境根目录可以用 TTKAI_ENV_ROOT 覆盖, 默认是本机 conda 环境的位置
$EnvRoot = if ($env:TTKAI_ENV_ROOT) { $env:TTKAI_ENV_ROOT } else { "D:\ttkai\.conda\ttkai" }
# 仓库根目录: 本脚本在 <repo>/scripts/dev/ 下
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path


if (-not (Test-Path "$EnvRoot\node.exe")) {
    Write-Host "conda env not found at $EnvRoot" -ForegroundColor Red
    exit 1
}

$env:PATH = "$EnvRoot;$EnvRoot\Scripts;$EnvRoot\Library\bin;$env:PATH"
$env:NODE_OPTIONS = "--openssl-legacy-provider"
$env:NODE_ENV = "development"
$env:DOTENV_CONFIG_PATH = "../../.env"

Set-Location "$Repo\packages\web"
Write-Host "frontend -> http://127.0.0.1:8081" -ForegroundColor Green
npx webpack serve --config build/webpack.dev.js --port 8081 --host 127.0.0.1
