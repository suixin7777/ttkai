import Message from '../components/Message';

/**
 * 前端版本自动更新
 *
 * 发版之后, 已经开着页面的用户不会自己拿到新代码 —— 他们手里的 js 是加载那一刻
 * 的版本, 除非主动刷新. 这里做的事情很简单: 定期回源取一次 index.html,
 * 比对里面引用的入口文件名. 文件名带内容哈希, 变了就说明发新版了
 *
 * 不需要服务端配合, 也不需要额外接口 —— index.html 本身就是版本指针
 */

/** 记录已经为哪个版本尝试过刷新, 用来防止"刷不动却一直刷"的循环 */
const AttemptKey = 'fiora-update-attempt';

/** 从 index.html 文本里取出入口文件名 */
function parseBundleName(html: string): string | null {
    const matched = html.match(/js\/app\.[0-9a-f]+\.js/i);
    return matched ? matched[0] : null;
}

/** 当前这个页面正在跑的入口文件名 */
function getLoadedBundleName(): string | null {
    const scripts = Array.from(document.scripts);
    for (let i = 0; i < scripts.length; i += 1) {
        const parsed = parseBundleName(scripts[i].src || '');
        if (parsed) {
            return parsed;
        }
    }
    return null;
}

let pendingVersion: string | null = null;
let notified = false;

/**
 * 单纯调 reload 是换不掉版本的, 必须先把两层缓存清掉:
 *
 *  - Service Worker: workbox 把旧的 index.html 和旧 js 预缓存了, 页面导航会被
 *    它接管, 刷新拿到的还是旧的
 *  - 浏览器自身的 HTTP 缓存: 早期版本的 index.html 是带着 7 天 max-age 缓存下来的,
 *    普通刷新不会回源
 *
 * 不处理这两层的话, 会变成"提示有新版 -> 刷新 -> 还是旧版 -> 再提示"的死循环,
 * 用户每次打开都被弹一次, 却永远更新不了
 */
async function hardReload(latest: string) {
    /**
     * 最后一道闸: 要换的版本必须真的和现在跑的不一样.
     *
     * 之前出过一次每 15 秒刷新一轮的事故 —— 一个合成出来的假版本号一路走到了
     * 这里. 只要在真正动手前再核对一次"当前加载的到底是哪个包",
     * 无论上游哪里判断错了, 都不会演变成无限刷新
     */
    if (latest === getLoadedBundleName()) {
        return false;
    }

    /**
     * 为同一个版本只尝试一次.
     * 清完缓存刷新后如果还是旧版本, 说明问题不在客户端 (比如中间还有一层代理
     * 在发旧文件), 再刷也没用 —— 这时候安静地放弃, 总好过无限刷新或者无限弹窗
     */
    try {
        if (window.localStorage.getItem(AttemptKey) === latest) {
            return false;
        }
        window.localStorage.setItem(AttemptKey, latest);
    } catch (err) {
        // 隐私模式下 localStorage 可能不可用, 那就退化成每次都试一次
    }

    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((r) => r.unregister()));
        }
        // @ts-ignore 老浏览器没有 caches
        if (window.caches && window.caches.keys) {
            // @ts-ignore
            const keys = await window.caches.keys();
            // @ts-ignore
            await Promise.all(keys.map((k: string) => window.caches.delete(k)));
        }
    } catch (err) {
        // 清不掉就算了, 下面照样刷一次
    }

    // replace 而不是 reload: 避免把当前这一次留在历史记录里, 用户点后退又回到旧页面
    window.location.replace(window.location.href);
    return true;
}

/** 页面还开着时, 等多久自动更新 */
const AutoReloadDelay = 1000 * 15;
let autoReloadTimer = 0;

/**
 * 用户有没有还没发出去的输入 —— 有的话刷新会把内容吞掉
 *
 * 光标停在输入框里也算, 哪怕还没打字: 这种时候页面自己刷掉一样很突兀.
 * 登录框里的账号密码同样受这条保护
 */
/**
 * 同时看 property 和 attribute.
 * isContentEditable 是浏览器算出来的, 有的环境(比如测试用的 jsdom)根本不实现,
 * 只认它会让可编辑区域整个漏判
 */
function isEditable(el: HTMLElement): boolean {
    return (
        el.isContentEditable || el.getAttribute('contenteditable') === 'true'
    );
}

