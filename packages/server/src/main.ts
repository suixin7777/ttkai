import config from '@fiora/config/server';
import getRandomAvatar from '@fiora/utils/getRandomAvatar';
import { doctor } from '@fiora/bin/scripts/doctor';
import logger from '@fiora/utils/logger';
import initMongoDB from '@fiora/database/mongoose/initMongoDB';
import Socket from '@fiora/database/mongoose/models/socket';
import Group, { GroupDocument } from '@fiora/database/mongoose/models/group';
import app from './app';

/**
 * 启动前检查那些"配错了也能跑起来, 但后果很严重"的配置
 *
 * 这里只警告不拦截: jwtSecret 的默认值是上游自带的, 硬失败会让现有部署
 * 直接起不来. RedisMock 的硬失败放在 initRedis 里 —— 那个开关是新加的,
 * 没有存量部署在用
 */
function checkProductionConfig() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    if (config.jwtSecret === 'jwtSecret') {
        logger.warn(
            '[config]',
            'JwtSecret 仍是默认值, 任何人都能伪造 token 登录任意账号, 请设置为随机长串',
        );
    }
    if (config.administrator.length === 0) {
        logger.warn('[config]', '没有配置管理员(Administrator), 将无人可以封禁用户');
    }
}

(async () => {
    if (process.argv.find((argv) => argv === '--doctor')) {
        await doctor();
    }

    checkProductionConfig();

    await initMongoDB();

    // 判断默认群是否存在, 不存在就创建一个
    const group = await Group.findOne({ isDefault: true });
    if (!group) {
        const defaultGroup = await Group.create({
            name: 'fiora',
            avatar: getRandomAvatar(),
            isDefault: true,
        } as GroupDocument);

        if (!defaultGroup) {
            logger.error('[defaultGroup]', 'create default group fail');
            return process.exit(1);
        }
    }

    app.listen(config.port, async () => {
        await Socket.deleteMany({}); // 删除Socket表所有历史数据
        logger.info(`>>> server listen on http://localhost:${config.port}`);
    });

    return null;
})();
