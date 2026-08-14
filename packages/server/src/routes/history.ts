import { Types } from '@fiora/database/mongoose';
import logger from '@fiora/utils/logger';
import Message from '@fiora/database/mongoose/models/message';
import { createOrUpdateHistory } from '@fiora/database/mongoose/models/history';

/**
 * 上报阅读位置
 *
 * 这个接口对非法输入一律返回一个正常对象而不是 assert 错误串, 是刻意的:
 * 服务端把 index.html 缓存了 7 天 (见 app.ts), 线上还会有相当长一段时间跑着老版本前端,
 * 而老版本的 service 封装没有关掉 toast. 一旦这里开始返回错误串,
 * 用户就会看到反复弹出的红色提示. 校验失败只记日志, 不打扰用户
 */
export async function updateHistory(
    ctx: Context<{ linkmanId: string; messageId: string }>,
) {
    const { linkmanId, messageId } = ctx.data;
    const self = ctx.socket.user.toString();

    if (!Types.ObjectId.isValid(messageId)) {
        /**
         * 前端在图片/文件上传期间会先插一条 id 为 `${focus}${Date.now()}` 的乐观消息,
         * 它并不存在于数据库里, 这里必须忽略而不是写进去
         */
        return {
            msg: `not update with invalid messageId:${messageId}`,
        };
    }
    if (typeof linkmanId !== 'string' || !linkmanId) {
        return { msg: 'not update with invalid linkmanId' };
    }

    const message = await Message.findOne(
        { _id: messageId },
        { to: 1, createTime: 1 },
    ).lean();
    if (!message) {
        return { msg: 'not update with nonexistent message' };
    }

    /**
     * 消息归属校验. 缺了它, History 就可能指向另一个联系人的消息,
     * 而未读数是基于这个锚点算的, 一旦指错就会算出一个完全无关的数字
     */
    if (message.to !== linkmanId) {
        logger.warn(
            '[updateHistory]',
            `message ${messageId} does not belong to linkman ${linkmanId}`,
        );
        return { msg: 'not update with mismatched linkman' };
    }

    /**
     * 这里刻意不做群成员校验.
     * 阅读位置是每个用户自己的记录, 写错了也只影响他自己的未读数, 没有越权读取的风险;
     * 而 group.members 一旦有历史脏数据, 加了校验就会让这些用户的阅读位置静默地再也存不上.
     * 群成员权限是另一件独立的事, 不该夹带在这次改动里
     */

    await createOrUpdateHistory(
        self,
        linkmanId,
        messageId,
        new Date(message.createTime),
    );

    return {
        msg: 'ok',
    };
}
