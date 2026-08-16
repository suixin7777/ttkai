import { isMobile } from '@fiora/utils/ua';
import getFriendId from '@fiora/utils/getFriendId';
import convertMessage from '@fiora/utils/convertMessage';
import getData from '../localStorage';
import {
    Action,
    ActionTypes,
    SetUserPayload,
    SetStatusPayload,
    AddLinkmanPayload,
    AddLinkmanHistoryMessagesPayload,
    SetLinkmanMessagesWindowPayload,
    AddLinkmanForwardMessagesPayload,
    SetLinkmanReadStatePayload,
    SetLinkmansLastMessagesPayload,
    SetLinkmanPropertyPayload,
    UpdateMessagePayload,
    AddLinkmanMessagePayload,
    UpdateUserInfoPayload,
    DeleteMessagePayload,
} from './action';

/** 聊天消息 */
export interface Message {
    _id: string;
    type: string;
    content: string;
    from: {
        _id: string;
        username: string;
        avatar: string;
        originUsername: string;
        tag: string;
    };
    loading: boolean;
    percent: number;
    createTime: string;
    deleted?: boolean;
}

export interface MessagesMap {
    [messageId: string]: Message;
}

export interface GroupMember {
    user: {
        _id: string;
        username: string;
        avatar: string;
    };
    os: string;
    browser: string;
    environment: string;
}

/** 群组 */
export interface Group {
    _id: string;
    name: string;
    avatar: string;
    createTime: string;
    creator: string;
    onlineMembers: GroupMember[];
}

/** 好友 */
export interface Friend {
    _id: string;
    name: string;
    avatar: string;
    createTime: string;
}

/** 联系人 */
export interface Linkman extends Group, User {
    type: string;
    unread: number;
    messages: MessagesMap;

    /**
     * 向前翻页的游标.
     * 以前翻页是拿"客户端持有的消息条数"当偏移量, 那个数字既包含还没落库的乐观消息,
     * 也会被 SetFocus 的裁剪破坏. 换成游标之后裁剪就只是单纯的内存回收了
     */
    oldestCreateTime?: number | null;
    oldestId?: string | null;
    /** 是否还有更早的消息 */
    hasMoreBefore?: boolean;

    /** 当前窗口最新一条消息的游标, 用于从阅读位置继续往后拉 */
    newestCreateTime?: number | null;
    newestId?: string | null;
    /**
     * 当前窗口和实时最新消息之间是否存在断层.
     * 跳回上次阅读位置之后就是这个状态, 此时新到的消息只能累加未读数,
     * 绝对不能直接追加进窗口 —— 那样会渲染成乱序, 并且伪造出"消息是连续的"这个假象
     */
    hasGapAfter?: boolean;

    /** 服务端记录的阅读位置 */
    lastReadMessageId?: string | null;
    lastReadCreateTime?: number | null;
    /**
     * 进入会话前的未读数快照.
     * SetFocus 会把 unread 清零, 不先存一份的话, "还有 N 条未读"这个信息
     * 在用户点开会话的瞬间就永远拿不回来了
     */
    unreadSnapshot?: number;
    /** 跳转锚点, 用于滚动定位和画未读分隔线 */
    anchorMessageId?: string | null;

    /**
     * 会话级阅读锚点 —— 进入会话那一刻"上次读到哪"的快照.
     *
     * 为什么不复用上面两个: anchorMessageId 归 SetLinkmanMessagesWindow 所有,
     * unreadSnapshot 是侧边栏角标的口径. 谁都不能借用, 否则会互相污染
     *
     * 这份状态只活在内存里, 永不落库 —— 服务端 createOrUpdateHistory 是严格单调的,
     * 往回写本来也写不进去. 关掉标签页就没了, 这正是"会话级"的含义
     */
    sessionAnchorId?: string | null;
    sessionAnchorCreateTime?: number | null;
    /** 钉住那一刻的未读数, 消息还在窗口里时会用实时计算的值覆盖它 */
    sessionAnchorUnread?: number;

    /**
     * 用户在"窗口有断层"的状态下发消息的次数, 单调递增.
     *
     * 断层状态下新消息不会进窗口 (会渲染成乱序), 自己发的也一样 ——
     * 于是用户发完消息什么都看不见. 这个序号是给界面的信号:
     * 变了就说明"用户想说话", 该带他回到最新消息那里
     */
    selfMessageSeq?: number;
}

export interface LinkmansMap {
    [linkmanId: string]: Linkman;
}

/** 用户信息 */
export interface User {
    _id: string;
    username: string;
    avatar: string;
    isOnline: boolean;
}

