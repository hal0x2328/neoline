export {
    getStorage,
    httpGet,
    httpPost,
    httpGetImage,
    setStorage,
    removeStorage,
    clearStorage,
    notification,
    setLocalStorage,
    removeLocalStorage,
    clearLocalStorage,
    getLocalStorage
} from '../common';
import {
    getStorage,
    setStorage,
    notification,
    httpPost,
    httpGet,
    setLocalStorage,
    getLocalStorage
} from '../common';
import { mainApi, Neo2NodeUrl, ChainType, Network, WitnessScope } from '../common/constants';
import {
    requestTarget, GetBalanceArgs, ERRORS,
    EVENT, AccountPublicKey, GetBlockInputArgs,
    TransactionInputArgs, GetStorageArgs, VerifyMessageArgs,
    SendArgs
} from '../common/data_module_neo2';
import {
    N3ApplicationLogArgs, N3BalanceArgs, N3GetBlockInputArgs,
    N3GetStorageArgs, N3InvokeArgs, N3InvokeMultipleArgs,
    N3InvokeReadArgs, N3InvokeReadMultiArgs, N3SendArgs , N3TransactionArgs,
    N3VerifyMessageArgs, requestTargetN3
} from '../common/data_module_neo3';
import {
    base64Encode, getN3ApplicationLog, getN3Balance, getN3Block, getN3RawTransaction, getN3Storage, getNetwork, getPrivateKeyFromWIF,
    getPublicKeyFromPrivateKey, getReqHeaderNetworkType,
    getScriptHashFromAddress, getWalletType,
    hexstring2str, sign, str2hexstring
} from '../common/utils';
import randomBytes = require('randomBytes');
import {
    u as u3,
    wallet as wallet3
} from '@cityofzion/neon-core-neo3/lib';
import { checkoutNetwork, getBlock, getRawTransaction, invokeFunction } from '../common/rpcN3';

/**
 * Background methods support.
 * Call window.NeoLineBackground to use.
 */
declare var chrome;

let currLang = 'en';
let currNetwork = 'MainNet';
let currChainId = 1;
let tabCurr: any;
let currChain = 'Neo2';
export let password = '';

export let haveBackupTip: boolean = null;

export const version = chrome.runtime.getManifest().version;

export function expand() {
    window.open('index.html#asset', '_blank');
}
(function init() {
    setInterval(async () => {
        const chainType = await getLocalStorage('chainType', () => { });
        let rpcUrl;
        const network: Network = getNetwork(currChainId);
        getStorage('NodeArray', (nodeArray) => {
            getStorage('chainId', chainId => {
                rpcUrl = nodeArray.filter(item => item.chainId === chainId)[0].nodeUrl;
            });
        });
        setTimeout(async () => {
            let oldHeight = await getLocalStorage(`${chainType}_${network}BlockHeight`, () => { }) || 0;
            httpPost(rpcUrl, {
                jsonrpc: '2.0',
                method: 'getblockcount',
                params: [],
                id: 1
            }, async (blockHeightData) => {
                const newHeight = blockHeightData.result;
                if (oldHeight === 0 || newHeight - oldHeight > 5) {
                    oldHeight = newHeight - 1;
                }
                let timer;
                for (let reqHeight = oldHeight; reqHeight < newHeight; reqHeight++) {
                    if (oldHeight !== newHeight) {
                        timer = setTimeout(() => {
                            httpPost(rpcUrl, {
                                jsonrpc: '2.0',
                                method: 'getblock',
                                params: [reqHeight, 1],
                                id: 1
                            }, (blockDetail) => {
                                if (blockDetail.error === undefined) {
                                    const txStrArr = [];
                                    blockDetail.result.tx.forEach(item => {
                                        txStrArr.push(item.txid);
                                    });
                                    windowCallback({
                                        data: {
                                            chainId: currChainId,
                                            blockHeight: reqHeight,
                                            blockTime: blockDetail.result.time,
                                            blockHash: blockDetail.result.hash,
                                            tx: txStrArr,
                                        },
                                        return: EVENT.BLOCK_HEIGHT_CHANGED
                                    });
                                }
                                if (newHeight - reqHeight <= 1) {
                                    const setData = {};
                                    setData[`${chainType}_${network}BlockHeight`] = newHeight;
                                    setLocalStorage(setData);
                                    clearTimeout(timer);
                                }
                            }, '*');
                        });
                    }
                }
            }, '*')
        }, 0);
        if(chainType === ChainType.Neo2) {
            const txArr = await getLocalStorage(`${currNetwork}TxArr`, (temp) => { }) || [];
            if (txArr.length === 0) {
                return;
            }
            httpPost(`${mainApi}/v1/neo2/txids_valid`, { txids: txArr }, (txConfirmData) => {
                if (txConfirmData.status === 'success') {
                    const txConfirms = txConfirmData.data || [];
                    txConfirms.forEach(item => {
                        const tempIndex = txArr.findIndex(e => e === item);
                        if (tempIndex >= 0) {
                            txArr.splice(tempIndex, 1);
                        }
                        httpGet(`${mainApi}/v1/neo2/transaction/${item}`, (txDetail) => {
                            if (txDetail.status === 'success') {
                                windowCallback({
                                    data: {
                                        chainId: currChainId,
                                        txid: item,
                                        blockHeight: txDetail.data.block_index,
                                        blockTime: txDetail.data.block_time,
                                    },
                                    return: EVENT.TRANSACTION_CONFIRMED
                                });
                            }
                        }, {
                            Network: getReqHeaderNetworkType(currNetwork)
                        });
                    });
                };
                const setData = {};
                setData[`${currNetwork}TxArr`] = txArr;
                setLocalStorage(setData);
            }, {
                Network: getReqHeaderNetworkType(currNetwork)
            });
        } else if(chainType === ChainType.Neo3) {
            const txArr = await getLocalStorage(`N3${currNetwork}TxArr`, (temp) => { }) || [];
            if (txArr.length === 0) {
                return;
            }
            txArr.forEach(txid => {
                getRawTransaction(txid).then(async txDetail => {
                    const tempIndex = txArr.findIndex(e => e === txid);
                        if (tempIndex >= 0) {
                            txArr.splice(tempIndex, 1);
                        }
                    const blockDetail = await getBlock(txDetail.blockhash);
                    windowCallback({
                        data: {
                            chainId: currChainId,
                            txid,
                            blockHeight: blockDetail.index,
                            blockTime: txDetail.blocktime /= 1000,
                        },
                        return: EVENT.TRANSACTION_CONFIRMED
                    });
                    const setData = {};
                    setData[`N3${currNetwork}TxArr`] = txArr;
                    setLocalStorage(setData)
                });
            });
        }
    }, 8000);

    if (navigator.language === 'zh-CN') {
        getStorage('lang', res => {
            if (res === undefined) {
                currLang = 'zh_CN';
                setStorage({ lang: currLang });
            }
        });
    }
    chrome.webRequest.onBeforeRequest.addListener(
        (details: any) => {
            if (details.url.indexOf(chrome.runtime.getURL('/index.html') < 0)) {
                return {
                    redirectUrl: details.url.replace(chrome.runtime.getURL(''), chrome.runtime.getURL('/index.html'))
                };
            } else {
                return {
                    redirectUrl: details.url
                };
            }
        }, {
        urls: [
            chrome.runtime.getURL('')
        ],
        types: ['main_frame']
    },
        ['blocking']
    );
})();

