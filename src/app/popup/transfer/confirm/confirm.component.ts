import {
    Component,
    OnInit,
    Inject
} from '@angular/core';
import {
    MatDialogRef, MAT_DIALOG_DATA, MatDialog,
} from '@angular/material/dialog';

import {
    ChromeService, AssetState, NeonService, GlobalService,
} from '@app/core';
import { NEO, GAS } from '@/models/models';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { forkJoin } from 'rxjs';
import { bignumber } from 'mathjs';

@Component({
    templateUrl: 'confirm.component.html',
    styleUrls: ['confirm.component.scss']
})
export class PopupTransferConfirmComponent implements OnInit {
    public logoUrlArr = [];
    public net = '';
    public fromName: string = '';
    public assetImageUrl: string = '';
    public datajson: any = {};
    public symbol = ''
    public money;
    public feeMoney;
    public totalMoney;
    public systemFeeMoney;
    public networkFeeMoney;
    public totalFee;
    public rateCurrency = ''

    isNeo3 = false;
    constructor(
        private dialog: MatDialog,
        private dialogRef: MatDialogRef<PopupTransferConfirmComponent>,
        private neon: NeonService,
        private assetState: AssetState,
        private global: GlobalService,
        @Inject(MAT_DIALOG_DATA) public data: {
            fromAddress: string ,
            toAddress: string,
            symbol: string,
            asset: string,
            amount: string,
            remark: string,
            fee: string,
            networkFee?: any,
            systemFee?: any,
            network: string,
            broadcastOverride: boolean,
            txSerialize: string
        } = {
            fromAddress: '',
            toAddress: '',
            symbol: '',
            asset: '',
            amount: '0',
            remark: '',
            fee: '0',
            network: '',
            broadcastOverride: false,
            txSerialize: '',
            networkFee: 0,
            systemFee: 0
        },
    ) {
        if (this.neon.currentWalletChainType === 'Neo3') {
            this.isNeo3 = true;
        }
    }

    async ngOnInit() {
        const wallet = this.neon.wallet;
        this.fromName = wallet.name;
        this.rateCurrency = this.assetState.rateCurrency;
        this.assetImageUrl = await this.assetState.getAssetImageFromAssetId(this.data.asset);
        for(const key in this.data) {
            if(this.data[key] !== '' && key !== 'txSerialize') {
                this.datajson[key] = this.data[key];
            }
        }
        this.net = this.global.net;
        this.getSymbol();
    }

    private async getSymbol() {
        if(this.data.asset === NEO) {
            this.symbol = 'NEO'
            return
        }
        if(this.data.asset === GAS) {
            this.symbol = 'GAS'
            return
        }
        if(this.data.symbol === '') {
            this.symbol = (await this.assetState.getNep5Detail(this.data.asset).toPromise()).symbol;
        } else {
            this.symbol = this.data.symbol;
        }
    }

    public editFee() {
        this.dialog.open(PopupEditFeeDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                fee: this.data.fee
            }
        }).afterClosed().subscribe(res => {
            if (res !== false) {
                this.data.fee = res;
                this.datajson.fee = res;
            }
        })
    }

    public confirm() {
        this.dialogRef.close(this.data.fee);
    }

    public exit() {
        this.dialogRef.close(false);
    }

    public getAddressSub(address: string) {
        return `${address.substr(0, 3)}...${address.substr(address.length - 4, address.length - 1)} `
    }
}