/** redux store state */
export interface State {
    /** 用户信息 */
    user: {
        _id: string;
        username: string;
        avatar: string;
        tag: string;
        isAdmin: boolean;
    } | null;
    linkmans: LinkmansMap;
    /** 聚焦的联系人 */
    focus: string;
    /** 客户端连接状态 */
    connect: boolean;
    /** 客户端的一些状态值 */
    status: {
        ready: boolean;
        /** 是否显示登陆注册框 */
        loginRegisterDialogVisible: boolean;
        /** 主题 */
        theme: string;
        /** 自身主色调 */
        primaryColor: string;
        /** 自身文字主色调 */
        primaryTextColor: string;
        /** 对方主色调 */
        anataColor: string;
        /** 对方文字主色调 */
        anataTextColor: string;
        /** 背景图 */
        backgroundImage: string;
        /** 启用毛玻璃效果 */
        aero: boolean;
        /** 新消息声音提示开关 */
        soundSwitch: boolean;
        /** 声音类型 */
        sound: string;
        /** 新消息桌面提醒开关 */
        notificationSwitch: boolean;
        /** 新消息语言朗读开关 */
        voiceSwitch: boolean;
        /** 是否朗读个人发送的消息开关 */
        selfVoiceSwitch: boolean;
        /**
         * 用户标签颜色模式
         * singleColor: 固定颜色
         * fixedColor: 同一词始终同一颜色
         * randomColor: 同一词在每次渲染中保持同一颜色
         */
        tagColorMode: string;
        /** 是否展示侧边栏 */
        sidebarVisible: boolean;
        /** 是否展示搜索+联系人列表栏 */
        functionBarAndLinkmanListVisible: boolean;
        /** enable search expression when input some phrase */
        enableSearchExpression: boolean;
    };
}

/**
 * 将联系人以_id为键转为对象结构
 * @param linkmans 联系人数组
 */
function getLinkmansMap(linkmans: Linkman[]) {
    return linkmans.reduce((map: LinkmansMap, linkman) => {
        map[linkman._id] = linkman;
        return map;
    }, {});
}

/**
 * 将消息以_id为键转为对象结构
 * @param messages 消息数组
 */
function getMessagesMap(messages: Message[]) {
    return messages.reduce((map: MessagesMap, message) => {
        map[message._id] = message;
        return map;
    }, {});
}

/**
 * 删除对象中的对个键值
 * @param obj 目标对象
 * @param keys 要删除的键列表
 */
function deleteObjectKeys<T>(obj: T, keys: string[]): T {
    let entries = Object.entries(obj);
    const keysSet = new Set(keys);
    entries = entries.filter((entry) => !keysSet.has(entry[0]));
    return entries.reduce((result: any, entry) => {
        const [k, v] = entry;
        result[k] = v;
        return result;
    }, {});
}

/**
 * 删除对象中的某个键值
 * 直接调用delete删除键值据说性能差(我没验证)
 * @param obj 目标对象
 * @param key 要删除的键
 */
function deleteObjectKey<T>(obj: T, key: string): T {
    return deleteObjectKeys(obj, [key]);
}

/**
 * 取值, 为 null/undefined 时回退到默认值
 * 服务端可能是尚未升级的版本, 新增字段会整个缺失
 */
function fallback<T>(value: T | null | undefined, defaultValue: T): T {
    return value === undefined || value === null ? defaultValue : value;
}

/**
 * 单个联系人在内存里最多保留的消息数
 * 以前唯一的回收点是 SetFocus, 而它只作用于正在切入的那个联系人,
 * 于是一个你从来不点开的活跃群会把整场会话的消息全部堆在内存里,
 * 并且每来一条新消息都要整体复制一遍这个 map
 */
const MaxLoadedMessages = 200;

/**
 * 超出上限时从最旧的一端裁掉
 * @param messages 消息map
 * @param keepNewest 是否保留最新的一端
 */
function trimMessages(messages: MessagesMap, keepNewest = true): MessagesMap {
    const keys = Object.keys(messages);
    if (keys.length <= MaxLoadedMessages) {
        return messages;
    }
    const dropKeys = keepNewest
        ? keys.slice(0, keys.length - MaxLoadedMessages)
        : keys.slice(MaxLoadedMessages);
    return deleteObjectKeys(messages, dropKeys);
}

/**
 * 取消息map里最旧/最新的一条
 * 消息在 map 里的顺序完全依赖插入顺序, 这里遵循同一套约定
 */
function getEdgeMessage(messages: MessagesMap, edge: 'oldest' | 'newest') {
    const keys = Object.keys(messages);
    if (keys.length === 0) {
        return null;
    }
    return messages[edge === 'oldest' ? keys[0] : keys[keys.length - 1]];
}

/**
 * 初始化联系人部分公共字段
 * @param linkman 联系人
 * @param type 联系人类型
 */
function initLinkmanFields(linkman: Linkman, type: string) {
    linkman.type = type;
    linkman.unread = 0;
    linkman.messages = {};
    linkman.oldestCreateTime = null;
    linkman.oldestId = null;
    linkman.hasMoreBefore = true;
    linkman.newestCreateTime = null;
    linkman.newestId = null;
    linkman.hasGapAfter = false;
    linkman.lastReadMessageId = null;
    linkman.lastReadCreateTime = null;
    linkman.unreadSnapshot = 0;
    linkman.anchorMessageId = null;
    // 必须一起重置: 退出登录不会刷新页面, 而默认群的 id 是所有账号共用的,
    // 漏了这几个字段就会把上一个账号的阅读位置泄漏给下一个账号
    linkman.sessionAnchorId = null;
    linkman.sessionAnchorCreateTime = null;
    linkman.sessionAnchorUnread = 0;
    linkman.selfMessageSeq = 0;
}

