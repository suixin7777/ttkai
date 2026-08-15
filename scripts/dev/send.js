/* eslint-disable no-console */
/**
 * Test helper: log in as an existing account and send N messages to a group.
 * Used to create "you missed these" state while your browser is looking elsewhere.
 *
 * Invoked by send.ps1 — see that file for usage.
 */
const { io } = require('socket.io-client');

const USER = process.env.U || 'sender2';
const PASS = process.env.P || 'test1234';
const GROUP = process.env.G || 'fiora';
const COUNT = Number(process.env.N || 20);
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

socket.on('connect_error', (e) => {
    console.error(`cannot reach ${SERVER}: ${e.message}`);
    process.exit(1);
});

socket.on('connect', () => {
    // The server registers its socket middlewares after an await, so a packet
    // sent immediately on connect has no listener yet and is silently dropped.
    setTimeout(async () => {
        try {
            const me = await rpc('login', {
                username: USER,
                password: PASS,
                os: 'script',
                browser: 'script',
                environment: 'script',
            });
            const group = me.groups.find((g) => g.name === GROUP);
            if (!group) {
                console.error(
                    `${USER} is not in a group named "${GROUP}". Groups: ${me.groups
                        .map((g) => g.name)
                        .join(', ')}`,
                );
                process.exit(1);
            }
            for (let i = 1; i <= COUNT; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                await rpc('sendMessage', {
                    to: group._id,
                    type: 'text',
                    content: `${USER} 发的第 ${i} 条 (${new Date()
                        .toTimeString()
                        .slice(0, 8)})`,
                });
                process.stdout.write('.');
            }
            console.log(`\nsent ${COUNT} messages to "${GROUP}" as ${USER}`);
        } catch (err) {
            console.error(`\nfailed: ${err.message}`);
            process.exit(1);
        }
        process.exit(0);
    }, 600);
});
