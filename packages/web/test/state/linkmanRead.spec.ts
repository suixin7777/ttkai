import {
    hasPendingJumpToLastRead,
    isLastReadOutsideWindow,
    getDisplayUnread,
} from '../../src/state/linkmanRead';
import {
    shouldShowJumpToLastRead,
    getSessionAnchorUnread,
} from '../../src/state/linkmanRead';
import reducer, { Linkman, State } from '../../src/state/reducer';
import { ActionTypes } from '../../src/state/action';

const OID_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OID_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

/** 造一段连续消息, id 是合法 ObjectId 形态 */
function buildMessages(count: number, startTime = 1000) {
    const map: any = {};
    for (let i = 0; i < count; i += 1) {
        const id = i.toString(16).padStart(24, '0');
        map[id] = { _id: id, createTime: new Date(startTime + i * 1000) };
    }
    return map;
}

/** 造一个刷新后、还欠着一段没读的会话 */
function pendingLinkman(overrides: Partial<Linkman> = {}): Linkman {
    return {
        _id: 'g1',
        unread: 20,
        unreadSnapshot: 20,
        messages: {},
        lastReadMessageId: 'm-anchor',
        // 锚点比窗口里最旧的一条还早 -> 光靠滚动回不去
        lastReadCreateTime: 1000,
        oldestCreateTime: 2000,
        hasGapAfter: false,
        ...overrides,
    } as unknown as Linkman;
}

