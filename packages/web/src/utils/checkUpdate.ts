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

let pendingReload = false;
let notified = false;

function reload() {
    // replace 而不是 reload: 避免把当前这一次留在历史记录里, 用户点后退又回到旧页面
    window.location.replace(window.location.href);
}

/**
 * 有新版本时不能立刻刷 —— 用户可能正在输入框里打字, 刷了就全没了.
 * 页面不可见 (切走了标签页) 时才真正执行, 这时刷新对用户是无感的
 */
function applyWhenSafe() {
    if (document.hidden) {
        reload();
        return;
    }
    pendingReload = true;
    if (!notified) {
        notified = true;
        Message.info('已有新版本, 切换标签页后会自动更新', 3);
    }
}

export async function checkForUpdate() {
    const current = getLoadedBundleName();
    // 开发模式下入口文件不带哈希, 取不到就直接放弃, 不做任何事
    if (!current || pendingReload) {
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
        if (latest && latest !== current) {
            applyWhenSafe();
        }
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
            if (pendingReload) {
                reload();
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
            applyWhenSafe();
        });
    }

    window.setInterval(checkForUpdate, CheckInterval);
}
