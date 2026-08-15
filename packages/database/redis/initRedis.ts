import redis, { RedisClient } from 'redis';
import { promisify } from 'util';
import config from '@fiora/config/server';
import logger from '@fiora/utils/logger';

/**
 * 本地开发用的内存版 Redis, 通过环境变量 RedisMock=true 启用
 *
 * Redis 官方没有 Windows 版本, 而这个项目里 Redis 只用来存封禁标记、新用户标记
 * 和全员禁言开关这几样临时状态, 本地调试时丢了也无所谓.
 * 这里只实现项目实际用到的 get / set / expire / keys 四个命令,
 * 并且保持 node 回调风格, 这样下面的 promisify 可以原样工作
 *
 * 生产环境不要开这个: 数据只在单个进程内存里, 多进程之间不共享
 */
function createMemoryClient() {
    const store = new Map<string, { value: string; expireAt: number }>();

    function read(key: string) {
        const item = store.get(key);
        if (!item) {
            return null;
        }
        if (item.expireAt !== Infinity && item.expireAt <= Date.now()) {
            store.delete(key);
            return null;
        }
        return item.value;
    }

    return {
        on() {
            // 内存实现不会有连接错误
        },
        get(key: string, cb: (err: null, value: string | null) => void) {
            cb(null, read(key));
        },
        set(key: string, value: string, cb: (err: null, res: string) => void) {
            store.set(key, { value, expireAt: Infinity });
            cb(null, 'OK');
        },
        expire(
            key: string,
            seconds: number,
            cb: (err: null, res: number) => void,
        ) {
            const item = store.get(key);
            if (!item) {
                cb(null, 0);
                return;
            }
            item.expireAt = Date.now() + seconds * 1000;
            cb(null, 1);
        },
        keys(pattern: string, cb: (err: null, res: string[]) => void) {
            // 项目里只用到 `前缀-*` 这一种通配形式
            const regexp = new RegExp(
                `^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
            );
            const matched = Array.from(store.keys()).filter(
                (key) => regexp.test(key) && read(key) !== null,
            );
            cb(null, matched);
        },
    };
}

export default function initRedis() {
    if (process.env.RedisMock === 'true') {
        /**
         * 生产环境直接拒绝启动.
         *
         * 内存实现的数据只在单个进程里, 多进程之间不共享, 重启即丢 ——
         * 封禁标记、萌新限流、全员禁言这些都会失效, 而且是静默失效.
         * 这个开关本来就是本次为本地开发新加的, 没有任何线上部署在用,
         * 所以这里可以放心地硬失败, 不会影响存量部署
         */
        if (process.env.NODE_ENV === 'production') {
            logger.error(
                '[redis]',
                'RedisMock=true 不能用于生产环境, 请接入真正的 Redis',
            );
            return process.exit(1) as never;
        }
        logger.warn('[redis]', 'using in-memory redis, do NOT use in production');
        /**
         * 断言成 RedisClient 而不是 any: 返回 any 会让 initRedis 的返回类型整体塌成 any,
         * 下面那些 promisify 出来的方法也跟着失去类型, 调用方就会冒出隐式 any 报错
         */
        return createMemoryClient() as unknown as RedisClient;
    }

    const client = redis.createClient({
        ...config.redis,
    });

    client.on('error', (err) => {
        logger.error('[redis]', err.message);
        process.exit(0);
    });

    return client;
}

const client = initRedis();

export const get = promisify(client.get).bind(client);

export const expire = promisify(client.expire).bind(client);

export async function set(key: string, value: string, expireTime = Infinity) {
    await promisify(client.set).bind(client)(key, value);
    if (expireTime !== Infinity) {
        await expire(key, expireTime);
    }
}

export const keys = promisify(client.keys).bind(client);

export async function has(key: string) {
    const v = await get(key);
    return v !== null;
}

export function getNewUserKey(userId: string) {
    return `NewUser-${userId}`;
}

export function getNewRegisteredUserIpKey(ip: string) {
    // The value of v1 is ip
    // The value of v2 is count number
    return `NewRegisteredUserIpV2-${ip}`;
}

export function getSealIpKey(ip: string) {
    return `SealIp-${ip}`;
}

export async function getAllSealIp() {
    const allSealIpKeys = await keys('SealIp-*');
    return allSealIpKeys.map((key) => key.replace('SealIp-', ''));
}

export function getSealUserKey(user: string) {
    return `SealUser-${user}`;
}

export async function getAllSealUser() {
    const allSealUserKeys = await keys('SealUser-*');
    return allSealUserKeys.map((key) => key.split('-')[1]);
}

const Minute = 60;
const Hour = Minute * 60;
const Day = Hour * 24;

export const Redis = {
    get,
    set,
    has,
    expire,
    keys,
    Minute,
    Hour,
    Day,
};

export const DisableSendMessageKey = 'DisableSendMessage';
export const DisableNewUserSendMessageKey = 'DisableNewUserSendMessageKey';
