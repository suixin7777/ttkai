/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import axios from 'axios';
import assert, { AssertionError } from 'assert';
import { Types } from '@fiora/database/mongoose';
import { Expo, ExpoPushErrorTicket } from 'expo-server-sdk';

import config from '@fiora/config/server';
import xss from '@fiora/utils/xss';
import logger from '@fiora/utils/logger';
import User, { UserDocument } from '@fiora/database/mongoose/models/user';
import Group, { GroupDocument } from '@fiora/database/mongoose/models/group';
import Message, {
    handleInviteV2Message,
    handleInviteV2Messages,
    MessageDocument,
} from '@fiora/database/mongoose/models/message';
import Notification from '@fiora/database/mongoose/models/notification';
import History from '@fiora/database/mongoose/models/history';
import Socket from '@fiora/database/mongoose/models/socket';

import {
    DisableSendMessageKey,
    DisableNewUserSendMessageKey,
    Redis,
} from '@fiora/database/redis/initRedis';
import client from '../../../config/client';






async function chatGPT(ctx) {
    // const res = await axios({
    //     method: 'post',
    //     url: 'https://api.chatanywhere.org/v1/chat/completions',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': "Bearer "+ config.chatGPTtoken
    //     },
    //     data: {
    //         "model": "gpt-4o-mini",
    //         "messages": [{"role": "user", "content": ctx.trim()}]
    //     }
    // });
    const res = await axios({
        method: 'post',
        url: 'https://api.deepseek.com/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "Bearer "+ config.chatGPTtoken
        },
        data: {
            "model": "deepseek-reasoner",
            "messages": [{"role": "user", "content": ctx.trim()}]
        }
    });
    assert(res.status === 200, '未配置token或ChatGPT服务端错误');
    

    try {
        return res.data.choices[0].message.content.trim();
    } catch (err) {
        assert(false, '屑CloseAI的数据解析异常');
        console.log(err);
    }

    return [];
}



async function getBV(bvid) {
    const res = await axios({
        method: 'get',
        url: `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    });
    assert(res.status === 200, 'bilibili服务端错误');
    

    try {
        return res.data.data;
    } catch (err) {
        assert(false, '屑b站的数据解析异常');
        console.log(err);
    }

    return false;
}

async function getLive(lvid) {
    const res = await axios({
        method: 'get',
        url: `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${lvid}`,
    });
    assert(res.status === 200, 'bilibili服务端错误');
    

    try {
        return res.data.data;
    } catch (err) {
        assert(false, '屑b站的数据解析异常');
        console.log(err);
    }

    return false;
}

async function getVup(uid) {
    const res = await axios({
        method: 'get',
        url: `https://api.live.bilibili.com/live_user/v1/Master/info?uid=${uid}`,
    });
    assert(res.status === 200, 'bilibili服务端错误');
    

    try {
        return res.data.data;
    } catch (err) {
        assert(false, '屑b站的数据解析异常');
        console.log(err);
    }

    return false;
}

async function short2long(surl) {
    const res = await axios({
        method: 'get',
        url: surl,
        // headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36 QIHU 360SE', 'Accept-Encoding': 'gzip, deflate', 'Accept': '*/*', 'Connection': 'keep-alive'}
    });

    assert(res.status === 200, 'bilibili服务端错误');

    try {
        return res.request.res.responseUrl;
    } catch (err) {
        assert(false, '屑b站的数据解析异常');
        console.log(err);
    }

    return false;
}




const { isValid } = Types.ObjectId;

/** 初次获取历史消息数 */
const FirstTimeMessagesCount = 15;
/** 每次调用接口获取的历史消息数 */
const EachFetchMessagesCount = 30;

const OneYear = 365 * 24 * 3600 * 1000;

/** 新加入群组时初次加载的消息数, 避免新人一进群就拉一大坨历史 */
const JoinGroupMessagesCount = 15;
/** 单次请求允许携带的最大联系人数 */
const MaxLinkmansPerRequest = 200;
/** 未读数上限, 超过后前端统一显示 99+, 没必要精确统计 */
const UnreadCountCap = 999;
/** 跳转到上次阅读位置时, 锚点上方额外带出的消息数, 用于让用户找回上下文 */
const ContextBeforeCount = 5;
/** 兼容老接口 existCount 的最大值, 防止被构造出超大 limit */
const MaxExistCount = 500;

/** 消息列表统一的字段投影 */
const MessageSelectFields = {
    type: 1,
    content: 1,
    from: 1,
    createTime: 1,
    deleted: 1,
};

/** populate 发送者时统一的字段投影 */
const MessageFromFields = { username: 1, avatar: 1, tag: 1 };

/**
 * 说明: 所有分页的条数上限都是"行数"上限, 不是"可见消息数"上限.
 * 被撤回的消息 (deleted: true) 依然会占用名额, 前端把它渲染成"撤回了消息"占位.
 * 这里刻意不过滤 deleted, 因为一旦过滤, 客户端持有的游标就可能指向一条被排除的行,
 * 翻页时会整段跳过. 要改成过滤必须所有游标查询和计数同时改, 属于另一件事
 */

