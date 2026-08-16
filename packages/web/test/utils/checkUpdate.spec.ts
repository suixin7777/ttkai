import { hasUnsavedInput } from '../../src/utils/checkUpdate';

/**
 * 自动更新会在 15 秒后刷新页面, 而刷新会把用户没发出去的输入吞掉.
 * 这个判定就是唯一的保护, 所以每条分支都要盯住
 */
describe('hasUnsavedInput', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('页面上什么都没有时可以放心刷新', () => {
        expect(hasUnsavedInput()).toBe(false);
    });

    it('输入框空着也可以刷新', () => {
        document.body.innerHTML = '<textarea></textarea><input type="text" />';
        expect(hasUnsavedInput()).toBe(false);
    });

    it('聊天输入框里有字就不能刷', () => {
        document.body.innerHTML = '<textarea>还没发出去的话</textarea>';
        expect(hasUnsavedInput()).toBe(true);
    });

    it('登录框里填了账号密码也不能刷', () => {
        document.body.innerHTML =
            '<input type="text" /><input type="password" />';
        const [username, password] = Array.from(
            document.querySelectorAll('input'),
        );
        username.value = 'someone';
        password.value = 'secret';
        expect(hasUnsavedInput()).toBe(true);
    });

    it('只有空白字符不算有内容', () => {
        document.body.innerHTML = '<textarea>   \n  </textarea>';
        expect(hasUnsavedInput()).toBe(false);
    });

    it('光标停在输入框里就不打断, 哪怕一个字都没打', () => {
        document.body.innerHTML = '<textarea id="t"></textarea>';
        const textarea = document.getElementById('t') as HTMLTextAreaElement;
        textarea.focus();
        expect(document.activeElement).toBe(textarea);
        expect(hasUnsavedInput()).toBe(true);
    });

    it('可编辑区域有内容同样算', () => {
        document.body.innerHTML =
            '<div contenteditable="true">草稿</div>';
        // jsdom 既不实现 isContentEditable 也不实现 innerText,
        // 判定要能靠 contenteditable 特性 + textContent 兜底
        expect(hasUnsavedInput()).toBe(true);
    });
});
