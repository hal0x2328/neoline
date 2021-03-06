import {
    Component,
    OnInit,
    AfterViewInit
} from '@angular/core';
import {
    ActivatedRoute,
    Router
} from '@angular/router';
import {
    AssetState,
    NeonService,
    HttpService,
    GlobalService,
    ChromeService,
    TransactionState
} from '@/app/core';
import {
    NEO
} from '@/models/models';
import {
    Transaction as Transaction3
} from '@cityofzion/neon-core-neo3/lib/tx';
import {
    TransferService
} from '@/app/popup/transfer/transfer.service';
import { ERRORS } from '@/models/dapi';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { rpc } from '@cityofzion/neon-core-neo3/lib';
import { MatDialog } from '@angular/material/dialog';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { bignumber } from 'mathjs';
import { GasFeeSpeed } from '../../_lib/type';
import { Neo3TransferService } from '../../transfer/neo3-transfer.service';

@Component({
    templateUrl: 'neo3-transfer.component.html',
    styleUrls: ['neo3-transfer.component.scss']
})
export class PopupNoticeNeo3TransferComponent implements OnInit, AfterViewInit {
    public rpcClient;
    public dataJson: any = {};
    public rateCurrency = '';
    public txSerialize = '';
    public assetImageUrl = '';
    public tx: Transaction3;
    public money = '';
    public feeMoney = '0';
    public totalMoney = '';

    public balance: any;
    public creating = false;
    public fromAddress: string = '';
    public toAddress: string = '';
    public assetId: string = '';
    public symbol: string = '';
    public amount: string = '0';
    public remark: string = '';
    private network: string = '';
    public loading = false;
    public loadingMsg: string;
    public wallet: any;

    public fee: number;
    public init = false;
    private broadcastOverride = false;
    private messageID = 0;

    public net: string;
    constructor(
        private router: Router,
        private aRoute: ActivatedRoute,
        private asset: AssetState,
        private transfer: TransferService,
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
        private txState: TransactionState,
        private dialog: MatDialog,
        private neo3Transfer: Neo3TransferService,
        private globalService: GlobalService,
    ) {
        this.rpcClient = new rpc.RPCClient(this.globalService.Neo3RPCDomain);
    }

