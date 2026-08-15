import fetch from './utils/fetch';
import { User, GroupMember } from './state/reducer';

function saveUsername(username: string) {
    window.localStorage.setItem('username', username);
}

/**
 * 注册新用户
 * @param username 用户名
 * @param password 密码
 * @param os 系统
 * @param browser 浏览器
 * @param environment 环境信息
 */
export async function register(
    username: string,
    password: string,
    os = '',
    browser = '',
    environment = '',
) {
    const [err, user] = await fetch('register', {
        username,
        password,
        os,
        browser,
        environment,
    });

    if (err) {
        return null;
    }

    saveUsername(user.username);
    return user;
}

/**
 * 使用账密登录
 * @param username 用户名
 * @param password 密码
 * @param os 系统
 * @param browser 浏览器
 * @param environment 环境信息
 */
export async function login(
    username: string,
    password: string,
    os = '',
    browser = '',
    environment = '',
) {
    const [err, user] = await fetch('login', {
        username,
        password,
        os,
        browser,
        environment,
    });

    if (err) {
        return null;
    }

    saveUsername(user.username);
    return user;
}

/**
 * 使用token登录
 * @param token 登录token
 * @param os 系统
 * @param browser 浏览器
 * @param environment 环境信息
 */
export async function loginByToken(
    token: string,
    os = '',
    browser = '',
    environment = '',
) {
    const [err, user] = await fetch(
        'loginByToken',
        {
            token,
            os,
            browser,
            environment,
        },
        { toast: false },
    );

    if (err) {
        return null;
    }

    saveUsername(user.username);
    return user;
}

/**
 * 游客模式登陆
 * @param os 系统
 * @param browser 浏览器
 * @param environment 环境信息
 */
export async function guest(os = '', browser = '', environment = '') {
    const [err, res] = await fetch('guest', { os, browser, environment });
    if (err) {
        return null;
    }
    return res;
}

/**
 * 修用户头像
 * @param avatar 新头像链接
 */
export async function changeAvatar(avatar: string) {
    const [error] = await fetch('changeAvatar', { avatar });
    return !error;
}

/**
 * 导入收藏表情
 * @param vurl
 */
export async function getExpression() {
    const [, result] = await fetch('getExpression', {  });
    return result;
}


/**
 * 增加收藏表情
 * @param vurl
 */
export async function addExpression(vurl: string) {
    const [error] = await fetch('addExpression', { vurl });
    return !error;
}

/**
 * 删除收藏表情
 * @param qnum
 */
export async function delExpression(qnum: number) {
    const [error] = await fetch('delExpression', { qnum });
    return !error;
}



/**
 * 修改用户密码
 * @param oldPassword 旧密码
 * @param newPassword 新密码
 */
export async function changePassword(oldPassword: string, newPassword: string) {
    const [error] = await fetch('changePassword', {
        oldPassword,
        newPassword,
    });
    return !error;
}

/**
 * 修改用户名
 * @param username 新用户名
 */
export async function changeUsername(username: string) {
    const [error] = await fetch('changeUsername', {
        username,
    });
    return !error;
}

/**
 * 修改群组名
 * @param groupId 目标群组
 * @param name 新名字
 */
export async function changeGroupName(groupId: string, name: string) {
    const [error] = await fetch('changeGroupName', { groupId, name });
    return !error;
}

/**
 * 修改群头像
 * @param groupId 目标群组
 * @param name 新头像
 */
export async function changeGroupAvatar(groupId: string, avatar: string) {
    const [error] = await fetch('changeGroupAvatar', { groupId, avatar });
    return !error;
}

/**
 * 创建群组
 * @param name 群组名
 */
export async function createGroup(name: string) {
    const [, group] = await fetch('createGroup', { name });
    return group;
}

/**
 * 删除群组
 * @param groupId 群组id
 */
export async function deleteGroup(groupId: string) {
    const [error] = await fetch('deleteGroup', { groupId });
    return !error;
}

/**
 * 加入群组
 * @param groupId 群组id
 */
export async function joinGroup(groupId: string) {
    const [, group] = await fetch('joinGroup', { groupId });
    return group;
}

/**
 * 离开群组
 * @param groupId 群组id
 */
export async function leaveGroup(groupId: string) {
    const [error] = await fetch('leaveGroup', { groupId });
    return !error;
}

/**
 * 添加好友
 * @param userId 目标用户id
 */
export async function addFriend(userId: string) {
    const [, user] = await fetch<User>('addFriend', { userId });
    return user;
}

/**
 * 删除好友
 * @param userId 目标用户id
 */
