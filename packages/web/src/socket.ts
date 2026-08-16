import IO from 'socket.io-client';
import platform from 'platform';

import convertMessage from '@fiora/utils/convertMessage';
import getFriendId from '@fiora/utils/getFriendId';
import config from '@fiora/config/client';
import notification from './utils/notification';

import { initOSS } from './utils/uploadFile';
import playSound from './utils/playSound';
import { Message, Linkman } from './state/reducer';
import {
    ActionTypes,
    SetLinkmanPropertyPayload,
    AddLinkmanHistoryMessagesPayload,
    AddLinkmanMessagePayload,
    DeleteMessagePayload,
} from './state/action';
import {
    loginByToken,
    getLinkmanMessagesBefore,
    getLinkmansLastMessagesV2,
} from './service';
import store from './state/store';

const { dispatch } = store;

const options = {
    // reconnectionDelay: 1000,
};
const socket = IO(config.server, options);

/**
 * 未登录时的处理: 要求登录, 不再回退到游客模式
 *
 * 以前这里会调 guest() 拿默认群, 让没账号的人也能围观. 现在改成必须登录 ——
 * 不登录就只有一个关不掉的登录框, 一个群也不加载
 */
function requireLogin() {
    dispatch({
        type: ActionTypes.SetStatus,
        payload: { key: 'loginRegisterDialogVisible', value: true },
    });
}

socket.on('connect', async () => {
    dispatch({ type: ActionTypes.Connect, payload: '' });

    /**
     * OSS 初始化不要阻塞登录.
     *
     * 它只影响图片上传和背景图 —— status.ready 唯一的用途就是决定背景图 URL
     * 怎么拼. 而原来是 await 完它才开始登录, 等于每次连接(包括退出登录后
     * 重连成游客)都白白串行多等一个完整往返, 用户就是在这段时间里对着空界面
     */
    initOSS()
        .then(() => dispatch({ type: ActionTypes.Ready, payload: '' }))
        .catch(() => dispatch({ type: ActionTypes.Ready, payload: '' }));

    const token = window.localStorage.getItem('token');
    if (token) {
        const user = await loginByToken(
            token,
            platform.os?.family,
            platform.name,
            platform.description,
        );
        if (user) {
            dispatch({
                type: ActionTypes.SetUser,
                payload: user,
            });
            const linkmanIds = [
                ...user.groups.map((group: any) => group._id),
                ...user.friends.map((friend: any) =>
                    getFriendId(friend.from, friend.to._id),
                ),
            ];
            const linkmanMessages = await getLinkmansLastMessagesV2(linkmanIds);
            Object.values(linkmanMessages).forEach(
                // @ts-ignore
                ({ messages }: { messages: Message[] }) => {
                    messages.forEach(convertMessage);
                },
            );
            dispatch({
                type: ActionTypes.SetLinkmansLastMessages,
                payload: linkmanMessages,
            });
            return;
        }
    }
    requireLogin();
});

socket.on('disconnect', () => {
    // @ts-ignore
    dispatch({ type: ActionTypes.Disconnect, payload: null });
});

let windowStatus = 'focus';
window.onfocus = () => {
    windowStatus = 'focus';
};
window.onblur = () => {
    windowStatus = 'blur';
};

let prevFrom: string | null = '';
let prevName = '';
socket.on('message', async (message: any) => {
    convertMessage(message);

    const state = store.getState();
    const isSelfMessage = message.from._id === state.user?._id;
    if (isSelfMessage && message.from.tag !== state.user?.tag) {
        dispatch({
            type: ActionTypes.UpdateUserInfo,
            payload: {
                tag: message.from.tag,
            },
        });
    }

    const linkman = state.linkmans[message.to];
    let title = '';
    if (linkman) {
        dispatch({
            type: ActionTypes.AddLinkmanMessage,
            payload: {
                linkmanId: message.to,
                message,
            } as AddLinkmanMessagePayload,
        });
        if (linkman.type === 'group') {
            title = `${message.from.username} 在 ${linkman.name} 对大家说:`;
        } else {
            title = `${message.from.username} 对你说:`;
        }
    } else {
        // 联系人不存在并且是自己发的消息, 不创建新联系人
        if (isSelfMessage) {
            return;
        }
        const newLinkman = {
            _id: getFriendId(state.user?._id as string, message.from._id),
            type: 'temporary',
            createTime: Date.now(),
            avatar: message.from.avatar,
            name: message.from.username,
            messages: [],
            unread: 1,
        };
        dispatch({
            type: ActionTypes.AddLinkman,
            payload: {
                linkman: newLinkman as unknown as Linkman,
                focus: false,
            },
        });
        title = `${message.from.username} 对你说:`;

        const page = await getLinkmanMessagesBefore({
            linkmanId: newLinkman._id,
            count: 15,
        });
        if (page && page.messages.length > 0) {
            /**
             * 这条路径原本是全项目唯一一个不做 convertMessage 就直接 dispatch 的地方,
             * 结果陌生人私聊的首屏里如果有系统消息, 就会以原始 JSON 的样子渲染出来,
             * 被撤回的消息也会显示原文而不是"撤回了消息"
             */
            page.messages.forEach(convertMessage);
            dispatch({
                type: ActionTypes.AddLinkmanHistoryMessages,
                payload: {
                    linkmanId: newLinkman._id,
                    messages: page.messages,
                    oldestCreateTime: page.oldestCreateTime,
                    oldestId: page.oldestId,
                    hasMoreBefore: page.hasMore,
                } as AddLinkmanHistoryMessagesPayload,
            });
        }
    }

    if (windowStatus === 'blur' && state.status.notificationSwitch) {
        notification(
            title,
            message.from.avatar,
            message.type === 'text'
                ? message.content.replace('<', '≺').replace('>', '≻')
                : `[${message.type}]`,
            Math.random().toString(),
        );
    }

    if (state.status.soundSwitch) {
        const soundType = state.status.sound;
        playSound(soundType);
    }


});

socket.on(
    'changeGroupName',
    ({ groupId, name }: { groupId: string; name: string }) => {
        dispatch({
            type: ActionTypes.SetLinkmanProperty,
            payload: {
                linkmanId: groupId,
                key: 'name',
                value: name,
            } as SetLinkmanPropertyPayload,
        });
    },
);

socket.on('deleteGroup', ({ groupId }: { groupId: string }) => {
    dispatch({
        type: ActionTypes.RemoveLinkman,
        payload: groupId,
    });
});

socket.on('changeTag', (tag: string) => {
    dispatch({
        type: ActionTypes.UpdateUserInfo,
        payload: {
            tag,
        },
    });
});

socket.on(
    'deleteMessage',
    ({
        linkmanId,
        messageId,
        isAdmin,
    }: {
        linkmanId: string;
        messageId: string;
        isAdmin: boolean;
    }) => {
        dispatch({
            type: ActionTypes.DeleteMessage,
            payload: {
                linkmanId,
                messageId,
                shouldDelete: isAdmin,
            } as DeleteMessagePayload,
        });
    },
);

export default socket;