/** 落库消息的 id 形态, 上传中的乐观消息用的是 `${linkmanId}${Date.now()}` */
const ObjectIdShape = /^[0-9a-f]{24}$/i;

type SessionAnchor = {
    sessionAnchorId: string | null;
    sessionAnchorCreateTime: number | null;
    sessionAnchorUnread: number;
};

/** 清空的会话锚点, 表示"这个会话没什么可跳回去的" */
const EmptySessionAnchor: SessionAnchor = {
    sessionAnchorId: null,
    sessionAnchorCreateTime: null,
    sessionAnchorUnread: 0,
};

/**
 * 进入会话时决定要不要钉一个阅读锚点.
 *
 * 条件不满足时返回空锚点而不是保留旧的 —— 用 unread 而不是 unreadSnapshot 判断,
 * 否则一个陈旧的锚点会自己养活自己, 每次重进都续命一次
 */
function pickSessionAnchor(linkman: Linkman): SessionAnchor {
    if (!linkman.unread || linkman.unread <= 0) {
        return EmptySessionAnchor;
    }
    const messageId = linkman.lastReadMessageId;
    // 临时会话 (陌生人私聊) 的 unread 是硬塞的 1, 并没有真实阅读位置;
    // 上传中的乐观消息 id 也不是 ObjectId, 都不能拿来当锚点
    if (!messageId || !ObjectIdShape.test(messageId)) {
        return EmptySessionAnchor;
    }
    const loaded = linkman.messages[messageId];
    const createTime = loaded
        ? new Date(loaded.createTime).getTime()
        : linkman.lastReadCreateTime;
    if (createTime === null || createTime === undefined || !Number.isFinite(createTime)) {
        return EmptySessionAnchor;
    }
    return {
        sessionAnchorId: messageId,
        sessionAnchorCreateTime: createTime,
        sessionAnchorUnread: linkman.unread,
    };
}

/**
 * "进入某个会话"要做的全部状态变更.
 *
 * SetFocus 和 RemoveLinkman 共用这一份 —— 退群/删好友时焦点会被动挪到另一个
 * 会话, 那条路径并不会 dispatch SetFocus, 各写一套的话它就会漏掉清未读、
 * 存快照、钉锚点这些动作, 表现为"被踢出群之后, 新落焦的会话红点擦不掉"
 *
 * @param isEntering 是否真的换了会话. 为 false 时保留已钉住的锚点不动 ——
 *   Linkman 的点击是无条件 dispatch 的, 连点当前会话也会走进来, 这时
 *   unread 已经是 0, 重算会把锚点清掉
 */
function enterLinkman(linkman: Linkman, isEntering: boolean) {
    const sessionAnchor = isEntering
        ? pickSessionAnchor(linkman)
        : {
            sessionAnchorId: linkman.sessionAnchorId ?? null,
            sessionAnchorCreateTime: linkman.sessionAnchorCreateTime ?? null,
            sessionAnchorUnread: linkman.sessionAnchorUnread ?? 0,
        };

    /**
     * 为了优化性能
     * 如果目标联系人的旧消息个数超过50条, 仅保留50条
     */
    // RemoveLinkman 会对"被动落焦"的那个联系人调用本函数, 而它可能是任何形态,
    // 不像 SetFocus 那样必然经过 initLinkmanFields, 所以这里要容忍 messages 缺失
    const messages = linkman.messages || {};
    const messageKeys = Object.keys(messages);
    let reserveMessages = messages;
    let { oldestCreateTime, oldestId, hasMoreBefore } = linkman;
    if (messageKeys.length > 50) {
        /**
         * 裁剪不能把锚点本身裁掉.
         * "进群时已经堆了 50+ 条流进来的消息"恰恰是这个功能存在的理由,
         * 在这条路径上丢掉锚点等于丢掉分隔线. 锚点之后的消息数量
         * 由 AddLinkmanMessage 的 200 条上限兜底, 不会无限增长
         */
        let dropCount = messageKeys.length - 50;
        if (sessionAnchor.sessionAnchorId) {
            const anchorIndex = messageKeys.indexOf(
                sessionAnchor.sessionAnchorId,
            );
            if (anchorIndex >= 0) {
                dropCount = Math.min(dropCount, anchorIndex);
            }
        }
        reserveMessages =
            dropCount > 0
                ? deleteObjectKeys(messages, messageKeys.slice(0, dropCount))
                : messages;
        /**
         * 裁剪之后向前翻页的游标必须跟着挪到幸存的最旧一条上,
         * 否则下次往上翻会从一个已经不在窗口里的位置开始, 中间那段就永远看不到了
         */
        const oldest = getEdgeMessage(reserveMessages, 'oldest');
        if (oldest) {
            oldestCreateTime = new Date(oldest.createTime).getTime();
            oldestId = oldest._id;
            hasMoreBefore = true;
        }
    }

    return {
        messages: reserveMessages,
        unread: 0,
        /**
         * 先把未读数存一份再清零, 这样"回到上次阅读位置"的提示条才有东西可显示.
         * 注意这里刻意不动 hasGapAfter —— 裁剪保留的是"当前窗口"最新的 50 条,
         * 对一个跳转过的窗口来说, 它和实时消息之间的断层依然存在
         *
         * 用 `||` 而不是直接赋值: 再次点开一个已经打开过的会话时 unread 已经是 0,
         * 直接写会把快照抹掉, 提示条就消失了, 可用户其实一条都还没读
         */
        /**
         * 已经钉过锚点说明上次进来没读完, 这次的 unread 是那之后新到的,
         * 和快照不相交, 要累加. 直接覆盖会把上次的积压抹掉
         */
        unreadSnapshot: linkman.sessionAnchorId
            ? (linkman.unreadSnapshot || 0) + linkman.unread
            : linkman.unread || linkman.unreadSnapshot || 0,
        oldestCreateTime,
        oldestId,
        hasMoreBefore,
        ...sessionAnchor,
    };
}

