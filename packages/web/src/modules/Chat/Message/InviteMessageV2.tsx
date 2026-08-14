import React from 'react';

import Style from './InviteMessage.less';
import { joinGroup, getLinkmanMessagesBefore } from '../../../service';

/** 新加入群组时只加载这么多条, 避免新人一进群就拉一大坨历史 */
const JoinGroupMessagesCount = 15;
import useAction from '../../../hooks/useAction';
import Message from '../../../components/Message';

interface InviteMessageProps {
    inviteInfo: string;
}

function InviteMessage(props: InviteMessageProps) {
    const { inviteInfo } = props;
    const invite = JSON.parse(inviteInfo);

    const action = useAction();

    async function handleJoinGroup() {
        const group = await joinGroup(invite.group);
        if (group) {
            group.type = 'group';
            action.addLinkman(group, true);
            Message.success('加入群组成功');
            const page = await getLinkmanMessagesBefore({
                linkmanId: invite.group,
                count: JoinGroupMessagesCount,
            });
            if (page) {
                action.addLinkmanHistoryMessages(invite.group, page.messages, {
                    oldestCreateTime: page.oldestCreateTime,
                    oldestId: page.oldestId,
                    hasMoreBefore: page.hasMore,
                });
            }
        }
    }

    return (
        <div
            className={Style.inviteMessage}
            onClick={handleJoinGroup}
            role="button"
        >
            <div className={Style.info}>
                <span className={Style.info}>
                    &quot;{invite.inviterName}&quot; 邀请你加入群组「
                    {invite.groupName}」
                </span>
            </div>
            <p className={Style.join}>加入</p>
        </div>
    );
}

export default InviteMessage;
