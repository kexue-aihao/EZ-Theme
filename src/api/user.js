

import request from './request';
import { isXboard } from '@/utils/baseConfig';





export function getUserInfo() {

    return request({

        url: '/user/info',

        method: 'get'

    });

}





export function getIpLocationInfo() {

    return request({

        url: 'https://myip.ipip.net/json',

        method: 'get',

        baseURL: ''
    });

}





export function redeemGiftCard(giftcard) {

    const xboard = isXboard();

    return request({

        url: xboard ? '/user/gift-card/redeem' : '/user/redeemgiftcard',

        method: 'post',

        data: xboard ? { code: giftcard } : { giftcard }

    });

}





export function changePassword(data) {

    return request({

        url: '/user/changePassword',

        method: 'post',

        data

    });

}





export function resetPassword(data) {

    return request({

        url: '/user/resetPassword',

        method: 'post',

        data

    });

}




export function resetSecurity() {

    return request({

        url: '/user/resetSecurity',

        method: 'get'

    });

}





export function updateRemindSettings(data) {

    return request({

        url: '/user/update',

        method: 'post',

        data

    });

}





export function getActiveSession() {

    return request({

        url: '/user/getActiveSession',

        method: 'get'

    });

}





export function removeActiveSession(sessionId) {

    return request({

        url: '/user/removeActiveSession',

        method: 'post',

        data: { session_id: sessionId }

    });

}





export function getCommConfig() {

    return request({

        url: '/user/comm/config',

        method: 'get'

    });

}





export function getTelegramBotInfo() {

    return request({

        url: '/user/telegram/getBotInfo',

        method: 'get'

    });

}





export function getSubscriptionList() {

    return request({

        url: '/user/subscription/fetch',

        method: 'get'

    });

}



export function getTelegramBinding() {

    return request({

        url: '/user/telegram/binding',

        method: 'get'

    });

}



export function prepareTelegramBinding(subscriptionId) {

    return request({

        url: '/user/telegram/binding/prepare',

        method: 'post',

        data: {

            subscription_id: subscriptionId

        }

    });

}



export function revokeTelegramBinding() {

    return request({

        url: '/user/telegram/binding/revoke',

        method: 'post'

    });

}



export function getTwoFactorStatus() {

    return request({

        url: '/user/2fa/status',

        method: 'get'

    });

}




export function setupTwoFactor() {

    return request({

        url: '/user/2fa/setup',

        method: 'post'

    });

}




export function confirmTwoFactor(data) {

    return request({

        url: '/user/2fa/confirm',

        method: 'post',


        data

    });

}




export function disableTwoFactor(data) {

    return request({

        url: '/user/2fa/disable',

        method: 'post',


        data

    });

}




export function regenerateTwoFactorRecoveryCodes(data) {

    return request({

        url: '/user/2fa/recovery-codes/regenerate',

        method: 'post',


        data

    });

}




export function getUserSubscribe() {

    return request({

        url: '/user/getSubscribe',

        method: 'get'

    });

}
