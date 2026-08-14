import { Socket } from 'socket.io';
import {
    getNewUserKey,
    getSealUserKey,
    Redis,
} from '@fiora/database/redis/initRedis';

export const CALL_SERVICE_FREQUENTLY = '发消息过于频繁, 请冷静一会再试';
export const NEW_USER_CALL_SERVICE_FREQUENTLY =
    '发消息过于频繁, 你还处于萌新期, 不要恶意刷屏, 先冷静一会再试';

const MaxCallPerMinutes = 20;
const NewUserMaxCallPerMinutes = 5;
const ClearDataInterval = 60000;

const AutoSealDuration = 5; // minutes

type Options = {
    maxCallPerMinutes?: number;
    newUserMaxCallPerMinutes?: number;
    clearDataInterval?: number;
};

/**
 * 限制接口调用频率
 * 新用户限制每分钟5次, 老用户限制每分钟20次
 */
export default function frequency(
    socket: Socket,
    {
        maxCallPerMinutes = MaxCallPerMinutes,
        newUserMaxCallPerMinutes = NewUserMaxCallPerMinutes,
        clearDataInterval = ClearDataInterval,
    }: Options = {},
) {
    let callTimes: Record<string, number> = {};

    // 每60s清空一次次数统计
    const timer = setInterval(() => {
        callTimes = {};
    }, clearDataInterval);

    /**
     * 这个中间件是每条连接实例化一次的, 定时器原本从不清理,
     * 于是每个连过的 socket 都会永久留下一个定时器和它闭包里的 callTimes
     *
     * 判断一下 on 是否存在: 这个中间件只需要 socket 的 id 和 data,
     * 单测里传的就是只带这两个字段的假对象
     */
    if (typeof socket.on === 'function') {
        socket.on('disconnect', () => {
            clearInterval(timer);
        });
    }

    return async ([event, , cb]: MiddlewareArgs, next: MiddlewareNext) => {
        if (event !== 'sendMessage') {
            next();
        } else {
            const socketId = socket.id;
            const count = callTimes[socketId] || 0;

            const isNewUser =
                socket.data.user &&
                (await Redis.has(getNewUserKey(socket.data.user)));
            if (isNewUser && count >= newUserMaxCallPerMinutes) {
                // new user limit
                cb(NEW_USER_CALL_SERVICE_FREQUENTLY);
                await Redis.set(
                    getSealUserKey(socket.data.user),
                    socket.data.user,
                    Redis.Minute * AutoSealDuration,
                );
            } else if (count >= maxCallPerMinutes) {
                // normal user limit
                cb(CALL_SERVICE_FREQUENTLY);
                await Redis.set(
                    getSealUserKey(socket.data.user),
                    socket.data.user,
                    Redis.Minute * AutoSealDuration,
                );
            } else {
                callTimes[socketId] = count + 1;
                next();
            }
        }
    };
}
