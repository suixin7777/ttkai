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
    IncrementLinkmanUnreadPayload,
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
        loginRegisterDialogVisible: false,
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

            /**
             * 为了优化性能
             * 如果目标联系人的旧消息个数超过50条, 仅保留50条
             */
            const { messages } = linkman;
            const messageKeys = Object.keys(messages);
            let reserveMessages = messages;
            let { oldestCreateTime, oldestId, hasMoreBefore } = linkman;
            if (messageKeys.length > 50) {
                reserveMessages = deleteObjectKeys(
                    messages,
                    messageKeys.slice(0, messageKeys.length - 50),
                );
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
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [focus]: {
                        ...linkman,
                        messages: reserveMessages,
                        unread: 0,
                        /**
                         * 先把未读数存一份再清零, 这样"回到上次阅读位置"的提示条
                         * 才有东西可显示. 注意这里刻意不动 hasGapAfter ——
                         * 裁剪保留的是"当前窗口"最新的 50 条, 对一个跳转过的窗口来说
                         * 它和实时消息之间的断层依然存在
                         */
                        /**
                         * 注意是 `||` 而不是直接赋值: 再次点开一个已经打开过的会话时
                         * unread 已经是 0 了, 直接写会把快照抹掉, 提示条就消失了,
                         * 可用户其实一条都还没读
                         */
                        unreadSnapshot:
                            linkman.unread || linkman.unreadSnapshot || 0,
                        oldestCreateTime,
                        oldestId,
                        hasMoreBefore,
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
            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...linkman,
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
            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [payload.linkmanId]: {
                        ...linkman,
                        // 这批消息严格新于窗口里已有的消息, 追加在尾部
                        messages: {
                            ...linkman.messages,
                            ...getMessagesMap(payload.messages),
                        },
                        newestCreateTime: fallback(
                            payload.newestCreateTime,
                            linkman.newestCreateTime as number | null,
                        ),
                        newestId: fallback(
                            payload.newestId,
                            linkman.newestId as string | null,
                        ),
                        hasGapAfter: payload.hasGapAfter,
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
                    },
                },
            };
        }

        case ActionTypes.IncrementLinkmanUnread: {
            const linkmanId = action.payload as IncrementLinkmanUnreadPayload;
            const linkman = state.linkmans[linkmanId];
            if (!linkman) {
                return state;
            }
            return {
                ...state,
                linkmans: {
                    ...state.linkmans,
                    [linkmanId]: {
                        ...linkman,
                        unread: linkman.unread + 1,
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
                        },
                    },
                };
            }

            const messages = trimMessages({
                ...linkman.messages,
                [payload.message._id]: payload.message,
            });
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
