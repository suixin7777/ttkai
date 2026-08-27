import { isNewMessageArrival } from '../../src/modules/Chat/MessageList';

const REAL_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const REAL_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
/** ChatInput 造的乐观 id: `${会话id}${Date.now()}` */
const OPTIMISTIC = '63860b1348444f072485787' + '21786871253794';

describe('isNewMessageArrival', () => {
    it('第一次渲染时不算新到达', () => {
        expect(isNewMessageArrival(null, null)).toBe(false);
    });

    it('id 没变就不算', () => {
        expect(isNewMessageArrival(REAL_A, REAL_A)).toBe(false);
    });

    it('别人发来一条新消息, 算', () => {
        expect(isNewMessageArrival(REAL_A, REAL_B)).toBe(true);
    });

    /**
     * 这两条是回归用例: 自己发消息时先插乐观消息, 落库后换成真实 id.
     * 第一步必须算 (否则发完消息画面不动), 第二步必须不算 (否则同一条滚两次)
     */
    it('插入乐观消息算新到达 —— 发完必须滚到底', () => {
        expect(isNewMessageArrival(REAL_A, OPTIMISTIC)).toBe(true);
    });

    it('乐观 id 换成真实 id 不算 —— 同一条消息不能滚两次', () => {
        expect(isNewMessageArrival(OPTIMISTIC, REAL_A)).toBe(false);
    });

    it('连发两条: 前一条已落库, 再插一条乐观消息照样算', () => {
        expect(isNewMessageArrival(REAL_A, OPTIMISTIC)).toBe(true);
    });
});
