import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TransactionState, NeonService } from '@/app/core';

@Component({
    templateUrl: 'tx-detail.dialog.html',
    styleUrls: ['tx-detail.dialog.scss'],
})
export class PopupTxDetailDialogComponent {
    txDetail: any;

    constructor(
        private txState: TransactionState,
        private neonService: NeonService,
        private neon: NeonService,
        @Inject(MAT_DIALOG_DATA)
        public data: {
            tx: any;
            symbol: string;
            address: string;
            assetId: string;
        }
    ) {
        if (this.neon.currentWalletChainType === 'Neo2') {
            this.txState
            .getTxDetail(
                this.data.tx.txid
            )
            .subscribe((res) => {
                this.txDetail = res;
                switch (this.neonService.currentWalletChainType) {
                    case 'Neo2':
                        this.txDetail.vin = this.txDetail.vin.reduce(
                            (prev, element) => {
                                if (
                                    !prev.find(
                                        (item) => item === element.address
                                    )
                                ) {
                                    prev.push(element.address);
                                }
                                return prev;
                            },
                            []
                        );
                        this.txDetail.vout = this.txDetail.vout.reduce(
                            (prev, element) => {
                                if (
                                    !prev.find(
                                        (item) => item === element.address
                                    )
                                ) {
                                    prev.push(element.address);
                                }
                                return prev;
                            },
                            []
                        );
                        break;
                }
            });
        }
    }
}
