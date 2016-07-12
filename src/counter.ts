/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

import {ApiClient} from './client';
import {EventEmitter} from './events';

export class ApiCounter extends EventEmitter {

	private where: Object = {};

	public value: number = 0;

	private liveMode: boolean = true;
	private liveHandler = null;

	private queryCache: string;

	private initialized = false;
	private _rid: number = 0;

	constructor(private client: ApiClient, private service: string, private endpoint: string){

		super();

		this.client.on("open", () => {

			if (this.initialized){

				if (this.liveHandler)
					this.liveHandler.unsubscribe();

				this.setup();

			}

		})

	}

	public reload(){

		this.client.call(this.service, this.endpoint, "count", {
			where: this.where
		}).then((res) => {

			this.value = res;

		});

	}

	private setup(){

		this.reload();

		//Fetch live endpoint
		if(this.liveMode)
			this.client.call(this.service, this.endpoint, "live").then((res) => {

				this.client.subscribe(res.toString(), (update) => {

					this.reload();

				}).then((handler) => {

					this.liveHandler = handler;

				}, (err) => {
					console.error("Collection LIVE subscription error:", err);
				})

			}, (err) => {
				console.error("Collection LIVE error:", err);

			})

	}

	private fetchIfChanged(){

		var cache = JSON.stringify(this.where);

		if (this.queryCache == cache) return;

		this.queryCache = cache;
		this.setup();

	}

	public destroy(){

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

		this.removeAllListeners();

	}

	public init(where: Object = {}){

		this.where = where;
		this.initialized = true;

		this.setup();

	}

	public setWhere(where: Object){
		
		this.where = where;
		this.fetchIfChanged();

	}

	public setLive(val: boolean) {

		this.liveMode = val;

	}

}