export function hasUnsavedInput(): boolean {
    const active = document.activeElement as HTMLElement | null;
    if (
        active &&
        (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            isEditable(active))
    ) {
        return true;
    }
    const fields = document.querySelectorAll(
        'input, textarea, [contenteditable="true"]',
    );
    for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i] as HTMLInputElement;
        const text = isEditable(field)
            ? field.innerText || field.textContent || ''
            : field.value || '';
        if (text.trim()) {
            return true;
        }
    }
    return false;
}

/**
 * 页面一直开着也要能更新到.
 *
 * 只靠"切走标签页才刷"的话, 一个从不切走的用户就永远停在旧版本上.
 * 但到点时如果人正在打字, 就顺延一轮再看 —— 宁可晚点更新,
 * 也不能把用户没发出去的话刷没了
 */
function scheduleAutoReload(latest: string) {
    if (autoReloadTimer) {
        return;
    }
    autoReloadTimer = window.setTimeout(() => {
        autoReloadTimer = 0;
        if (!pendingVersion) {
            return;
        }
        if (!document.hidden && hasUnsavedInput()) {
            scheduleAutoReload(latest);
            return;
        }
        hardReload(latest);
    }, AutoReloadDelay);
}

/**
 * 有新版本时不能立刻刷 —— 用户可能正在输入框里打字, 刷了就全没了.
 * 页面不可见时直接刷 (这时对用户是无感的), 否则先提示再等一会儿
 */
function applyWhenSafe(latest: string) {
    pendingVersion = latest;
    if (document.hidden) {
        hardReload(latest);
        return;
    }
    if (!notified) {
        notified = true;
        // 不提"标签页": 手机用户没有这个概念, 而且到底等多久取决于用户在不在打字
        Message.info('已有新版本, 稍后会自动更新', 3);
    }
    scheduleAutoReload(latest);
}

export async function checkForUpdate() {
    const current = getLoadedBundleName();
    // 开发模式下入口文件不带哈希, 取不到就直接放弃, 不做任何事
    if (!current || pendingVersion) {
        return;
    }
    try {
        /**
         * 加时间戳是为了绕开 Service Worker 的预缓存 ——
         * workbox 是按 URL 匹配的, 带上随机参数就不会命中缓存条目, 会真的走网络
         */
        const res = await fetch(`/index.html?_=${Date.now()}`, {
            cache: 'no-store',
        });
        if (!res.ok) {
            return;
        }
        const latest = parseBundleName(await res.text());
        if (!latest || latest === current) {
            /**
             * 版本一致, 说明上一次更新已经落地了, 把尝试记录清掉 ——
             * 否则下次真的发版时, 万一哈希撞上这个旧值就会被误判为"试过了"
             */
            try {
                window.localStorage.removeItem(AttemptKey);
            } catch (err) {
                // ignore
            }
            return;
        }
        applyWhenSafe(latest);
    } catch (err) {
        // 网络抖动而已, 下一轮再说
    }
}

/** 每隔多久回源查一次 */
const CheckInterval = 1000 * 60 * 10;

export default function startUpdateChecker() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 切走的瞬间, 如果之前已经发现新版本, 就在这时候刷
            if (pendingVersion) {
                hardReload(pendingVersion);
            }
            return;
        }
        // 切回来时顺便查一次, 用户离开期间很可能已经发版了
        checkForUpdate();
    });

    /**
     * 新 Service Worker 接管时, 只有"确实已经发现新版本"才刷.
     *
     * 这里原来是无条件调 applyWhenSafe(pendingVersion || `${current}-sw`),
     * 那个合成出来的 `-sw` 版本号造成了一个每 15 秒刷新一次的死循环:
     *
     *   页面加载新版 -> checkForUpdate 发现版本一致, 删掉防重复刷新的锁
     *   -> main.tsx 注册 SW, 新 SW 因为 clientsClaim 立即接管
     *   -> controllerchange 触发, 拿着假版本号安排刷新
     *   -> 15 秒后锁已经没了, 真的刷 -> 回到第一步
     *
     * 之前只在页面切走时才刷, 这条路基本踩不到; 加了定时兜底就暴露了.
     * 真有新版本的话 checkForUpdate 本来就会发现, 不需要这里代劳
     */
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (pendingVersion) {
                applyWhenSafe(pendingVersion);
            }
        });
    }

    window.setInterval(checkForUpdate, CheckInterval);
    // 启动时先查一次, 不用干等十分钟
    checkForUpdate();
}
