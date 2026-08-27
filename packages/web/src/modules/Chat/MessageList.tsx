import React, {
    useRef,
    useCallback,
    useLayoutEffect,
    useEffect,
    useState,
} from 'react';
import { useSelector } from 'react-redux';

import { css } from 'linaria';
import { State, Message, MessagesMap } from '../../state/reducer';
import {
    shouldShowJumpToLastRead,
    getJumpUnread,
} from '../../state/linkmanRead';
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

/**
 * 滚动意图.
 *
 * linkmanId 是必须的: 这些意图都是在 await 之后才写入的, 而用户完全可能在
 * 请求飞行途中切走. 不带归属的话, A 会话的跳转结果会作用到 B 会话上 ——
 * 表现为"点开另一个群, 它自己莫名其妙滚到了中间"
 */
type ScrollIntent = { linkmanId: string } & (
    | { type: 'bottom' }
    | { type: 'restore'; prevHeight: number; prevTop: number }
    | { type: 'anchor'; messageId: string }
    /**
     * 把某条消息钉在视口里的原位置上.
     *
     * 向后翻页时用它而不是 restore: restore 算的是
     * `新高度 - 旧高度 + 旧位置`, 前提是"高度变化全部发生在视口上方" ——
     * 而向后翻页恰恰是在下方追加, 同时还可能在上方裁剪, 那个算式会算偏.
     * 按 DOM 元素定位则在"上方删、下方加"同时发生时依然精确
     */
    | { type: 'keep'; messageId: string; offset: number }
);

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
    const sessionAnchorId = (linkman && linkman.sessionAnchorId) || null;
    const sessionAnchorCreateTime =
        (linkman && linkman.sessionAnchorCreateTime) || null;
    /** 断层状态下用户发消息的次数, 变化即代表"用户想说话" */
    const selfMessageSeq = (linkman && linkman.selfMessageSeq) || 0;
    /**
     * 画分隔线用的锚点: 会话锚点优先.
     * 这样一进会话就能看到"读到哪了", 不用非得先跳一次
     */
    const anchorMessageId =
        sessionAnchorId || (linkman && linkman.anchorMessageId) || null;
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
    /** 上一次渲染时窗口里最新一条消息的 id, 用来识别"刚刚新增了一条" */
    const prevNewestId = useRef<string | null>(null);
    /** 上一次见过的最新消息时间戳, 用来区分"真的来了新消息"和"只是换了 id" */
    const prevNewestCreateTime = useRef(0);
    /**
     * 本次进入会话内, 用户是否已经用过"回到上次阅读位置".
     *
     * 用过就把提示条收起来 —— 它的任务是"把你送回读到的地方", 送到了就该退场,
     * 一直挂着反而像个赖着不走的弹窗. 但分隔线要留着, 那是"你读到哪"的标记
     *
     * 注意不能靠清除会话锚点来实现: 锚点一清, 分隔线跟着就没了
     */
    const [jumpUsed, setJumpUsed] = useState(false);
    // 换会话就重新给一次机会, 否则用过一次之后所有会话都不再提示了
    useEffect(() => {
        setJumpUsed(false);
    }, [focus]);
    /**
     * 窗口有断层时用户发了消息 —— 那条消息进不了当前窗口 (进去会乱序),
     * 用户会看不见自己刚说的话. 这时直接把他带回最新消息那里.
     *
     * 用序号而不是布尔值: 连发几条也要每次都触发
     */
    const prevSelfSeq = useRef(selfMessageSeq);
    useEffect(() => {
        if (selfMessageSeq === prevSelfSeq.current) {
            return;
        }
        prevSelfSeq.current = selfMessageSeq;
        if (hasGapAfter) {
            handleJumpToLatest();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selfMessageSeq, hasGapAfter]);
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
            /**
             * 时间戳必须和 id 一起更新.
             *
             * 只推进 id 的话, lastReadCreateTime 会一直停在旧值, 等窗口滚动到
             * oldestCreateTime 超过它, canReportRead() 就永久返回 false,
             * 本次会话剩下的时间里已读再也上报不出去 —— 未读会在服务端悄悄堆积,
             * 直到下次刷新或者在别的设备上才暴露出来
             */
            const reported = messages[messageId];
            action.setLinkmanReadState({
                linkmanId: focus,
                lastReadMessageId: messageId,
                lastReadCreateTime: reported
                    ? new Date(reported.createTime).getTime()
                    : undefined,
                unread: 0,
            });
        },
        [isLogin, focus, canReportRead, getNewestPersistedId, action, messages],
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
                    {
                        beforeCreateTime:
                            current.oldestCreateTime === undefined
                                ? null
                                : current.oldestCreateTime,
                        beforeId:
                            current.oldestId === undefined
                                ? null
                                : current.oldestId,
                    },
                );
                if (historyMessages && historyMessages.length > 0) {
                    scrollIntent.current = {
                        linkmanId: focus,
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
            if (page.messages.length === 0) {
                /**
                 * 空页只意味着"到头了", 不该再走 addLinkmanHistoryMessages ——
                 * 那个 reducer 即使收到空数组也会造出一个新的 messages 对象,
                 * 引用一变布局副作用就跟着跑一次, 而这次没有任何滚动意图,
                 * 于是直接落进兜底分支被弹到底部.
                 * setLinkmanProperty 保持 messages 引用不变, 不会惊动它
                 */
                action.setLinkmanProperty(focus, 'hasMoreBefore', page.hasMore);
                return;
            }
            /**
             * 在 dispatch 之前先记录高度, 提交之后按
             * 新高度 - 旧高度 + 旧位置 还原,
             * 否则插入的历史消息会把视口整个顶下去
             */
            scrollIntent.current = {
                linkmanId: focus,
                type: 'restore',
                prevHeight,
                prevTop,
            };
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
            /**
             * 必须留下滚动意图, 否则布局副作用会落到最后那个兜底分支.
             *
             * fetchAfter 的唯一调用点在 `if (nearBottom.current)` 里面, 也就是说
             * 走到这里时 nearBottom 必然是 true —— 兜底分支于是每次都执行
             * `scrollTop = scrollHeight`, 把用户直接送过刚刚取回来的那 30 条,
             * 一路弹到最新消息. 用户看到的就是"往下滑一点, 触发加载, 然后跳到最新"
             *
             * 这里读 linkmanRef 而不是上面的 current: current 是 await 之前抓的
             */
            const $listDiv = $list.current;
            const keys = Object.keys(linkmanRef.current?.messages || {});
            const joinId = keys[keys.length - 1];
            const $join =
                $listDiv && joinId
                    ? ($listDiv.querySelector(
                        `[data-message-id="${joinId}"]`,
                    ) as HTMLElement | null)
                    : null;
            if ($listDiv && $join) {
                scrollIntent.current = {
                    linkmanId: focus,
                    type: 'keep',
                    messageId: joinId,
                    offset: $join.offsetTop - $listDiv.scrollTop,
                };
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

        /**
         * 自己发的消息必须无条件回到底部.
         *
         * 否则用户跳回历史位置看旧消息时随手发一句, 消息进了列表最下面,
         * 视口却还停在上面 —— 看起来就像"发出去了但没发出去"
         */
        const messageKeys = Object.keys(messages);
        const newestId = messageKeys.length
            ? messageKeys[messageKeys.length - 1]
            : null;
        /**
         * 是否真的来了一条更新的消息.
         *
         * 只比 id 不够: 自己发的消息会先以 `${会话id}${时间戳}` 的乐观 id 插进来,
         * 落库后 UpdateMessage 把它换成真实 ObjectId —— 条数没变、内容没变,
         * 单看 id 却是"最新一条变了", 于是同一条消息会把视口滚两次
         *
         * 时间戳才是可靠依据: 换 key 时 createTime 不变, 真来了新消息才会前进
         */
        const newestCreateTime = newestId
            ? new Date(messages[newestId].createTime).getTime()
            : 0;
        /**
         * 自己发的消息会经历"乐观插入 -> 落库后换成真实 id"两步.
         *
         * 光比时间戳挡不住第二步: 乐观消息用的是本地 Date.now(), 而服务端
         * 落库的时间戳通常还要晚几十毫秒, 于是"时间戳前进了"照样成立 ——
         * 结果同一条消息滚两次, 用户看到的就是发完之后画面又动了一下
         *
         * 换 id 这一步的特征很明确: 上一次的最新一条是乐观 id (不是 ObjectId 形态),
         * 这一次变成了真实 ObjectId. 这种情况只是同一条消息换了身份, 不是新消息
         */
        const wasOptimistic =
            !!prevNewestId.current &&
            !ObjectIdRegex.test(prevNewestId.current);
        const isReplacingOptimistic =
            wasOptimistic && !!newestId && ObjectIdRegex.test(newestId);
        const isNewestChanged =
            !!newestId &&
            newestId !== prevNewestId.current &&
            newestCreateTime > prevNewestCreateTime.current &&
            !isReplacingOptimistic;
        const isNewSelfMessage =
            isNewestChanged &&
            !!messages[newestId as string].from &&
            messages[newestId as string].from._id === selfId;
        prevNewestId.current = newestId;
        if (newestCreateTime > prevNewestCreateTime.current) {
            prevNewestCreateTime.current = newestCreateTime;
        }

        const intent = scrollIntent.current;
        scrollIntent.current = null;

        /**
         * 切换会话的重置必须排在"丢弃过期意图"前面.
         *
         * prevFocus 在上面已经推进过了, 如果上一个会话的请求正好在这一次提交里
         * 返回, 下面那个 return 会把这段重置整个跳过 —— 而它是唯一会重置
         * nearBottom 和滚动位置的地方, 跳过之后新会话就继承了旧会话的状态,
         * 并且再也没有第二次机会
         */
        if (isFocusChange) {
            nearBottom.current = true;
            $div.scrollTop = $div.scrollHeight;
            return;
        }

        // 请求飞行途中用户切走了, 这个意图属于别的会话, 丢弃
        if (intent && intent.linkmanId !== focus) {
            return;
        }

        /**
         * 每个分支都要明确声明它造成的"贴底状态", 不能沿用上一次的值.
         * 这几个分支都是把视口挪到别处, 却把 nearBottom 留在原样 ——
         * 于是紧接着到达的任何一条消息都会读到过期的 true, 把刚定位好的位置冲掉
         */
        if (intent) {
            if (intent.type === 'restore') {
                $div.scrollTop =
                    $div.scrollHeight - intent.prevHeight + intent.prevTop;
                nearBottom.current = false;
                return;
            }
            if (intent.type === 'keep') {
                const $keep = $div.querySelector(
                    `[data-message-id="${intent.messageId}"]`,
                ) as HTMLElement | null;
                if ($keep) {
                    $div.scrollTop = $keep.offsetTop - intent.offset;
                }
                nearBottom.current = false;
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
                nearBottom.current = false;
                return;
            }
            if (intent.type === 'bottom') {
                $div.scrollTop = $div.scrollHeight;
                nearBottom.current = true;
                return;
            }
        }

        if (isNewSelfMessage) {
            nearBottom.current = true;
            $div.scrollTop = $div.scrollHeight;
            return;
        }

        /**
         * 兜底: 必须"真的追加了最新一条", 并且这条到达之前用户就贴着底部.
         *
         * 少了 isNewestChanged 这个条件, 任何让 messages 引用变化的操作
         * (翻页、撤回、跳转、重连拉取) 都会走到这里, 拿上一轮的几何结论
         * 去决定这一轮要不要弹到底部
         */
        if (isNewestChanged && nearBottom.current) {
            $div.scrollTop = $div.scrollHeight;
        }
    }, [messages, focus, selfId]);

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
        /**
         * 必须包一层再传给 pagehide.
         *
         * 直接把 reportRead 当监听器, 浏览器会把 PageTransitionEvent 作为第一个参数
         * 传进去, 正好落在 `force` 上 —— 于是 canReportRead() 和 isAtBottom()
         * 两道保护全被跳过. 后果很严重: 一个积压 300 条未读、本地只加载了 15 条的
         * 用户, 关掉标签页就会把最新那条上报成已读, 中间 285 条从此再也回不去
         */
        function flushOnHide() {
            reportRead();
        }
        window.document.addEventListener('visibilitychange', flush);
        window.addEventListener('pagehide', flushOnHide);
        return () => {
            window.document.removeEventListener('visibilitychange', flush);
            window.removeEventListener('pagehide', flushOnHide);
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

        /**
         * 锚点消息就在本地窗口里, 直接滚过去 —— 不发请求, 不改 state.
         *
         * 这是"没刷新就点进有未读的会话"的常见情况: 那些消息本来就是推过来的,
         * 一直在内存里. 这里不能用 scrollIntent, 因为应用它的 layout effect
         * 依赖 [messages, focus], 这两个都没变, effect 不会重跑
         */
        if (sessionAnchorId && !hasGapAfter && messages[sessionAnchorId]) {
            const $div = $list.current;
            const target = $div
                ? $div.querySelector(
                    `[data-message-id="${sessionAnchorId}"]`,
                )
                : null;
            if (target) {
                target.scrollIntoView({ block: 'center' });
                nearBottom.current = false;
                setJumpUsed(true);
                return;
            }
        }

        const context = await getLinkmanUnreadContext(
            focus,
            ForwardFetchCount,
            /**
             * 锚点必须由客户端指定.
             *
             * 服务端是从 History 里取锚点的, 而用户点开会话时前端已经上报过已读,
             * History 早就推到最新了 —— 让服务端决定的话, 这个叫"回到上次阅读位置"
             * 的按钮会把人直接送到最底部, 顺带把锚点也冲掉
             */
            sessionAnchorId
                ? {
                    anchorMessageId: sessionAnchorId,
                    anchorCreateTime: sessionAnchorCreateTime as number,
                }
                : undefined,
        );
        if (!context) {
            return;
        }
        setJumpUsed(true);
        scrollIntent.current = {
            linkmanId: focus,
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
            /**
             * 钉住锚点的这条路径不要传 unread ——
             * SetLinkmanMessagesWindow 会拿它去写 unreadSnapshot,
             * 而此刻服务端算出来的 unread 已经是 0 了, 传过去会把侧边栏角标清掉
             */
            unread: sessionAnchorId ? undefined : context.unread,
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
        scrollIntent.current = { linkmanId: focus, type: 'bottom' };
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
        /**
         * 必须把已读同步给服务端.
         *
         * "跳到最新"是用户主动放弃补课, 和点"×"是一个意思. 只在本地把 unread 清零
         * 而不上报的话, 服务端的阅读位置会永远停在积压之前 —— 于是之后每次
         * canReportRead() 都判定锚点在窗口外而拒绝上报, 未读数就此永久卡死,
         * 客户端显示 0、服务端却还记着上百条
         *
         * 这里不能调 reportRead(): 它从闭包里读 messages, 而此刻组件还没重渲染,
         * 拿到的是替换之前的旧窗口. 直接用刚拉到的这一页的最新一条
         */
        if (page.newestId) {
            reportedRef.current[focus] = page.newestId;
            updateHistory(focus, page.newestId);
            action.setLinkmanReadState({
                linkmanId: focus,
                lastReadMessageId: page.newestId,
                lastReadCreateTime: page.newestCreateTime,
                unread: 0,
                clearSessionAnchor: true,
            });
        } else {
            reportedRef.current[focus] = '';
        }
    }

    /** 忽略积压, 直接全部标记为已读 */
    function handleDismissUnread(e: React.MouseEvent) {
        e.stopPropagation();
        action.setLinkmanReadState({
            linkmanId: focus,
            unread: 0,
            // 明确把会话锚点也清掉, 不要指望 unread 归零的副作用
            clearSessionAnchor: true,
        });
        // 不重置这个, 强制上报会在去重那一步被短路掉, 什么都发不出去
        reportedRef.current[focus] = '';
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
    const showJumpToLastRead =
        isLogin && !jumpUsed && shouldShowJumpToLastRead(linkman);
    /**
     * 提示条上的数字.
     * 用 linkmanRead 里那个共用函数算, 保证和"要不要显示"的阈值判断口径一致
     */
    const jumpUnreadCount = getJumpUnread(linkman);

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
                            jumpUnreadCount > 99 ? '99+' : jumpUnreadCount
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