export async function deleteFriend(userId: string) {
    const [err] = await fetch('deleteFriend', { userId });
    return !err;
}

/**
 * Get the last messages and unread number of a group of linkmans
 * @param linkmanIds Linkman ids who need to get the last messages
 */
export async function getLinkmansLastMessagesV2(linkmanIds: string[]) {
    const [, linkmanMessages] = await fetch('getLinkmansLastMessagesV2', {
        linkmans: linkmanIds,
    });
    return linkmanMessages;
}

/**
 * 获取联系人历史消息
 * @param linkmanId 联系人id
 * @param existCount 客户端已有消息条数
 */
export async function getLinkmanHistoryMessages(
    linkmanId: string,
    existCount: number,
) {
    const [, messages] = await fetch('getLinkmanHistoryMessages', {
        linkmanId,
        existCount,
    });
    return messages;
}

/**
 * 获取默认群组的历史消息
 * @param existCount 客户端已有消息条数
 */
export async function getDefaultGroupHistoryMessages(existCount: number) {
    const [, messages] = await fetch('getDefaultGroupHistoryMessages', {
        existCount,
    });
    return messages;
}

/** 一页消息 + 游标 */
export type MessagePage = {
    messages: any[];
    hasMore: boolean;
    oldestCreateTime: number | null;
    oldestId: string | null;
    newestCreateTime: number | null;
    newestId: string | null;
};

/**
 * 服务端不认识某个事件时会返回 `Server Error: event [x] not exists`
 * (见 server 的 registerRoutes 中间件).
 * index.html 被缓存 7 天, 所以新前端完全可能跑在还没升级的服务端上,
 * 这种情况下要能安静地退回老接口, 而不是每次上滑都弹一个红色报错
 */
function isUnsupportedEvent(err: string | null) {
    return !!err && err.indexOf('not exists') > -1;
}

/** 服务端是否支持游标接口, 探测到不支持之后就不再重复尝试 */
let cursorApiSupported = true;

/** 从一页升序消息里算出游标字段, 用于老接口回退时补齐结构 */
function buildCursorFromMessages(messages: any[]): MessagePage {
    if (!messages || messages.length === 0) {
        return {
            messages: [],
            hasMore: false,
            oldestCreateTime: null,
            oldestId: null,
            newestCreateTime: null,
            newestId: null,
        };
    }
    const oldest = messages[0];
    const newest = messages[messages.length - 1];
    return {
        messages,
        // 老接口不返回 hasMore, 只能用"这一页是否装满"来近似判断
        hasMore: messages.length >= 30,
        oldestCreateTime: new Date(oldest.createTime).getTime(),
        oldestId: oldest._id,
        newestCreateTime: new Date(newest.createTime).getTime(),
        newestId: newest._id,
    };
}

/**
 * 向前 (更旧) 翻一页
 * 不传游标时返回最新的一页, 新加入群组的首屏加载走的就是这条路径
 */
export async function getLinkmanMessagesBefore(params: {
    linkmanId: string;
    beforeCreateTime?: number | null;
    beforeId?: string | null;
    count?: number;
    /** 老接口回退时需要的偏移量 */
    existCount?: number;
}): Promise<MessagePage | null> {
    const { linkmanId, beforeCreateTime, beforeId, count, existCount } = params;

    if (cursorApiSupported) {
        const [err, page] = await fetch<MessagePage>(
            'getLinkmanMessagesBefore',
            {
                linkmanId,
                beforeCreateTime,
                beforeId,
                count,
            },
            { toast: false },
        );
        if (!err && page) {
            return page;
        }
        if (!isUnsupportedEvent(err)) {
            return null;
        }
        cursorApiSupported = false;
    }

    const messages = await getLinkmanHistoryMessages(
        linkmanId,
        existCount || 0,
    );
    if (!messages) {
        return null;
    }
    return buildCursorFromMessages(messages);
}

/**
 * 向后 (更新) 翻一页, 用于从上次阅读位置继续往下看
 */
export async function getLinkmanMessagesAfter(params: {
    linkmanId: string;
    afterCreateTime: number;
    afterId?: string | null;
    count?: number;
}): Promise<MessagePage | null> {
    const [, page] = await fetch<MessagePage>('getLinkmanMessagesAfter', {
        linkmanId: params.linkmanId,
        afterCreateTime: params.afterCreateTime,
        afterId: params.afterId,
        count: params.count,
    });
    return page;
}

export type UnreadContext = MessagePage & {
    anchorMessageId: string | null;
    anchorCreateTime: number | null;
    hasMoreAfter: boolean;
    unread: number;
};

