/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

import {ApiClient} from './client';

export class ApiCollection {

	private properties: Array<String> = [];
	private where: Object = {};
	private sort: Object = {};
	private skip: number = 0;
	private limit: number = null;

	public records: Array<Object>;
	public index: Object;
	public count: number = 0;
	public total: number = 0;

	public pages = [];
	public page = 0;

	private appendMode: boolean = false;
	private clearRecords: boolean = false;

	public loaded = false;

	private liveHandler = null;

	private initialized = false;
	private queryCache: string;

	constructor(private client: ApiClient, private service: string, private endpoint: string){

		this.client.on("open", () => {

			if (this.initialized){
				
				this.clearRecords = true;

				if (this.liveHandler)
					this.liveHandler.unsubscribe();

				this.fetchRecords();

			}

		})

	}

	private applyUpdate(update: any){
		
		update.record["$imported"] = (new Date()).getTime();
			
		switch(update.op){
			case 'insert':
				this.records.unshift(update.record);
				this.index[(update.record._id ? update.record._id : this.records.length)] = update.record;
				this.count++;
				this.total++;
				break;

			case 'update':
				if(update.record._id && this.index[update.record._id]){
					for (var i in update.record)
						this.index[update.record._id][i] = update.record[i];
				} else {
					this.records.unshift(update.record);
					this.index[(update.record._id ? update.record._id : this.records.length)] = update.record;
					this.count++;
					this.total++;
				}
				break;

			case 'delete':
				if (update.record._id && this.index[update.record._id]) {
					var d = this.records.indexOf(this.index[update.record._id]);

					if (d >= 0)
						this.records.splice(d, 1);

					delete this.index[update.record._id];

					this.count--;
				}
				
				this.total--;

				break;
		}

	}

	private createQuery(withPagination: boolean = true){

		var query = {
			properties: this.properties,
			where: this.where,
			sort: this.sort,
			skip: null,
			limit: null
		};

		if (withPagination){
			query.skip = this.skip;
			query.limit = this.limit;
		}

		return query;

	}

	private fetchRecords(){

		this.loaded = false;

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

		var query = this.createQuery();
		var liveQuery = this.createQuery(false);

		this.client.call(this.service, this.endpoint, "query", query).then((res) => {

			if (this.clearRecords) {
				this.records = [];
				this.index = {};
				this.count = 0;
			}

			if (this.appendMode && this.records instanceof Array) {
				this.records = this.records.concat(res.records);
				this.count += res.count;
			} else {
				this.records = res.records;
				this.count = res.count;
				this.index = {};
			}

			this.total = res.total;
			this.clearRecords = false;

			this.pages = [];
			this.page = Math.ceil(this.skip / this.limit);

			for (var p = 0; p < Math.ceil(this.total / this.limit); p++)
				this.pages.push(p);

			for (var i in res.records)
				this.index[(res.records[i]._id ? res.records[i]._id : i)] = res.records[i];

			this.loaded = true;

			//Fetch live endpoint
			this.client.call(this.service, this.endpoint, "live", liveQuery).then((res) => {

				this.client.subscribe(res.toString(), (update) => {

					this.applyUpdate(update);

				}).then((handler) => {

					this.liveHandler = handler;

				}, (err) => {
					console.error("Collection LIVE subscription error:", err);
				})

			}, (err) => {
				console.error("Collection LIVE error:", err);

			})

		}, (err) => {
			console.error("Collection error:", err);
		});

	}

	private fetchIfChanged(){

		var cache = JSON.stringify(this.createQuery());

		if (this.queryCache == cache) return;

		this.queryCache = cache;
		this.fetchRecords();

	}

	public init(properties: Array<String> = [], where: Object = {}, sort: Object = {}, limit: number = 100){

		this.properties = properties;
		this.where = where;
		this.sort = sort;
		this.limit = limit;

		this.initialized = true;

		this.fetchRecords();

	}

	public destroy(){

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

	}

	public setWhere(where: Object){
		
		this.clearRecords = true;
		this.skip = 0;
		this.where = where;


		this.fetchIfChanged();

	}

	public setSort(sort: Object) {

		this.clearRecords = true;
		this.sort = sort;
		this.skip = 0;

		this.fetchIfChanged();

	}

	public setProperties(properties: Array<String>) {

		this.clearRecords = true;
		this.properties = properties;
		this.skip = 0;

		this.fetchIfChanged();

	}

	public setPagination(skip: number, limit: number){

		this.clearRecords = true;
		this.skip = skip;
		this.limit = limit;
		
		this.fetchIfChanged();

	}

	public setPage(num: number){

		this.clearRecords = true;
		this.skip = num * this.limit;
		this.fetchIfChanged();

	}

	public loadMore(){

		this.page += 1;
		this.skip = this.page * this.limit;

		if(this.skip < this.total)
			this.fetchIfChanged();

	}

	public setAppend(val: boolean){

		this.appendMode = val;

	}

}