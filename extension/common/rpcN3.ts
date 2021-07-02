import {
    rpc as rpc3,
} from '@cityofzion/neon-core-neo3/lib';
import { ContractParamJson } from '@cityofzion/neon-core-neo3/lib/sc';
import { getStorage } from '../common';

let rpcClient;
let nodeUrl;

export function checkoutNetwork(): any {
    getStorage('NodeArray', nodeArr => {
        getStorage('chainId', chainId => {
            const nodeItem = nodeArr.filter(item => item.chainId === chainId)[0];
            nodeUrl = nodeItem.nodeUrl;
            rpcClient = new rpc3.RPCClient(nodeItem.nodeUrl);
            return nodeUrl;
        });
    });
}

export function getRawTransaction(txid: string) {
    if (!rpcClient) checkoutNetwork();
    return rpcClient.getRawTransaction(txid, true);
}

export function getBlockCount() {
    if (!rpcClient) checkoutNetwork();
    return rpcClient.getBlockCount();
}

export function getBlock(blockHeight: number) {
    if (!rpcClient) checkoutNetwork();
    return rpcClient.getBlock(blockHeight, true);
}

export function getApplicationLog(blockHeight: string) {
    if (!rpcClient) checkoutNetwork();
    return rpcClient.getApplicationLog(blockHeight, true);
}

export function getStorageDetails(scriptHash: string, key: string) {
    if (!rpcClient) checkoutNetwork();
    return rpcClient.getStorage(scriptHash, key);
}

export function getNep17Balances(address: string): Promise<any>{
    if (!rpcClient) checkoutNetwork();
    return rpcClient.getNep17Balances(address);
}

export function invokeFunction(
    scriptHash: string,
    method: string,
    args: Array<ContractParamJson>,
    signers?: Array<any>
): Promise<any>{
    if (!rpcClient) checkoutNetwork();
    return rpcClient.invokeFunction(scriptHash, method, args, signers);
}
