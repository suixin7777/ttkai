---
name: run-ttkai
description: Launch the ttkai (fiora) chat app locally on Windows and drive it — starts MongoDB, the socket.io backend and the webpack dev server, seeds test data, and creates unread state. Use when asked to run, start, restart, or manually test this app, or to verify a change in the real UI rather than only in tests.
---

# Running ttkai locally (Windows)

This app is a lerna monorepo: `packages/server` (koa + socket.io + mongodb + redis)
and `packages/web` (react + redux, webpack dev server). It needs **three** processes.

Everything below was verified end to end on this machine. The non-obvious parts are
all load-bearing — read the "Why" notes before changing a command.

## Prerequisites (already installed, verify before reinstalling)

A dedicated conda env at `D:\ttkai\.conda\ttkai` holds Node and MongoDB:

```powershell
Test-Path D:\ttkai\.conda\ttkai\node.exe                  # Node 20.20.2
Test-Path D:\ttkai\.conda\ttkai\Library\bin\mongod.exe     # MongoDB 4.2.15
```

If missing, recreate it (no admin needed; `D:\Anaconda\envs` is NOT writable):

```powershell
& "D:\Anaconda\Scripts\conda.exe" create -p "D:\ttkai\.conda\ttkai" -c conda-forge "nodejs=20" "mongodb=4.2" -y
& "D:\ttkai\.conda\ttkai\npm.cmd" install -g yarn
```

**Why MongoDB 4.2 and not the latest:** the project pins mongodb node driver
`3.6.10` (see `packages/database/yarn.lock`), which only speaks to server **≤ 4.4**.
conda-forge's default `mongodb` is 6/7/8 and will fail to connect.

**Why Node 20 and not the system Node:** this is a 2021-era toolchain (lerna 4,
webpack 5.45, webpack-dev-server 3). Node 24 has not been validated here.

Dependencies: `yarn install` at the repo root (it runs `lerna bootstrap`, which
creates the `@fiora/*` symlinks the app needs at runtime). Takes ~4 minutes.

## Config

Local config lives in `.env` at the repo root (gitignored). Minimum:

```
Host=localhost
Port=9200
Database=mongodb://localhost:27017/fiora
RedisMock=true
JwtSecret=local-dev-only-secret
ALIYUN_OSS=false
```

**`RedisMock=true` is required on Windows** — Redis has no official Windows build
and conda-forge has no win-64 package. It enables an in-process implementation in
`packages/database/redis/initRedis.ts` covering only the four commands the project
uses. It hard-fails if `NODE_ENV=production`.

## Start (three separate PowerShell windows)

Scripts live in `scripts/dev/`. They default to the conda env at
`D:\ttkai\.conda\ttkai`; override with `$env:TTKAI_ENV_ROOT` on another machine
(and `$env:TTKAI_DB_PATH` for the mongo data directory).

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-mongo.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-server.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-web.ps1
```

Then open **http://127.0.0.1:8081**.

Gotchas these scripts already handle — do not "simplify" them away:

- **Port 8081, not 8080.** Another app on this machine (`ApplicationWebServer`)
  holds IPv4 `0.0.0.0:8080`; webpack only binds IPv6, so `localhost:8080`
  resolves to the wrong server and returns 404.
- **`NODE_OPTIONS=--openssl-legacy-provider` is mandatory for the web server.**
  webpack 5.45 still hashes with MD4, which OpenSSL 3 (Node 17+) refuses:
  `ERR_OSSL_EVP_UNSUPPORTED`.
- **`mongod --fork` does not exist on Windows.** Run it in its own window.
- The backend is `ts-node --transpile-only`. It does **not** hot reload —
  restart it after any change under `packages/server`, `packages/database`,
  `packages/config` or `packages/utils`. The frontend does hot reload,
  **except** reducer changes: the store is created once in `state/store.ts`,
  so a reducer edit needs a full page reload.

## Test accounts and data

`seeduser` / `sender2`, both password `test1234`, in groups `fiora` (the default
group) and `testgroup`.

To create unread state (needed to exercise the read-position features):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\send.ps1 -Count 20 -Group fiora
```

To see what the server actually returns for a conversation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\check.ps1 -Group fiora
```

Rate limits that will bite during manual testing — they are correct behaviour,
not bugs:

- **3 registrations per IP per 24h.** Counter lives in the mock Redis, so
  restarting the backend clears it.
- **New users (registered < 24h ago): 5 messages/minute**, and exceeding it
  auto-seals the account for 5 minutes. `sender2` is backdated 90 days
  specifically to avoid this; it still has the normal **20/minute** limit.

To reset all data (the backend recreates the default group on next start):

```powershell
& "D:\ttkai\.conda\ttkai\Library\bin\mongo.exe" --quiet --port 27017 fiora --eval "db.dropDatabase()"
```

## Driving it

Prefer `read_page` / `javascript_tool` over screenshots — the message list is long
and the interesting state (which message the unread divider sits between, whether
a fetch happened) is far easier to assert in the DOM than to eyeball.

Useful probes:

```js
// 会话列表的未读角标
Array.from(document.querySelectorAll('[class*="linkman--"]')).map(n => ({
  name: n.querySelector('[class*="name--"]')?.innerText,
  unread: n.querySelector('[class*="unread--"]')?.innerText || '0',
  focused: n.className.includes('focus--'),
}))

// 未读分隔线的位置 —— linaria 的类名是哈希过的, 按文字找
const list = document.querySelector('[class*="messageList"]');
const kids = Array.from(list.children);
const i = kids.findIndex(k => /以下是新消息/.test(k.innerText || ''));
({ before: kids[i-1]?.innerText, after: kids[i+1]?.innerText,
   loaded: list.querySelectorAll('[data-message-id]').length });
```

**A packet sent immediately on `connect` used to be dropped** (middlewares were
registered after an `await`). That is fixed in `packages/server/src/app.ts`, but
if you write a socket.io client script against an older build, wait ~500ms after
`connect` before the first `emit`.

## Verifying without the browser

```powershell
cd D:\ttkai\ttkai-main
node node_modules\jest\bin\jest.js          # unit tests
npx tsc --noEmit                            # type check (has pre-existing errors;
                                            # compare against a stashed baseline)
```

The repo has **pre-existing** type errors unrelated to any current change. To tell
a real regression from noise, generate a baseline with the working tree stashed and
diff the normalised output — do not just count errors, and use the same `tsc`
version for both runs.
