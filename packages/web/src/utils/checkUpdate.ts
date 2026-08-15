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

/**
 * 有新版本时不能立刻刷 —— 用户可能正在输入框里打字, 刷了就全没了.
 * 页面不可见 (切走了标签页) 时才真正执行, 这时刷新对用户是无感的
 */
function applyWhenSafe(latest: string) {
    pendingVersion = latest;
    if (document.hidden) {
        hardReload(latest);
        return;
    }
    if (!notified) {
        notified = true;
        Message.info('已有新版本, 切换标签页后会自动更新', 3);
    }
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
     * 新的 Service Worker 接管时也刷一次.
     * 构建配置里开了 skipWaiting + clientsClaim, 新 SW 会立即接管,
     * 但当前页面仍然跑着旧代码, 必须重新加载才生效
     */
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            const current = getLoadedBundleName();
            applyWhenSafe(pendingVersion || `${current}-sw`);
        });
    }

    window.setInterval(checkForUpdate, CheckInterval);
    // 启动时先查一次, 不用干等十分钟
    checkForUpdate();
}
