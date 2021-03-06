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
    Balance, NEO
} from '@/models/models';
import { tx as tx2, u } from '@cityofzion/neon-js';
import {
    Transaction
} from '@cityofzion/neon-core/lib/tx';
import {
    TransferService
} from '@/app/transfer/transfer.service';
import { ERRORS, requestTarget } from '@/models/dapi';
import { rpc } from '@cityofzion/neon-js';
import { MatDialog } from '@angular/material/dialog';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { bignumber } from 'mathjs';
import { GasFeeSpeed } from '../../_lib/type';

@Component({
    templateUrl: 'transfer.component.html',
    styleUrls: ['transfer.component.scss']
})
export class PopupNoticeTransferComponent implements OnInit, AfterViewInit {

    public dataJson: any = {};
    public rateCurrency = '';
    public txSerialize = ''
    public assetImageUrl = '';
    public tx: Transaction;
    public money = '';
    public feeMoney = '0';
    public totalMoney = '';

    public balance: Balance;
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
        private dialog: MatDialog
    ) { }

    ngOnInit(): void {
        this.assetImageUrl = this.asset.getAssetImageFromAssetId(NEO)
        this.rateCurrency = this.asset.rateCurrency
        this.fromAddress = this.neon.address;
        this.wallet = this.neon.wallet;
        this.aRoute.queryParams.subscribe((params: any) => {
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
                    return: requestTarget.Send,
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
            // this.fee = params.fee || 0;
            if (params.fee) {
                this.fee = parseFloat(params.fee);
            } else {
                if (this.asset.gasFeeSpeed) {
                    this.fee = Number(this.asset.gasFeeSpeed.propose_price);
                } else {
                    this.asset.getGasFee().subscribe((res: GasFeeSpeed) => {
                        this.fee = Number(res.propose_price);
                    });
                }
            }
            this.remark = params.remark || '';
            if (this.assetId !== undefined && this.assetId !== '') {
                this.asset.detail(this.neon.address, this.assetId).subscribe((res: Balance) => {
                    this.init = true;
                    this.symbol = res.symbol;
                    this.balance = res;
                    this.submit();
                });
            } else {
                this.asset.fetchBalance(this.neon.address).subscribe(res => {
                    const filterAsset = res.filter(item => item.asset_id === params.asset);
                    if (filterAsset.length > 0) {
                        this.init = true;
                        this.symbol = filterAsset[0].symbol;
                        this.balance = filterAsset[0];
                    } else {
                        this.global.snackBarTip('balanceLack');
                        return;
                    }
                    this.submit();
                });
            }
        });
    }

    ngAfterViewInit(): void { }

    public submit() {
        this.loading = true;
        this.loadingMsg = 'Loading';
        if (this.balance.balance === undefined || bignumber(this.balance.balance ).comparedTo(0) < 1) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        if (bignumber(this.balance.balance.toString()).comparedTo(bignumber(this.amount.toString())) === -1  || this.amount === '0') {
            this.global.snackBarTip('balanceLack');
            return;
        }
        this.creating = true;
        this.asset.detail(this.neon.address, this.assetId).subscribe((res: Balance) => {
            this.loading = false;
            this.loadingMsg = '';
            this.balance = res;
            this.transfer.create(this.fromAddress, this.toAddress, this.assetId, this.amount, this.fee, res.decimals,
                this.broadcastOverride).subscribe((tx) => {
                    if(this.remark !== '') {
                        tx.addAttribute(
                            tx2.TxAttrUsage.Remark2,
                            u.str2hexstring(this.remark)
                        );
                    }
                    this.resolveSign(tx);
                }, (err) => {
                    this.creating = false;
                    this.global.snackBarTip('wentWrong');
                });
        });

    }

    public cancel() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTarget.Send,
            ID: this.messageID
        });
        window.close();
    }

    private resolveSign(transaction: Transaction) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        try {
            const wif = this.neon.WIFArr[
                this.neon.walletArr.findIndex(item => item.accounts[0].address === this.neon.wallet.accounts[0].address)
            ]
            try {
                transaction.sign(wif);
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
                return: requestTarget.Invoke,
                ID: this.messageID
            });
            window.close();
        }
    }

    private resolveSend(tx: Transaction) {
        this.loadingMsg = 'Wait';
        this.loading = true;
        return rpc.Query.sendRawTransaction(tx.serialize(true)).execute(this.global.RPCDomain).then(async res => {
            if (
                !res.result ||
                (res.result && typeof res.result === 'object' && res.result.succeed === false)
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
                    txid: tx.hash,
                    nodeUrl: `${this.global.RPCDomain}`
                },
                return: requestTarget.Send,
                ID: this.messageID
            });
            const setData = {};
            setData[`${this.network}TxArr`] = await this.chrome.getLocalStorage(`${this.network}TxArr`) || [];
            setData[`${this.network}TxArr`].push('0x' + tx.hash);
            this.chrome.setLocalStorage(setData);
            this.router.navigate([{
                outlets: {
                    transfer: ['transfer', 'result']
                }
            }]);
        }).catch(err => {
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            this.chrome.windowCallback({
                error: ERRORS.RPC_ERROR,
                return: requestTarget.Send,
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
            return: requestTarget.Send,
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
                return: requestTarget.Send,
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
            if (res !== false) {
                this.submit();
            }
        })
    }

    public getAddressSub(address: string) {
        return `${address.substr(0, 3)}...${address.substr(address.length - 4, address.length - 1)} `
    }

}