    ngOnInit(): void {
        this.assetImageUrl = this.asset.getAssetImageFromAssetId(NEO)
        this.rateCurrency = this.asset.rateCurrency
        this.fromAddress = this.neon.address;
        this.wallet = this.neon.wallet;
        this.aRoute.queryParams.subscribe(async (params: any) => {
            const pramsData = JSON.parse(JSON.stringify(params));
            this.dataJson = JSON.stringify(params);
            this.messageID = params.messageID;
            if (JSON.stringify(params) === '{}') {
                return;
            }
            for (const key in pramsData) {
                if (Object.prototype.hasOwnProperty.call(pramsData, key)) {
                    let tempObject: any
                    try {
                        tempObject = pramsData[key].replace(/([a-zA-Z0-9]+?):/g, '"$1":').replace(/'/g, '"');
                        tempObject = JSON.parse(tempObject);
                    } catch (error) {
                        tempObject = pramsData[key];
                    };
                    pramsData[key] = tempObject;
                }
            }
            this.dataJson = pramsData;
            this.dataJson.messageID = undefined;
            this.broadcastOverride = (params.broadcastOverride === 'true' || params.broadcastOverride === true);
            window.onbeforeunload = () => {
                this.chrome.windowCallback({
                    error: ERRORS.CANCELLED,
                    return: requestTargetN3.Send,
                    ID: this.messageID
                });
            };
            if (params.network === 'MainNet') {
                this.global.modifyNet('MainNet');
            } else {
                this.global.modifyNet('TestNet');
            }
            this.net = this.global.net;
            this.network = params.network || 'MainNet';
            this.toAddress = params.toAddress || '';
            this.assetId = params.asset || '';
            this.amount = params.amount || 0;
            this.symbol = params.symbol || '';
            this.fee = params.fee || 0;
            if (params.fee) {
                this.fee = parseFloat(params.fee);
            } else {
                if (this.asset.gasFeeSpeed) {
                    this.fee = Number(this.asset.gasFeeSpeed.propose_price);
                } else {
                    this.asset.fetchNeo3GasFee().subscribe((res: GasFeeSpeed) => {
                        this.fee = Number(res.propose_price);
                    });
                }
            }
            this.remark = params.remark || '';
            this.asset.fetchBalance(this.neon.address).subscribe(async res => {
                const assets = await res;
                const filterAsset = assets.filter(item => item.asset_id === params.asset);
                if (filterAsset.length > 0) {
                    this.init = true;
                    this.symbol = filterAsset[0].symbol;
                    this.balance = filterAsset[0];
                    this.submit();
                }
            });
        });
    }

    ngAfterViewInit(): void { }

    public submit() {
        this.loading = true;
        this.loadingMsg = 'Loading';
        this.creating = true;
        this.loading = false;
        this.loadingMsg = '';
        this.transfer.create(this.fromAddress, this.toAddress, this.assetId, this.amount, this.fee, this.balance.decimals,
            this.broadcastOverride).subscribe((tx) => {
                this.resolveSign(tx);
            }, (err) => {
                this.creating = false;
                this.global.snackBarTip('wentWrong');
            });
    }

    public cancel() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTargetN3.Send,
            ID: this.messageID
        });
        window.close();
    }


    private resolveSign(transaction) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        try {
            const wif = this.neon.WIFArr[
                this.neon.walletArr.findIndex(item => item.accounts[0].address === this.neon.wallet.accounts[0].address)
            ]
            try {
                transaction.sign(wif, this.globalService.n3MagicNumberTestnet);
            } catch (error) {
                console.log(error);
            }
            this.tx = transaction;
            this.txSerialize = this.tx.serialize(true);
            this.loading = false
            this.loadingMsg = '';
            this.creating = false;
        } catch (error) {
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            this.global.snackBarTip('verifyFailed', error);
            this.chrome.windowCallback({
                error: ERRORS.DEFAULT,
                return: requestTargetN3.Send,
                ID: this.messageID
            });
            window.close();
        }
    }

    private resolveSend(tx: Transaction3) {
        this.loadingMsg = 'Wait';
        this.loading = true;
        return this.rpcClient.sendRawTransaction(this.neo3Transfer.hexToBase64(tx.serialize(true))).then(async TxHash => {
            if (
                !TxHash
            ) {
                throw {
                    msg: 'Transaction rejected by RPC node.'
                };
            }
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            if (this.fromAddress !== this.toAddress) {
                const txTarget = {
                    txid: '0x' + tx.hash,
                    value: -this.amount,
                    block_time: new Date().getTime() / 1000
                };
                this.pushTransaction(txTarget);
            }
            this.chrome.windowCallback({
                data: {
                    txid: TxHash,
                    nodeUrl: `${this.global.Neo3RPCDomain}`
                },
                return: requestTargetN3.Send,
                ID: this.messageID
            });
            const sendTx = {
                txid: TxHash,
                from: this.fromAddress,
                to: this.toAddress,
                value: -this.amount,
                block_time: new Date().getTime() / 1000,
                asset_id: this.assetId,
                symbol: this.symbol,
                id: -1
            };
            if (this.neon.currentWalletChainType === 'Neo3') {
                this.chrome.getTransactions().subscribe(transactions => {
                    let addressTxs = transactions[this.fromAddress] ? transactions[this.fromAddress] : [];
                    addressTxs = [...addressTxs]
                    transactions[this.fromAddress] = [sendTx, ...addressTxs];
                    this.chrome.setTransactions(transactions);
                });
            }
            const setData = {};
            setData[`N3${this.network}TxArr`] = await this.chrome.getLocalStorage(`N3${this.network}TxArr`) || [];
            setData[`N3${this.network}TxArr`].push(TxHash);
            this.chrome.setLocalStorage(setData);
            this.router.navigate([{
                outlets: {
                    transfer: ['transfer', 'result']
                }
            }]);
        }).catch(err => {
            console.log(err)
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            this.chrome.windowCallback({
                error: ERRORS.RPC_ERROR,
                return: requestTargetN3.Send,
                ID: this.messageID
            });
            this.global.snackBarTip('transferFailed', err.msg || err);
        });
    }

    public pushTransaction(transaction: object) {
        const net = this.net;
        const address = this.fromAddress;
        const assetId = this.assetId;
        this.chrome.getTransaction().subscribe(res => {
            if (res === null || res === undefined) {
                res = {};
            }
            if (res[net] === undefined) {
                res[net] = {};
            }
            if (res[net][address] === undefined) {
                res[net][address] = {};
            }
            if (res[net][address][assetId] === undefined) {
                res[net][address][assetId] = [];
            }
            res[net][address][assetId].unshift(transaction);
            this.chrome.setTransaction(res);
            this.txState.pushTxSource();
        });
    }

    public exit() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTargetN3.Send,
            ID: this.messageID
        });
        window.close();
    }

    public confirm() {
        if (this.creating) {
            return;
        }
        if (this.broadcastOverride) {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: {
                    txid: this.tx.hash,
                    signedTx: this.tx.serialize(true)
                },
                return: requestTargetN3.Send,
                ID: this.messageID
            });
            window.close();
        } else {
            this.resolveSend(this.tx);
        }
    }
    public editFee() {
        this.dialog.open(PopupEditFeeDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                fee: this.fee
            }
        }).afterClosed().subscribe(res => {
            if (res) {
                this.fee = res;
                this.submit();
            }
        });
    }

    public getAddressSub(address: string) {
        return `${address.substr(0, 3)}...${address.substr(address.length - 4, address.length - 1)} `
    }

}
