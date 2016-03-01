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

	private liveHandler = null;

	constructor(private client: ApiClient, private service: string, private endpoint: string){

	}

	private applyUpdate(update: any){
		
		switch(update.op){
			case 'insert':
				this.records.push(update.record);
				this.index[(update.record._id ? update.record._id : this.records.length)] = update.record;
				this.count++;
				this.total++;
				break;

			case 'update':
				if(update.record._id && this.index[update.record._id]){
					for (var i in update.record)
						this.index[update.record._id][i] = update.record[i];
				} else {
					this.records.push(update.record);
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

	private fetchRecords(){

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

		var query = {
			properties: this.properties,
			where: this.where,
			sort: this.sort,
			skip: this.skip,
			limit: this.limit
		};

		this.client.call(this.service, this.endpoint, "query", query).then((res) => {

			this.records = res.records;
			this.index = {};
			this.count = res.count;
			this.total = res.total;

			this.pages = [];
			this.page = Math.ceil(this.skip / this.limit);

			for (var p = 0; p < Math.ceil(this.total / this.limit); p++)
				this.pages.push(p);

			for (var i in res.records)
				this.index[(res.records[i]._id ? res.records[i]._id : i ) ] = res.records[i];

			//Fetch live endpoint
			this.client.call(this.service, this.endpoint, "live", query).then((res) => {

				var channelName = res.service + ":/" + res.endpoint + "#" + res.id;

				this.client.subscribe(channelName, (update) => {

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
		})

	}

	public init(properties: Array<String> = [], where: Object = {}, sort: Object = {}, limit: number = 100){

		this.properties = properties;
		this.where = where;
		this.sort = sort;
		this.limit = limit;

		this.fetchRecords();

	}

	public setWhere(where: Object){
		
		this.where = where;
		this.fetchRecords();

	}

	public setSort(sort: Object) {

		this.sort = sort;
		this.fetchRecords();

	}

	public setProperties(properties: Array<String>) {

		this.properties = properties;
		this.fetchRecords();

	}

	public setPagination(skip: number, limit: number){

		this.skip = skip;
		this.limit = limit;
		
		this.fetchRecords();

	}

	public setPage(num: number){

		this.skip = num * this.limit;
		this.fetchRecords();

	}

}