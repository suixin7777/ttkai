import { useDispatch } from 'react-redux';
import convertMessage from '@fiora/utils/convertMessage';
import { User, Linkman, Message } from '../state/reducer';
import { ActionTypes } from '../state/action';

/**
 * 获取 redux action
 */
export default function useAction() {
    const dispatch = useDispatch();

    return {
        setUser(user: User) {
            dispatch({
                type: ActionTypes.SetUser,
                payload: user,
            });
        },

        logout() {
            dispatch({
                type: ActionTypes.Logout,
            });
        },

        setAvatar(avatar: string) {
            dispatch({
                type: ActionTypes.SetAvatar,
                payload: avatar,
            });
        },

        setFocus(linkmanId: string) {
            dispatch({
                type: ActionTypes.SetFocus,
                payload: linkmanId,
            });
        },

        addLinkman(linkman: Linkman, focus = false) {
            dispatch({
                type: ActionTypes.AddLinkman,
                payload: {
                    linkman,
                    focus,
                },
            });
        },

        removeLinkman(linkmanId: string) {
            dispatch({
                type: ActionTypes.RemoveLinkman,
                payload: linkmanId,
            });
        },

        addLinkmanHistoryMessages(
            linkmanId: string,
            messages: Message[],
            cursor?: {
                oldestCreateTime?: number | null;
                oldestId?: string | null;
                hasMoreBefore?: boolean;
            },
        ) {
            messages.forEach((message) => convertMessage(message));
            dispatch({
                type: ActionTypes.AddLinkmanHistoryMessages,
                payload: {
                    linkmanId,
                    messages,
                    ...(cursor || {}),
                },
            });
        },

        /** 整体替换消息窗口, 用于跳转到上次阅读位置 */
        setLinkmanMessagesWindow(payload: {
            linkmanId: string;
            messages: Message[];
            oldestCreateTime: number | null;
            oldestId: string | null;
            newestCreateTime: number | null;
            newestId: string | null;
            hasMoreBefore: boolean;
            hasGapAfter: boolean;
            anchorMessageId?: string | null;
            unread?: number;
        }) {
            payload.messages.forEach((message) => convertMessage(message));
            dispatch({
                type: ActionTypes.SetLinkmanMessagesWindow,
                payload,
            });
        },

        /** 追加更新的消息, 用于从阅读位置继续往后看 */
        addLinkmanForwardMessages(payload: {
            linkmanId: string;
            messages: Message[];
            newestCreateTime: number | null;
            newestId: string | null;
            hasGapAfter: boolean;
        }) {
            payload.messages.forEach((message) => convertMessage(message));
            dispatch({
                type: ActionTypes.AddLinkmanForwardMessages,
                payload,
            });
        },

        setLinkmanReadState(payload: {
            linkmanId: string;
            lastReadMessageId?: string | null;
            lastReadCreateTime?: number | null;
            unread?: number;
            clearSessionAnchor?: boolean;
        }) {
            dispatch({
                type: ActionTypes.SetLinkmanReadState,
                payload,
            });
        },

        addLinkmanMessage(linkmanId: string, message: Message) {
            convertMessage(message);
            dispatch({
                type: ActionTypes.AddLinkmanMessage,
                payload: {
                    linkmanId,
                    message,
                },
            });
        },

        setLinkmanProperty(linkmanId: string, key: string, value: any) {
            dispatch({
                type: ActionTypes.SetLinkmanProperty,
                payload: {
                    linkmanId,
                    key,
                    value,
                },
            });
        },

        updateMessage(linkmanId: string, messageId: string, value: any) {
            convertMessage(value);
            dispatch({
                type: ActionTypes.UpdateMessage,
                payload: {
                    linkmanId,
                    messageId,
                    value,
                },
            });
        },

        deleteMessage(linkmanId: string, messageId: string, shouldDelete: boolean = false) {
            dispatch({
                type: ActionTypes.DeleteMessage,
                payload: {
                    linkmanId,
                    messageId,
                    shouldDelete,
                },
            });
        },

        setStatus(key: string, value: any) {
            dispatch({
                type: ActionTypes.SetStatus,
                payload: {
                    key,
                    value,
                },
            });
            window.localStorage.setItem(key, value);
        },

        toggleLoginRegisterDialog(visible: boolean) {
            dispatch({
                type: ActionTypes.SetStatus,
                payload: {
                    key: 'loginRegisterDialogVisible',
                    value: visible,
                },
            });
        },
    };
}