/**
 * 转换群组数据结构
 * @param group 群组
 */
function transformGroup(group: Linkman): Linkman {
    initLinkmanFields(group, 'group');
    group.creator = group.creator || '';
    group.onlineMembers = [];
    return group;
}

/**
 * 转换好友数据结构
 * @param friend 好友
 */
function transformFriend(friend: Linkman): Linkman {
    // @ts-ignore
    const { from, to } = friend;
    const transformedFriend = {
        _id: getFriendId(from, to._id),
        name: to.username,
        avatar: to.avatar,
        // @ts-ignore
        createTime: friend.createTime,
    };
    initLinkmanFields(transformedFriend as unknown as Linkman, 'friend');
    return transformedFriend as Linkman;
}

function transformTemporary(temporary: Linkman): Linkman {
    initLinkmanFields(temporary, 'temporary');
    return temporary;
}

const localStorage = getData();
export const initialState: State = {
    user: null,
    linkmans: {},
    focus: '',
    connect: false,
    status: {
        ready: false,
        /**
         * 本地没有 token 就直接把登录框摆出来.
         *
         * 不这样的话, 从打开页面到 socket 连上、发现没登录、再 dispatch 显示,
         * 中间有一段空窗期是完全空白的界面. 有 token 时不弹 ——
         * 让它先去静默登录, 失败了 socket.ts 会再把这个开关打开
         */
        loginRegisterDialogVisible: !window.localStorage.getItem('token'),
        theme: localStorage.theme,
        primaryColor: localStorage.primaryColor,
        primaryTextColor: localStorage.primaryTextColor,
        anataColor: localStorage.anataColor,
        anataTextColor: localStorage.anataTextColor,
        backgroundImage: localStorage.backgroundImage,
        aero: localStorage.aero,
        soundSwitch: localStorage.soundSwitch,
        sound: localStorage.sound,
        notificationSwitch: localStorage.notificationSwitch,
        voiceSwitch: localStorage.voiceSwitch,
        selfVoiceSwitch: localStorage.selfVoiceSwitch,
        tagColorMode: localStorage.tagColorMode,
        sidebarVisible: !isMobile,
        functionBarAndLinkmanListVisible: !isMobile,
        enableSearchExpression: localStorage.enableSearchExpression,
    },
};

