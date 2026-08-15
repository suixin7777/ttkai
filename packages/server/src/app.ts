import Koa from 'koa';
import koaSend from 'koa-send';
import koaStatic from 'koa-static';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';

import logger from '@fiora/utils/logger';
import config from '@fiora/config/server';
import { getSocketIp } from '@fiora/utils/socket';
import SocketModel, {
    SocketDocument,
} from '@fiora/database/mongoose/models/socket';

import seal from './middlewares/seal';
import frequency from './middlewares/frequency';
import isLogin from './middlewares/isLogin';
import isAdmin from './middlewares/isAdmin';

import * as userRoutes from './routes/user';
import * as groupRoutes from './routes/group';
import * as messageRoutes from './routes/message';
import * as systemRoutes from './routes/system';
import * as notificationRoutes from './routes/notification';
import * as historyRoutes from './routes/history';
import registerRoutes from './middlewares/registerRoutes';

const app = new Koa();
app.proxy = true;

const httpServer = http.createServer(app.callback());
const io = new Server(httpServer, {
    cors: {
        origin: config.allowOrigin || '*',
        credentials: true,
    },
    pingTimeout: 10000,
    pingInterval: 5000,
});

// serve index.html
app.use(async (ctx, next) => {
    if (
        /\/invite\/group\/[\w\d]+/.test(ctx.request.url) ||
        !/(\.)|(\/invite\/group\/[\w\d]+)/.test(ctx.request.url)
    ) {
        await koaSend(ctx, 'index.html', {
            root: path.join(__dirname, '../public'),
            maxage: 1000 * 60 * 60 * 24 * 7,
            gzip: true,
        });
    } else {
        await next();
    }
});

// serve public static files
app.use(
    koaStatic(path.join(__dirname, '../public'), {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        gzip: true,
    }),
);

const routes: Routes = {
    ...userRoutes,
    ...groupRoutes,
    ...messageRoutes,
    ...systemRoutes,
    ...notificationRoutes,
    ...historyRoutes,
};
Object.keys(routes).forEach((key) => {
    if (key.startsWith('_')) {
        routes[key] = null;
    }
});

io.on('connection', (socket) => {
    const ip = getSocketIp(socket);
    logger.trace(`connection ${socket.id} ${ip}`);

    /**
     * 这里必须同步把监听器和中间件都挂上, 不能 await 之后再挂.
     *
     * 之前的写法是先 `await SocketModel.create(...)` 再 socket.use(...),
     * 在这个空档里到达的数据包没有任何监听者, 会被 socket.io 直接丢弃 ——
     * 客户端的 ack 回调永远不触发, 表现为"连上之后第一个请求石沉大海".
     * 线上没暴露是因为前端连上后先 await initOSS(), 刚好把第一个请求延后了
     *
     * 但那个 await 本身是有意义的: login 路由会 Socket.updateOne({id}) 写入
     * 用户和环境信息, 记录还没建好的话这次更新会静默失效, 用户就不显示在线.
     * 所以改成同步注册, 再用一个闸门中间件去等这条记录建好
     */
    const socketReady = SocketModel.create({
        id: socket.id,
        ip,
    } as SocketDocument).catch((err) => {
        // 建不出来不该让整条连接卡死, 记录下来放行即可
        logger.error('[connection]', (err as Error).message);
        return null;
    });

    socket.on('disconnect', async () => {
        logger.trace(`disconnect ${socket.id}`);
        // 等建好再删, 否则闪连闪断会留下一条永远删不掉的记录
        await socketReady;
        await SocketModel.deleteOne({
            id: socket.id,
        });
    });

    socket.use(async (_packet, next) => {
        await socketReady;
        next();
    });
    socket.use(seal(socket));
    socket.use(isLogin(socket));
    socket.use(isAdmin(socket));
    socket.use(frequency(socket));
    socket.use(registerRoutes(socket, routes));
});

export default httpServer;