describe('linkmanRead', () => {
    describe('isLastReadOutsideWindow', () => {
        it('锚点早于窗口最旧一条时为真', () => {
            expect(isLastReadOutsideWindow(pendingLinkman())).toBe(true);
        });

        it('锚点已经在窗口里时为假', () => {
            expect(
                isLastReadOutsideWindow(
                    pendingLinkman({ lastReadCreateTime: 3000 }),
                ),
            ).toBe(false);
        });

        it('缺少任一边界时为假, 不做猜测', () => {
            expect(
                isLastReadOutsideWindow(
                    pendingLinkman({ lastReadCreateTime: null }),
                ),
            ).toBe(false);
            expect(
                isLastReadOutsideWindow(
                    pendingLinkman({ oldestCreateTime: null }),
                ),
            ).toBe(false);
            expect(isLastReadOutsideWindow(null)).toBe(false);
        });
    });

    describe('hasPendingJumpToLastRead', () => {
        it('刷新后有未读且锚点在窗口外 -> 需要跳转', () => {
            expect(hasPendingJumpToLastRead(pendingLinkman())).toBe(true);
        });

        it('用户瞄了一眼把 unread 清零, 但快照还在 -> 仍然需要跳转', () => {
            expect(hasPendingJumpToLastRead(pendingLinkman({ unread: 0 }))).toBe(
                true,
            );
        });

        it('从来没读过的会话不提示跳转', () => {
            expect(
                hasPendingJumpToLastRead(
                    pendingLinkman({ lastReadMessageId: undefined }),
                ),
            ).toBe(false);
        });

        it('已经跳转过、窗口和最新消息断开时不再提示往回跳', () => {
            expect(
                hasPendingJumpToLastRead(pendingLinkman({ hasGapAfter: true })),
            ).toBe(false);
        });

        it('一条未读都没有时不提示', () => {
            expect(
                hasPendingJumpToLastRead(
                    pendingLinkman({ unread: 0, unreadSnapshot: 0 }),
                ),
            ).toBe(false);
        });
    });

    describe('getDisplayUnread', () => {
        it('有实时未读时显示实时未读', () => {
            expect(getDisplayUnread(pendingLinkman({ unread: 3 }))).toBe(3);
        });

        it('unread 被点开清零、但还欠着时, 回落到快照而不是显示 0', () => {
            expect(getDisplayUnread(pendingLinkman({ unread: 0 }))).toBe(20);
        });

        it('真读完了就是 0', () => {
            expect(
                getDisplayUnread(
                    pendingLinkman({ unread: 0, lastReadCreateTime: 3000 }),
                ),
            ).toBe(0);
        });
    });

    /**
     * 核心场景: 不刷新页面, 消息是 socket 推过来的, 已经在本地了.
     * 这时锚点落在窗口"里面", 老判断给不出提示条, 得靠会话锚点
     */
    describe('会话锚点 (不刷新也能回跳)', () => {
        /** 消息都推到本地了的会话: 锚点在窗口内, 老判断为假 */
        function streamedState(unread = 20): State {
            const messages = buildMessages(40);
            const keys = Object.keys(messages);
            const anchorId = keys[keys.length - 1 - unread];
            return {
                focus: 'other',
                user: { _id: 'u1' },
                linkmans: {
                    g1: {
                        _id: 'g1',
                        unread,
                        unreadSnapshot: 0,
                        messages,
                        lastReadMessageId: anchorId,
                        lastReadCreateTime: new Date(
                            messages[anchorId].createTime,
                        ).getTime(),
                        // 锚点在窗口内 -> 老判断给不出提示条
                        oldestCreateTime: 1000,
                        hasGapAfter: false,
                    } as unknown as Linkman,
                    other: { _id: 'other', unread: 0, messages: {} } as unknown as Linkman,
                },
            } as unknown as State;
        }

        it('老判断在这个场景下确实是假的 (说明确实需要新机制)', () => {
            const s = streamedState();
            expect(isLastReadOutsideWindow(s.linkmans.g1)).toBe(false);
            expect(hasPendingJumpToLastRead(s.linkmans.g1)).toBe(false);
        });

        it('切进会话时钉住锚点, 提示条就出来了', () => {
            const next = reducer(streamedState(20), {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            const g1 = next.linkmans.g1;
            expect(g1.sessionAnchorId).toBe(g1.lastReadMessageId);
            expect(typeof g1.sessionAnchorCreateTime).toBe('number');
            expect(shouldShowJumpToLastRead(g1)).toBe(true);
            expect(getSessionAnchorUnread(g1)).toBe(20);
        });

        it('没有未读时不钉锚点, 也不显示提示条', () => {
            const next = reducer(streamedState(0), {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            expect(next.linkmans.g1.sessionAnchorId).toBe(null);
            expect(shouldShowJumpToLastRead(next.linkmans.g1)).toBe(false);
        });

        it('再点一次当前已经打开的会话, 不会把锚点清掉', () => {
            let state = reducer(streamedState(20), {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            const pinned = state.linkmans.g1.sessionAnchorId;
            // 此时 unread 已经是 0, 少了 focus 变化的判断就会被重算成空
            state = reducer(state, {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            expect(state.linkmans.g1.sessionAnchorId).toBe(pinned);
            expect(shouldShowJumpToLastRead(state.linkmans.g1)).toBe(true);
        });

        it('上报已读不会抹掉用户眼前的分隔线', () => {
            let state = reducer(streamedState(20), {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            const pinned = state.linkmans.g1.sessionAnchorId;
            // reportRead 走的就是这个 action, 且不带 clearSessionAnchor
            state = reducer(state, {
                type: ActionTypes.SetLinkmanReadState,
                payload: {
                    linkmanId: 'g1',
                    lastReadMessageId: OID_B,
                    lastReadCreateTime: 999999,
                    unread: 0,
                },
            } as any);
            expect(state.linkmans.g1.sessionAnchorId).toBe(pinned);
            expect(shouldShowJumpToLastRead(state.linkmans.g1)).toBe(true);
        });

        it('点"×"全部标记已读才会清掉锚点', () => {
            let state = reducer(streamedState(20), {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            state = reducer(state, {
                type: ActionTypes.SetLinkmanReadState,
                payload: {
                    linkmanId: 'g1',
                    unread: 0,
                    clearSessionAnchor: true,
                },
            } as any);
            expect(state.linkmans.g1.sessionAnchorId).toBe(null);
            expect(shouldShowJumpToLastRead(state.linkmans.g1)).toBe(false);
        });

        it('裁剪到 50 条时不会把锚点裁掉', () => {
            // 60 条消息, 未读 55 -> 锚点很靠前, 按老规则会被裁掉
            const state = streamedState(20);
            const messages = buildMessages(60);
            const keys = Object.keys(messages);
            const anchorId = keys[2];
            state.linkmans.g1 = {
                ...state.linkmans.g1,
                messages,
                unread: 57,
                lastReadMessageId: anchorId,
                lastReadCreateTime: new Date(
                    messages[anchorId].createTime,
                ).getTime(),
            } as unknown as Linkman;

            const next = reducer(state, {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            const g1 = next.linkmans.g1;
            expect(g1.sessionAnchorId).toBe(anchorId);
            // 锚点仍然在窗口里, 分隔线才画得出来
            expect(Object.keys(g1.messages)).toContain(anchorId);
        });

        it('临时会话 (陌生人私聊) 没有真实阅读位置, 不钉锚点', () => {
            const state = streamedState(1);
            state.linkmans.g1 = {
                ...state.linkmans.g1,
                unread: 1,
                lastReadMessageId: null,
            } as unknown as Linkman;
            const next = reducer(state, {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            expect(next.linkmans.g1.sessionAnchorId).toBe(null);
        });

        it('上传中的乐观消息 id 不能当锚点', () => {
            const state = streamedState(1);
            state.linkmans.g1 = {
                ...state.linkmans.g1,
                unread: 1,
                lastReadMessageId: 'g11786800000000',
            } as unknown as Linkman;
            const next = reducer(state, {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            expect(next.linkmans.g1.sessionAnchorId).toBe(null);
        });

        it('锚点被硬删后提示条还在, 因为锚点自带时间戳', () => {
            const next = reducer(streamedState(20), {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            const g1 = next.linkmans.g1;
            const withoutAnchor = {
                ...g1,
                messages: Object.keys(g1.messages)
                    .filter((k) => k !== g1.sessionAnchorId)
                    .reduce((acc: any, k) => {
                        acc[k] = (g1.messages as any)[k];
                        return acc;
                    }, {}),
            } as unknown as Linkman;
            expect(shouldShowJumpToLastRead(withoutAnchor)).toBe(true);
            // 数不出来就退回钉住那一刻的快照
            expect(getSessionAnchorUnread(withoutAnchor)).toBe(20);
        });

        it('侧边栏角标不受会话锚点影响 (不制造幽灵红点)', () => {
            const next = reducer(streamedState(20), {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            // 聊天区有提示条, 但列表角标按服务端口径仍然是 0
            expect(shouldShowJumpToLastRead(next.linkmans.g1)).toBe(true);
            expect(getDisplayUnread(next.linkmans.g1)).toBe(0);
        });
    });

    /**
     * 用户提的场景: 同时有多个群都欠着未读, 切来切去每个群都要各自记账
     */
    describe('多个会话之间互不干扰', () => {
        function twoGroupState(): State {
            return {
                focus: 'g1',
                user: { _id: 'u1' },
                linkmans: {
                    g1: pendingLinkman({ _id: 'g1', unread: 20, unreadSnapshot: 20 }),
                    g2: pendingLinkman({ _id: 'g2', unread: 35, unreadSnapshot: 35 }),
                },
            } as unknown as State;
        }

        it('两个群各自都需要跳转', () => {
            const state = twoGroupState();
            expect(hasPendingJumpToLastRead(state.linkmans.g1)).toBe(true);
            expect(hasPendingJumpToLastRead(state.linkmans.g2)).toBe(true);
        });

        it('切到 g2 不会动 g1 的账', () => {
            const state = twoGroupState();
            const next = reducer(state, {
                type: ActionTypes.SetFocus,
                payload: 'g2',
            } as any);

            // g2 被点开: unread 清零, 但快照留着, 提示条照常显示
            expect(next.linkmans.g2.unread).toBe(0);
            expect(next.linkmans.g2.unreadSnapshot).toBe(35);
            expect(hasPendingJumpToLastRead(next.linkmans.g2)).toBe(true);
            expect(getDisplayUnread(next.linkmans.g2)).toBe(35);

            // g1 完全没被碰过
            expect(next.linkmans.g1.unread).toBe(20);
            expect(next.linkmans.g1.unreadSnapshot).toBe(20);
            expect(hasPendingJumpToLastRead(next.linkmans.g1)).toBe(true);
        });

        it('反复切换不会把快照抹掉', () => {
            let state = twoGroupState();
            state = reducer(state, {
                type: ActionTypes.SetFocus,
                payload: 'g2',
            } as any);
            state = reducer(state, {
                type: ActionTypes.SetFocus,
                payload: 'g1',
            } as any);
            // 再切回 g2: 此时它的 unread 已经是 0 了, 快照不能被 0 覆盖
            state = reducer(state, {
                type: ActionTypes.SetFocus,
                payload: 'g2',
            } as any);

            expect(state.linkmans.g2.unreadSnapshot).toBe(35);
            expect(hasPendingJumpToLastRead(state.linkmans.g2)).toBe(true);
        });
    });
});
