import Message from '../components/Message';
import socket from '../socket';

import { SEAL_TEXT, SEAL_USER_TIMEOUT } from '../../../utils/const';

/** 用户是否被封禁 */
let isSeal = false;

/**
 * 即使本地记着封禁状态, 这几个事件也必须放行.
 *
 * 它们是用户"回到正常状态"的唯一通道: 拦住 guest 会让退出登录之后连游客身份
 * 都拿不到, 界面直接空白; 拦住 login/register 会让封禁到期后也登不回来.
 * 本地这份缓存的目的只是别让被封的客户端反复骚扰服务端,
 * 不该顺手把出路也堵死 —— 真的还在封禁期的话, 服务端自然会再拒绝一次
 */
const AlwaysAllowEvents = new Set([
    'guest',
    'login',
    'register',
    'loginByToken',
    'getSTS',
]);

export default function fetch<T = any>(
    event: string,
    data = {},
    { toast = true } = {},
): Promise<[string | null, T | null]> {
    if (isSeal && !AlwaysAllowEvents.has(event)) {
        Message.error(SEAL_TEXT);
        return Promise.resolve([SEAL_TEXT, null]);
    }
    return new Promise((resolve) => {
        socket.emit(event, data, (res: any) => {
            if (typeof res === 'string') {
                if (toast) {
                    Message.error(res);
                }
                /**
                 * 服务端返回封禁状态后, 本地存储该状态
                 * 用户再触发接口请求时, 直接拒绝
                 */
                if (res === SEAL_TEXT) {
                    isSeal = true;
                    // 用户封禁和ip封禁时效不同, 这里用的短时间
                    setTimeout(() => {
                        isSeal = false;
                    }, SEAL_USER_TIMEOUT);
                }
                resolve([res, null]);
            } else {
                /**
                 * 服务端受理了请求, 说明封禁已经解除, 本地这份缓存该立刻作废.
                 *
                 * 只靠上面那个定时器的话, 本地会锁 10 分钟, 而服务端的自动封禁
                 * 只有 5 分钟 —— 被放出来之后还要再干等 5 分钟才能正常用
                 */
                isSeal = false;
                resolve([null, res]);
            }
        });
    });
}
