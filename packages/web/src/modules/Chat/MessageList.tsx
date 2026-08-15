import React, { useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { useSelector } from 'react-redux';

import { css } from 'linaria';
import { State, Message, MessagesMap } from '../../state/reducer';
import { hasPendingJumpToLastRead } from '../../state/linkmanRead';
import useIsLogin from '../../hooks/useIsLogin';
import useAction from '../../hooks/useAction';
import {
    getLinkmanMessagesBefore,
    getLinkmanMessagesAfter,
    getLinkmanUnreadContext,
    getDefaultGroupHistoryMessages,
    updateHistory,
} from '../../service';
import MessageComponent from './Message/Message';

import Style from './MessageList.less';

/** 距离底部多少像素以内算"在底部" */
const BottomThreshold = 30;
/** 一次向后翻页的条数 */
const ForwardFetchCount = 30;
/** 落库消息的 id 形态, 上传中的乐观消息用的是 `${focus}${Date.now()}` */
const ObjectIdRegex = /^[0-9a-f]{24}$/i;

const styles = {
    container: css`
        flex: 1;
        position: relative;
        overflow: hidden;
    `,
    unread: css`
        position: absolute;
        bottom: 6px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--primary-color-8);
        font-size: 14px;
        color: var(--primary-text-color-9);
        padding: 3px 8px;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        z-index: 2;
    `,
    unreadDismiss: css`
        margin-left: 8px;
        padding: 0 2px;
        opacity: 0.75;
        &:hover {
            opacity: 1;
        }
    `,
    divider: css`
        display: flex;
        align-items: center;
        margin: 10px 0;
        color: var(--primary-color-8);
        font-size: 12px;
        &::before,
        &::after {
            content: '';
            flex: 1;
            height: 1px;
            background-color: var(--primary-color-8);
            opacity: 0.5;
        }
        span {
            padding: 0 8px;
        }
    `,
    tip: css`
        text-align: center;
        color: #888;
        font-size: 12px;
        padding: 6px 0;
    `,
};

type ScrollIntent =
    | { type: 'bottom' }
    | { type: 'restore'; prevHeight: number; prevTop: number }
    | { type: 'anchor'; messageId: string };

type Props = {
    /** ChatInput 的 ref, 用于点头像/回复时把文本插入输入框 */
    qwe: any;
};

function MessageList(props: Props) {
    const { qwe } = props;
    const action = useAction();
    const isLogin = useIsLogin();

    const selfId = useSelector((state: State) => state.user?._id || '');
    const isAdmin = useSelector(
        (state: State) => !!(state.user && state.user.isAdmin),
    );
    const focus = useSelector((state: State) => state.focus);
    const linkman = useSelector((state: State) => state.linkmans[focus]);
    const tagColorMode = useSelector(
        (state: State) => state.status.tagColorMode,
    );

    const messages: MessagesMap = linkman ? linkman.messages : {};
    const hasGapAfter = !!(linkman && linkman.hasGapAfter);
    const hasMoreBefore = !linkman || linkman.hasMoreBefore !== false;
    const unreadSnapshot = (linkman && linkman.unreadSnapshot) || 0;
    const anchorMessageId = (linkman && linkman.anchorMessageId) || null;
    const lastReadCreateTime =
        linkman && linkman.lastReadCreateTime !== undefined
            ? linkman.lastReadCreateTime
            : null;
    const oldestCreateTime =
        linkman && linkman.oldestCreateTime !== undefined
            ? linkman.oldestCreateTime
            : null;

    const $list = useRef<HTMLDivElement>(null);
    /**
     * 始终指向最新的联系人对象.
     * 翻页函数是在 handleScroll 的闭包里被调用的, 而 handleScroll 是 memo 过的,
     * 直接读闭包里的 linkman 有可能读到上一轮渲染的游标
     */
    const linkmanRef = useRef(linkman);
    linkmanRef.current = linkman;
    /**
     * 用 ref 而不是普通局部变量.
     * 原来的 `let isFetching = false` 每次渲染都会重新创建, 而请求过程中的 dispatch
     * 会触发重渲染并换掉 DOM 上的事件处理函数, 新函数里的标记又是 false,
     * 于是这个"防重入"标记实际上从来没起过作用
     */
    const isFetchingBefore = useRef(false);
    const isFetchingAfter = useRef(false);
    /** 下一次 DOM 提交后要执行的滚动动作 */
    const scrollIntent = useRef<ScrollIntent | null>(null);
    /** 用户当前是否贴着底部, 在滚动时持续记录, 供提交后判断要不要跟随 */
    const nearBottom = useRef(true);
    const prevFocus = useRef(focus);
    /** 每个联系人最后一次上报过的已读消息id, 避免重复请求 */
    const reportedRef = useRef<{ [linkmanId: string]: string }>({});
    const rafId = useRef(0);

    /**
     * 内容不足一屏时 scrollHeight === clientHeight, scrollTop 恒为 0,
     * 这种情况必须算作"已经看到底部", 否则短会话 (新群和大多数私聊)
     * 永远无法上报已读, 未读角标每次登录都会重新冒出来
     */
    function isAtBottom($div: HTMLDivElement) {
        if ($div.scrollHeight <= $div.clientHeight) {
            return true;
        }
        return (
            $div.scrollHeight - $div.clientHeight - $div.scrollTop <
            BottomThreshold
        );
    }

    /**
     * 是否可以把"读到底部"如实上报
     *
     * 只有当上次阅读位置落在当前已加载窗口之内时, "滚动到底部"才真的等于
     * "这中间的消息我都看过了". 如果锚点比窗口里最旧的消息还早,
     * 说明中间那段用户根本没加载过, 这时上报就会把没读的消息标记成已读 ——
     * 而这恰好会毁掉"回到上次阅读位置"所依赖的锚点
     */
    const canReportRead = useCallback(() => {
        if (hasGapAfter) {
            return false;
        }
        if (lastReadCreateTime === null || oldestCreateTime === null) {
            return true;
        }
        return lastReadCreateTime >= oldestCreateTime;
    }, [hasGapAfter, lastReadCreateTime, oldestCreateTime]);

    /** 找出窗口里最新的一条"真实落库"的消息 */
    const getNewestPersistedId = useCallback(() => {
        const keys = Object.keys(messages);
        for (let i = keys.length - 1; i >= 0; i -= 1) {
            const { _id } = messages[keys[i]];
            if (ObjectIdRegex.test(_id)) {
                return _id;
            }
        }
        return null;
    }, [messages]);

    const reportRead = useCallback(
        (force = false) => {
            const $div = $list.current;
            if (!isLogin || !focus || !$div) {
                return;
            }
            if (!force) {
                if (!canReportRead() || !isAtBottom($div)) {
                    return;
                }
            }
            const messageId = getNewestPersistedId();
            if (!messageId || reportedRef.current[focus] === messageId) {
                return;
            }
            reportedRef.current[focus] = messageId;
            updateHistory(focus, messageId);
            action.setLinkmanReadState({
                linkmanId: focus,
                lastReadMessageId: messageId,
                unread: 0,
            });
        },
        [isLogin, focus, canReportRead, getNewestPersistedId, action],
    );

    /** 向前 (更旧) 翻一页 */
    async function fetchBefore() {
        const current = linkmanRef.current;
        if (isFetchingBefore.current || !focus || !current) {
            return;
        }
        // 已经到最早了就不要再无谓地请求
        if (current.hasMoreBefore === false) {
            return;
        }
        isFetchingBefore.current = true;
        try {
            const $div = $list.current;
            const prevHeight = $div ? $div.scrollHeight : 0;
            const prevTop = $div ? $div.scrollTop : 0;
            const existCount = Object.keys(current.messages).length;

            if (!isLogin) {
                const historyMessages = await getDefaultGroupHistoryMessages(
                    existCount,
                );
                if (historyMessages && historyMessages.length > 0) {
                    scrollIntent.current = {
                        type: 'restore',
                        prevHeight,
                        prevTop,
                    };
                    action.addLinkmanHistoryMessages(focus, historyMessages);
                } else {
                    // 老接口不返回 hasMore, 空结果就代表到头了
                    action.setLinkmanProperty(focus, 'hasMoreBefore', false);
                }
                return;
            }

            const page = await getLinkmanMessagesBefore({
                linkmanId: focus,
                beforeCreateTime: current.oldestCreateTime,
                beforeId: current.oldestId,
                existCount,
            });
            if (!page) {
                return;
            }
            if (page.messages.length > 0) {
                /**
                 * 在 dispatch 之前先记录高度, 提交之后按
                 * 新高度 - 旧高度 + 旧位置 还原,
                 * 否则插入的历史消息会把视口整个顶下去
                 */
                scrollIntent.current = { type: 'restore', prevHeight, prevTop };
            }
            action.addLinkmanHistoryMessages(focus, page.messages, {
                oldestCreateTime: page.oldestCreateTime,
                oldestId: page.oldestId,
                hasMoreBefore: page.hasMore,
            });
        } finally {
            isFetchingBefore.current = false;
        }
    }

    /** 向后 (更新) 翻一页, 跳转之后继续往下读时使用 */
    async function fetchAfter() {
        const current = linkmanRef.current;
        if (
            isFetchingAfter.current ||
            !focus ||
            !current ||
            !current.hasGapAfter ||
            !isLogin
        ) {
            return;
        }
        const { newestCreateTime, newestId } = current;
        if (newestCreateTime === null || newestCreateTime === undefined) {
            return;
        }
        isFetchingAfter.current = true;
        try {
            const page = await getLinkmanMessagesAfter({
                linkmanId: focus,
                afterCreateTime: newestCreateTime,
                afterId: newestId,
                count: ForwardFetchCount,
            });
            if (!page) {
                return;
            }
            action.addLinkmanForwardMessages({
                linkmanId: focus,
                messages: page.messages,
                newestCreateTime: page.newestCreateTime,
                newestId: page.newestId,
                /**
                 * 服务端说"没有更多"也不代表窗口就接上了实时消息 ——
                 * 完全可能有一条新消息正在路上. 所以断层不在这里关闭,
                 * 而是由"跳到最新消息"重新拉一页来收尾
                 */
                hasGapAfter: page.hasMore,
            });
        } finally {
            isFetchingAfter.current = false;
        }
    }

    const handleScroll = useCallback(
        (e: any) => {
            // 代码预览弹窗滚动时也会冒泡到这里
            if ($list.current && e.target !== $list.current) {
                return;
            }
            const $div = e.target as HTMLDivElement;

            // 滚动事件触发极其频繁, 用 rAF 合并到每帧一次
            if (rafId.current) {
                return;
            }
            rafId.current = window.requestAnimationFrame(() => {
                rafId.current = 0;
                nearBottom.current = isAtBottom($div);

                if ($div.scrollTop === 0 && $div.scrollHeight > $div.clientHeight) {
                    fetchBefore();
                }
                if (nearBottom.current) {
                    if (hasGapAfter) {
                        fetchAfter();
                    } else {
                        reportRead();
                    }
                }
            });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [focus, messages, hasGapAfter, hasMoreBefore, reportRead],
    );

    /**
     * 所有滚动定位都集中在这一个 layout effect 里
     *
     * 之所以是 useLayoutEffect 而不是 useEffect: Message 组件里原本有一段注释说
     * "在 useEffect 里触发滚动会比 componentDidMount 晚, 会先看到历史消息再一闪而过".
     * 那个结论对 useEffect 成立, 但 useLayoutEffect 是在浏览器绘制之前同步执行的,
     * 不会有这个闪烁. 换过来之后就可以去掉每条消息各自调 scrollIntoView 的做法 ——
     * 原来首屏渲染时 $list.current 还是 null, shouldScroll 对每条消息都是 true,
     * 打开一个有 100 条消息的会话会在一次提交里连续触发 100 次同步滚动
     */
    useLayoutEffect(() => {
        const $div = $list.current;
        if (!$div) {
            return;
        }

        const isFocusChange = prevFocus.current !== focus;
        prevFocus.current = focus;

        const intent = scrollIntent.current;
        scrollIntent.current = null;

        if (isFocusChange) {
            // 切换会话必须重置位置, 否则会继承上一个会话的 scrollTop
            nearBottom.current = true;
            $div.scrollTop = $div.scrollHeight;
            return;
        }

        if (intent) {
            if (intent.type === 'restore') {
                $div.scrollTop =
                    $div.scrollHeight - intent.prevHeight + intent.prevTop;
                return;
            }
            if (intent.type === 'anchor') {
                const $anchor = $div.querySelector(
                    `[data-message-id="${intent.messageId}"]`,
                );
                if ($anchor) {
                    $anchor.scrollIntoView({ block: 'center' });
                } else {
                    $div.scrollTop = 0;
                }
                return;
            }
            if (intent.type === 'bottom') {
                $div.scrollTop = $div.scrollHeight;
                return;
            }
        }

        // 没有特别指定时, 只有用户本来就贴着底部才跟随新消息
        if (nearBottom.current) {
            $div.scrollTop = $div.scrollHeight;
        }
    }, [messages, focus]);

    // 内容变化后补一次已读上报, 覆盖"整屏还没撑满"的场景
    useEffect(() => {
        reportRead();
    }, [messages, reportRead]);

    /**
     * 关闭标签页/切到后台时把阅读位置刷出去
     * 原来完全没有这类处理, 最多可能丢掉 30 秒的阅读进度
     */
    useEffect(() => {
        function flush() {
            if (window.document.hidden) {
                reportRead();
            }
        }
        window.document.addEventListener('visibilitychange', flush);
        window.addEventListener('pagehide', reportRead);
        return () => {
            window.document.removeEventListener('visibilitychange', flush);
            window.removeEventListener('pagehide', reportRead);
        };
    }, [reportRead]);

    useEffect(
        () => () => {
            if (rafId.current) {
                window.cancelAnimationFrame(rafId.current);
            }
        },
        [],
    );

    /** 一键回到上次阅读位置 */
    async function handleJumpToLastRead() {
        if (!focus || !isLogin) {
            return;
        }
        const context = await getLinkmanUnreadContext(
            focus,
            ForwardFetchCount,
        );
        if (!context) {
            return;
        }
        scrollIntent.current = {
            type: 'anchor',
            messageId: context.anchorMessageId || '',
        };
        action.setLinkmanMessagesWindow({
            linkmanId: focus,
            messages: context.messages,
            oldestCreateTime: context.oldestCreateTime,
            oldestId: context.oldestId,
            newestCreateTime: context.newestCreateTime,
            newestId: context.newestId,
            hasMoreBefore: true,
            hasGapAfter: context.hasMoreAfter,
            anchorMessageId: context.anchorMessageId,
            unread: context.unread,
        });
    }

    /**
     * 跳到最新消息
     *
     * 这里刻意用"重新拉最新一页并整体替换", 而不是循环调用向后翻页直到没有更多:
     * 后者对一个积压几百条的会话意味着十几次串行请求, 而且永远无法证明自己
     * 真的追上了实时消息 —— 服务端回答"没有更多"的同时可能已经有新消息在路上了.
     * 以服务端返回的最新一页为准, 一次请求就能确定地回到实时状态
     */
    async function handleJumpToLatest() {
        if (!focus) {
            return;
        }
        const page = await getLinkmanMessagesBefore({
            linkmanId: focus,
            count: 15,
        });
        if (!page) {
            return;
        }
        scrollIntent.current = { type: 'bottom' };
        action.setLinkmanMessagesWindow({
            linkmanId: focus,
            messages: page.messages,
            oldestCreateTime: page.oldestCreateTime,
            oldestId: page.oldestId,
            newestCreateTime: page.newestCreateTime,
            newestId: page.newestId,
            hasMoreBefore: page.hasMore,
            hasGapAfter: false,
            anchorMessageId: null,
            unread: 0,
        });
        reportedRef.current[focus] = '';
    }

    /** 忽略积压, 直接全部标记为已读 */
    function handleDismissUnread(e: React.MouseEvent) {
        e.stopPropagation();
        action.setLinkmanReadState({ linkmanId: focus, unread: 0 });
        reportRead(true);
    }

    function renderMessage(message: Message) {
        const isSelf = message.from._id === selfId;

        let { tag } = message.from;
        if (!tag && linkman.type === 'group' && message.from._id === linkman.creator) {
            tag = '群主';
        }

        return (
            <MessageComponent
                key={message._id}
                id={message._id}
                linkmanId={focus}
                isSelf={isSelf}
                isAdmin={isAdmin}
                userId={message.from._id}
                avatar={message.from.avatar}
                username={message.from.username}
                originUsername={message.from.originUsername}
                time={message.createTime}
                type={message.type}
                content={message.content}
                tag={tag}
                loading={message.loading}
                percent={message.percent}
                tagColorMode={tagColorMode}
                qwe={qwe}
            />
        );
    }

    if (!linkman) {
        return <div className={styles.container} />;
    }

    /**
     * 上次阅读位置还在当前窗口之外时才提示跳转.
     * 都已经看得到了就没必要再让用户点一下
     */
    const showJumpToLastRead = isLogin && hasPendingJumpToLastRead(linkman);

    const messageList = Object.values(messages);

    /**
     * 未读分隔线要画在"最后读过的那条"之后, 而不是它之前 ——
     * 锚点本身是已经读过的消息, 把线画在它上面会让它看起来也是新消息.
     * 锚点正好是最后一条时不画线 (下面没有新消息了)
     */
    const anchorIndex = anchorMessageId
        ? messageList.findIndex((message) => message._id === anchorMessageId)
        : -1;
    const dividerBeforeId =
        anchorIndex >= 0 && anchorIndex + 1 < messageList.length
            ? messageList[anchorIndex + 1]._id
            : null;

    return (
        <div className={styles.container}>
            <div
                className={`${Style.messageList} show-scrollbar`}
                onScroll={handleScroll}
                ref={$list}
            >
                {!hasMoreBefore && messageList.length > 0 && (
                    <div className={styles.tip}>没有更早的消息了</div>
                )}
                {messageList.map((message) => (
                    <React.Fragment key={message._id}>
                        {dividerBeforeId === message._id && (
                            <div className={styles.divider}>
                                <span>以下是新消息</span>
                            </div>
                        )}
                        {renderMessage(message)}
                    </React.Fragment>
                ))}
            </div>

            {hasGapAfter && (
                <div
                    className={styles.unread}
                    onClick={handleJumpToLatest}
                    role="button"
                >
                    <span>跳到最新消息</span>
                </div>
            )}

            {!hasGapAfter && showJumpToLastRead && (
                <div
                    className={styles.unread}
                    onClick={handleJumpToLastRead}
                    role="button"
                >
                    <span>
                        {`回到上次阅读位置 · ${
                            unreadSnapshot > 99 ? '99+' : unreadSnapshot
                        }条未读`}
                    </span>
                    <span
                        className={styles.unreadDismiss}
                        onClick={handleDismissUnread}
                        role="button"
                    >
                        ×
                    </span>
                </div>
            )}
        </div>
    );
}

export default MessageList;