type CursorDirection = 'before' | 'after';

/**
 * 构造 keyset 游标过滤条件
 *
 * 为什么用游标而不是 skip/offset:
 * 老接口把客户端持有的消息条数当偏移量, 而这个条数里混着还没落库的乐观消息,
 * 中途又可能有人发新消息或者管理员硬删消息, 偏移量一旦错位就会永久漏掉一段消息.
 * (createTime, _id) 是全序的, 不受插入和删除影响
 *
 * createTime 取的是应用服务器的 Date.now(), 同一毫秒内可能有多条消息,
 * 所以必须用 _id 做第二排序键, 否则翻页会跳过或者死循环
 */
function buildCursorFilter(
    linkmanId: string,
    cursorTime: Date | null,
    cursorId: string | null,
    direction: CursorDirection,
): any {
    if (!cursorTime) {
        return { to: linkmanId };
    }

    const timeOperator = direction === 'before' ? '$lt' : '$gt';

    if (!cursorId || !isValid(cursorId)) {
        /**
         * 没有可用的 id 兜底时只能按时间比较.
         * 同一毫秒内的消息会被整体包含或整体排除, 这是锚点消息被硬删之后可接受的降级.
         * 注意这里绝对不能把 undefined 传给 ObjectId 构造函数 —— 它会返回一个
         * 全新的随机 ObjectId, 从而静默地匹配到一个完全错误的范围
         */
        return { to: linkmanId, createTime: { [timeOperator]: cursorTime } };
    }

    return {
        to: linkmanId,
        $or: [
            { createTime: { [timeOperator]: cursorTime } },
            {
                createTime: cursorTime,
                _id: { [timeOperator]: new Types.ObjectId(cursorId) },
            },
        ],
    };
}

/**
 * 统计某个位置之后的未读消息数
 * 这里的过滤条件必须和 getLinkmanMessagesAfter 完全一致,
 * 否则会出现"角标说 3 条, 往后翻只有 2 条"这种对不上的情况
 */
async function countMessagesAfter(
    linkmanId: string,
    cursorTime: Date,
    cursorId: string | null,
) {
    const filter = buildCursorFilter(linkmanId, cursorTime, cursorId, 'after');
    /**
     * 这里没有用 countDocuments().limit(), 因为 mongoose 5 是否把 limit 透传给
     * count 命令并不确定 —— 万一没透传, 一个很久没上线的用户每次连接都会让每个联系人
     * 各跑一次完整的索引区间扫描. find + select(_id) + limit 的上限是确定生效的,
     * 而且这个查询完全被 {to, createTime, _id} 复合索引覆盖
     */
    const rows = await Message.find(filter, { _id: 1 })
        .limit(UnreadCountCap + 1)
        .lean();
    return Math.min(rows.length, UnreadCountCap);
}

/** 把请求里的条数参数收敛到合法区间 */
function normalizeCount(count: unknown, fallback: number) {
    const parsed = Number(count);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }
    return Math.min(Math.floor(parsed), EachFetchMessagesCount);
}

/**
 * 收敛老接口的 existCount 偏移量
 * 原本它未经任何校验就被拼进 limit, 传字符串 "10" 会让 30 + "10" 变成 "3010",
 * 传负数则会让 slice 从尾部取, 而 getDefaultGroupHistoryMessages 还是免登录接口
 */
function normalizeExistCount(existCount: unknown) {
    const parsed = Number(existCount);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return Math.min(Math.floor(parsed), MaxExistCount);
}

/** 把客户端传来的毫秒时间戳转成 Date, 非法值一律当成"没有游标" */
function normalizeCursorTime(value: unknown): Date | null {
    if (value === undefined || value === null) {
        return null;
    }
    const time = Number(value);
    if (!Number.isFinite(time) || time <= 0) {
        return null;
    }
    return new Date(time);
}

/**
 * 把一页消息整理成响应
 * 多查一条用来判断还有没有更多, 并且只对真正返回的那些消息做 inviteV2 补全,
 * 避免为被丢弃的消息白白多查几次数据库
 */
async function buildMessagePage(messages: any[], count: number) {
    const hasMore = messages.length > count;
    const page = hasMore ? messages.slice(0, count) : messages;
    await handleInviteV2Messages(page);
    return { page, hasMore };
}

/**
 * 游标字段统一用毫秒数返回, 客户端不需要自己从消息里推导游标.
 * 注意 messages[].createTime 保持原有的序列化方式 (Date -> ISO 字符串) 不变,
 * 只有这些新增的游标字段是数字, 以免影响已有的客户端
 */
function getCursorFields(ascendingMessages: any[]) {
    if (ascendingMessages.length === 0) {
        return {
            oldestCreateTime: null,
            oldestId: null,
            newestCreateTime: null,
            newestId: null,
        };
    }
    const oldest = ascendingMessages[0];
    const newest = ascendingMessages[ascendingMessages.length - 1];
    return {
        oldestCreateTime: new Date(oldest.createTime).getTime(),
        oldestId: oldest._id.toString(),
        newestCreateTime: new Date(newest.createTime).getTime(),
        newestId: newest._id.toString(),
    };
}

