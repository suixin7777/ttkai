import { Group, Friend, Message, Linkman } from './reducer';

// eslint-disable-next-line import/prefer-default-export
export enum ActionTypes {
    /** 设置游客信息 */
    SetGuest = 'SetGuest',
    /** 设置用户信息 */
    SetUser = 'SetUser',
    /** 更新用户信息 */
    UpdateUserInfo = 'UpdateUserInfo',
    /** 更新客户端状态 */
    SetStatus = 'SetStatus',
    /** 退出登录 */
    Logout = 'Logout',
    /** 设置用户头像 */
    SetAvatar = 'SetAvatar',
    /** 添加新联系人 */
    AddLinkman = 'AddLinkman',
    /** 移除指定联系人 */
    RemoveLinkman = 'RemoveLinkman',
    /** 设置聚焦的联系人 */
    SetFocus = 'SetFocus',
    /** 设置各联系人历史消息 */
    SetLinkmansLastMessages = 'SetLinkmansLastMessages',
    /** 添加联系人历史消息 */
    AddLinkmanHistoryMessages = 'AddLinkmanHistoryMessages',
    /** 整体替换联系人的消息窗口, 用于跳转到上次阅读位置 */
    SetLinkmanMessagesWindow = 'SetLinkmanMessagesWindow',
    /** 追加更新的消息, 用于从阅读位置继续往后看 */
    AddLinkmanForwardMessages = 'AddLinkmanForwardMessages',
    /** 设置联系人的阅读位置信息 */
    SetLinkmanReadState = 'SetLinkmanReadState',
    /** 未读数加一, 但不把消息塞进当前窗口 */
    IncrementLinkmanUnread = 'IncrementLinkmanUnread',
    /** 添加联系人新消息 */
    AddLinkmanMessage = 'AddLinkmanMessage',
    /** 设置联系人指定属性值 */
    SetLinkmanProperty = 'SetLinkmanProperty',
    /** 更新消息 */
    UpdateMessage = 'UpdateMessage',
    /** 删除消息 */
    DeleteMessage = 'DeleteMessage',
    /** socket连接成功 */
    Connect = 'Connect',
    /** socket断开连接 */
    Disconnect = 'Disconnect',
    /** Aliyun OSS ready */
    Ready = 'Ready',
}

export type SetGuestPayload = Group;

export type SetUserPayload = {
    _id: string;
    username: string;
    tag: string;
    avatar: string;
    groups: Group[];
    friends: Friend[];
    isAdmin: boolean;
};

export type UpdateUserInfoPayload = Object;

export interface SetStatusPayload {
    key: string;
    value: any;
}

export type SetAvatarPayload = string;

export interface AddLinkmanPayload {
    linkman: Linkman;
    focus: boolean;
}

export type SetFocusPayload = string;

export interface SetLinkmansLastMessagesPayload {
    [linkmanId: string]: {
        messages: Message[];
        unread: number;
        lastReadMessageId?: string | null;
        lastReadCreateTime?: number | null;
        hasMoreBefore?: boolean;
        oldestCreateTime?: number | null;
        oldestId?: string | null;
    };
}

export interface AddLinkmanHistoryMessagesPayload {
    linkmanId: string;
    messages: Message[];
    /** 向前翻页后新的游标, 不传则保持原值 */
    oldestCreateTime?: number | null;
    oldestId?: string | null;
    hasMoreBefore?: boolean;
}

/**
 * 跳转到上次阅读位置时使用
 * 这是整体替换而不是合并: 跳过去之后客户端持有的是一段和最新消息不相连的窗口,
 * 所以必须把旧内容清掉, 并且用 hasGapAfter 标记"下方还有断层"
 */
export interface SetLinkmanMessagesWindowPayload {
    linkmanId: string;
    messages: Message[];
    oldestCreateTime: number | null;
    oldestId: string | null;
    newestCreateTime: number | null;
    newestId: string | null;
    hasMoreBefore: boolean;
    hasGapAfter: boolean;
    /** 跳转锚点, 用于滚动定位和渲染未读分隔线 */
    anchorMessageId?: string | null;
    unread?: number;
}

export interface AddLinkmanForwardMessagesPayload {
    linkmanId: string;
    messages: Message[];
    newestCreateTime: number | null;
    newestId: string | null;
    hasGapAfter: boolean;
}

export interface SetLinkmanReadStatePayload {
    linkmanId: string;
    lastReadMessageId?: string | null;
    lastReadCreateTime?: number | null;
    unread?: number;
}

export type IncrementLinkmanUnreadPayload = string;

export interface AddLinkmanMessagePayload {
    linkmanId: string;
    message: Message;
}

export interface SetLinkmanPropertyPayload {
    linkmanId: string;
    key: string;
    value: any;
}

export type RemoveLinkmanPayload = string;

export interface UpdateMessagePayload {
    linkmanId: string;
    messageId: string;
    value: any;
}

export interface DeleteMessagePayload {
    linkmanId: string;
    messageId: string;
    shouldDelete: boolean;
}

export interface Action {
    type: ActionTypes;
    payload:
        | SetUserPayload
        | UpdateUserInfoPayload
        | SetGuestPayload
        | SetStatusPayload
        | SetAvatarPayload
        | AddLinkmanPayload
        | SetFocusPayload
        | AddLinkmanHistoryMessagesPayload
        | SetLinkmanMessagesWindowPayload
        | AddLinkmanForwardMessagesPayload
        | SetLinkmanReadStatePayload
        | IncrementLinkmanUnreadPayload
        | AddLinkmanMessagePayload
        | SetLinkmanPropertyPayload
        | RemoveLinkmanPayload
        | SetLinkmansLastMessagesPayload
        | UpdateMessagePayload
        | DeleteMessagePayload;
}
