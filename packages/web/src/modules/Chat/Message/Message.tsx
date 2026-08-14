import React, { Component } from 'react';
import pureRender from 'pure-render-decorator';


import Time from '@fiora/utils/time';
import { getRandomColor, getPerRandomColor } from '@fiora/utils/getRandomColor';
import client from '@fiora/config/client';
import Style from './Message.less';
import Avatar from '../../../components/Avatar';
import TextMessage from './TextMessage';
import { ShowUserOrGroupInfoContext } from '../../../context';

import ImageMessage from './ImageMessage';
import CodeMessage from './CodeMessage';
import UrlMessage from './UrlMessage';
import InviteMessageV2 from './InviteMessageV2';
import SystemMessage from './SystemMessage';
import FileMessage from './FileMessage';

import store from '../../../state/store';
import { ActionTypes, DeleteMessagePayload } from '../../../state/action';
import { deleteMessage } from '../../../service';
import IconButton from '../../../components/IconButton';
import IconButton2 from '../../../components/IconButton2';
import Tooltip from '../../../components/Tooltip';
import themes from '../../../themes';

import Minfo from '../../../components/Message';


import ReplyMessage from './ReplyMessage';
import BiliMessage from './BiliMessage';
import MusicMessage from './MusicMessage';
import MediaMessage from './MediaMessage';


import { addExpression } from '../../../service';


const { dispatch } = store;

interface MessageProps {
    id: string;
    linkmanId: string;
    isSelf: boolean;
    userId: string;
    avatar: string;
    username: string;
    originUsername: string;
    tag: string;
    time: string;
    type: string;
    content: string;
    loading: boolean;
    percent: number;
    tagColorMode: string;
    isAdmin?: boolean;
    /** ChatInput 的 ref, 用于点头像/回复时把文本插入输入框 */
    qwe?: any;
}

interface MessageState {
    showDeleteList: boolean;
    showReplyList: boolean;
    showImgList: boolean;
}

/**
 * 滚动定位已经统一收归到 MessageList 的 useLayoutEffect 里
 *
 * 这里原本每条消息都在 componentDidMount 里自己调一次 scrollIntoView,
 * 当时避开 hooks 是因为 useEffect 执行得比 componentDidMount 晚, 会先闪一下历史消息.
 * 但 useLayoutEffect 是在浏览器绘制前同步执行的, 不存在这个问题,
 * 而"每条消息各滚一次"的代价很实在: 首屏渲染时列表容器的 ref 还是 null,
 * 判断条件退化成对每条消息都为真, 一次提交里会连续触发上百次同步滚动
 */
@pureRender
class Message extends Component<MessageProps, MessageState> {
    constructor(props: MessageProps) {
        super(props);
        this.state = {
            showDeleteList: false,
            showReplyList: false,
            showImgList: false,
        };
    }

    handleMouseEnter = () => {
        const { isAdmin, isSelf, type, content } = this.props;
        if (type === 'system') {
            return;
        }
        if (isAdmin || (!client.disableDeleteMessage && isSelf)) {
            this.setState({ showDeleteList: true });
        }
        if (!isAdmin && (type==='text' || type==='reply' || type==='bilibili' || type==='image' ) && !isSelf) {
            this.setState({ showReplyList: true  });
        }
        if (!isAdmin &&  type==='image'  && !content.includes("ImageMessage")  &&!isSelf) {
            this.setState({ showImgList: true  });
        }
    };

    handleMouseLeave = () => {
        this.setState({ showDeleteList: false, showReplyList: false, showImgList: false });
    };

    /**
     * 管理员撤回消息
     */
    handleDeleteMessage = async () => {
        const { id, linkmanId, loading, isAdmin } = this.props;
        if (loading) {
            dispatch({
                type: ActionTypes.DeleteMessage,
                payload: {
                    linkmanId,
                    messageId: id,
                    shouldDelete: isAdmin,
                } as DeleteMessagePayload,
            });
            return;
        }

        const isSuccess = await deleteMessage(id);
        if (isSuccess) {
            dispatch({
                type: ActionTypes.DeleteMessage,
                payload: {
                    linkmanId,
                    messageId: id,
                    shouldDelete: isAdmin,
                } as DeleteMessagePayload,
            });
            this.setState({ showDeleteList: false});
        }
    };

