import getFriendId from '@fiora/utils/getFriendId';
import reducer, { State, initialState } from '../../src/state/reducer';
import { Action, ActionTypes } from '../../src/state/action';

describe('redux reducer', () => {
    it('should user initial state', () => {
        const action = { type: 'mock' as ActionTypes, payload: {} } as Action;
        expect(reducer(undefined, action)).toBe(initialState);
    });

    it('should return origin state with unknown action', () => {
        const state = {} as State;
        const action = { type: 'mock' as ActionTypes, payload: {} } as Action;
        expect(reducer(state, action)).toBe(state);
    });

    it('should set connect status to true', () => {
        const state = {
            connect: false,
        } as State;
        const action = {
            type: ActionTypes.Connect,
            payload: {},
        };
        const newState = reducer(state, action);
        expect(newState.connect).toBe(true);
    });

    it('should set connect status to false', () => {
        const state = {
            connect: true,
        } as State;
        const action = {
            type: ActionTypes.Disconnect,
            payload: {},
        };
        const newState = reducer(state, action);
        expect(newState.connect).toBe(false);
    });

    it('should set guest user and default group', () => {
        const state = {} as State;
        const group = {
            _id: '1',
            name: 'Default Group',
        };
        const action = {
            type: ActionTypes.SetGuest,
            payload: group,
        };
        const newState = reducer(state, action);
        expect(newState.user).not.toBe(null);
        expect(newState.linkmans[group._id]).toBe(group);
        expect(newState.focus).toBe(group._id);
    });

    it('should set user and linkmans', () => {
        const state = {
            linkmans: {},
        } as State;
        const group = {
            _id: 'group',
            name: 'group',
        };
        const friend = {
            from: '111',
            to: {
                _id: '222',
                username: 'friend',
            },
        };
        const action = {
            type: ActionTypes.SetUser,
            payload: {
                _id: 'id',
                username: 'user',
                friends: [friend],
                groups: [group],
            },
        };
        const newState = reducer(state, action);
        expect(newState.user).not.toBe(null);
        expect(Object.keys(newState.linkmans).length).toBe(2);
        expect(newState.linkmans[group._id].type).toBe('group');

        const friendId = getFriendId(friend.from, friend.to._id);
        expect(newState.linkmans[friendId].type).toBe('friend');
        expect(newState.linkmans[friendId].name).toBe(friend.to.username);
        expect(newState.focus).toBe(group._id);
    });

    it('should update user with payload data', () => {
        const state = {
            user: {
                _id: 'id',
                username: 'name',
            },
        } as State;
        const action = {
            type: ActionTypes.UpdateUserInfo,
            payload: {
                username: 'new',
            },
        };
        const newState = reducer(state, action);
        expect(newState.user?.username).toBe('new');
    });

    it('should set user to null', () => {
        const state = {
            user: {
                _id: 'id',
            },
        } as State;
        const action = {
            type: ActionTypes.Logout,
            payload: {},
        };
        const newState = reducer(state, action);
        expect(newState.user).toEqual(null);
    });

    it('should update user avatar', () => {
        const state = {
            user: {
                _id: 'id',
                avatar: 'avatar',
            },
        } as State;
        const action = {
            type: ActionTypes.SetAvatar,
            payload: 'new',
        };
        const newState = reducer(state, action);
        expect(newState.user?.avatar).toBe('new');
    });

    it('should update focus and reduce exist messages when more than 50', () => {
        const linkman = {
            _id: '1',
            messages: {},
        };
        const state = {
            linkmans: {
                [linkman._id]: linkman,
            },
            focus: '',
        } as State;
        const action = {
            type: ActionTypes.SetFocus,
            payload: linkman._id,
        };
        const newState = reducer(state, action);
        expect(newState.focus).toBe(linkman._id);
        expect(
            Object.keys(newState.linkmans[newState.focus].messages),
        ).toHaveLength(0);
    });

    it('should reduce exist messages when more than 50', () => {
        const messages: { [id: string]: any } = {};
        for (let i = 0; i < 51; i++) {
            messages[i] = {
                _id: i,
            };
        }
        const linkman = {
            _id: '1',
            messages,
            unread: 10,
        };
        const state = {
            linkmans: {
                [linkman._id]: linkman,
            },
            focus: '',
        } as State;
        const action = {
            type: ActionTypes.SetFocus,
            payload: linkman._id,
        };
        const newState = reducer(state, action);
        expect(
            Object.keys(newState.linkmans[newState.focus].messages),
        ).toHaveLength(50);
    });

    it('should be no change when foucs not exits user id', () => {
        const linkman = {
            id: '1',
        };
        // @ts-ignore
        const state = {
            linkmans: {
                [linkman.id]: linkman,
            },
            focus: linkman.id,
        } as State;
        const action = {
            type: ActionTypes.SetFocus,
            payload: '2',
        };
        const newState = reducer(state, action);
        expect(newState).toBe(state);
    });

    it('should add new group linkman into linkmans', () => {
        const state = {
            linkmans: {},
        } as State;
        const linkman = {
            _id: 'id',
            name: 'name',
            type: 'group',
        };
        const action = {
            type: ActionTypes.AddLinkman,
            payload: {
                linkman,
                focus: true,
            },
        };
        const newState = reducer(state, action);
        expect(Object.keys(newState.linkmans)).toHaveLength(1);
        expect(newState.focus).toBe(linkman._id);
    });

    it('should add new friend linkman into linkmans', () => {
        const state = {
            linkmans: {},
        } as State;
        const linkman = {
            name: 'name',
            type: 'friend',
            from: '111',
            to: {
                _id: '222',
            },
        };
        const action = {
            type: ActionTypes.AddLinkman,
            payload: {
                linkman,
            },
        };
        const newState = reducer(state, action);
        expect(Object.keys(newState.linkmans)).toHaveLength(1);
        expect(newState.linkmans['111222']).toBeTruthy();
    });

    it('should add new temporary linkman into linkmans', () => {
        const state = {
            linkmans: {},
        } as State;
        const linkman = {
            _id: 'id',
            name: 'name',
            type: 'temporary',
        };
        const action = {
            type: ActionTypes.AddLinkman,
            payload: {
                linkman,
            },
        };
        const newState = reducer(state, action);
        expect(Object.keys(newState.linkmans)).toHaveLength(1);
        expect(newState.linkmans[linkman._id].unread).toBe(1);
    });

    it('should return origin state when add unknown linkman', () => {
        const state = {
            linkmans: {},
        } as State;
        const action = {
            type: ActionTypes.AddLinkman,
            payload: {
                linkman: {
                    type: 'xxx',
                },
            },
        };
        const newState = reducer(state, action);
        expect(newState).toBe(state);
    });

    it('should remove linkman form linkmans', () => {
        const linkman1 = {
            _id: '1',
        };
        const linkman2 = {
            _id: '2',
        };
        const state = {
            linkmans: {
                [linkman1._id]: linkman1,
                [linkman2._id]: linkman2,
            },
        } as State;
        const action1 = {
            type: ActionTypes.RemoveLinkman,
            payload: linkman1._id,
        };
        const newState = reducer(state, action1);
        expect(Object.keys(newState.linkmans)).toHaveLength(1);
        expect(newState.focus).toBe(linkman2._id);

        const action2 = {
            type: ActionTypes.RemoveLinkman,
            payload: linkman2._id,
        };
        expect(reducer(newState, action2).focus).toBe('');
    });

    it('should add messages to linkmans', () => {
        const state = {
            linkmans: {
                1: {
                    _id: '1',
                    name: 'name',
                    messages: {},
                },
                2: {
                    _id: '2',
                    name: 'name',
                    messages: {},
                },
            },
        } as unknown as State;
        const action = {
            type: ActionTypes.SetLinkmansLastMessages,
            payload: {
                '1': {
                    messages: [
                        {
                            _id: 'm1',
                            type: 'text',
                            content: 'content',
                        },
                        {
                            _id: 'm2',
                            type: 'text',
                            content: 'content',
                        },
                    ],
                    unread: 2,
                },
            },
        };
        const newState = reducer(state, action);
        expect(Object.keys(newState.linkmans['1'].messages).length).toBe(2);
        expect(Object.keys(newState.linkmans['2'].messages).length).toBe(0);
    });

    it('should add messages to linkman', () => {
        const state = {
            linkmans: {
                1: {
                    _id: '1',
                    name: 'name',
                    messages: {},
                },
            },
        } as unknown as State;
        const action = {
            type: ActionTypes.AddLinkmanHistoryMessages,
            payload: {
                linkmanId: '1',
                messages: [
                    {
                        _id: 'm1',
                        type: 'text',
                        content: 'content',
                    },
                    {
                        _id: 'm2',
                        type: 'text',
                        content: 'content',
                    },
                ],
            },
        };
        const newState = reducer(state, action);
        expect(Object.keys(newState.linkmans['1'].messages).length).toBe(2);
    });

    it('should add message to linkman', () => {
        const linkman = {
            _id: '1',
            name: 'name',
            messages: {},
            unread: 0,
        };
        const state = {
            linkmans: {
                [linkman._id]: linkman,
            },
        } as State;
        const action = {
            type: ActionTypes.AddLinkmanMessage,
            payload: {
                linkmanId: '1',
                message: {
                    _id: 'm1',
                    type: 'text',
                    content: 'content',
                },
            },
        };
        const newState = reducer(state, action);
        expect(Object.keys(newState.linkmans['1'].messages)).toHaveLength(1);
        expect(newState.linkmans['1'].unread).toBe(1);
    });

    it('should not increase unread count when linkman is foucs', () => {
        const linkman = {
            _id: '1',
            name: 'name',
            messages: {},
            unread: 0,
        };
        const state = {
            linkmans: {
                [linkman._id]: linkman,
            },
            focus: linkman._id,
        } as State;
        const action = {
            type: ActionTypes.AddLinkmanMessage,
            payload: {
                linkmanId: '1',
                message: {
                    _id: 'm1',
                    type: 'text',
                    content: 'content',
                },
            },
        };
        const newState = reducer(state, action);
        expect(Object.keys(newState.linkmans['1'].messages)).toHaveLength(1);
        expect(newState.linkmans['1'].unread).toBe(0);
    });

    it('should remove message from linkman', () => {
        const state = {
            linkmans: {
                1: {
                    _id: '1',
                    name: 'name',
                    messages: {
                        m1: {
                            _id: 'm1',
                            type: 'text',
                            content: 'content',
                            from: {},
                        },
                    },
                    unread: 0,
                },
            },
        } as unknown as State;
        const action = {
            type: ActionTypes.DeleteMessage,
            payload: {
                linkmanId: '1',
                messageId: 'm1',
            },
        };
        const newState = reducer(state, action);
        expect(newState.linkmans['1'].messages.m1.deleted).toBe(true);
    });

    it('should return origin state when delete not exists linkman message', () => {
        const state = {
            linkmans: {},
        } as State;
        const action = {
            type: ActionTypes.DeleteMessage,
            payload: {
                linkmanId: '1',
                messageId: 'm1',
            },
        };
        const newState = reducer(state, action);
        expect(newState).toBe(state);
    });

    it('should update linkman property', () => {
        const state = {
            linkmans: {
                1: {
                    _id: '1',
                    name: 'name',
                    messages: {},
                    unread: 0,
                },
            },
        } as unknown as State;
        const action = {
            type: ActionTypes.SetLinkmanProperty,
            payload: {
                linkmanId: '1',
                key: 'name',
                value: 'new_name',
            },
        };
        const newState = reducer(state, action);
        expect(newState.linkmans['1'].name).toBe('new_name');
    });

    it('should update message from linkman', () => {
        const state = {
            linkmans: {
                1: {
                    _id: '1',
                    name: 'name',
                    messages: {
                        m1: {
                            _id: 'm1',
                            type: 'text',
                            content: 'content',
                        },
                    },
                    unread: 0,
                },
            },
        } as unknown as State;
        const action = {
            type: ActionTypes.UpdateMessage,
            payload: {
                linkmanId: '1',
                messageId: 'm1',
                value: {
                    _id: 'm1',
                    type: 'text',
                    content: 'new_content',
                },
            },
        };
        const newState = reducer(state, action);
        expect(newState.linkmans['1'].messages.m1.content).toBe('new_content');
    });

    it('should add instead of update message when it not exists', () => {
        const linkman = {
            _id: '1',
            name: 'name',
            messages: {},
            unread: 0,
        };
        const state = {
            linkmans: {
                [linkman._id]: linkman,
            },
        } as State;
        const action = {
            type: ActionTypes.UpdateMessage,
            payload: {
                linkmanId: linkman._id,
                messageId: 'm1',
                value: {
                    type: 'text',
                    content: 'new_content',
                },
            },
        };
        const newState = reducer(state, action);
        expect(newState.linkmans[linkman._id].messages.m1.content).toBe(
            'new_content',
        );
    });

    it('should update status of key', () => {
        const state = {
            status: {
                aero: false,
            },
        } as unknown as State;
        const action = {
            type: ActionTypes.SetStatus,
            payload: {
                key: 'aero',
                value: true,
            },
        };
        const newState = reducer(state, action);
        expect(newState.status.aero).toBe(true);
    });
});