/**
 * 获取上次阅读位置附近的消息窗口
 * 锚点由服务端自己查, 客户端不需要传
 */
export async function getLinkmanUnreadContext(
    linkmanId: string,
    count?: number,
    /**
     * 由客户端指定锚点. 不传就用服务端 History 里的阅读位置.
     * 会话内跳转必须传 —— 那时 History 已经被上报推到最新了
     */
    anchor?: { anchorMessageId: string; anchorCreateTime: number },
): Promise<UnreadContext | null> {
    const [, context] = await fetch<UnreadContext>('getLinkmanUnreadContext', {
        linkmanId,
        count,
        ...(anchor || {}),
    });
    return context;
}

/**
 * 搜索用户和群组
 * @param keywords 关键字
 */
export async function search(keywords: string) {
    const [, result] = await fetch('search', { keywords });
    return result;
}

/**
 * 搜索表情包
 * @param keywords 关键字
 */
export async function searchExpression(keywords: string) {
    const [, result] = await fetch('searchExpression', { keywords });
    return result;
}

/**
 * 发送消息
 * @param to 目标
 * @param type 消息类型
 * @param content 消息内容
 */
export async function sendMessage(to: string, type: string, content: string) {
    return fetch('sendMessage', { to, type, content });
}

/**
 * 删除消息
 * @param messageId 要删除的消息id
 */
export async function deleteMessage(messageId: string) {
    const [err] = await fetch('deleteMessage', { messageId });
    return !err;
}

/**
 * 获取目标群组的在线用户列表
 * @param groupId 目标群id
 */
export const getGroupOnlineMembers = (() => {
    let cache: {
        groupId: string;
        key: string;
        members: GroupMember[];
    } = {
        groupId: '',
        key: '',
        members: [],
    };
    return async function _getGroupOnlineMembers(
        groupId: string,
    ): Promise<GroupMember[]> {
        const [, result] = await fetch('getGroupOnlineMembersV2', {
            groupId,
            cache: cache.groupId === groupId ? cache.key : undefined,
        });
        if (!result) {
            return [];
        }

        if (result.cache === cache.key) {
            return cache.members as GroupMember[];
        }
        cache = {
            groupId,
            key: result.cache,
            members: result.members,
        };
        return result.members;
    };
})();

/**
 * 获取默认群组的在线用户列表
 */
export async function getDefaultGroupOnlineMembers() {
    const [, members] = await fetch('getDefaultGroupOnlineMembers');
    return members;
}

/**
 * 封禁用户
 * @param username 目标用户名
 */
export async function sealUser(username: string) {
    const [err] = await fetch('sealUser', { username });
    return !err;
}

/**
 * 封禁ip
 * @param ip ip地址
 */
export async function sealIp(ip: string) {
    const [err] = await fetch('sealIp', { ip });
    return !err;
}

/**
 * 封禁用户所有在线ip
 * @param userId 用户id
 */
export async function sealUserOnlineIp(userId: string) {
    const [err] = await fetch('sealUserOnlineIp', { userId });
    return !err;
}

/**
 * 获取封禁用户列表
 */
export async function getSealList() {
    const [, sealList] = await fetch('getSealList');
    return sealList;
}

export async function getSystemConfig() {
    const [, systemConfig] = await fetch('getSystemConfig');
    return systemConfig;
}

/**
 * 重置指定用户的密码
 * @param username 目标用户名
 */
export async function resetUserPassword(username: string) {
    const [, res] = await fetch('resetUserPassword', { username });
    return res;
}

/**
 * 更新指定用户的标签
 * @param username 目标用户名
 * @param tag 标签
 */
export async function setUserTag(username: string, tag: string) {
    const [err] = await fetch('setUserTag', { username, tag });
    return !err;
}

/**
 * 获取在线用户 ip
 * @param userId 用户id
 */
export async function getUserIps(userId: string) {
    const [, res] = await fetch('getUserIps', { userId });
    return res;
}

export async function getUserOnlineStatus(userId: string) {
    const [, res] = await fetch('getUserOnlineStatus', { userId });
    return res && res.isOnline;
}

export async function updateHistory(linkmanId: string, messageId: string) {
    // 这是后台静默上报, 任何失败都不该弹提示打扰用户
    const [, result] = await fetch(
        'updateHistory',
        { linkmanId, messageId },
        { toast: false },
    );
    return !!result;
}

export async function toggleSendMessage(enable: boolean) {
    const [, result] = await fetch('toggleSendMessage', { enable });
    return !!result;
}

export async function toggleNewUserSendMessage(enable: boolean) {
    const [, result] = await fetch('toggleNewUserSendMessage', { enable });
    return !!result;
}
