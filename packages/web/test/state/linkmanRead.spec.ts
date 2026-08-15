import {
    hasPendingJumpToLastRead,
    isLastReadOutsideWindow,
    getDisplayUnread,
} from '../../src/state/linkmanRead';
import reducer, { Linkman, State } from '../../src/state/reducer';
import { ActionTypes } from '../../src/state/action';

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