    handleAddExpression = async () => {
        const { type, content, username, qwe } = this.props;
        addExpression(content);
        const message: string = "添加表情成功";
        Minfo.success(message);
        this.setState({ showDeleteList: false, showReplyList: false, showImgList: false });
    };

    handleReplyMessage = async () => {
        const { type, content, username, qwe } = this.props;
        if (type==='text'){
            qwe.current.insertCursor(`回复${username}「${content}」:   `);
        }else if (type==='reply'){
            const jscontent = JSON.parse(content);
            qwe.current.insertCursor(`回复${username}「${jscontent.replymsg}」:   `);
        }else if (type=='bilibili'){
            const jscontent = JSON.parse(content);
            qwe.current.insertCursor(`回复${username}的B站分享「${jscontent.title}」:   `);
        }else if (type=='image'){
            qwe.current.insertCursor(`回复${username}的图片「${content}」:   `);
        }
        this.setState({ showDeleteList: false, showReplyList: false, showImgList: false });
    };

    handleClickAvatar(showUserInfo: (userinfo: any) => void) {
        const { isSelf, userId, type, username, avatar, qwe, content } = this.props;
        if (!isSelf && type !== 'system') {
            showUserInfo({
                _id: userId,
                username,
                avatar,
            });
        }
        if (isSelf && type !== 'system') {
            if (type==='text'){
                qwe.current.insertCursor(`回复${username}「${content}」:   `);
            }else if (type==='reply'){
                const jscontent = JSON.parse(content);
                qwe.current.insertCursor(`回复${username}「${jscontent.replymsg}」:   `);
            }else if (type=='bilibili'){
                const jscontent = JSON.parse(content);
                qwe.current.insertCursor(`回复${username}的B站分享「${jscontent.title}」:   `);
            }else if (type=='image'){
                qwe.current.insertCursor(`回复${username}的图片「${content}」:   `);
            }
        }
    }

    formatTime() {
        const { time } = this.props;
        const messageTime = new Date(time);
        const nowTime = new Date();
        if (Time.isToday(nowTime, messageTime)) {
            return Time.getHourMinute(messageTime);
        }
        if (Time.isYesterday(nowTime, messageTime)) {
            return `昨天 ${Time.getHourMinute(messageTime)}`;
        }
        return `${Time.getMonthDate(messageTime)} ${Time.getHourMinute(
            messageTime,
        )}`;
    }

    renderContent() {
        const { type, content, loading, percent, originUsername } = this.props;
        switch (type) {
            case 'text': {
                return <TextMessage content={content} />;
            }
            case 'reply': {
                return <ReplyMessage content={content} />;
            }
            case 'bilibili': {
                return <BiliMessage content={content} />;
            }
            case 'music': {
                return <MusicMessage content={content} />;
            }
            case 'media': {
                return <MediaMessage content={content} />;
            }
            case 'image': {
                return (
                    <ImageMessage
                        src={content}
                        loading={loading}
                        percent={percent}
                    />
                );
            }
            case 'file': {
                return <FileMessage file={content} percent={percent} />;
            }
            case 'code': {
                return <CodeMessage code={content} />;
            }
            case 'url': {
                return <UrlMessage url={content} />;
            }
            case 'inviteV2': {
                return <InviteMessageV2 inviteInfo={content} />;
            }
            case 'system': {
                return (
                    <SystemMessage
                        message={content}
                        username={originUsername}
                    />
                );
            }
            default:
                return <div className="unknown">不支持的消息类型</div>;
        }
    }

