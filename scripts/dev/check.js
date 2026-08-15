/* eslint-disable no-console */
/**
 * Print what the server actually sends for the message-loading paths,
 * so the loading behaviour can be checked without squinting at WS frames.
 */
const { io } = require('socket.io-client');

const USER = process.env.U || 'seeduser';
const PASS = process.env.P || 'test1234';
const GROUP = process.env.G || 'fiora';
const SERVER = process.env.SERVER || 'http://localhost:9200';

const socket = io(SERVER, { transports: ['websocket'] });

function rpc(event, data) {
    return new Promise((resolve, reject) => {
        socket.emit(event, data, (res) => {
            if (typeof res === 'string') reject(new Error(res));
            else resolve(res);
        });
        setTimeout(() => reject(new Error(`${event} timeout`)), 15000);
    });
}

const kb = (obj) => `${(Buffer.byteLength(JSON.stringify(obj)) / 1024).toFixed(1)} KB`;

socket.on('connect_error', (e) => {
    console.error(`cannot reach ${SERVER}: ${e.message}`);
    process.exit(1);
});

socket.on('connect', () => {
    setTimeout(async () => {
        try {
            const me = await rpc('login', {
                username: USER, password: PASS,
                os: 'script', browser: 'script', environment: 'script',
            });
            const group = me.groups.find((g) => g.name === GROUP);
            if (!group) {
                console.error(`${USER} not in group "${GROUP}"`);
                process.exit(1);
            }
            const gid = group._id;

            // total messages in this group, by walking the cursor
            let total = 0;
            let cursor = null;
            for (;;) {
                // eslint-disable-next-line no-await-in-loop
                const page = await rpc('getLinkmanMessagesBefore', {
                    linkmanId: gid, count: 100,
                    beforeCreateTime: cursor ? cursor.t : undefined,
                    beforeId: cursor ? cursor.id : undefined,
                });
                total += page.messages.length;
                if (!page.hasMore) break;
                cursor = { t: page.oldestCreateTime, id: page.oldestId };
            }

            console.log(`\n群 "${GROUP}" 库里共 ${total} 条消息\n`);

            const t0 = Date.now();
            const v2 = await rpc('getLinkmansLastMessagesV2', { linkmans: [gid] });
            const d = v2[gid];
            console.log('首屏加载 (getLinkmansLastMessagesV2):');
            console.log(`  返回条数   ${d.messages.length}   <- 与群里有多少条无关, 恒定`);
            console.log(`  未读数     ${d.unread}   <- 精确值, 不再是封顶的 100`);
            console.log(`  载荷大小   ${kb(d)}`);
            console.log(`  耗时       ${Date.now() - t0} ms`);
            console.log(`  上面还有更早的消息: ${d.hasMoreBefore}`);
            console.log(`  阅读锚点:  ${d.lastReadMessageId || '(无, 该用户从没读过)'}`);

            console.log('\n向上翻页 (getLinkmanMessagesBefore) —— 翻到第几页开销都一样:');
            let cur = null;
            for (let page = 1; page <= 4; page += 1) {
                const s = Date.now();
                // eslint-disable-next-line no-await-in-loop
                const r = await rpc('getLinkmanMessagesBefore', {
                    linkmanId: gid, count: 30,
                    beforeCreateTime: cur ? cur.t : undefined,
                    beforeId: cur ? cur.id : undefined,
                });
                console.log(
                    `  第 ${page} 页: 取回 ${String(r.messages.length).padStart(2)} 条, ` +
                    `${kb(r).padStart(8)}, ${String(Date.now() - s).padStart(3)} ms, 还有更多=${r.hasMore}`,
                );
                if (!r.hasMore) break;
                cur = { t: r.oldestCreateTime, id: r.oldestId };
            }
            console.log(
                '\n  (旧实现是 limit = 30 + 已加载数 再 slice 丢弃前面的,\n' +
                '   翻到第 4 页服务端要读 120 条扔掉 90 条, 越翻越慢)',
            );

            if (d.lastReadMessageId) {
                const s = Date.now();
                const ctx = await rpc('getLinkmanUnreadContext', { linkmanId: gid, count: 30 });
                const idx = ctx.messages.findIndex((m) => m._id === ctx.anchorMessageId);
                console.log('\n回到上次阅读位置 (getLinkmanUnreadContext):');
                console.log(`  窗口共 ${ctx.messages.length} 条: 锚点上方 ${idx} 条上文 + 下方 ${ctx.messages.length - idx - 1} 条未读`);
                console.log(`  载荷 ${kb(ctx)}, 耗时 ${Date.now() - s} ms`);
            }
            console.log('');
        } catch (err) {
            console.error(`failed: ${err.message}`);
            process.exit(1);
        }
        process.exit(0);
    }, 600);
});
