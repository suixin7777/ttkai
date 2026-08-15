# Print the server's actual message-loading numbers for a group.
#
#   .\check.ps1                      -> group "fiora" as seeduser
#   .\check.ps1 -Group testgroup
#   .\check.ps1 -User sender2
param(
    [string]$Group = "fiora",
    [string]$User = "seeduser"
)

$ErrorActionPreference = "Stop"
# 环境根目录可以用 TTKAI_ENV_ROOT 覆盖, 默认是本机 conda 环境的位置
$EnvRoot = if ($env:TTKAI_ENV_ROOT) { $env:TTKAI_ENV_ROOT } else { "D:\ttkai\.conda\ttkai" }
# 仓库根目录: 本脚本在 <repo>/scripts/dev/ 下
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$env:PATH = "$EnvRoot;$EnvRoot\Scripts;$EnvRoot\Library\bin;$env:PATH"
$env:NODE_PATH = "$Repo\packages\web\node_modules"
$env:U = $User
$env:G = $Group

node "D:\ttkai\check.js"