    render() {
        const { id, isSelf, avatar, tag, tagColorMode, username } = this.props;
        const { showDeleteList, showReplyList, showImgList } = this.state;

        let tagColor = `rgb(${themes.default.primaryColor})`;
        if (tagColorMode === 'fixedColor') {
            tagColor = getRandomColor(tag);
        } else if (tagColorMode === 'randomColor') {
            tagColor = getPerRandomColor(username);
        }

        return (
            <div
                className={`${Style.message} ${isSelf ? Style.self : ''}`}
                // 跳转到指定消息时用它在列表容器内定位, 不用全局 id 以免和页面其它内容撞名
                data-message-id={id}
            >
                <ShowUserOrGroupInfoContext.Consumer>
                    {(context) => (
                        <Avatar
                            className={Style.avatar}
                            src={avatar}
                            size={44}
                            onClick={() =>
                                // @ts-ignore
                                this.handleClickAvatar(context.showUserInfo)
                            }
                        />
                    )}
                </ShowUserOrGroupInfoContext.Consumer>
                <div className={Style.right}>
                    <div className={Style.nicknameTimeBlock}>
                        {tag && (
                            <span
                                className={Style.tag}
                                style={{ backgroundColor: tagColor }}
                            >
                                {tag}
                            </span>
                        )}
                        <span className={Style.nickname}>{username}</span>
                        <span className={Style.time}>{this.formatTime()}</span>
                    </div>
                    <div
                        className={Style.contentButtonBlock}
                        onMouseEnter={this.handleMouseEnter}
                        onMouseLeave={this.handleMouseLeave}
                    >
                        <div className={Style.content}>
                            {this.renderContent()}
                        </div>

                        {showImgList && (
                            <div className={Style.buttonList_sc}>
                                <Tooltip
                                    placement={isSelf ? 'topLeft' : 'topRight'}
                                    mouseEnterDelay={0.3}
                                    overlay={<span>收藏表情</span>}
                                >
                                    <div>
                                        <IconButton2
                                            className={Style.button}
                                            icon="shoucang"
                                            iconSize={16}
                                            width={20}
                                            height={20}
                                            onClick={this.handleAddExpression}
                                        />
                                    </div>
                                </Tooltip>
                            </div>
                        )}


                        {showDeleteList && (
                            <div className={Style.buttonList}>
                                <Tooltip
                                    placement={isSelf ? 'left' : 'right'}
                                    mouseEnterDelay={0.3}
                                    overlay={<span>撤回消息</span>}
                                >
                                    <div>
                                        <IconButton
                                            className={Style.button}
                                            icon="recall"
                                            iconSize={16}
                                            width={20}
                                            height={20}
                                            onClick={this.handleDeleteMessage}
                                        />
                                    </div>
                                </Tooltip>
                            </div>
                        )}

                        {showReplyList && (
                            <div className={Style.buttonList}>
                                <Tooltip
                                    placement={isSelf ? 'left' : 'right'}
                                    mouseEnterDelay={0.3}
                                    overlay={<span>回复消息</span>}
                                >
                                    <div>
                                        <IconButton
                                            className={Style.button}
                                            icon="chat"
                                            iconSize={16}
                                            width={20}
                                            height={20}
                                            onClick={this.handleReplyMessage}
                                        />
                                    </div>
                                </Tooltip>
                            </div>
                        )}


                    </div>
                    <div className={Style.arrow} />
                </div>
            </div>
        );
    }
}

/**
 * 这里原来包了一层 connect 只为读一个 isAdmin.
 * 那意味着列表里挂载了多少条消息, store 上就有多少个订阅者:
 * 每一次 dispatch (每条新消息, 每个上传进度回调) 都要跑 N 次 mapStateToProps
 * 和 N 次浅比较, 而这个值在整个会话期间根本不会变.
 * 现在由 MessageList 统一读一次再作为普通 prop 传下来
 */
// 显式标注组件类型: @pureRender 装饰器没有类型声明, 会把类的类型抹成 any,
// 原先是 connect() 顺带把它重新包成了一个合法的 JSX 组件类型
export default Message as unknown as React.ComponentClass<MessageProps>;
