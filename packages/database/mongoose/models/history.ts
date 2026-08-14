import { Schema, model, Document } from 'mongoose';

const HistoryScheme = new Schema({
    user: {
        type: String,
        required: true,
    },
    linkman: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    /**
     * 已读消息的创建时间
     * 之所以要冗余存一份, 是因为管理员撤回消息走的是硬删除 (Message.deleteOne),
     * 一旦被指向的消息没了, 只靠 message id 就完全无法定位阅读位置了.
     * 时间戳不会因为目标消息被删而失效, 所以它才是真正的锚点.
     * 老数据没有这个字段, 因此是可选的, 读取方需要兼容缺失的情况
     */
    messageCreateTime: {
        type: Date,
    },
    updateTime: {
        type: Date,
        default: Date.now,
    },
});

/**
 * 每次 sendMessage 都会写一次 History, 每次登录都会按 (user, linkman) 批量读,
 * 而原本这张表一个索引都没有, 全是全表扫描
 */
HistoryScheme.index({ user: 1, linkman: 1 });

export interface HistoryDocument extends Document {
    /** user id */
    user: string;

    /** linkman id */
    linkman: string;

    /** last readed message id */
    message: string;

    /** last readed message create time, 老数据可能没有 */
    messageCreateTime?: Date;

    /** 阅读位置最后更新时间 */
    updateTime: Date;
}

const History = model<HistoryDocument>('History', HistoryScheme);

export default History;

/**
 * 更新阅读位置
 *
 * 这个写入是单调的: 只允许把阅读位置往新的方向推, 永远不会往回退.
 * 原因是同一个账号可能同时在多个设备登录, 而每个设备的已读进度不一样,
 * 落后的那个设备如果能覆盖领先的设备, 就会让已经读过的消息重新变成未读.
 *
 * 单调性用 $or 条件表达, 条件不满足时 findOneAndUpdate 返回 null, 此时:
 * - 如果记录本来就不存在, 才去创建
 * - 如果记录存在只是比要写入的更新, 那么什么都不做才是正确的
 *
 * 这里没有用 upsert, 因为带过滤条件的 upsert 在条件不匹配时会尝试插入新文档,
 * 在没有唯一索引的情况下会直接产生重复行
 *
 * @param userId 用户id
 * @param linkmanId 联系人id
 * @param messageId 已读到的消息id
 * @param messageCreateTime 已读到的消息的创建时间
 */
export async function createOrUpdateHistory(
    userId: string,
    linkmanId: string,
    messageId: string,
    messageCreateTime?: Date,
) {
    const time = messageCreateTime || new Date();

    const monotonicFilter: any = {
        user: userId,
        linkman: linkmanId,
        $or: [
            { messageCreateTime: { $lt: time } },
            // 同一毫秒内的多条消息用 message id 兜底比较
            // ObjectId 的十六进制字符串字典序与其自身顺序一致
            { messageCreateTime: time, message: { $lt: messageId } },
            // 老数据没有 messageCreateTime, 直接补齐
            { messageCreateTime: { $exists: false } },
            { messageCreateTime: null },
        ],
    };

    const updated = await History.findOneAndUpdate(
        monotonicFilter,
        {
            $set: {
                message: messageId,
                messageCreateTime: time,
                updateTime: new Date(),
            },
        },
        { new: true },
    );

    if (!updated) {
        const existing = await History.findOne({
            user: userId,
            linkman: linkmanId,
        });
        // 记录已存在且比要写入的更新, 保持不变才是正确的
        if (!existing) {
            try {
                await History.create({
                    user: userId,
                    linkman: linkmanId,
                    message: messageId,
                    messageCreateTime: time,
                    updateTime: new Date(),
                } as HistoryDocument);
            } catch (err) {
                // 并发下另一个写入抢先创建了记录, 忽略即可
            }
        }
    }

    return {};
}