/** 石头剪刀布, 用于随机生成结果 */
const RPS = ['石头', '剪刀', '布'];

async function pushNotification(
    notificationTokens: string[],
    message: MessageDocument,
    groupName?: string,
) {
    const expo = new Expo({});

    const content =
        message.type === 'text' ? message.content : `[${message.type}]`;
    const pushMessages = notificationTokens.map((notificationToken) => ({
        to: notificationToken,
        sound: 'default',
        title: groupName || (message.from as any).username,
        body: groupName
            ? `${(message.from as any).username}: ${content}`
            : content,
        data: { focus: message.to },
    }));

    const chunks = expo.chunkPushNotifications(pushMessages as any);
    for (const chunk of chunks) {
        try {
            const results = await expo.sendPushNotificationsAsync(chunk);
            results.forEach((result) => {
                const { status, message: errMessage } =
                    result as ExpoPushErrorTicket;
                if (status === 'error') {
                    logger.warn('[Notification]', errMessage);
                }
            });
        } catch (error) {
            logger.error('[Notification]', (error as Error).message);
        }
    }
}

/**
 * 发送消息
 * 如果是发送给群组, to是群组id
 * 如果是发送给个人, to是俩人id按大小序拼接后的值
 * @param ctx Context
 */
export async function sendMessage(ctx: Context<SendMessageData>) {
    const disableSendMessage = await Redis.get(DisableSendMessageKey);
    assert(disableSendMessage !== 'true' || ctx.socket.isAdmin, '全员禁言中');

    const disableNewUserSendMessage = await Redis.get(
        DisableNewUserSendMessageKey,
    );
    if (disableNewUserSendMessage === 'true') {
        const user = await User.findById(ctx.socket.user);
        const isNewUser =
            user && user.createTime.getTime() > Date.now() - OneYear;
        assert(
            ctx.socket.isAdmin || !isNewUser,
            '新用户禁言中! 请自发维护交流环境',
        );
    }

    const { to, content } = ctx.data;
    let { type } = ctx.data;
    assert(to, 'to不能为空');

    let toGroup: GroupDocument | null = null;
    let toUser: UserDocument | null = null;
    if (isValid(to)) {
        toGroup = await Group.findOne({ _id: to });
        assert(toGroup, '群组不存在');
    } else {
        const userId = to.replace(ctx.socket.user.toString(), '');
        assert(isValid(userId), '无效的用户ID');
        toUser = await User.findOne({ _id: userId });
        assert(toUser, '用户不存在');
    }

    let messageContent = content;
    if (type === 'text') {
        assert(messageContent.length <= 2048, '消息长度过长');
        
        const rollRegex = /^-roll( ([0-9]*))?$/;
        const gptRegex  = /^-gpt( (.*))?$/;
        const missRegex = /^-miss( (.*))?$/;
        const sysRegex = /^-sys( (.*))?$/;
        const mediaRegex = /^-sp( (.*))?$/;
        const replyRegex= /^回复(.*)「(.*)」:(.*)/;
        const bvRegex   = /BV\w{10}/i;
        const liveRegex = /\w+:\/\/live.bilibili.com\/(\d+)/;
        const b23Regex  = /\w+:\/\/b23.tv\/\w{7}/;
        const b23Regex2  = /\w+:\/\/bili2233.cn\/\w{7}/;  
        const musicRegex= /.*music.163.com.*\bsong\?id=\b(\d+).*/;
        const m163Regex = /\w+:\/\/163cn.tv\/\w+/;
        if (rollRegex.test(messageContent)) {
            const regexResult = rollRegex.exec(messageContent);
            if (regexResult) {
                let numberStr = regexResult[1] || '100';
                if (numberStr.length > 5) {
                    numberStr = '99999';
                }
                const number = parseInt(numberStr, 10);
                type = 'system';
                messageContent = JSON.stringify({
                    command: 'roll',
                    value: Math.floor(Math.random() * (number + 1)),
                    top: number,
                });
            }
        } else if (/^-rps$/.test(messageContent)) {
            type = 'system';
            messageContent = JSON.stringify({
                command: 'rps',
                value: RPS[Math.floor(Math.random() * RPS.length)],
            });
        } else if (sysRegex.test(messageContent)) {
            const regexResult = sysRegex.exec(messageContent);
            if (regexResult) {
                type = 'system';
                messageContent = JSON.stringify({
                    command: 'sys',
                    tt: regexResult[1].trim()
                });
            }
        } else if (gptRegex.test(messageContent)) {
            const regexResult = gptRegex.exec(messageContent);
            if (regexResult) {
                type = 'system';
                const ansqq = await chatGPT(regexResult[1].trim());
                if (ansqq)
                {
                    messageContent = JSON.stringify({
                        command: 'gpt',
                        ask: regexResult[2].trim(),
                        answer: ansqq,
                    });
                }
            }
        } else if (missRegex.test(messageContent)) {
            const regexResult = missRegex.exec(messageContent);
            if (regexResult) {
                const user = await User.findOne({username: regexResult[1].trim()});
                if (user)
                {
                    const tt = Math.floor((Date.now() - user.lastLoginTime.getTime())/(24*3600*1000))
                    if (tt<1) {
                        messageContent = `今天也是想念${regexResult[1].trim()}的一天`;
                    } else {
                        messageContent = `想念${regexResult[1].trim()}的第${tt}天`;
                    }

                    if(regexResult[1].trim()==='yunqiao'){
                        messageContent = '想念龙小姐的第∞天';
                    }
                }else{
                    messageContent = '想念龙小姐的第∞天';
                }
            }
        } else if (replyRegex.test(messageContent)){
            const regexResult = replyRegex.exec(messageContent);
            if (regexResult) {
                type = 'reply';
                messageContent = JSON.stringify({
                    replywho: regexResult[1].replace(/<[^>]+>/gm, ''),
                    orignmsg: regexResult[2].replace(/<[^>]+>/gm, ''),
                    replymsg: regexResult[3].trim()?regexResult[3].trim():'　',
                });
            }
        } else if (bvRegex.test(messageContent)){
            const regexResult = bvRegex.exec(messageContent);
            if (regexResult) {
                const ansbv = await getBV(regexResult[0]);
                if(Object.keys(ansbv).length>0){
                    type = 'bilibili';
                    messageContent = JSON.stringify(ansbv);
                }
            }
        } else if (liveRegex.test(messageContent)){
            const regexResult = liveRegex.exec(messageContent);
            
            if (regexResult) {
                const anslv = await getLive(regexResult[1]);
                const ansup = await getVup(anslv.uid);
                delete anslv['description'];
                if(Object.keys(anslv).length>0 && Object.keys(ansup).length>0){
                    type = 'bilibili';
                    messageContent = JSON.stringify(Object.assign(anslv,ansup));
                }
            }
        } else if (b23Regex.test(messageContent) || b23Regex2.test(messageContent)){
            const regexResult = b23Regex.exec(messageContent);
            const regexResult2 = b23Regex2.exec(messageContent);
            if (regexResult || regexResult2) {
                if (regexResult){
                    const trueurl = await short2long(regexResult[0]);
                    if (bvRegex.test(trueurl)){
                        const regexResult2 = bvRegex.exec(trueurl);
                        if (regexResult2) {
                            const ansbv = await getBV(regexResult2[0]);
                            if(Object.keys(ansbv).length>0){
                                type = 'bilibili';
                                messageContent = JSON.stringify(ansbv);
                            }
                        }
                    }else if (liveRegex.test(trueurl)){
                        const regexResult3 = liveRegex.exec(trueurl);
                        if (regexResult3) {
                            const anslv = await getLive(regexResult3[1]);
                            const ansup = await getVup(anslv.uid);
    
                            if(Object.keys(anslv).length>0 && Object.keys(ansup).length>0){
                                type = 'bilibili';
                                messageContent = JSON.stringify(Object.assign(anslv,ansup));
                            }
                        }
                    }
                }else if(regexResult2){
                    const trueurl = await short2long(regexResult2[0]);
                    if (bvRegex.test(trueurl)){
                        const regexResult2 = bvRegex.exec(trueurl);
                        if (regexResult2) {
                            const ansbv = await getBV(regexResult2[0]);
                            if(Object.keys(ansbv).length>0){
                                type = 'bilibili';
                                messageContent = JSON.stringify(ansbv);
                            }
                        }
                    }else if (liveRegex.test(trueurl)){
                        const regexResult3 = liveRegex.exec(trueurl);
                        if (regexResult3) {
                            const anslv = await getLive(regexResult3[1]);
                            const ansup = await getVup(anslv.uid);
    
                            if(Object.keys(anslv).length>0 && Object.keys(ansup).length>0){
                                type = 'bilibili';
                                messageContent = JSON.stringify(Object.assign(anslv,ansup));
                            }
                        }
                    }
                }
                

            }
        } else if (musicRegex.test(messageContent)){
            const regexResult = musicRegex.exec(messageContent);
            if (regexResult) {
                type = 'music';
                messageContent = regexResult[1];
            }
        } else if (m163Regex.test(messageContent)){
            const regexResult = m163Regex.exec(messageContent);
            if (regexResult) {
                const trueurl = await short2long(regexResult[0]);
                const regexResult2 = musicRegex.exec(trueurl);
                if (regexResult2) {
                    type = 'music';
                    messageContent = regexResult2[1];
                }
            }
        } else if (mediaRegex.test(messageContent)){
            const regexResult = mediaRegex.exec(messageContent);
            if (regexResult) {
                type = 'media';
                messageContent = regexResult[1];
            }
        };
        messageContent = xss(messageContent);
    } else if (type === 'file') {
        const file: { size: number } = JSON.parse(content);
        assert(file.size < client.maxFileSize, '要发送的文件过大');
        messageContent = content;
    } else if (type === 'inviteV2') {
        const shareTargetGroup = await Group.findOne({ _id: content });
        if (!shareTargetGroup) {
            throw new AssertionError({ message: '目标群组不存在' });
        }
        const user = await User.findOne({ _id: ctx.socket.user });
        if (!user) {
            throw new AssertionError({ message: '用户不存在' });
        }
        messageContent = JSON.stringify({
            inviter: user._id,
            group: shareTargetGroup._id,
        });
    }

    const user = await User.findOne(
        { _id: ctx.socket.user },
        { username: 1, avatar: 1, tag: 1 },
    );
    if (!user) {
        throw new AssertionError({ message: '用户不存在' });
    }

    const message = await Message.create({
        from: ctx.socket.user,
        to,
        type,
        content: messageContent,
    } as MessageDocument);

    const messageData = {
        _id: message._id,
        createTime: message.createTime,
        from: user.toObject(),
        to,
        type,
        content: message.content,
    };
    if (type === 'inviteV2') {
        await handleInviteV2Message(messageData);
    }

    if (toGroup) {
        ctx.socket.emit(toGroup._id.toString(), 'message', messageData);

        const notifications = await Notification.find({
            user: {
                $in: toGroup.members,
            },
        });
        const notificationTokens: string[] = [];
        notifications.forEach((notification) => {
            // Messages sent by yourself don’t push notification to yourself
            if (
                notification.user._id.toString() === ctx.socket.user.toString()
            ) {
                return;
            }
            notificationTokens.push(notification.token);
        });
        if (notificationTokens.length) {
            pushNotification(
                notificationTokens,
                messageData as unknown as MessageDocument,
                toGroup.name,
            );
        }
    } else {
        const targetSockets = await Socket.find({ user: toUser?._id });
        const targetSocketIdList =
            targetSockets?.map((socket) => socket.id) || [];
        if (targetSocketIdList.length) {
            ctx.socket.emit(targetSocketIdList, 'message', messageData);
        }

        const selfSockets = await Socket.find({ user: ctx.socket.user });
        const selfSocketIdList = selfSockets?.map((socket) => socket.id) || [];
        if (selfSocketIdList.length) {
            ctx.socket.emit(selfSocketIdList, 'message', messageData);
        }

        const notificationTokens = await Notification.find({ user: toUser });
        if (notificationTokens.length) {
            pushNotification(
                notificationTokens.map(({ token }) => token),
                messageData as unknown as MessageDocument,
            );
        }
    }

    /**
     * 这里原本会把发送者的阅读位置直接推到刚发出的这条消息上.
     * 但"发消息"不等于"读消息": 一个群里积压了 60 条未读的用户随手发一句话,
     * 整个积压就被标记成已读了, 而这恰好就是"回到上次阅读位置"依赖的那个锚点.
     * 阅读位置改由客户端在真正滚动到底部时上报 (见 web 的 MessageList)
     */

    return messageData;
}

