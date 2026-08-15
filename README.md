# ttkai

一个开源的实时聊天应用 —— 支持群聊、私聊、多种消息类型,以及 B 站视频、网易云音乐链接的自动解析。

技术栈:**Node.js + Koa + Socket.IO + MongoDB + Redis**(服务端),**React + Redux + Webpack**(前端),TypeScript 全栈。

## 仓库来源

本仓库的代码来自 **<https://github.com/qtlark/ttkai>**,在其基础上继续开发。

而 `qtlark/ttkai` 本身又是上游开源项目 [fiora](https://github.com/yinxin630/fiora)(作者 [碎碎酱](http://suisuijiang.com),MIT 协议)的二次开发版本。

原项目与上游的版权和许可归各自作者所有,详见 [LICENSE](./LICENSE)。

## 功能

- 注册登录,数据长期保存;也可以游客身份直接围观默认群
- 群聊 / 私聊,加好友,邀请入群
- 多种消息类型:文本、表情、图片、文件、代码、语音
- 链接自动解析:B 站视频/直播间/短链、网易云音乐
- `-gpt` 指令接入大模型问答,`-roll` / `-rps` 等小指令
- 新消息桌面通知、提示音、语音朗读
- 主题、壁纸、主色调自定义
- 管理员:封禁用户/IP、全员禁言、撤回消息

## 目录结构

这是一个 Lerna 管理的 monorepo,包之间通过 `@fiora/*` 别名互相引用:

```
packages/
├── server/     Koa + Socket.IO 服务端(业务核心)
├── web/        React 前端
├── database/   Mongoose 模型 + Redis 封装
├── config/     server.ts / client.ts
├── utils/      跨端共享工具
├── i18n/       中英文案
├── assets/     头像、提示音、字体
├── bin/        运维 CLI 脚本
└── docs/       Docusaurus 文档站
scripts/dev/    本地开发用的启动脚本(见下)
```

### 架构要点

**没有 REST API。** Koa 只负责发静态文件,所有业务都走 Socket.IO 事件 + 回调:

```
前端 fetch('login', {...})  →  socket.emit(event, data, callback)
                                      ↓
服务端 中间件链 → routes[event](ctx) → cb(结果)
                                      ↓
前端拿到 [err, data]
```

`packages/server/src/app.ts` 把所有路由模块的导出函数展开成一张表,**函数名即事件名**,不需要任何路由配置。约定:回调收到字符串即错误,收到对象即成功;服务端用 `assert(条件, '中文提示')` 表达业务校验。

每个连接依次经过 5 个中间件:`seal`(封禁)→ `isLogin` → `isAdmin` → `frequency`(限流)→ `registerRoutes`(分发)。

## 快速开始

需要 **Node.js ≥ 14**、**MongoDB**、**Redis** 三样。

```bash
yarn install          # 内部会跑 lerna bootstrap, 建立 @fiora/* 软链
```

在仓库根目录建 `.env`:

```
Port=9200
Database=mongodb://localhost:27017/fiora
RedisHost=localhost
JwtSecret=换成一串随机长字符串
Administrator=<管理员的用户id, 逗号分隔>
```

开发模式(两个终端):

```bash
yarn dev:server       # 后端, 默认 9200
yarn dev:web          # 前端, 默认 8080
```

生产模式:

```bash
yarn build:web        # 构建前端并拷进 packages/server/public
yarn start
```

Windows 上开发另见 [.claude/skills/run-ttkai/SKILL.md](.claude/skills/run-ttkai/SKILL.md) 和 `scripts/dev/` 下的脚本 —— 那里记录了几个绕不开的坑(Windows 没有官方 Redis、webpack 5.45 与 OpenSSL 3 冲突、mongodb 驱动的版本上限等)。

### Docker

```bash
docker-compose up
```

## 配置项

全部通过环境变量提供,完整列表见 [packages/config/server.ts](packages/config/server.ts) 和 [client.ts](packages/config/client.ts)。几个要紧的:

| 变量 | 说明 |
|---|---|
| `JwtSecret` | **必改**。默认值是 `jwtSecret`,不改等于任何人都能伪造 token 登录任意账号 |
| `Administrator` | 管理员用户 id,逗号分隔。不配则无人能封禁用户 |
| `Database` / `RedisHost` | 数据库地址 |
| `DisableRegister` | 关闭注册 |
| `MaxGroupCount` | 每人可创建的群数量上限,默认 3 |
| `ALIYUN_OSS` | 开启后图片/文件走阿里云 OSS,否则存本地 `packages/server/public` |
| `chatGPTtoken` | `-gpt` 指令用的大模型 API token |

> `RedisMock=true` 只用于本地开发(Windows 上没有官方 Redis),它启用一个进程内的内存实现。生产环境下带这个参数会**直接拒绝启动**。

## 消息加载与阅读位置

这部分做过一轮专门优化,行为值得单独说明:

- **首屏恒定**。无论群里有 15 条还是 40 万条,进来只加载最新 15 条;向上翻页每次固定 30 条,翻到第几页开销都一样(游标翻页,不是 `skip`)。
- **新人入群不拉积压**。加入群组时阅读位置直接锚定在最新一条,不会一次性灌进几百条历史。
- **回到上次阅读位置**。离开后再回来,底部会出现「回到上次阅读位置 · N条未读」,点击跳回上次读到的地方,并画一条「以下是新消息」分隔线。消息已在本地时直接滚动,不发请求。
- **阅读位置单调**。多设备同时在线时,进度落后的设备不会把已读的消息重新变成未读。

会话列表的角标区分两种状态:**实心**表示有新消息推达,**空心**表示"上次离开前还欠着一段没读"。

## 运维脚本

```bash
npx ts-node index.ts <命令>
```

| 命令 | 作用 |
|---|---|
| `register <用户名> <密码>` | 直接建账号(绕过注册限制) |
| `getUserId <用户名>` | 查用户 id(用于配 `Administrator`) |
| `deleteUser <用户id>` | 删除用户 |
| `deleteMessages` | 清空消息 |
| `updateDefaultGroupName <新名字>` | 改默认群名 |
| `doctor` | 环境自检 |

## 开发

```bash
yarn test             # jest 单元测试
yarn ts-check         # tsc --noEmit 类型检查
yarn lint             # eslint --fix
```

> 类型检查目前存在若干**历史遗留**报错。判断自己的改动有没有引入新问题时,应当与改动前的输出做差集对比,而不是只看报错总数。

## 许可

[MIT](./LICENSE)