/**
 * 「回到上次阅读位置」相关的状态流转
 */
describe('redux reducer - 阅读位置与消息窗口', () => {
    function makeState(linkman: any, extra: any = {}): State {
        return {
            user: { _id: 'self' },
            linkmans: { [linkman._id]: linkman },
            focus: '',
            ...extra,
        } as unknown as State;
    }

    function makeMessage(id: string, from = 'other', createTime = 1000) {
        return {
            _id: id,
            type: 'text',
            content: 'content',
            createTime,
            from: { _id: from },
        };
    }

    it('聚焦时应把未读数存成快照再清零', () => {
        const state = makeState({
            _id: '1',
            messages: {},
            unread: 8,
        });
        const newState = reducer(state, {
            type: ActionTypes.SetFocus,
            payload: '1',
        } as Action);
        expect(newState.linkmans['1'].unread).toBe(0);
        expect(newState.linkmans['1'].unreadSnapshot).toBe(8);
    });

    it('重复聚焦不应把已有的未读快照冲掉', () => {
        const state = makeState({
            _id: '1',
            messages: {},
            unread: 0,
            unreadSnapshot: 8,
        });
        const newState = reducer(state, {
            type: ActionTypes.SetFocus,
            payload: '1',
        } as Action);
        expect(newState.linkmans['1'].unreadSnapshot).toBe(8);
    });

    it('跳转应整体替换消息窗口并标记断层', () => {
        const state = makeState({
            _id: '1',
            messages: { old: makeMessage('old') },
            unread: 0,
        });
        const newState = reducer(state, {
            type: ActionTypes.SetLinkmanMessagesWindow,
            payload: {
                linkmanId: '1',
                messages: [makeMessage('a'), makeMessage('b')],
                oldestCreateTime: 1,
                oldestId: 'a',
                newestCreateTime: 2,
                newestId: 'b',
                hasMoreBefore: true,
                hasGapAfter: true,
                anchorMessageId: 'a',
                unread: 30,
            },
        } as Action);
        const linkman = newState.linkmans['1'];
        expect(Object.keys(linkman.messages)).toEqual(['a', 'b']);
        expect(linkman.messages.old).toBeUndefined();
        expect(linkman.hasGapAfter).toBe(true);
        expect(linkman.anchorMessageId).toBe('a');
        expect(linkman.unreadSnapshot).toBe(30);
    });

    it('存在断层时新消息只累加未读, 不能插进窗口', () => {
        const state = makeState(
            {
                _id: '1',
                messages: { a: makeMessage('a') },
                unread: 0,
                hasGapAfter: true,
            },
            { focus: '1' },
        );
        const newState = reducer(state, {
            type: ActionTypes.AddLinkmanMessage,
            payload: { linkmanId: '1', message: makeMessage('new') },
        } as Action);
        const linkman = newState.linkmans['1'];
        expect(Object.keys(linkman.messages)).toEqual(['a']);
        // 聚焦中但消息看不见, 依然要计入未读
        expect(linkman.unread).toBe(1);
    });

    it('自己发的消息不应给自己算未读', () => {
        const state = makeState({
            _id: '1',
            messages: {},
            unread: 0,
        });
        const newState = reducer(state, {
            type: ActionTypes.AddLinkmanMessage,
            payload: { linkmanId: '1', message: makeMessage('m1', 'self') },
        } as Action);
        expect(newState.linkmans['1'].unread).toBe(0);
        expect(Object.keys(newState.linkmans['1'].messages)).toHaveLength(1);
    });

    it('向后翻页应追加到窗口尾部并更新断层标记', () => {
        const state = makeState({
            _id: '1',
            messages: { a: makeMessage('a') },
            hasGapAfter: true,
            unread: 5,
        });
        const newState = reducer(state, {
            type: ActionTypes.AddLinkmanForwardMessages,
            payload: {
                linkmanId: '1',
                messages: [makeMessage('b'), makeMessage('c')],
                newestCreateTime: 3,
                newestId: 'c',
                hasGapAfter: false,
            },
        } as Action);
        const linkman = newState.linkmans['1'];
        expect(Object.keys(linkman.messages)).toEqual(['a', 'b', 'c']);
        expect(linkman.hasGapAfter).toBe(false);
        expect(linkman.newestId).toBe('c');
    });

    /**
     * 审查发现的回归: 200 条上限裁掉最旧的消息之后, 如果不把 hasMoreBefore
     * 重新打开, 那些消息就再也拉不回来了, 而界面还显示"没有更早的消息了"
     */
    it('AddLinkmanMessage 裁剪后要重新打开向前翻页', () => {
        const messages: any = {};
        for (let i = 0; i < 200; i += 1) {
            const id = i.toString(16).padStart(24, '0');
            messages[id] = { _id: id, createTime: new Date(1000 + i) };
        }
        const state = {
            user: { _id: 'self' },
            focus: 'g1',
            linkmans: {
                g1: {
                    _id: 'g1',
                    type: 'group',
                    messages,
                    unread: 0,
                    // 已经翻到最早了
                    hasMoreBefore: false,
                    hasGapAfter: false,
                },
            },
        } as unknown as State;

        const newState = reducer(state, {
            type: ActionTypes.AddLinkmanMessage,
            payload: {
                linkmanId: 'g1',
                message: {
                    _id: 'ffffffffffffffffffffffff',
                    createTime: new Date(99999),
                    from: { _id: 'other' },
                },
            },
        } as Action);

        const g1 = newState.linkmans.g1;
        // 仍然是 200 条(最旧的被裁掉了)
        expect(Object.keys(g1.messages).length).toBe(200);
        expect(Object.keys(g1.messages)).not.toContain(
            '0'.padStart(24, '0'),
        );
        // 关键: 被裁掉的那段必须还能翻回来
        expect(g1.hasMoreBefore).toBe(true);
    });

    /**
     * 退群/删好友时焦点会被动挪到另一个会话, 这条路径不 dispatch SetFocus,
     * 所以清未读、存快照这些"进入会话"的动作必须由 RemoveLinkman 自己补上
     */
    it('RemoveLinkman 会把新落焦的会话当作"进入"处理', () => {
        const state = {
            user: { _id: 'self' },
            focus: 'gone',
            linkmans: {
                survivor: {
                    _id: 'survivor',
                    type: 'group',
                    messages: {},
                    unread: 7,
                    unreadSnapshot: 0,
                },
                gone: { _id: 'gone', type: 'group', messages: {}, unread: 0 },
            },
        } as unknown as State;

        const newState = reducer(state, {
            type: ActionTypes.RemoveLinkman,
            payload: 'gone',
        } as Action);

        expect(newState.focus).toBe('survivor');
        // 红点必须擦掉, 否则用户被踢出群后眼前顶着一个抹不掉的未读数
        expect(newState.linkmans.survivor.unread).toBe(0);
        // 但未读数要留一份快照, 这样还能回到上次阅读位置
        expect(newState.linkmans.survivor.unreadSnapshot).toBe(7);
    });

    it('RemoveLinkman 删掉的不是当前会话时, 焦点会话不受影响', () => {
        const state = {
            user: { _id: 'self' },
            focus: 'keep',
            linkmans: {
                keep: {
                    _id: 'keep',
                    type: 'group',
                    messages: {},
                    unread: 5,
                    unreadSnapshot: 0,
                },
                gone: { _id: 'gone', type: 'group', messages: {}, unread: 0 },
            },
        } as unknown as State;

        const newState = reducer(state, {
            type: ActionTypes.RemoveLinkman,
            payload: 'gone',
        } as Action);

        expect(newState.focus).toBe('keep');
        // 焦点没变, 不该被当成一次"进入", 未读保持原样
        expect(newState.linkmans.keep.unread).toBe(5);
    });

    it('同一个用户重连时应保留已加载的消息和游标', () => {
        const state = {
            user: { _id: 'self' },
            linkmans: {
                g1: {
                    _id: 'g1',
                    type: 'group',
                    messages: { a: makeMessage('a') },
                    unread: 3,
                    oldestCreateTime: 100,
                    oldestId: 'a',
                },
            },
            focus: 'g1',
        } as unknown as State;
        const newState = reducer(state, {
            type: ActionTypes.SetUser,
            payload: {
                _id: 'self',
                username: 'u',
                avatar: 'a',
                tag: '',
                isAdmin: false,
                groups: [{ _id: 'g1', name: 'g', avatar: 'a' }],
                friends: [],
            },
        } as unknown as Action);
        expect(Object.keys(newState.linkmans.g1.messages)).toHaveLength(1);
        expect(newState.linkmans.g1.unread).toBe(3);
        expect(newState.linkmans.g1.oldestId).toBe('a');
    });

    it('换成另一个用户时不能把上一个用户的消息带过去', () => {
        const state = {
            user: { _id: 'self' },
            linkmans: {
                g1: {
                    _id: 'g1',
                    type: 'group',
                    messages: { a: makeMessage('a') },
                    unread: 3,
                },
            },
            focus: 'g1',
        } as unknown as State;
        const newState = reducer(state, {
            type: ActionTypes.SetUser,
            payload: {
                _id: 'other',
                username: 'u',
                avatar: 'a',
                tag: '',
                isAdmin: false,
                groups: [{ _id: 'g1', name: 'g', avatar: 'a' }],
                friends: [],
            },
        } as unknown as Action);
        expect(Object.keys(newState.linkmans.g1.messages)).toHaveLength(0);
        expect(newState.linkmans.g1.unread).toBe(0);
    });

    it('重复收到同一条撤回推送不应抛异常', () => {
        const state = makeState({
            _id: '1',
            messages: {
                m1: {
                    _id: 'm1',
                    type: 'system',
                    content: '撤回了消息',
                    deleted: true,
                    from: { _id: 'system' },
                },
            },
        });
        expect(() =>
            reducer(state, {
                type: ActionTypes.DeleteMessage,
                payload: {
                    linkmanId: '1',
                    messageId: 'm1',
                    shouldDelete: false,
                },
            } as Action),
        ).not.toThrow();
    });

    it('联系人不存在时各个消息 action 都应安全返回原状态', () => {
        const state = { linkmans: {}, focus: '' } as unknown as State;
        const actions = [
            {
                type: ActionTypes.AddLinkmanHistoryMessages,
                payload: { linkmanId: 'nope', messages: [] },
            },
            {
                type: ActionTypes.AddLinkmanMessage,
                payload: { linkmanId: 'nope', message: makeMessage('m') },
            },
        ];
        actions.forEach((action) => {
            expect(reducer(state, action as Action)).toBe(state);
        });
    });
});