/**
 * 获取一组联系人的最后历史消息
 * @param ctx Context
 */
export async function getLinkmansLastMessages(
    ctx: Context<{ linkmans: string[] }>,
) {
    const allLinkmans = ctx.data.linkmans;
    assert(Array.isArray(allLinkmans), '参数linkmans应该是Array');
    // 同样是截断而不是报错, 理由见 V2
    const linkmans = allLinkmans.slice(0, MaxLinkmansPerRequest);

    const promises = linkmans.map(async (linkmanId) => {
        const messages = await Message.find(
            { to: linkmanId },
            MessageSelectFields,
            {
                sort: { createTime: -1, _id: -1 },
                limit: FirstTimeMessagesCount,
            },
        )
            .populate('from', MessageFromFields)
            .lean();
        await handleInviteV2Messages(messages);
        return messages;
    });
    const results = await Promise.all(promises);
    type Messages = {
        // .lean() 返回的是普通对象而不是 Mongoose Document
        [linkmanId: string]: any[];
    };
    const messages = linkmans.reduce((result: Messages, linkmanId, index) => {
        result[linkmanId] = (results[index] || []).reverse();
        return result;
    }, {});

    return messages;
}

/**
 * 读取用户在这批联系人上的阅读位置
 *
 * History 表历史上没有唯一约束, 同一个 (user, linkman) 可能存在重复行,
 * 所以这里显式取"最新"的那条, 而不是听天由命地取扫描顺序的最后一条 ——
 * 后者会让阅读位置随机回退, 表现为已经读过的消息又变成未读
 *
 * 老数据没有 messageCreateTime, 用一次批量查询把时间戳补出来.
 * 补不出来 (消息已被硬删) 就当作没有锚点, 而不是像以前那样报一个写死的 100
 */