function reducer(state: State = initialState, action: Action): State {
    switch (action.type) {
        case ActionTypes.Ready: {
            return {
                ...state,
                status: {
                    ...state.status,
                    ready: true,
                },
            };
        }
        case ActionTypes.Connect: {
            return {
                ...state,
                connect: true,
            };
        }
        case ActionTypes.Disconnect: {
            return {
                ...state,
                connect: false,
            };
        }

        case ActionTypes.SetGuest: {
            const group = action.payload as Linkman;
            transformGroup(group);
            return {
                ...state,
                user: {
                    _id: '',
                    username: '',
                    avatar: '',
                    tag: '',
                    isAdmin: false,
                },
                linkmans: {
                    [group._id]: group,
                },
                focus: group._id,
            };
        }

        case ActionTypes.SetUser: {
            const { _id, username, avatar, tag, groups, friends, isAdmin } =
                action.payload as SetUserPayload;
            // @ts-ignore
            const linkmans: Linkman[] = [
                // @ts-ignore
                ...groups.map(transformGroup),
                // @ts-ignore
                ...friends.map(transformFriend),
            ];

            // 如果没登录过, 则将聚焦联系人设置为第一个联系人
            let { focus } = state;
            /* istanbul ignore next */
            if (!state.user && linkmans.length > 0) {
                focus = linkmans[0]._id;
            }

            const linkmansMap = getLinkmansMap(linkmans);

            /**
             * socket 每次自动重连都会重跑一遍登录流程, 进而重跑 SetUser,
             * 而 transformGroup / transformFriend 会把 messages 清空.
             * 网络一抖, 用户翻了半天的历史消息就全没了, 还要再拉一遍全量.
             * 因此同一个用户重连时, 保留已经加载好的消息和游标
             *
             * 这里必须比对 user._id: 退出登录并不会刷新页面, 如果不加判断,
             * A 账号的消息就会泄漏到 B 账号的会话里 (默认群这种 id 是共享的)
             */
            const isSameUser = !!state.user && state.user._id === _id;
            if (isSameUser) {
                Object.keys(linkmansMap).forEach((linkmanId) => {
                    const existing = state.linkmans[linkmanId];
                    if (existing) {
                        linkmansMap[linkmanId] = {
                            ...linkmansMap[linkmanId],
                            messages: existing.messages,
                            unread: existing.unread,
                            unreadSnapshot: existing.unreadSnapshot,
                            oldestCreateTime: existing.oldestCreateTime,
                            oldestId: existing.oldestId,
                            newestCreateTime: existing.newestCreateTime,
                            newestId: existing.newestId,
                            hasMoreBefore: existing.hasMoreBefore,
                            hasGapAfter: existing.hasGapAfter,
                            lastReadMessageId: existing.lastReadMessageId,
                            lastReadCreateTime: existing.lastReadCreateTime,
                            anchorMessageId: existing.anchorMessageId,
                            // 断线重连会整套重跑登录流程, 这里不带上就会把
                            // 用户正看着的那条分隔线弄丢
                            sessionAnchorId: existing.sessionAnchorId,
                            sessionAnchorCreateTime:
                                existing.sessionAnchorCreateTime,
                            sessionAnchorUnread: existing.sessionAnchorUnread,
                        };
                    }
                });
            }

            return {
                ...state,
                user: {
                    _id,
                    username,
                    avatar,
                    tag,
                    isAdmin,
                },
                linkmans: linkmansMap,
                focus,
            };
        }

        case ActionTypes.UpdateUserInfo: {
            const payload = action.payload as UpdateUserInfoPayload;
            return {
                ...state,
                // @ts-ignore
                user: {
                    ...state.user,
                    ...payload,
                },
            };
        }

        case ActionTypes.Logout: {
            return {
                ...initialState,
                status: {
                    ...state.status,
                    /**
                     * 退出登录后立刻把登录框摆出来.
                     *
                     * 不这样的话, 从点退出到 socket 重连上、发现没登录、再打开登录框
                     * 中间有一段空窗期 —— 而现在没有游客模式, 那段时间界面是全空的
                     */
                    loginRegisterDialogVisible: true,
                },
            };
        }

        case ActionTypes.SetAvatar: {
            return {
                ...state,
                // @ts-ignore
                user: {
                    ...state.user,
                    avatar: action.payload as string,
                },
            };
        }

        case ActionTypes.SetFocus: {
            const focus = action.payload as string;
            if (!state.linkmans[focus]) {
                /* istanbul ignore next */
                if (!__TEST__) {
                    console.warn(
                        `ActionTypes.SetFocus Error: 联系人 ${focus} 不存在`,
                    );
                }
                return state;
            }

            const linkman = state.linkmans[focus];
            const entered = enterLinkman(linkman, state.focus !== focus);

            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [focus]: {
                        ...linkman,
                        ...entered,
                    },
                },
                focus,
            };
        }

        case ActionTypes.AddLinkman: {
            const payload = action.payload as AddLinkmanPayload;
            const { linkman } = payload;
            const focus = payload.focus ? linkman._id : state.focus;

            let transformedLinkman = linkman;
            switch (linkman.type) {
                case 'group': {
                    transformedLinkman = transformGroup(linkman);
                    break;
                }
                case 'friend': {
                    transformedLinkman = transformFriend(linkman);
                    break;
                }
                case 'temporary': {
                    transformedLinkman = transformTemporary(linkman);
                    transformedLinkman.unread = 1;
                    break;
                }
                default: {
                    return state;
                }
            }

            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [transformedLinkman._id]: transformedLinkman,
                },
                focus,
            };
        }

        case ActionTypes.RemoveLinkman: {
            const linkmans = deleteObjectKey(
                state.linkmans,
                action.payload as string,
            );
            const linkmanIds = Object.keys(linkmans);
            const focus = linkmanIds.length > 0 ? linkmanIds[0] : '';
            /**
             * 这条路径把焦点挪到了另一个会话, 却不会 dispatch SetFocus.
             * 不在这里补一次"进入会话"的处理, 新落焦的会话就会保留原来的未读数 ——
             * 用户被踢出群之后, 眼前这个会话顶着一个擦不掉的红点, 也没得跳
             */
            if (focus && linkmans[focus] && focus !== state.focus) {
                linkmans[focus] = {
                    ...linkmans[focus],
                    ...enterLinkman(linkmans[focus], true),
                };
            }
            return {
                ...state,
                linkmans: {
                    ...linkmans,
                },
                focus,
            };
        }

        case ActionTypes.SetLinkmansLastMessages: {
            const linkmansMessages =
                action.payload as SetLinkmansLastMessagesPayload;
            const { linkmans } = state;
            const newState = { ...state, linkmans: {} };
            Object.keys(linkmans).forEach((linkmanId) => {
                const payload = linkmansMessages[linkmanId];
                if (!payload) {
                    // @ts-ignore
                    newState.linkmans[linkmanId] = linkmans[linkmanId];
                    return;
                }
                const messages = getMessagesMap(payload.messages);
                const newest = getEdgeMessage(messages, 'newest');
                const existing = linkmans[linkmanId];
                /**
                 * 会话锚点只对当前正看着的会话有意义, 其余一律清掉.
                 *
                 * 首次登录时焦点是 SetUser 选出来的, 不走 SetFocus,
                 * 所以还没有锚点的话在这里补钉一次 —— 用服务端刚给的数据来算,
                 * 这时 unread 和 lastRead* 都是权威值
                 */
                let sessionAnchor: SessionAnchor = EmptySessionAnchor;
                if (linkmanId === state.focus) {
                    if (existing && existing.sessionAnchorId) {
                        // 重连时保住用户眼前那条线; 窗口被换成最新 15 条了,
                        // 但锚点自带时间戳, 点一下还能把那段捞回来
                        sessionAnchor = {
                            sessionAnchorId: existing.sessionAnchorId,
                            sessionAnchorCreateTime:
                                existing.sessionAnchorCreateTime ?? null,
                            sessionAnchorUnread:
                                existing.sessionAnchorUnread ?? 0,
                        };
                    } else {
                        sessionAnchor = pickSessionAnchor({
                            ...linkmans[linkmanId],
                            messages,
                            unread: payload.unread,
                            lastReadMessageId: fallback(
                                payload.lastReadMessageId,
                                null,
                            ),
                            lastReadCreateTime: fallback(
                                payload.lastReadCreateTime,
                                null,
                            ),
                        } as Linkman);
                    }
                }
                // @ts-ignore
                newState.linkmans[linkmanId] = {
                    ...linkmans[linkmanId],
                    messages,
                    unread: payload.unread,
                    lastReadMessageId: fallback(
                        payload.lastReadMessageId,
                        null,
                    ),
                    lastReadCreateTime: fallback(
                        payload.lastReadCreateTime,
                        null,
                    ),
                    oldestCreateTime: fallback(payload.oldestCreateTime, null),
                    oldestId: fallback(payload.oldestId, null),
                    newestCreateTime: newest
                        ? new Date(newest.createTime).getTime()
                        : null,
                    newestId: newest ? newest._id : null,
                    hasMoreBefore: fallback(payload.hasMoreBefore, true),
                    /**
                     * 这是直接从服务端拉到的最新一页, 和实时消息是连续的,
                     * 所以任何遗留的断层标记都应该在这里清掉
                     */
                    hasGapAfter: false,
                    anchorMessageId: null,
                    unreadSnapshot: payload.unread,
                    ...sessionAnchor,
                };
            });
            return newState;
        }

        case ActionTypes.AddLinkmanHistoryMessages: {
            const payload = action.payload as AddLinkmanHistoryMessagesPayload;
            const linkman = state.linkmans[payload.linkmanId];
            /**
             * 和 SetFocus / DeleteMessage 一样需要判空:
             * 一个 deleteGroup 推送如果正好赶在历史消息请求返回之前,
             * 这里就会解引用 undefined 并把异常抛出 reducer
             */
            if (!linkman) {
                /* istanbul ignore next */
                if (!__TEST__) {
                    console.warn(
                        `ActionTypes.AddLinkmanHistoryMessages Error: 联系人 ${payload.linkmanId} 不存在`,
                    );
                }
                return state;
            }

            const messagesMap = getMessagesMap(payload.messages);
            /**
             * 这里不做条数上限裁剪: 用户是主动往回翻的, 裁掉他刚要看的内容没有意义.
             * 内存回收交给 SetFocus 在切走时做
             */
            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...linkman,
                        messages: {
                            ...messagesMap,
                            ...linkman.messages,
                        },
                        oldestCreateTime: fallback(
                            payload.oldestCreateTime,
                            linkman.oldestCreateTime as number | null,
                        ),
                        oldestId: fallback(
                            payload.oldestId,
                            linkman.oldestId as string | null,
                        ),
                        hasMoreBefore: fallback(
                            payload.hasMoreBefore,
                            linkman.hasMoreBefore as boolean,
                        ),
                    },
                },
            };
        }

        case ActionTypes.SetLinkmanMessagesWindow: {
            const payload =
                action.payload as SetLinkmanMessagesWindowPayload;
            const linkman = state.linkmans[payload.linkmanId];
            if (!linkman) {
                return state;
            }
            /**
             * 整体替换而不是合并.
             * 跳回上次阅读位置拿到的是一段和实时消息不相连的窗口, 如果和旧内容合并,
             * map 里就会同时存在两段不连续的消息, 而顺序完全靠插入顺序维持, 必然错乱
             */
            /**
             * 只有"跳到的正好是钉住的那个锚点"才保留会话锚点.
             *
             * 跳回最新 (handleJumpToLatest) 传的是 null, 于是锚点被清掉, 正确;
             * 万一服务端旧版本忽略了客户端指定的锚点、返回了别的位置,
             * 这里也会把锚点清掉而不是悄悄改指向 —— 提示条消失, 但不会骗人
             */
            const keepSessionAnchor =
                !!linkman.sessionAnchorId &&
                payload.anchorMessageId === linkman.sessionAnchorId;
            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...linkman,
                        ...(keepSessionAnchor ? {} : EmptySessionAnchor),
                        messages: getMessagesMap(payload.messages),
                        oldestCreateTime: payload.oldestCreateTime,
                        oldestId: payload.oldestId,
                        newestCreateTime: payload.newestCreateTime,
                        newestId: payload.newestId,
                        hasMoreBefore: payload.hasMoreBefore,
                        hasGapAfter: payload.hasGapAfter,
                        anchorMessageId: fallback(
                            payload.anchorMessageId,
                            null,
                        ),
                        unreadSnapshot: fallback(
                            payload.unread,
                            linkman.unreadSnapshot as number,
                        ),
                    },
                },
            };
        }

        case ActionTypes.AddLinkmanForwardMessages: {
            const payload =
                action.payload as AddLinkmanForwardMessagesPayload;
            const linkman = state.linkmans[payload.linkmanId];
            if (!linkman) {
                return state;
            }
            const forwardMerged = {
                ...linkman.messages,
                ...getMessagesMap(payload.messages),
            };
            const forwardMessages = trimMessages(forwardMerged);
            const forwardTrimmed =
                Object.keys(forwardMessages).length <
                Object.keys(forwardMerged).length;
            const forwardOldest = getEdgeMessage(forwardMessages, 'oldest');
            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...linkman,
                        // 这批消息严格新于窗口里已有的消息, 追加在尾部
                        messages: forwardMessages,
                        newestCreateTime: fallback(
                            payload.newestCreateTime,
                            linkman.newestCreateTime as number | null,
                        ),
                        newestId: fallback(
                            payload.newestId,
                            linkman.newestId as string | null,
                        ),
                        /**
                         * 一路往下补课时这里是唯一的回收点 —— 跳转之后 hasGapAfter
                         * 为真, AddLinkmanMessage 会提前返回, 不走它那道 200 条上限.
                         * 不裁的话窗口能无限涨
                         *
                         * 裁的是最旧的一端 (保住向后翻页的游标), 所以同样要重新
                         * 打开向前翻页, 否则被裁掉的那段就再也回不去了
                         */
                        ...(forwardTrimmed
                            ? {
                                oldestCreateTime: forwardOldest
                                    ? new Date(
                                        forwardOldest.createTime,
                                    ).getTime()
                                    : linkman.oldestCreateTime,
                                oldestId: forwardOldest
                                    ? forwardOldest._id
                                    : linkman.oldestId,
                                hasMoreBefore: true,
                            }
                            : {}),
                        hasGapAfter: payload.hasGapAfter,
                        /**
                         * 断层合上了, 说明用户已经从锚点一路读到了实时消息,
                         * 这段补课结束, 锚点该退休了
                         */
                        ...(payload.hasGapAfter === false
                            ? EmptySessionAnchor
                            : {}),
                    },
                },
            };
        }

        case ActionTypes.SetLinkmanReadState: {
            const payload = action.payload as SetLinkmanReadStatePayload;
            const linkman = state.linkmans[payload.linkmanId];
            if (!linkman) {
                return state;
            }
            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...linkman,
                        lastReadMessageId: fallback(
                            payload.lastReadMessageId,
                            linkman.lastReadMessageId as string | null,
                        ),
                        lastReadCreateTime: fallback(
                            payload.lastReadCreateTime,
                            linkman.lastReadCreateTime as number | null,
                        ),
                        unread: fallback(payload.unread, linkman.unread),
                        unreadSnapshot: fallback(
                            payload.unread,
                            linkman.unreadSnapshot as number,
                        ),
                        /**
                         * 只有"×"(全部标记已读)会带这个标记.
                         * reportRead 不带 —— 它只是如实上报进度, 不该把用户
                         * 眼前那条分隔线抹掉
                         */
                        ...(payload.clearSessionAnchor
                            ? EmptySessionAnchor
                            : {}),
                    },
                },
            };
        }

        case ActionTypes.AddLinkmanMessage: {
            const payload = action.payload as AddLinkmanMessagePayload;
            const linkman = state.linkmans[payload.linkmanId];
            if (!linkman) {
                return state;
            }

            const isSelfMessage =
                !!state.user &&
                payload.message.from &&
                payload.message.from._id === state.user._id;

            let { unread } = linkman;
            /**
             * 只有"正在看这个会话, 并且窗口就接在实时消息后面"时, 新消息才算被看到.
             * 窗口存在断层时消息根本不会出现在界面上, 即使会话是聚焦的也得计入未读
             */
            const isVisible =
                state.focus === payload.linkmanId && !linkman.hasGapAfter;
            // 自己发的消息不该给自己算未读, 否则多端登录时会凭空多出角标
            if (!isVisible && !isSelfMessage) {
                unread++;
            }

            /**
             * 窗口和实时消息之间存在断层时, 新消息只累加未读数, 不塞进窗口.
             * 塞进去会渲染成乱序, 而且会让后续的翻页游标是从一个虚假的边界算出来的.
             * 用户点"跳到最新消息"时会整体重新拉一页, 那时自然就补齐了
             */
            if (linkman.hasGapAfter) {
                return {
                    ...state,
                    linkmans: {
                        ...state.linkmans,
                        [payload.linkmanId]: {
                            ...linkman,
                            unread,
                            // 自己说话了就记一笔, 界面据此把用户带回最新
                            selfMessageSeq: isSelfMessage
                                ? (linkman.selfMessageSeq || 0) + 1
                                : linkman.selfMessageSeq,
                        },
                    },
                };
            }

            const merged = {
                ...linkman.messages,
                [payload.message._id]: payload.message,
            };
            /**
             * 用户正在看的这个会话不裁剪.
             *
             * 裁掉的是视口"上方"的 DOM. 一次删掉上百条(往上翻过历史之后很容易
             * 攒到这个量), 浏览器要么把内容整体上移, 要么直接把 scrollTop 夹到
             * 新的最大值 —— 也就是底部. 用户正读着历史就被弹到最新一条.
             *
             * 更糟的是这个夹取动作本身会发出一个 scroll 事件, 于是 MessageList
             * 拿着已经缩水的几何数据重算, nearBottom 被锁死成 true,
             * 从此任何人发消息都会把用户拽到底部 —— 这就是"别人发消息也跳"的由来
             *
             * 上限本来的用途(见 MaxLoadedMessages 的注释)是防止一个你从来不点开的
             * 活跃群把整场会话堆在内存里 —— 那种会话没有滚动位置可破坏.
             * 当前会话的内存回收交给 enterHelper: 切走时 enterLinkman 会裁到 50 条
             */
            const messages =
                state.focus === payload.linkmanId
                    ? merged
                    : trimMessages(merged);
            const trimmed =
                Object.keys(messages).length < Object.keys(merged).length;
            const oldest = getEdgeMessage(messages, 'oldest');

            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...linkman,
                        messages,
                        unread,
                        newestCreateTime: new Date(
                            payload.message.createTime,
                        ).getTime(),
                        newestId: payload.message._id,
                        // 裁剪掉最旧的消息后, 向前翻页的游标要跟着挪
                        oldestCreateTime: oldest
                            ? new Date(oldest.createTime).getTime()
                            : linkman.oldestCreateTime,
                        oldestId: oldest ? oldest._id : linkman.oldestId,
                        /**
                         * 真裁掉了东西就必须重新打开向前翻页.
                         *
                         * 之前只挪游标不动这个标志: 如果此前已经翻到底
                         * (hasMoreBefore === false), 被裁掉的那些消息就再也拉不回来了,
                         * 而界面还理直气壮地显示"没有更早的消息了".
                         * enterLinkman 里的裁剪就是因为同样的原因才置 true 的
                         */
                        ...(trimmed ? { hasMoreBefore: true } : {}),
                    },
                },
            };
        }

        case ActionTypes.DeleteMessage: {
            const { linkmanId, messageId, shouldDelete } =
                action.payload as DeleteMessagePayload;
            if (!state.linkmans[linkmanId]) {
                /* istanbul ignore next */
                if (!__TEST__) {
                    console.warn(
                        `ActionTypes.DeleteMessage Error: 联系人 ${linkmanId} 不存在`,
                    );
                }
                return state;
            }

            const target = state.linkmans[linkmanId].messages[messageId];
            /**
             * 同一条撤回推送可能重复到达 (比如断线重连), 而 convertMessage 不是幂等的:
             * 它的 system 分支会 JSON.parse(content), 但上一次撤回已经把 content
             * 改写成了"撤回了消息". 再跑一次就会在 reducer 里抛异常, 整个 dispatch 失败
             */
            if (!shouldDelete && (!target || target.deleted)) {
                return state;
            }

            const newMessages = shouldDelete
                ? deleteObjectKey(state.linkmans[linkmanId].messages, messageId)
                : {
                    ...state.linkmans[linkmanId].messages,
                    [messageId]: convertMessage({
                        ...target,
                        deleted: true,
                    }),
                };

            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [linkmanId]: {
                        ...state.linkmans[linkmanId],
                        messages: newMessages,
                    },
                },
            };
        }

        case ActionTypes.SetLinkmanProperty: {
            const payload = action.payload as SetLinkmanPropertyPayload;
            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...state.linkmans[payload.linkmanId],
                        [payload.key]: payload.value,
                    },
                },
            };
        }

        case ActionTypes.UpdateMessage: {
            const payload = action.payload as UpdateMessagePayload;

            let messages = {};
            if (payload.value._id) {
                messages = {
                    ...deleteObjectKey(
                        state.linkmans[payload.linkmanId].messages,
                        payload.messageId,
                    ),
                    [payload.value._id]: payload.value,
                };
            } else {
                messages = {
                    ...state.linkmans[payload.linkmanId].messages,
                    [payload.messageId]: {
                        ...state.linkmans[payload.linkmanId].messages[
                            payload.messageId
                        ],
                        ...payload.value,
                    },
                };
            }

            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...state.linkmans[payload.linkmanId],
                        messages,
                    },
                },
            };
        }

        case ActionTypes.SetStatus: {
            const payload = action.payload as SetStatusPayload;
            return {
                ...state,
                status: {
                    ...state.status,
                    [payload.key]: payload.value,
                },
            };
        }

        default:
            return state;
    }
}

export default reducer;