export function setPopup(lang) {
    switch (lang) {
        case 'zh_CN':
            currLang = 'zh_CN';
            break;
        case 'en':
            currLang = 'en';
            break;
    }
}

export function setNetwork(network, chainId, chainType) {
    currNetwork = network;
    currChainId = chainId;
    currChain = chainType;
    if (chainId === 3 || chainId === 4) {
        checkoutNetwork();
    }
}

getLocalStorage('startTime', (time) => {
    if (time === undefined) {
        setLocalStorage({
            startTime: chrome.csi().startE
        });
        setLocalStorage({
            shouldLogin: true
        });
    } else {
        if (time !== chrome.csi().startE) {
            setLocalStorage({
                shouldLogin: true
            });
            setLocalStorage({
                startTime: chrome.csi().startE
            });
        }
    }
});

chrome.windows.onRemoved.addListener(() => {
    chrome.tabs.query({}, (res) => {
        if (res.length === 0) { // All browsers are closed
            setLocalStorage({
                shouldLogin: true
            });
        }
    });
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    switch (request.target) {
        case requestTarget.PickAddress: {
            window.open(`/index.html#popup/notification/pick-address?hostname=${request.parameter.hostname}&chainType=Neo2&messageID=${request.ID}`, '_blank',
                'height=620, width=386, resizable=no, top=0, left=0');
            return true;
        }
        case requestTargetN3.PickAddress: {
            window.open(`/index.html#popup/notification/pick-address?hostname=${request.parameter.hostname}&chainType=Neo3&messageID=${request.ID}`, '_blank',
                'height=620, width=386, resizable=no, top=0, left=0');
            return true;
        }
        case requestTarget.Connect:
        case requestTarget.AuthState:
            {
                getStorage('connectedWebsites', (res: any) => {
                    if ((res !== undefined && res[request.hostname] !== undefined) || request.connect === 'true') {
                        if (res !== undefined && res[request.hostname] !== undefined && res[request.hostname].status === 'false') {
                            notification(chrome.i18n.getMessage('rejected'), chrome.i18n.getMessage('rejectedTip'));
                            windowCallback({
                                return: requestTarget.Connect,
                                data: false
                            });
                            return;
                        }
                        windowCallback({
                            return: requestTarget.Connect,
                            data: true
                        });
                        notification(`${chrome.i18n.getMessage('from')}: ${request.hostname}`, chrome.i18n.getMessage('connectedTip'));
                    } else {
                        window.open(`/index.html#popup/notification/authorization?icon=${request.icon}&hostname=${request.hostname}&title=${request.title}`, '_blank',
                            'height=620, width=386, resizable=no, top=0, left=0');
                    }
                sendResponse('');
                });
                return true;
            }
        case requestTarget.Login: {
            getLocalStorage('shouldLogin', res => {
                if (res === 'false' || res === false) {
                    windowCallback({
                        return: requestTarget.Login,
                        data: true
                    });
                } else {
                    window.open('/index.html#popup/login?notification=true', '_blank',
                        'height=620, width=386, resizable=no, top=0, left=0');
                }
            })
            return true;
        }
        case requestTarget.AccountPublicKey: {
            try {
                const key = currChain === 'Neo2' ? '' : `-${currChain}`;
                const walletArr = await getLocalStorage(`walletArr${key}`, () => { });
                const currWallet = await getLocalStorage('wallet', () => { });
                const WIFArr = await getLocalStorage(`WIFArr${key}`, () => { });
                const data: AccountPublicKey = { address: '', publicKey: '' };
                if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                    const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                        item.accounts[0].address === currWallet.accounts[0].address)]
                    );
                    data.address = currWallet.accounts[0].address;
                    data.publicKey = getPublicKeyFromPrivateKey(privateKey);
                }
                windowCallback({
                    return: requestTarget.AccountPublicKey,
                    data,
                    ID: request.ID
                })
            } catch (error) {
                console.log(error)
                windowCallback({ data: [], ID: request.ID, return: requestTarget.AccountPublicKey, error: ERRORS.DEFAULT });
            }
            return;
        }

        case requestTarget.Balance: {
            const parameter = request.parameter as GetBalanceArgs;
            const postData = [];
            let params = [];
            if (parameter.params instanceof Array) {
                params = parameter.params
            } else {
                params.push(parameter.params)
            }
            params.forEach(item => {
                const assetIds = [];
                const symbols = [];
                (item.assets || []).forEach((asset: string) => {
                    try {
                        if (asset.startsWith('0x') && asset.length === 66) {
                            asset = asset.substring(2);
                        }
                        hexstring2str(asset);
                        if (asset.length === 64) {
                            assetIds.push(`0x${asset}`);
                        }
                        if (asset.length === 40) {
                            assetIds.push(asset)
                        }
                    } catch (error) {
                        symbols.push(asset);
                    }
                });
                const pushData = {
                    address: item.address,
                    asset_ids: assetIds,
                    symbols,
                    fetch_utxo: item.fetchUTXO || false
                };
                postData.push(pushData);
            });
            httpPost(`${mainApi}/v1/neo2/address/balances`, { params: postData }, (response) => {
                if (response.status === 'success') {
                    const returnData = response.data;
                    for (const key in returnData) {
                        if (Object.prototype.hasOwnProperty.call(returnData, key)) {
                            if (returnData[key]) {
                                returnData[key].map(item => {
                                    item.assetID = item.asset_id;
                                    item.asset_id = undefined;
                                    return item;
                                })
                            }
                        }
                    }
                    windowCallback({
                        return: requestTarget.Balance,
                        data: returnData,
                        ID: request.ID,
                        error: null
                    });
                    sendResponse('');
                } else {
                    windowCallback({
                        return: requestTarget.Balance,
                        data: null,
                        ID: request.ID,
                        error: ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }
            }, {
                Network: getReqHeaderNetworkType(parameter.network)
            });
            return;
        }
        case requestTarget.Transaction: {
            try {
                const parameter = request.parameter;
                const url = `${mainApi}/v1/neo2/transaction/${parameter.txid}`;
                httpGet(url, (response) => {
                    if (response.status === 'success') {
                        const returnData = response.data;
                        windowCallback({
                            return: requestTarget.Transaction,
                            ID: request.ID,
                            data: returnData,
                            error: null
                        });
                    } else {
                        windowCallback({
                            return: requestTarget.Transaction,
                            data: null,
                            ID: request.ID,
                            error: ERRORS.DEFAULT
                        });
                    }
                }, {
                    Network: getReqHeaderNetworkType(parameter.network)
                });
            } catch (error) {
                windowCallback({
                    return: requestTarget.Transaction,
                    data: null,
                    ID: request.parameter.ID,
                    error
                });
            }
            sendResponse('');
            return;
        }
        case requestTarget.Block: {
            try {
                const parameter = request.parameter as GetBlockInputArgs;
                const nodeUrl = Neo2NodeUrl[parameter.network];
                httpPost(nodeUrl, {
                    jsonrpc: '2.0',
                    method: 'getblock',
                    params: [parameter.blockHeight, 1],
                    id: 1
                }, (response) => {
                    windowCallback({
                        return: requestTarget.Block,
                        data: response.error !== undefined ? null : response.result,
                        ID: request.ID,
                        error: response.error === undefined ? null : ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }, null);
            } catch (error) {
                windowCallback({
                    return: requestTarget.Block,
                    data: null,
                    ID: request.ID,
                    error
                });
                sendResponse('');
            }
            return;
        }
        case requestTarget.ApplicationLog: {
            try {
                const parameter = request.parameter as TransactionInputArgs;
                const data = await getN3ApplicationLog(parameter.txid);
                windowCallback({
                    return: requestTarget.ApplicationLog,
                    data,
                    ID: request.ID,
                    error: null
                });
            } catch (error) {
                windowCallback({
                    return: requestTarget.ApplicationLog,
                    data: null,
                    ID: request.ID,
                    error
                });
                sendResponse('');
            }
            return;
        }
        case requestTarget.Storage: {
            try {
                const parameter = request.parameter as GetStorageArgs;
                const nodeUrl = Neo2NodeUrl[parameter.network];
                httpPost(nodeUrl, {
                    jsonrpc: '2.0',
                    method: 'getstorage',
                    params: [parameter.scriptHash, str2hexstring(parameter.key)],
                    id: 1
                }, (response) => {
                    windowCallback({
                        return: requestTarget.Storage,
                        data: response.error !== undefined ? null : ({ result: hexstring2str(response.result) } || null),
                        ID: request.ID,
                        error: response.error === undefined ? null : ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }, null);
            } catch (error) {
                windowCallback({
                    return: requestTarget.Storage,
                    data: null,
                    ID: request.ID,
                    error
                });
                sendResponse('');
            }
            return;
        }
        case requestTarget.InvokeRead: {
            const nodeUrl = Neo2NodeUrl[request.parameter.network];
            request.parameter = [request.parameter.scriptHash, request.parameter.operation, request.parameter.args];
            const args = request.parameter[2];
            args.forEach((item, index) => {
                if (item.type === 'Address') {
                    args[index] = {
                        type: 'Hash160',
                        value: getScriptHashFromAddress(item.value)
                    }
                } else if (item.type === 'Boolean') {
                    if (typeof item.value === 'string') {
                        if ((item.value && item.value.toLowerCase()) === 'true') {
                            args[index] = {
                                type: 'Boolean',
                                value: true
                            }
                        } else if (item.value && item.value.toLowerCase() === 'false') {
                            args[index] = {
                                type: 'Boolean',
                                value: false
                            }
                        } else {
                            windowCallback({
                                error: ERRORS.MALFORMED_INPUT,
                                return: requestTarget.InvokeRead,
                                ID: request.ID
                            });
                            window.close();
                        }
                    }
                }
            });
            request.parameter[2] = args;
            const returnRes = { data: {}, ID: request.ID, return: requestTarget.InvokeRead, error: null };
            httpPost(nodeUrl, {
                jsonrpc: '2.0',
                method: 'invokefunction',
                params: request.parameter,
                id: 1
            }, (res) => {
                res.return = requestTarget.InvokeRead;
                if (!res.error) {
                    returnRes.data = {
                        script: res.result.script,
                        state: res.result.state,
                        gas_consumed: res.result.gas_consumed,
                        stack: res.result.stack
                    };
                } else {
                    returnRes.error = ERRORS.RPC_ERROR;
                }
                windowCallback(returnRes);
                sendResponse('');
            }, null);
            return;
        }
        case requestTarget.InvokeReadMulti: {
            try {
                const nodeUrl = Neo2NodeUrl[request.parameter.network];
                const requestData = request.parameter;
                requestData.invokeReadArgs.forEach((invokeReadItem: any, index) => {
                    invokeReadItem.args.forEach((item, itemIndex) => {
                        if (item.type === 'Address') {
                            invokeReadItem.args[itemIndex] = {
                                type: 'Hash160',
                                value: getScriptHashFromAddress(item.value)
                            }
                        } else if (item.type === 'Boolean') {
                            if (typeof item.value === 'string') {
                                if ((item.value && item.value.toLowerCase()) === 'true') {
                                    invokeReadItem.args[itemIndex] = {
                                        type: 'Boolean',
                                        value: true
                                    }
                                } else if (item.value && item.value.toLowerCase() === 'false') {
                                    invokeReadItem.args[itemIndex] = {
                                        type: 'Boolean',
                                        value: false
                                    }
                                } else {
                                    windowCallback({
                                        error: ERRORS.MALFORMED_INPUT,
                                        return: requestTarget.InvokeReadMulti,
                                        ID: request.ID
                                    });
                                    window.close();
                                }
                            }
                        }
                    });
                    requestData.invokeReadArgs[index] = [invokeReadItem.scriptHash, invokeReadItem.operation, invokeReadItem.args];
                })
                const returnRes = { data: [], ID: request.ID, return: requestTarget.InvokeReadMulti, error: null };
                let requestCount = 0;
                requestData.invokeReadArgs.forEach(item => {
                    httpPost(nodeUrl, {
                        jsonrpc: '2.0',
                        method: 'invokefunction',
                        params: item,
                        id: 1
                    }, (res) => {
                        requestCount++;
                        if (!res.error) {
                            returnRes.data.push({
                                script: res.result.script,
                                state: res.result.state,
                                gas_consumed: res.result.gas_consumed,
                                stack: res.result.stack
                            });
                        } else {
                            returnRes.error = ERRORS.RPC_ERROR;
                        }
                        if (requestCount === requestData.invokeReadArgs.length) {
                            windowCallback(returnRes);
                            sendResponse('');
                        }
                    }, null);
                })
            } catch (error) {
                windowCallback({ data: [], ID: request.ID, return: requestTarget.InvokeReadMulti, error: ERRORS.RPC_ERROR });
                sendResponse('');
            }
            return;
        }
        case requestTarget.VerifyMessage: {
            const parameter = request.parameter as VerifyMessageArgs;
            const walletArr = await getLocalStorage('walletArr', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr', () => { });
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                const publicKey = getPublicKeyFromPrivateKey(privateKey);
                const parameterHexString = str2hexstring(parameter.message);
                const lengthHex = (parameterHexString.length / 2).toString(16).padStart(2, '0');
                const concatenatedString = lengthHex + parameterHexString;
                const serializedTransaction = '010001f0' + concatenatedString + '0000';
                windowCallback({
                    return: requestTarget.VerifyMessage,
                    data: {
                        result: sign(serializedTransaction, privateKey) === parameter.data &&
                            publicKey === parameter.publicKey ? true : false
                    },
                    ID: request.ID
                });
            }
            sendResponse('');
            return;
        }
        case requestTarget.SignMessage: {
            const parameter = request.parameter;
            const walletArr = await getLocalStorage('walletArr', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr', () => { });
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                const randomSalt = randomBytes(16).toString('hex');
                const publicKey = getPublicKeyFromPrivateKey(privateKey);
                const parameterHexString = str2hexstring(randomSalt + parameter.message);
                const lengthHex = (parameterHexString.length / 2).toString(16).padStart(2, '0');
                const concatenatedString = lengthHex + parameterHexString;
                const serializedTransaction = '010001f0' + concatenatedString + '0000';
                windowCallback({
                    return: requestTarget.SignMessage,
                    data: {
                        publicKey,
                        data: sign(serializedTransaction, privateKey),
                        salt: randomSalt,
                        message: parameter.message
                    },
                    ID: request.ID
                });
            }
            sendResponse('');
            return;
        }
        case requestTarget.Invoke: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter;
            getStorage('connectedWebsites', (res) => {
                let queryString = '';
                for (const key in params) {
                    if (params.hasOwnProperty(key)) {
                        const value = key === 'args' || key === 'assetIntentOverrides' || key === 'attachedAssets' ||
                            key === 'assetIntentOverrides' || key === 'txHashAttributes' || key === 'extra_witness' ?
                            JSON.stringify(params[key]) : params[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                window.open(`index.html#popup/notification/invoke?${queryString}messageID=${request.ID}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
            });
            sendResponse('');
            return;
        }
        case requestTarget.InvokeMulti: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter;
            getStorage('connectedWebsites', (res) => {
                let queryString = '';
                for (const key in params) {
                    if (params.hasOwnProperty(key)) {
                        const value = key === 'invokeArgs' || key === 'assetIntentOverrides' || key === 'attachedAssets' ||
                            key === 'assetIntentOverrides' || key === 'txHashAttributes' || key === 'extra_witness' ?
                            JSON.stringify(params[key]) : params[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                window.open(`index.html#popup/notification/invoke-multi?${queryString}messageID=${request.ID}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
            });
            sendResponse('');
            return;
        }
        case requestTarget.Send: {
            const parameter = request.parameter as SendArgs;
            const assetID = parameter.asset.length < 10 ? '' : parameter.asset;
            const symbol = parameter.asset.length >= 10 ? '' : parameter.asset;
            httpGet(`${mainApi}/v1/neo2/address/assets?address=${parameter.fromAddress}`, (resBalance) => {
                let enough = true; // ???????????????
                let hasAsset = false;  // ????????????????????????
                const assets = (resBalance.data.asset as []).concat(resBalance.data.nep5 || []) as any;
                for (const asset of assets) {
                    if (asset.asset_id === assetID || String(asset.symbol).toLowerCase() === symbol.toLowerCase()) {
                        hasAsset = true;
                        request.parameter.asset = asset.asset_id;
                        if (Number(asset.balance) < Number(parameter.amount)) {
                            enough = false;
                        }
                        break;
                    }
                }
                if (enough && hasAsset) {
                    let queryString = '';
                    for (const key in parameter) {
                        if (parameter.hasOwnProperty(key)) {
                            const value = parameter[key];
                            queryString += `${key}=${value}&`;
                        }
                    }
                    chrome.tabs.query({
                        active: true,
                        currentWindow: true
                    }, (tabs) => {
                        tabCurr = tabs;
                    });
                    getLocalStorage('wallet', (wallet) => {
                        if (wallet !== undefined && wallet.accounts[0].address !== parameter.fromAddress) {
                            windowCallback({
                                return: requestTarget.Send,
                                error: ERRORS.MALFORMED_INPUT,
                                ID: request.ID
                            });
                        } else {
                            window.open(`index.html#popup/notification/transfer?${queryString}messageID=${request.ID}`,
                                '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                        }
                    });
                } else {
                    window.postMessage({
                        return: requestTarget.Send,
                        error: ERRORS.INSUFFICIENT_FUNDS,
                        ID: request.ID
                    }, '*');
                    return;
                }
            }, {
                Network: getReqHeaderNetworkType(request.parameter.network)
            });
            return true;
        }
        case requestTarget.Deploy: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter;
            getStorage('connectedWebsites', (res) => {
                let queryString = '';
                for (const key in params) {
                    if (params.hasOwnProperty(key)) {
                        const value = params[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                window.open(`index.html#popup/notification/deploy?${queryString}messageID=${request.ID}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
            });
            sendResponse('');
            return;
        }

        // neo3 dapi method
        case requestTargetN3.Balance: {
            try {
                const currWallet = await getLocalStorage('wallet', () => { });
                const address = currWallet.accounts[0].address;
                if (!wallet3.isAddress(address)) {
                    return;
                };
                const assets = await getN3Balance(address);
                const postData = [
                    {
                        address,
                        contracts: assets
                    }
                ];
                windowCallback({
                    return: requestTargetN3.Balance,
                    ID: request.ID,
                    data: postData,
                    error: null
                });
                sendResponse('');
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.Balance,
                    data: null,
                    ID: request.parameter.ID,
                    error: ERRORS.DEFAULT
                });
                sendResponse('');
            }
            return true;
        }
        case requestTargetN3.Transaction: {
            try {
                const parameter = request.parameter as N3TransactionArgs;
                const data = await getN3RawTransaction(parameter.txid);
                windowCallback({
                    return: requestTargetN3.Transaction,
                    ID: request.ID,
                    data,
                    error: null
                });
                sendResponse('');
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.Transaction,
                    data: null,
                    ID: request.parameter.ID,
                    error
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.Block: {
            try {
                const parameter = request.parameter as N3GetBlockInputArgs;
                const data = await getN3Block(parameter.blockHeight);
                windowCallback({
                    return: requestTargetN3.Block,
                    data,
                    ID: request.ID,
                    error: null
                });
                sendResponse('');
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.Block,
                    data: null,
                    ID: request.ID,
                    error
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.ApplicationLog: {
            try {
                const parameter = request.parameter as N3ApplicationLogArgs;
                const data = await getN3ApplicationLog(parameter.txid);
                windowCallback({
                    return: requestTargetN3.ApplicationLog,
                    data,
                    ID: request.ID,
                    error: null
                });
                sendResponse('');
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.ApplicationLog,
                    data: null,
                    ID: request.ID,
                    error
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.Storage: {
            try {
                const parameter = request.parameter as N3GetStorageArgs;
                const data = await getN3Storage(parameter.scriptHash, base64Encode(parameter.key));
                windowCallback({
                    return: requestTargetN3.Storage,
                    data: data.error !== undefined ? null : ({ result: data.result } || null),
                    ID: request.ID,
                    error: data.error === undefined ? null : ERRORS.RPC_ERROR
                });
                sendResponse('');
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.Storage,
                    data: null,
                    ID: request.ID,
                    error
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.InvokeRead: {
            const parameter = request.parameter as N3InvokeReadArgs;
            const signers = parameter.signers.map(item => {
                return {
                    account: item.account,
                    scopes: item.scopes,
                    allowedcontracts: item.allowedContracts || undefined,
                    allowedgroups: item.allowedGroups || undefined,
                }
            });
            request.parameter = [parameter.scriptHash, parameter.operation, parameter.args, signers];
            const args = request.parameter[2];
            args.forEach((item, index) => {
                if (item.type === 'Address') {
                    args[index] = {
                        type: 'Hash160',
                        value: getScriptHashFromAddress(item.value)
                    }
                } else if (item.type === 'Boolean') {
                    if (typeof item.value === 'string') {
                        if ((item.value && item.value.toLowerCase()) === 'true') {
                            args[index] = {
                                type: 'Boolean',
                                value: true
                            }
                        } else if (item.value && item.value.toLowerCase() === 'false') {
                            args[index] = {
                                type: 'Boolean',
                                value: false
                            }
                        } else {
                            chrome.windowCallback({
                                error: ERRORS.MALFORMED_INPUT,
                                return: requestTargetN3.InvokeRead,
                                ID: request.ID
                            });
                            window.close();
                        }
                    }
                }
            });
            request.parameter[2] = args;
            const data = await invokeFunction(parameter.scriptHash, parameter.operation, parameter.args, signers);
            windowCallback({
                data,
                ID: request.ID,
                return: requestTargetN3.InvokeRead,
                error: null
            });
            sendResponse('');
            return;
        }
        case requestTargetN3.InvokeReadMulti: {
            try {
                const requestData = request.parameter;
                const signers = requestData.signers.map(item => {
                    return {
                        account: item.account,
                        scopes: item.scopes,
                        allowedcontracts: item.allowedContracts || undefined,
                        allowedgroups: item.allowedGroups || undefined,
                    }
                });
                requestData.invokeReadArgs.forEach((invokeReadItem: any, index) => {
                    invokeReadItem.args.forEach((item, itemIndex) => {
                        if (item === null || typeof item !== 'object') {
                            return;
                        } else if (item.type === 'Address') {
                            invokeReadItem.args[itemIndex] = {
                                type: 'Hash160',
                                value: getScriptHashFromAddress(item.value)
                            }
                        } else if (item.type === 'Boolean') {
                            if (typeof item.value === 'string') {
                                if ((item.value && item.value.toLowerCase()) === 'true') {
                                    invokeReadItem.args[itemIndex] = {
                                        type: 'Boolean',
                                        value: true
                                    }
                                } else if (item.value && item.value.toLowerCase() === 'false') {
                                    invokeReadItem.args[itemIndex] = {
                                        type: 'Boolean',
                                        value: false
                                    }
                                } else {
                                    chrome.windowCallback({
                                        error: ERRORS.MALFORMED_INPUT,
                                        return: requestTargetN3.InvokeReadMulti,
                                        ID: request.ID
                                    });
                                    window.close();
                                }
                            }
                        }
                    });
                    requestData.invokeReadArgs[index] = {
                        scriptHash: invokeReadItem.scriptHash,
                        operation: invokeReadItem.operation,
                        args: invokeReadItem.args,
                        signers
                    }
                });
                const returnRes = { data: [], ID: request.ID, return: requestTargetN3.InvokeReadMulti, error: null };
                let requestCount = 0;
                requestData.invokeReadArgs.forEach(async item => {
                    const data = await invokeFunction(item.scriptHash, item.operation, item.args, item.signers);
                    returnRes.data.push(data);
                    requestCount++;
                    if (requestCount === requestData.invokeReadArgs.length) {
                        windowCallback(returnRes);
                        sendResponse('');
                    }
                })
            } catch (error) {
                console.log(error)
                windowCallback({ data: [], ID: request.ID, return: requestTargetN3.InvokeReadMulti, error });
                sendResponse('');
            };
            return;
        }
        case requestTargetN3.VerifyMessage: {
            const parameter = request.parameter as N3VerifyMessageArgs;
            const walletArr = await getLocalStorage('walletArr-Neo3', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr-Neo3', () => { });
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = wallet3.getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                const publicKey = wallet3.getPublicKeyFromPrivateKey(privateKey);
                const parameterHexString = u3.str2hexstring(parameter.message);
                const lengthHex = u3.num2VarInt(parameterHexString.length / 2);
                const concatenatedString = lengthHex + parameterHexString;
                const messageHex = '010001f0' + concatenatedString + '0000';
                const result = wallet3.verify(messageHex, parameter.data, publicKey);
                windowCallback({
                    return: requestTargetN3.VerifyMessage,
                    data: {
                        result: publicKey === parameter.publicKey ? result : false
                    },
                    ID: request.ID
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.SignMessage: {
            const parameter = request.parameter;
            const walletArr = await getLocalStorage('walletArr-Neo3', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr-Neo3', () => { });
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = wallet3.getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                const randomSalt = randomBytes(16).toString('hex');
                const publicKey = wallet3.getPublicKeyFromPrivateKey(privateKey);
                const parameterHexString = u3.str2hexstring(randomSalt + parameter.message);
                const lengthHex = u3.num2VarInt(parameterHexString.length / 2);
                const concatenatedString = lengthHex + parameterHexString;
                const messageHex = '010001f0' + concatenatedString + '0000';
                windowCallback({
                    return: requestTargetN3.SignMessage,
                    data: {
                        publicKey,
                        data: wallet3.sign(messageHex, privateKey),
                        salt: randomSalt,
                        message: parameter.message
                    },
                    ID: request.ID
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.Invoke: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter as N3InvokeArgs;
            const currWallet = await getLocalStorage('wallet', () => { });
            const tempScriptHash = wallet3.getScriptHashFromAddress(
                currWallet.accounts[0].address
            );
            if (!params.signers) {
                params.signers = [{
                    account: tempScriptHash,
                    scopes: WitnessScope.CalledByEntry
                }];
            } else {
                if (!params.signers[0].account) {
                    params.signers[0].account = tempScriptHash;
                }
                if (!params.signers[0].scopes) {
                    params.signers[0].scopes = WitnessScope.CalledByEntry;
                }
            };
            getStorage('connectedWebsites', async (res) => {
                const storageName = `InvokeArgsArray`;
                const saveData = {};
                const invokeArgsArray = await getLocalStorage(storageName, () => {}) || [];
                const data = {
                    ...params,
                    messageID: request.ID
                }
                saveData[storageName] = [data, ...invokeArgsArray];
                setLocalStorage(saveData);
                window.open(`index.html#popup/notification/neo3-invoke?messageID=${request.ID}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
            });
            sendResponse('');
            return;
        }
        case requestTargetN3.InvokeMultiple: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter as N3InvokeMultipleArgs;
            const currWallet = await getLocalStorage('wallet', () => { });
            const tempScriptHash = wallet3.getScriptHashFromAddress(
                currWallet.accounts[0].address
            );
            if (!params.signers) {
                params.signers = [{
                    account: tempScriptHash,
                    scopes: WitnessScope.CalledByEntry
                }];
            } else {
                if (!params.signers[0].account) {
                    params.signers[0].account = tempScriptHash;
                }
                if (!params.signers[0].scopes) {
                    params.signers[0].scopes = WitnessScope.CalledByEntry;
                }
            };
            getStorage('connectedWebsites', async (res) => {
                let queryString = '';
                for (const key in params) {
                    if (params.hasOwnProperty(key)) {
                        const value = key === 'invokeArgs' || key === 'signers' ?
                            JSON.stringify(params[key]) : params[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                const storageName = `InvokeArgsArray`;
                const saveData = {};
                const invokeArgsArray = await getLocalStorage(storageName, () => {}) || [];
                const data = {
                    ...params,
                    messageID: request.ID
                }
                saveData[storageName] = [data, ...invokeArgsArray];
                setLocalStorage(saveData);
                window.open(`index.html#popup/notification/neo3-invoke-multiple?messageID=${request.ID}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
            });
            sendResponse('');
            return;
        }
        case requestTargetN3.Send: {
            const parameter = request.parameter as N3SendArgs;
            const assetID = parameter.asset.length < 10 ? '' : parameter.asset;
            const symbol = parameter.asset.length >= 10 ? '' : parameter.asset;
            const assets = await getN3Balance(parameter.fromAddress);
            let enough = true; // ???????????????
            let hasAsset = false;  // ????????????????????????
            for (let index = 0; index < assets.length; index++) {
                if (assets[index].contract === assetID || String(assets[index].symbol).toLowerCase() === symbol.toLowerCase()) {
                    hasAsset = true;
                    parameter.asset = assets[index].contract;
                    if (Number(assets[index].balance) < Number(parameter.amount)) {
                        enough = false;
                    }
                    break;
                }
            }
            if (enough && hasAsset) {
                let queryString = '';
                for (const key in parameter) {
                    if (parameter.hasOwnProperty(key)) {
                        const value = parameter[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, (tabs) => {
                    tabCurr = tabs;
                });
                getLocalStorage('wallet', (wallet) => {
                    if (wallet !== undefined && wallet.accounts[0].address !== parameter.fromAddress) {
                        windowCallback({
                            return: requestTargetN3.Send,
                            error: ERRORS.MALFORMED_INPUT,
                            ID: request.ID
                        });
                    } else {
                        window.open(`index.html#popup/notification/neo3-transfer?${queryString}messageID=${request.ID}`,
                            '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                    }
                });
            } else {
                window.postMessage({
                    return: requestTargetN3.Send,
                    error: ERRORS.INSUFFICIENT_FUNDS,
                    ID: request.ID
                }, '*');
                return;
            }
            return true;
        }
        case requestTargetN3.AddressToScriptHash: {
            const scriptHash = wallet3.getScriptHashFromAddress(request.parameter.address);
            windowCallback({
                data: { scriptHash },
                return: requestTargetN3.AddressToScriptHash,
                ID: request.ID
            });
            return;
        }
        case requestTargetN3.ScriptHashToAddress: {
            const scriptHash = request.parameter.scriptHash;
            const str = scriptHash.startsWith('0x') ? scriptHash.substring(2, 44) : scriptHash;
            const address = wallet3.getAddressFromScriptHash(str);
            windowCallback({
                data: { address },
                return: requestTargetN3.ScriptHashToAddress,
                ID: request.ID
            });
            return;
        }
    }
    return true;
});

export function windowCallback(data) {
    chrome.tabs.query({
    }, (tabs: any) => {
        // console.log(tabs);
        // tabCurr = tabs;
        if (tabs.length > 0) {
            tabs.forEach(item => {
                chrome.tabs.sendMessage(item.id, data, (response) => {
                    // tabCurr = null;
                });
            })
        }
    });
}