async function getReadAnchors(userId: string, linkmans: string[]) {
    const histories = await History.find({
        user: userId,
        linkman: { $in: linkmans },
    }).lean();

    type Anchor = { messageId: string; createTime: Date | null };
    const anchorMap: { [linkman: string]: Anchor } = {};

    histories.filter(Boolean).forEach((history) => {
        const createTime = history.messageCreateTime
            ? new Date(history.messageCreateTime)
            : null;
        const existing = anchorMap[history.linkman];
        if (
            !existing ||
            (createTime &&
                (!existing.createTime || createTime > existing.createTime))
        ) {
            anchorMap[history.linkman] = {
                messageId: history.message,
                createTime,
            };
        }
    });

    // 补齐老数据缺失的时间戳
    const pendingIds = Object.keys(anchorMap)
        .filter(
            (linkmanId) =>
                !anchorMap[linkmanId].createTime &&
                isValid(anchorMap[linkmanId].messageId),
        )
        .map((linkmanId) => anchorMap[linkmanId].messageId);

    if (pendingIds.length > 0) {
        const anchorMessages = await Message.find(
            { _id: { $in: pendingIds } },
            { createTime: 1 },
        ).lean();
        const timeMap: { [messageId: string]: Date } = {};
        anchorMessages.forEach((message) => {
            timeMap[message._id.toString()] = new Date(message.createTime);
        });
        Object.keys(anchorMap).forEach((linkmanId) => {
            const anchor = anchorMap[linkmanId];
            if (!anchor.createTime && timeMap[anchor.messageId]) {
                anchor.createTime = timeMap[anchor.messageId];
            }
        });
    }

    return anchorMap;
}

