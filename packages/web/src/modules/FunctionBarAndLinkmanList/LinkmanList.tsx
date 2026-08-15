import React from 'react';
import { useSelector } from 'react-redux';

import { Linkman, State } from '../../state/reducer';
import {
    getDisplayUnread,
    hasPendingJumpToLastRead,
} from '../../state/linkmanRead';
import LinkmanComponent from './Linkman';

import Style from './LinkmanList.less';

function LinkmanList() {
    const linkmans = useSelector((state: State) => state.linkmans);

    function renderLinkman(linkman: Linkman) {
        const messages = Object.values(linkman.messages);
        const lastMessage =
            messages.length > 0 ? messages[messages.length - 1] : null;

        let time = new Date(linkman.createTime);
        let preview = '暂无消息';
        if (lastMessage) {
            time = new Date(lastMessage.createTime);
            const { type } = lastMessage;
            preview = type === 'text' ? `${lastMessage.content}` : `[${type}]`;
            if (linkman.type === 'group') {
                preview = `${lastMessage.from.username}: ${preview}`;
            }
        }
        return (
            <LinkmanComponent
                key={linkman._id}
                id={linkman._id}
                name={linkman.name}
                avatar={linkman.avatar}
                preview={preview}
                time={time}
                /**
                 * 不能直接用 linkman.unread —— 点进会话时它就被清零了,
                 * 但用户可能只是瞄了一眼没真读, 那些消息还欠着
                 */
                unread={getDisplayUnread(linkman)}
                unreadIsPending={
                    linkman.unread === 0 && hasPendingJumpToLastRead(linkman)
                }
            />
        );
    }

    function getLinkmanLastTime(linkman: Linkman): number {
        let time = linkman.createTime;
        const messages = Object.values(linkman.messages);
        if (messages.length > 0) {
            time = messages[messages.length - 1].createTime;
        }
        return new Date(time).getTime();
    }

    function sort(linkman1: Linkman, linkman2: Linkman): number {
        return getLinkmanLastTime(linkman1) < getLinkmanLastTime(linkman2)
            ? 1
            : -1;
    }

    return (
        <div className={Style.linkmanList}>
            {Object.values(linkmans)
                .sort(sort)
                .map((linkman) => renderLinkman(linkman))}
        </div>
    );
}

export default LinkmanList;
