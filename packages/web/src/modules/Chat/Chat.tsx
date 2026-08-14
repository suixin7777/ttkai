import React, { useContext, useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import Style from './Chat.less';
import HeaderBar from './HeaderBar';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import GroupManagePanel from './GroupManagePanel';
import { State, GroupMember } from '../../state/reducer';
import { ShowUserOrGroupInfoContext } from '../../context';
import useIsLogin from '../../hooks/useIsLogin';
import { getGroupOnlineMembers, getUserOnlineStatus } from '../../service';
import useAction from '../../hooks/useAction';
import useAero from '../../hooks/useAero';

function Chat() {
    const isLogin = useIsLogin();
    const action = useAction();
    const hasUserInfo = useSelector((state: State) => !!state.user);
    const focus = useSelector((state: State) => state.focus);
    const linkman = useSelector((state: State) => state.linkmans[focus]);
    const [groupManagePanel, toggleGroupManagePanel] = useState(false);
    const context = useContext(ShowUserOrGroupInfoContext);
    const aero = useAero();
    const self = useSelector((state: State) => state.user?._id) || '';


    const inputrf = useRef(null);


    function handleBodyClick(e: MouseEvent) {
        const { currentTarget } = e;
        let target = e.target as HTMLDivElement;
        do {
            if (target.getAttribute('data-float-panel') === 'true') {
                return;
            }
            // @ts-ignore
            target = target.parentElement;
        } while (target && target !== currentTarget);
        toggleGroupManagePanel(false);
    }
    useEffect(() => {
        document.body.addEventListener('click', handleBodyClick, false);
        return () => {
            document.body.removeEventListener('click', handleBodyClick, false);
        };
    }, []);

    async function fetchGroupOnlineMembers() {
        let onlineMembers: GroupMember[] | { cache: true } = [];
        if (isLogin) {
            onlineMembers = await getGroupOnlineMembers(focus);
        }
        if (Array.isArray(onlineMembers)) {
            action.setLinkmanProperty(focus, 'onlineMembers', onlineMembers);
        }
    }
    async function fetchUserOnlineStatus() {
        const isOnline = await getUserOnlineStatus(focus.replace(self, ''));
        action.setLinkmanProperty(focus, 'isOnline', isOnline);
    }
    useEffect(() => {
        if (!linkman) {
            return () => {};
        }
        const request =
            linkman.type === 'group'
                ? fetchGroupOnlineMembers
                : fetchUserOnlineStatus;
        request();
        const timer = setInterval(() => request(), 1000 * 60);
        return () => clearInterval(timer);
    }, [focus]);

    /**
     * 这里原本有一个每 30 秒跑一次的心跳, 会把"当前已加载的最新一条消息"写成已读,
     * 完全不看用户实际滚动到哪儿 —— 用户正往回翻积压消息的时候, 它照样把这些
     * 还没读的消息标记成已读, 而这正是"回到上次阅读位置"要用的锚点.
     * 另外它的去重缓存是模块级的, 所有联系人共用一份且退出登录也不重置.
     * 阅读位置的上报改由 MessageList 负责 —— 滚动容器在那里, 只有它知道用户真正看到哪了
     */

    if (!hasUserInfo) {
        return <div className={Style.chat} />;
    }
    if (!linkman) {
        return (
            <div className={Style.chat}>
                <HeaderBar id="" name="" type="" onClickFunction={() => {}} />
                <div className={Style.noLinkman}>
                    <div className={Style.noLinkmanImage} />
                    <h2 className={Style.noLinkmanText}>
                        找个群或者好友呀, 不然怎么聊天~~
                    </h2>
                </div>
            </div>
        );
    }

    async function handleClickFunction() {
        if (linkman.type === 'group') {
            let onlineMembers: GroupMember[] | { cache: true } = [];
            if (isLogin) {
                onlineMembers = await getGroupOnlineMembers(focus);
            }
            if (Array.isArray(onlineMembers)) {
                action.setLinkmanProperty(
                    focus,
                    'onlineMembers',
                    onlineMembers,
                );
            }
            toggleGroupManagePanel(true);
        } else {
            // @ts-ignore
            context.showUserInfo(linkman);
        }
    }

    return (
        <div className={Style.chat} {...aero}>
            <HeaderBar
                id={linkman._id}
                name={linkman.name}
                type={linkman.type}
                onlineMembersCount={linkman.onlineMembers?.length}
                isOnline={linkman.isOnline}
                onClickFunction={handleClickFunction}
            />
            <MessageList qwe={inputrf}/>
            <ChatInput ref={inputrf}/>

            {linkman.type === 'group' && (
                <GroupManagePanel
                    visible={groupManagePanel}
                    onClose={() => toggleGroupManagePanel(false)}
                    groupId={linkman._id}
                    avatar={linkman.avatar}
                    creator={linkman.creator}
                    onlineMembers={linkman.onlineMembers}
                />
            )}
        </div>
    );
}

export default Chat;
