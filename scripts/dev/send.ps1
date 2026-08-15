# Send test messages into a group, as another user, to create unread state.
#
#   .\send.ps1                 -> 20 messages into "fiora" as sender2
#   .\send.ps1 -Count 25       -> 25 messages
#   .\send.ps1 -Group testgroup
#
# Note: sender2 is rate-limited to 20 messages/minute by the server's frequency
# middleware (non-new users). Asking for much more than 20 will trip it and get
# the account auto-sealed for 5 minutes.
param(
    [int]$Count = 20,
    [string]$Group = "fiora",
    [string]$User = "sender2"
)

$ErrorActionPreference = "Stop"
# 环境根目录可以用 TTKAI_ENV_ROOT 覆盖, 默认是本机 conda 环境的位置
$EnvRoot = if ($env:TTKAI_ENV_ROOT) { $env:TTKAI_ENV_ROOT } else { "D:\ttkai\.conda\ttkai" }
# 仓库根目录: 本脚本在 <repo>/scripts/dev/ 下
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if ($Count -gt 20) {
    Write-Host "warning: >20 messages will hit the per-minute rate limit" -ForegroundColor Yellow
}

$env:PATH = "$EnvRoot;$EnvRoot\Scripts;$EnvRoot\Library\bin;$env:PATH"
# socket.io-client lives in the web package
$env:NODE_PATH = "$Repo\packages\web\node_modules"
$env:U = $User
$env:G = $Group
$env:N = $Count

Write-Host "sending $Count messages to '$Group' as $User ..." -ForegroundColor Green
node "D:\ttkai\send.js"
