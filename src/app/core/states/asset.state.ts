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
    public rpcClient;

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
        private neonService: NeonService
    ) {
        this.rpcClient = new rpc3.RPCClient('https://neo3-testnet.neoline.vip');
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
        let getBalance = this.rpcClient.getNep17Balances(address);
        if (this.neonService.currentWalletChainType === 'Neo3') {
            getBalance = this.rpcClient.getNep17Balances(address);
        }
        return forkJoin([getBalance]).pipe(
            map((res) => {
                const { balance } = (res[0] as any);
                const assets = Promise.all(balance.map(async item => {
                    const { amount, assethash } = item;
                    const symbolRes = await this.rpcClient.invokeFunction(assethash, 'symbol', []);
                    const decimalsRes = await this.rpcClient.invokeFunction(assethash, 'decimals', []);
                    if (symbolRes.state === 'HALT' && decimalsRes.state === 'HALT') {
                        return {
                            balance: bignumber(amount).dividedBy(bignumber(10).pow(decimalsRes.stack[0].value)).toFixed(),
                            asset_id: assethash,
                            decimals: decimalsRes.stack[0].value,
                            name: this.base64Decod(symbolRes.stack[0].value),
                            symbol: this.base64Decod(symbolRes.stack[0].value)
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
            a.readAsDataURL(res.response); // 读取文件保存在result中
            a.onload = (e: any) => {
                const getRes = e.target.result; // 读取的结果在result中
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
        const imageObj = this.assetFile.get(asset.asset_id);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            return imageObj['image-src'];
        }
        const assetRes = await this.getAssetImageFromUrl(
            asset.image_url,
            lastModified
        ).toPromise();
        if (assetRes && assetRes.status === 200) {
            const src = await this.setAssetFile(assetRes, asset.asset_id);
        } else if (assetRes && assetRes.status === 404) {
            return this.defaultAssetSrc;
        }
    }

    public getAssetImageFromAssetId(asset: string) {
        const imageObj = this.assetFile.get(asset);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            return imageObj['image-src'];
        } else {
            return this.defaultAssetSrc;
        }
    }

    public getNep5Detail(assetId: string): Observable<Nep5Detail> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3AssetDetail(assetId);
        }
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
     * 格式化neo3 接口返回数据，字段名 contract => asset_id
     * @param data 接口数据
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
     * 获取指定网络节点所有资产
     */
    fetchNeo3TokenList(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/assets`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    /**
     * 获取推荐资产
     */
    fetchNeo3PopularToken(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/allowlist`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    /**
     * 模糊搜素资产信息
     * @param query 搜索信息
     */
    searchNeo3Token(query: string): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/search/asset?q=${query}`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    fetchNeo3GasFee(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/fees`).pipe(
            map((res: any) => {
                res.slow_price = bignumber(res.slow_price).dividedBy(bignumber(10).pow(8)).toFixed();
                res.propose_price = bignumber(res.propose_price).dividedBy(bignumber(10).pow(8)).toFixed();
                res.fast_price = bignumber(res.fast_price).dividedBy(bignumber(10).pow(8)).toFixed();
                this.neo3GasFeeSpeed = res || this.gasFeeDefaultSpeed;
                return res || this.gasFeeDefaultSpeed;
            })
        );
    }

    /**
     * 获取资产详情
     * @param assetId 资产id
     */
    public fetchNeo3AssetDetail(assetId: string): Observable<any> {
        return this.http.get(
            `${this.global.apiDomain}/neo3/asset/${assetId}`
        ).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }
    //#endregion

    public base64Decod(value: string): string {
        return decodeURIComponent(window.atob(value));
    }
}
