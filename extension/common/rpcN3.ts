import {
    rpc as rpc3,
} from '@cityofzion/neon-core-neo3/lib';
import { ContractParamJson } from '@cityofzion/neon-core-neo3/lib/sc';
import { SignerJson } from '@cityofzion/neon-core-neo3/lib/tx';
import { RPC } from './constants';

let rpcClient;

export function checkoutN3Network() {
    const rpcUrl = RPC.Neo3.N3TestNet;
    rpcClient = new rpc3.RPCClient(rpcUrl);
}

export function getRawTransaction(txid: string) {
    if (!rpcClient) checkoutN3Network();
    return rpcClient.getRawTransaction(txid, true);
}

export function getBlock(blockHeight: number) {
    if (!rpcClient) checkoutN3Network();
    return rpcClient.getBlock(blockHeight, true);
}

export function getApplicationLog(blockHeight: string) {
    if (!rpcClient) checkoutN3Network();
    return rpcClient.getApplicationLog(blockHeight, true);
}

export function getStorageDetails(scriptHash: string, key: string) {
    if (!rpcClient) checkoutN3Network();
    return rpcClient.getStorage(scriptHash, key);
}

export function getNep17Balances(address: string): Promise<any>{
    if (!rpcClient) checkoutN3Network();
    return rpcClient.getNep17Balances(address);
}

export function invokeFunction(
    scriptHash: string,
    method: string,
    args: Array<ContractParamJson>,
    signers?: Array<any>
): Promise<any>{
    if (!rpcClient) checkoutN3Network();
    return rpcClient.invokeFunction(scriptHash, method, args, signers);
}