export async function getLinkmansLastMessagesV2(
    ctx: Context<{ linkmans: string[] }>,
) {
    const allLinkmans = ctx.data.linkmans;
    // V1 有这个校验而 V2 没有, 传个非数组进来会抛原始 TypeError
    assert(Array.isArray(allLinkmans), '参数linkmans应该是Array');

    /**
     * 超出上限时截断并记日志, 而不是直接 assert 报错.
     * 这个接口在登录链路上, 一旦 assert 失败, 群+好友超过上限的用户就直接登不上了 ——
     * 那是"完全不可用", 而截断只是"体验降级"
     */
    let linkmans = allLinkmans;
    if (linkmans.length > MaxLinkmansPerRequest) {
        logger.warn(
            '[getLinkmansLastMessagesV2]',
            `linkmans truncated from ${linkmans.length} to ${MaxLinkmansPerRequest} for user ${ctx.socket.user}`,
        );
        linkmans = linkmans.slice(0, MaxLinkmansPerRequest);
    }

    const anchorMap = await getReadAnchors(ctx.socket.user.toString(), linkmans);

    const linkmansMessages = await Promise.all(
        linkmans.map(async (linkmanId) => {
            /**
             * 以前这里在有阅读记录时会拉 100 条, 只为了用 findIndex 算出一个未读数,
             * 然后把其中 85 条直接丢掉. 现在固定只拉首屏需要的条数,
             * 未读数改用走索引的 countDocuments 精确统计
             */
            const messages = await Message.find(
                { to: linkmanId },
                MessageSelectFields,
                {
                    sort: { createTime: -1, _id: -1 },
                    limit: FirstTimeMessagesCount + 1,
                },
            )
                .populate('from', MessageFromFields)
                .lean();

            const { page, hasMore } = await buildMessagePage(
                messages,
                FirstTimeMessagesCount,
            );
            return { messages: page.reverse(), hasMoreBefore: hasMore };
        }),
    );

    const unreadCounts = await Promise.all(
        linkmans.map(async (linkmanId) => {
            const anchor = anchorMap[linkmanId];
            if (!anchor || !anchor.createTime) {
                return 0;
            }
            return countMessagesAfter(
                linkmanId,
                anchor.createTime,
                anchor.messageId,
            );
        }),
    );

    type ResponseData = {
        [linkmanId: string]: {
            // .lean() 返回的是普通对象而不是 Mongoose Document
            messages: any[];
            unread: number;
            lastReadMessageId: string | null;
            lastReadCreateTime: number | null;
            hasMoreBefore: boolean;
            oldestCreateTime: number | null;
            oldestId: string | null;
        };
    };

    return linkmans.reduce((result: ResponseData, linkmanId, index) => {
        const { messages, hasMoreBefore } = linkmansMessages[index];
        const anchor = anchorMap[linkmanId];
        const cursor = getCursorFields(messages);
        result[linkmanId] = {
            messages,
            unread: unreadCounts[index],
            lastReadMessageId: anchor ? anchor.messageId : null,
            lastReadCreateTime:
                anchor && anchor.createTime
                    ? anchor.createTime.getTime()
                    : null,
            hasMoreBefore,
            oldestCreateTime: cursor.oldestCreateTime,
            oldestId: cursor.oldestId,
        };
        return result;
    }, {});
}

/**
 * 向前 (更旧) 翻页
 *
 * 不传游标时返回最新的一页, 新加入群组的首屏加载走的就是这条路径
 */
