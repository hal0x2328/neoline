import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NeonService } from '../services/neon.service';
import { TX_LIST_PAGE_SIZE, NEO3_CONTRACT, GAS3_CONTRACT } from '@popup/_lib';
import { rpc as rpc3 } from '@cityofzion/neon-core-neo3';
import { ChromeService } from '../services/chrome.service';

@Injectable()
export class TransactionState {
    public txSource = new Subject();
    public txSub$ = this.txSource.asObservable();
    public rpcClient;

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private neonService: NeonService,
        private globalService: GlobalService,
        private chrome: ChromeService,
    ) {
        this.rpcClient = new rpc3.RPCClient(this.globalService.Neo3RPCDomain);
    }

    public pushTxSource() {
        this.txSource.next('new');
    }

    public fetchTx(
        address: string,
        page: number,
        asset: string,
        maxId: number = -1
    ): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3TokenTxs(address, asset, maxId);
        }
        let url =
            `${this.global.apiDomain}/v1/neo2/transactions/${address}/${asset}` +
            `?count=10`;
        if (maxId !== -1) {
            url += `&max_id=${maxId - 1}`;
        }
        return this.http.get(url).pipe(
            map((res) => {
                return res || [];
            })
        );
    }

    public getAllTx(address: string, maxId: number = -1): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return;
        }
        let url =
            `${this.global.apiDomain}/v1/neo2/address/transactions/all?` +
            `address=${address}&count=10`;
        if (maxId !== -1) {
            url += `&max_id=${maxId - 1}`;
        }
        return this.http.get(url).pipe(
            map((res) => {
                return res || [];
            })
        );
    }

    getTxDetail(
        txid: string,
    ): Observable<any> {
        return this.http
            .get(`${this.global.apiDomain}/v1/neo2/transaction/${txid}`)
            .pipe(
                map((res) => {
                    return res || {};
                })
            );
    }

    //#region neo3
    /**
     * ?????????neo3 ?????????????????????????????? contract => asset_id
     * @param data ????????????
     */
    formatResponseData(data: any[]) {
        return data && data.map((item) => {
            item.asset_id = item.contract;
            item.value = item.amount;
            item.from = [item.from];
            item.to = [item.to];
            item.block_time /= 1000;
            if (item.contract === NEO3_CONTRACT) {
                item.symbol = 'NEO';
            }
            if (item.contract === GAS3_CONTRACT) {
                item.symbol = 'GAS';
            }
            return item;
        });
    }
    /**
     * ??????????????????????????????
     * @param address ??????
     * @param assetId ??????id
     * @param maxId maxid
     */
    fetchNeo3TokenTxs(
        address: string,
        assetId: string,
        maxId?: number
    ): Observable<any> {
        let req = `?address=${address}&contract=${assetId}&count=${TX_LIST_PAGE_SIZE}`;
        if (maxId !== -1) {
            req += `&max_id=${maxId - 1}`;
        }
        return this.http
            .get(`${this.global.apiDomain}/v1/neo3/address/transactions${req}`)
            .pipe(
                map((res) => {
                    return this.formatResponseData(res);
                })
            );
    }

    updateN3transactions() {
        this.chrome.getWallet().subscribe(wallet => {
            const address = wallet.accounts[0].address;
            this.chrome.getTransactions().subscribe(transactions => {
                transactions[address] = transactions[address] ? transactions[address] : [];
                transactions[address].forEach((item, index) => {
                    if (item.id === -1 || item.id === undefined) {
                        this.global.rpc3.getRawTransaction(item.txid, true).then(transactionDetail => {
                            transactions[address][index].id = transactionDetail && transactionDetail.nonce ? transactionDetail.nonce : -1;
                            this.chrome.setTransactions(transactions);
                        }).catch(error => {
                            console.log(error);
                        });
                    }
                });
            });
        });
    }
    //#endregion
}
