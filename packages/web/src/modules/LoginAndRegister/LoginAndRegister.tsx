import React from 'react';
import { useSelector } from 'react-redux';

import {
    Tabs,
    TabPane,
    TabContent,
    ScrollableInkTabBar,
} from '../../components/Tabs';
import Style from './LoginAndRegister.less';
import Login from './Login';
import Register from './Register';
import Dialog from '../../components/Dialog';
import { State } from '../../state/reducer';
import useAction from '../../hooks/useAction';

function LoginAndRegister() {
    const action = useAction();
    const loginRegisterDialogVisible = useSelector(
        (state: State) => state.status.loginRegisterDialogVisible,
    );

    return (
        <Dialog
            visible={loginRegisterDialogVisible}
            /**
             * 三个都要关掉才是真的关不掉:
             * closable 只是隐藏右上角的 X, 点遮罩和按 ESC 依然能把它关了,
             * 而这个应用不登录就没有任何内容可看, 关掉只会留下一片空白
             */
            closable={false}
            maskClosable={false}
            keyboard={false}
            onClose={() => action.toggleLoginRegisterDialog(false)}
        >
            <Tabs
                className={Style.login}
                defaultActiveKey="login"
                renderTabBar={() => <ScrollableInkTabBar />}
                renderTabContent={() => <TabContent />}
            >
                <TabPane tab="登录" key="login">
                    <Login />
                </TabPane>
                <TabPane tab="注册" key="register">
                    <Register />
                </TabPane>
            </Tabs>
        </Dialog>
    );
}

export default LoginAndRegister;