export async function getLinkmanMessagesBefore(
    ctx: Context<{
        linkmanId: string;
        beforeCreateTime?: number;
        beforeId?: string;
        count?: number;
    }>,
) {
    const { linkmanId, beforeCreateTime, beforeId, count } = ctx.data;
    assert(
        typeof linkmanId === 'string' && linkmanId.length > 0,
        '无效的联系人ID',
    );

    const limit = normalizeCount(count, EachFetchMessagesCount);
    const cursorTime = normalizeCursorTime(beforeCreateTime);
    const filter = buildCursorFilter(
        linkmanId,
        cursorTime,
        beforeId || null,
        'before',
    );

    const messages = await Message.find(filter, MessageSelectFields, {
        sort: { createTime: -1, _id: -1 },
        limit: limit + 1,
    })
        .populate('from', MessageFromFields)
        .lean();

    const { page, hasMore } = await buildMessagePage(messages, limit);
    const ascending = page.reverse();

    return {
        messages: ascending,
        hasMore,
        ...getCursorFields(ascending),
    };
}

/**
 * 向后 (更新) 翻页
 * 这是"从上次读到的地方继续往下看"的引擎
 */
export async function getLinkmanMessagesAfter(
    ctx: Context<{
        linkmanId: string;
        afterCreateTime: number;
        afterId?: string;
        count?: number;
    }>,
) {
    const { linkmanId, afterCreateTime, afterId, count } = ctx.data;
    assert(
        typeof linkmanId === 'string' && linkmanId.length > 0,
        '无效的联系人ID',
    );

    const cursorTime = normalizeCursorTime(afterCreateTime);
    assert(cursorTime, '无效的游标参数');

    const limit = normalizeCount(count, EachFetchMessagesCount);
    const filter = buildCursorFilter(
        linkmanId,
        cursorTime,
        afterId || null,
        'after',
    );

    const messages = await Message.find(filter, MessageSelectFields, {
        sort: { createTime: 1, _id: 1 },
        limit: limit + 1,
    })
        .populate('from', MessageFromFields)
        .lean();

    const { page, hasMore } = await buildMessagePage(messages, limit);

    return {
        messages: page,
        hasMore,
        ...getCursorFields(page),
    };
}

/**
 * 一键回到上次阅读位置
 *
 * 锚点由服务端自己从 History 读, 客户端不需要 (也不应该) 传进来.
 * 这样即使客户端从来没收到过那条消息, 或者页面刚刷新, 或者未读数超过任何上限,
 * 甚至锚点消息已经被管理员硬删了 (此时时间戳依然有效), 都能正确定位
 */
export async function getLinkmanUnreadContext(
    ctx: Context<{ linkmanId: string; count?: number }>,
) {
    const { linkmanId, count } = ctx.data;
    assert(
        typeof linkmanId === 'string' && linkmanId.length > 0,
        '无效的联系人ID',
    );

    const limit = normalizeCount(count, EachFetchMessagesCount);
    const anchorMap = await getReadAnchors(ctx.socket.user.toString(), [
        linkmanId,
    ]);
    const anchor = anchorMap[linkmanId];

    // 没有阅读记录就等于已经读完了, 直接给最新的一屏
    if (!anchor || !anchor.createTime) {
        const latest = await Message.find(
            { to: linkmanId },
            MessageSelectFields,
            { sort: { createTime: -1, _id: -1 }, limit: FirstTimeMessagesCount },
        )
            .populate('from', MessageFromFields)
            .lean();
        await handleInviteV2Messages(latest);
        const ascending = latest.reverse();
        return {
            anchorMessageId: null,
            anchorCreateTime: null,
            messages: ascending,
            hasMoreAfter: false,
            unread: 0,
            ...getCursorFields(ascending),
        };
    }

    const anchorId = isValid(anchor.messageId) ? anchor.messageId : null;

    /**
     * before 和 after 必须是严格互补的两个集合, 中间不能漏.
     * before 取"早于锚点, 或与锚点同时且 id 不大于锚点"的消息,
     * after 取它的补集. 否则同一毫秒内的消息会两边都落不到,
     * 而客户端后续的翻页游标又是从这个窗口的边界算的, 漏掉就会变成永久空洞
     */
    const beforeFilter = anchorId
        ? {
            to: linkmanId,
            $or: [
                { createTime: { $lt: anchor.createTime } },
                {
                    createTime: anchor.createTime,
                    _id: { $lte: new Types.ObjectId(anchorId) },
                },
            ],
        }
        : { to: linkmanId, createTime: { $lte: anchor.createTime } };

    const [beforeMessages, afterMessages, unread] = await Promise.all([
        Message.find(beforeFilter, MessageSelectFields, {
            sort: { createTime: -1, _id: -1 },
            limit: ContextBeforeCount,
        })
            .populate('from', MessageFromFields)
            .lean(),
        Message.find(
            buildCursorFilter(linkmanId, anchor.createTime, anchorId, 'after'),
            MessageSelectFields,
            { sort: { createTime: 1, _id: 1 }, limit: limit + 1 },
        )
            .populate('from', MessageFromFields)
            .lean(),
        countMessagesAfter(linkmanId, anchor.createTime, anchorId),
    ]);

    const { page: afterPage, hasMore: hasMoreAfter } = await buildMessagePage(
        afterMessages,
        limit,
    );
    await handleInviteV2Messages(beforeMessages);

    // before ++ after 拼成一段连续的升序窗口, 客户端整体替换即可
    const messages = [...beforeMessages.reverse(), ...afterPage];

    return {
        anchorMessageId: anchor.messageId,
        anchorCreateTime: anchor.createTime.getTime(),
        messages,
        hasMoreAfter,
        unread,
        ...getCursorFields(messages),
    };
}

