import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';
import { Observable, Subject, from, of, forkJoin } from 'rxjs';
import { Asset, Balance, Nep5Detail } from 'src/models/models';
import { map, switchMap, refCount, publish } from 'rxjs/operators';
import { GasFeeSpeed } from '@popup/_lib/type';
import { bignumber } from 'mathjs';
import { rpc as rpc2 } from '@cityofzion/neon-js';
import { rpc as rpc3 } from '@cityofzion/neon-core-neo3';
import { NeonService } from '../services/neon.service';
import { NEO3_CONTRACT, GAS3_CONTRACT } from '@popup/_lib';

@Injectable()
export class AssetState {
    public assetFile: Map<string, {}> = new Map();
    public defaultAssetSrc = '/assets/images/default_asset_logo.jpg';
    public $webAddAssetId: Subject<Balance> = new Subject();
    public $webDelAssetId: Subject<string> = new Subject();
    public assetRate: Map<string, {}> = new Map();
    public rateCurrency: string;

    public balanceSource = new Subject<Balance[]>();
    public balanceSub$ = this.balanceSource.asObservable();
    public gasFeeSpeed: GasFeeSpeed;
    public neo3GasFeeSpeed: GasFeeSpeed;
    public gasFeeDefaultSpeed: GasFeeSpeed = {
        slow_price: '0',
        propose_price: '0.011',
        fast_price: '0.2',
    };

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
        private neonService: NeonService
    ) {
        this.chrome.getAssetFile().subscribe((res) => {
            this.assetFile = res;
        });
        this.chrome.getRateCurrency().subscribe((res) => {
            this.rateCurrency = res;
            this.changeRateCurrency(res);
        });
    }

    public pushBalance(balance: Balance[]) {
        this.balanceSource.next(balance);
    }
    public changeRateCurrency(currency) {
        this.rateCurrency = currency;
        if (currency === 'CNY') {
            this.chrome.getAssetCNYRate().subscribe((res) => {
                this.assetRate = res;
            });
        } else {
            this.chrome.getAssetUSDRate().subscribe((res) => {
                this.assetRate = res;
            });
        }
    }

    public pushDelAssetId(id) {
        this.$webDelAssetId.next(id);
    }

    public popDelAssetId(): Observable<any> {
        return this.$webDelAssetId.pipe(publish(), refCount());
    }

    public pushAddAssetId(id) {
        this.$webAddAssetId.next(id);
    }

    public popAddAssetId(): Observable<any> {
        return this.$webAddAssetId.pipe(publish(), refCount());
    }

    public clearCache() {
        this.assetFile = new Map();
        this.assetRate = new Map();
    }

    public detail(address: string, id: string): Observable<Balance> {
        return this.fetchBalance(address).pipe(
            switchMap((balance) =>
                this.chrome
                    .getWatch(address, this.neonService.currentWalletChainType)
                    .pipe(
                        map((watching) => {
                            return (
                                balance.find((e) => e.asset_id === id) ||
                                watching.find((w) => w.asset_id === id)
                            );
                        })
                    )
            )
        );
    }

    public fetchBalance(address: string): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.getN3Balance(address);
        }
        return this.http
            .get(
                `${this.global.apiDomain}/v1/neo2/address/assets?address=${address}`
            )
            .pipe(
                map((res) => {
                    const result = [];
                    res.asset = res.asset || [];
                    res.nep5 = res.nep5 || [];
                    res.asset.forEach((item) => {
                        result.push(item);
                    });
                    res.nep5.forEach((item) => {
                        result.push(item);
                    });
                    return result;
                })
            );
    }

    public getN3Balance(address: string): Observable<any> {
        const getBalance = this.global.rpc3.getNep17Balances(address);
        return forkJoin([getBalance]).pipe(
            map(async (res) => {
                const { balance } = (res[0] as any);
                const assets = await Promise.all(balance.map(async item => {
                    const { amount, assethash } = item;
                    const symbolRes = await this.global.rpc3.invokeFunction(assethash, 'symbol', []);
                    const decimalsRes = await this.global.rpc3.invokeFunction(assethash, 'decimals', []);
                    if (symbolRes.state === 'HALT' && decimalsRes.state === 'HALT') {
                        return {
                            balance: bignumber(amount).dividedBy(bignumber(10).pow(decimalsRes.stack[0].value)).toFixed(),
                            asset_id: assethash,
                            decimals: decimalsRes.stack[0].value,
                            name: this.base64Decod(symbolRes.stack[0].value),
                            symbol: this.base64Decod(symbolRes.stack[0].value),
                            type: 'nep17'
                        }
                    }
                }));
                return assets;
            })
        );
    }

    public fetchClaim(address: string): Observable<any> {
        const getClaimable = from(
            rpc2.Query.getClaimable(address).execute(this.global.RPCDomain)
        );
        const getUnclaimed = from(
            rpc2.Query.getUnclaimed(address).execute(this.global.RPCDomain)
        );
        return forkJoin([getClaimable, getUnclaimed]).pipe(
            map((res) => {
                const result = {
                    available: 0,
                    unavailable: 0,
                    claimable: [],
                };
                const claimableData = res[0];
                const unclaimed = res[1];
                result.available = unclaimed.result.available || 0;
                result.unavailable = unclaimed.result.unavailable || 0;
                result.claimable = claimableData.result.claimable || [];
                return result;
            })
        );
    }

    public fetchAll(): Promise<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3TokenList().toPromise();
        }
        return this.http
            .get(`${this.global.apiDomain}/v1/neo2/assets`)
            .toPromise();
    }

    public fetchAllowList(): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3PopularToken();
        }
        return from(
            this.http
                .get(`${this.global.apiDomain}/v1/neo2/allowlist`)
                .toPromise()
        ).pipe(
            map((res) => {
                return res || [];
            })
        );
    }

    public searchAsset(query: string): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.searchNeo3Token(query);
        }
        return this.http.get(
            `${this.global.apiDomain}/v1/neo2/search/asset?q=${query}`
        );
    }

    public getAssetImageFromUrl(url: string, lastModified: string) {
        return this.http.getImage(url, lastModified);
    }

    public setAssetFile(res: XMLHttpRequest, assetId: string): Promise<any> {
        const temp = {};
        temp['last-modified'] = res.getResponseHeader('Last-Modified');
        return new Promise((resolve, reject) => {
            const a = new FileReader();
            a.readAsDataURL(res.response); // ?????????????????????result???
            a.onload = (e: any) => {
                const getRes = e.target.result; // ??????????????????result???
                temp['image-src'] = getRes;
                this.assetFile.set(assetId, temp);
                this.chrome.setAssetFile(this.assetFile);
                resolve(getRes);
            };
        });
    }
    public getRate(): Observable<any> {
        return this.http.get(
            `${this.global.apiDomain}/v1/coin/rates?chain=neo`
        );
    }

    public getFiatRate(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/fiat/rates`);
    }

    public async getAssetImage(asset: Asset) {
        // const imageObj = this.assetFile.get(asset.asset_id);
        // let lastModified = '';
        // if (imageObj) {
        //     lastModified = imageObj['last-modified'];
        //     return imageObj['image-src'];
        // }
        // const assetRes = await this.getAssetImageFromUrl(
        //     asset.image_url,
        //     lastModified
        // ).toPromise();
        // if (assetRes && assetRes.status === 200) {
        //     const src = await this.setAssetFile(assetRes, asset.asset_id);
        // } else if (assetRes && assetRes.status === 404) {
            return this.defaultAssetSrc;
        // }
    }

    public getAssetImageFromAssetId(asset: string) {
        // const imageObj = this.assetFile.get(asset);
        // let lastModified = '';
        // if (imageObj) {
        //     lastModified = imageObj['last-modified'];
        //     return imageObj['image-src'];
        // } else {
            return this.defaultAssetSrc;
        // }
    }

    public getNep5Detail(assetId: string): Observable<Nep5Detail> {
        return this.http.get(
            `${this.global.apiDomain}/v1/neo2/nep5/${assetId}`
        );
    }

    public getGasFee(): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3GasFee();
        }
        return this.http.get(`${this.global.apiDomain}/v1/neo2/fees`).pipe(
            map((res: any) => {
                this.gasFeeSpeed = res || this.gasFeeDefaultSpeed;
                return res || this.gasFeeDefaultSpeed;
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
     * ????????????????????????????????????
     */
    fetchNeo3TokenList(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/assets`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    /**
     * ??????????????????
     */
    fetchNeo3PopularToken(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/allowlist`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    /**
     * ????????????????????????
     * @param query ????????????
     */
    searchNeo3Token(query: string): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/search/asset?q=${query}`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    fetchNeo3GasFee(): Observable<any> {
        return new Observable((observer) => {
            return observer.next({
                slow_price: bignumber(100000).dividedBy(bignumber(10).pow(8)).toFixed(),
                propose_price: bignumber(500000).dividedBy(bignumber(10).pow(8)).toFixed(),
                fast_price: bignumber(1000000).dividedBy(bignumber(10).pow(8)).toFixed()
            });
        });
    }

    public base64Decod(value: string): string {
        return decodeURIComponent(window.atob(value));
    }
    //#endregion
}
