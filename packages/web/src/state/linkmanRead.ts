import { Linkman } from './reducer';

/**
 * 上次阅读位置是否已经落到当前已加载窗口的更早处.
 *
 * 为真时说明"从上次读到的地方到现在"这一段并没有全在本地,
 * 用户光靠往上滚是滚不回去的, 必须向服务端要那一段
 */
export function isLastReadOutsideWindow(linkman?: Linkman | null): boolean {
    if (!linkman) {
        return false;
    }
    const { lastReadCreateTime, oldestCreateTime } = linkman;
    if (lastReadCreateTime === null || lastReadCreateTime === undefined) {
        return false;
    }
    if (oldestCreateTime === null || oldestCreateTime === undefined) {
        return false;
    }
    return lastReadCreateTime < oldestCreateTime;
}

/**
 * 这个会话是否还欠用户一次"回到上次阅读位置".
 *
 * 会话列表的角标和聊天区底部的提示条共用这一个判断 —— 两边各写一套的话
 * 迟早会对不上, 出现"列表说有、点进去没有"这种自相矛盾的情况
 *
 * hasGapAfter 为真时不算: 那说明用户已经跳过一次, 当前窗口和最新消息之间
 * 是断开的, 此时该引导用户回到最新, 而不是再往回跳
 */
export function hasPendingJumpToLastRead(linkman?: Linkman | null): boolean {
    if (!linkman || linkman.hasGapAfter) {
        return false;
    }
    if (!linkman.lastReadMessageId) {
        return false;
    }
    if (!((linkman.unreadSnapshot || 0) > 0)) {
        return false;
    }
    return isLastReadOutsideWindow(linkman);
}

/**
 * 会话列表角标要显示的数字.
 *
 * 点进一个会话时 unread 会被清零, 但用户可能只是瞄了一眼并没有真的读 ——
 * 这时仍然欠着一次跳转, 就继续用快照里的数字, 免得列表看起来"已经读完了"
 */
/**
 * 会话锚点之后有多少条消息.
 *
 * 优先按窗口实时算 —— 用户站在会话里时消息还在源源不断地来, 显示钉住那一刻的
 * 旧数字会越来越不准. 锚点不在窗口里 (被裁掉/被硬删) 时退回快照
 */
export function getSessionAnchorUnread(linkman?: Linkman | null): number {
    if (!linkman || !linkman.sessionAnchorId) {
        return 0;
    }
    if (!linkman.hasGapAfter) {
        const keys = Object.keys(linkman.messages || {});
        const index = keys.indexOf(linkman.sessionAnchorId);
        if (index >= 0) {
            // map 的插入顺序就是时间顺序, 且没有断层, 所以直接数后面有几条
            return keys.length - 1 - index;
        }
    }
    return linkman.sessionAnchorUnread || 0;
}

/**
 * 聊天区底部要不要显示"回到上次阅读位置".
 *
 * 两种情况都算数:
 *  - 钉住了会话锚点 (进会话时有未读). 这时不要求锚点落在窗口外 ——
 *    消息可能早就通过 socket 推到本地了, 但用户依然需要一个"我看到哪了"的参照
 *  - 老判断: 锚点在已加载窗口之外. 原样保留, 保证刷新后那条路径完全不变
 */
export function shouldShowJumpToLastRead(linkman?: Linkman | null): boolean {
    if (!linkman || linkman.hasGapAfter) {
        return false;
    }
    const pinned =
        linkman.sessionAnchorId !== null &&
        linkman.sessionAnchorId !== undefined &&
        linkman.sessionAnchorCreateTime !== null &&
        linkman.sessionAnchorCreateTime !== undefined &&
        getSessionAnchorUnread(linkman) > 0;
    return pinned || hasPendingJumpToLastRead(linkman);
}

export function getDisplayUnread(linkman?: Linkman | null): number {
    if (!linkman) {
        return 0;
    }
    if (linkman.unread > 0) {
        return linkman.unread;
    }
    return hasPendingJumpToLastRead(linkman) ? linkman.unreadSnapshot || 0 : 0;
}