/**
 * 获取联系人的历史消息
 * @param ctx Context
 */
export async function getLinkmanHistoryMessages(
    ctx: Context<{ linkmanId: string; existCount: number }>,
) {
    const { linkmanId, existCount } = ctx.data;
    const skip = normalizeExistCount(existCount);

    /**
     * 保持原有的偏移量语义和返回结构不变 (新客户端已改用游标接口, 这里只服务老客户端),
     * 但把"多查 existCount 条再切掉"换成 skip, 被跳过的文档不再被实例化 / populate /
     * 走一遍 inviteV2 补全
     */
    const messages = await Message.find(
        { to: linkmanId },
        MessageSelectFields,
        {
            sort: { createTime: -1, _id: -1 },
            skip,
            limit: EachFetchMessagesCount,
        },
    )
        .populate('from', MessageFromFields)
        .lean();
    await handleInviteV2Messages(messages);
    return messages.reverse();
}

/**
 * 获取默认群组的历史消息
 * @param ctx Context
 */
/**
 * 默认群组 id 缓存
 * GroupSchema 只在 name 上建了索引, isDefault 没有索引, 而这个查询原本每次调用都跑一遍,
 * 偏偏它还是唯一一个游客也能调的消息接口
 */
let defaultGroupIdCache = '';
let defaultGroupIdExpireTime = 0;
const DefaultGroupCacheDuration = 1000 * 60 * 10;

async function getDefaultGroupId() {
    if (defaultGroupIdCache && Date.now() < defaultGroupIdExpireTime) {
        return defaultGroupIdCache;
    }
    const group = await Group.findOne({ isDefault: true }, { _id: 1 }).lean();
    if (!group) {
        throw new AssertionError({ message: '默认群组不存在' });
    }
    defaultGroupIdCache = group._id.toString();
    defaultGroupIdExpireTime = Date.now() + DefaultGroupCacheDuration;
    return defaultGroupIdCache;
}

/**
 * 这是唯一一个免登录可调的消息接口 (见 middlewares/isLogin.ts),
 * 返回结构必须保持"裸数组"不变, 否则会直接打断线上老客户端的游客浏览
 */
export async function getDefaultGroupHistoryMessages(
    ctx: Context<{ existCount: number }>,
) {
    const { existCount } = ctx.data;
    const skip = normalizeExistCount(existCount);

    const groupId = await getDefaultGroupId();
    const messages = await Message.find({ to: groupId }, MessageSelectFields, {
        sort: { createTime: -1, _id: -1 },
        skip,
        limit: EachFetchMessagesCount,
    })
        .populate('from', MessageFromFields)
        .lean();
    await handleInviteV2Messages(messages);
    return messages.reverse();
}

/**
 * 删除消息, 需要管理员权限
 */
export async function deleteMessage(ctx: Context<{ messageId: string }>) {
    assert(
        !client.disableDeleteMessage || ctx.socket.isAdmin,
        '已禁止撤回消息',
    );

    const { messageId } = ctx.data;
    assert(messageId, 'messageId不能为空');

    const message = await Message.findOne({ _id: messageId });
    if (!message) {
        throw new AssertionError({ message: '消息不存在' });
    }
    assert(
        ctx.socket.isAdmin ||
            message.from.toString() === ctx.socket.user.toString(),
        '只能撤回本人的消息',
    );

    if (ctx.socket.isAdmin) {
        await Message.deleteOne({ _id: messageId });
    } else {
        message.deleted = true;
        await message.save();
    }

    /**
     * 广播删除消息通知, 区分群消息和私聊消息
     */
    const messageName = 'deleteMessage';
    const messageData = {
        linkmanId: message.to.toString(),
        messageId,
        isAdmin: ctx.socket.isAdmin,
    };
    if (isValid(message.to)) {
        // 群消息
        ctx.socket.emit(message.to.toString(), messageName, messageData);
    } else {
        // 私聊消息
        const targetUserId = message.to.replace(ctx.socket.user.toString(), '');
        const targetSockets = await Socket.find({ user: targetUserId });
        const targetSocketIdList =
            targetSockets?.map((socket) => socket.id) || [];
        if (targetSocketIdList) {
            ctx.socket.emit(targetSocketIdList, messageName, messageData);
        }

        const selfSockets = await Socket.find({ user: ctx.socket.user });
        const selfSocketIdList = selfSockets?.map((socket) => socket.id) || [];
        if (selfSocketIdList) {
            ctx.socket.emit(
                selfSocketIdList.filter(
                    (socketId) => socketId !== ctx.socket.id,
                ),
                messageName,
                messageData,
            );
        }
    }

    return {
        msg: 'ok',
    };
}
