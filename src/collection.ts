/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

import {ApiClient} from './client';
import {EventEmitter} from './events';

export class ApiCollection extends EventEmitter {

	private properties: Array<String> = [];
	private resolve: Array<String> = ["*"];
	private where: Object = {};
	private sort: Object = {};
	private skip: number = 0;
	private limit: number = null;

	public records: Array<Object> = [];
	public index: any = {};
	public count: number = 0;
	public total: number = 0;

	public pages = [];
	public page = 0;

	private appendMode: boolean = false;
	private liveMode: boolean = true;
	private clearRecords: boolean = false;
	private _rid: number = 0;

	public loaded = false;

	private liveHandler = null;

	private initialized = false;
	private queryCache: string;

	constructor(private client: ApiClient, private service: string, private endpoint: string){

		super();

		this.client.on("open", () => {

			if (this.initialized){
				
				this.clearRecords = true;

				if (this.liveHandler)
					this.liveHandler.unsubscribe();

				if(this.appendMode)
					this.skip = 0;

				this.fetchRecords();

			}

		})

	}

	private genAnonId(){

		return (new Date()).getTime() + ":" + Math.random();

	}

	private updateRecord(record: any, data: any){

		for (var i in data)
			record[i] = data[i];

	}

	private updateRecords(records: any, clear: boolean){

		var now = (new Date()).getTime();

		if (clear)
			this.index = {};

		//Update index
		for (var i in records){

			var _id = (records[i]._id ? records[i]._id : this.genAnonId());

			records[i]["$__ref"] = _id;

			if (this.index[_id])
				this.updateRecord(this.index[_id], records[i]);
			else
				this.index[_id] = records[i];

			this.index[_id]["$__loaded"] = now;

		}

		//Remove old indexed values
		if(clear)
			for (var j in this.index)
				if (this.index[j]._deleted)
					this.index[j] = { _deleted: true }
				else if (this.index[j]["$__loaded"] != now)
					delete this.index[j];

		//Resort array
		var newRecords = (clear ? [] : this.records);

		for (var k in records){
			
			newRecords.push(this.index[ records[k]["$__ref"] ]);

		}

		//Flop
		this.records = newRecords;

	}

	private applyUpdate(update: any){
		
		//console.log("COLL LIVE UPDATE", update);

		//Get id
		var _id = (update.record._id ? update.record._id : this.genAnonId());
		var now = (new Date()).getTime();

		//Set imported
		update.record["$__imported"] = now;
			
		var removeRecord = () => {

			if (this.index[_id]) {

				if (this.index[_id]._deleted) return;

				var d = this.records.indexOf(this.index[_id]);

				if (d >= 0)
					this.records.splice(d, 1);

				this.count--;

			}

			this.index[_id]._deleted = true;

			this.total--;

		};

		var updateRecord = () => {

			//Update
			if (this.index[_id] && !this.index[_id]._deleted) {
				
				this.updateRecord(this.index[_id], update.record);

			//Re-insert
			} else if (this.index[_id] && this.index[_id]._deleted) {
				
				this.updateRecord(this.index[_id], update.record);
				this.index[_id]["$__loaded"] = now;

				this.records.unshift(this.index[_id]);

				this.count++;
				this.total++;

			//Insert
			} else {

				update.record["$__ref"] = _id;
				this.index[_id] = update.record;
				this.index[_id]["$__loaded"] = now;

				this.records.unshift( this.index[_id] );

				this.count++;
				this.total++;

			}

		};

		switch(update.op){
			case 'insert':
				updateRecord();
				break;

			case 'update':
				if (update.record._deleted)
					removeRecord();
				else
					updateRecord();
				break;

			case 'delete':
				removeRecord();
				break;

		}

		this.emit("update");

	}

	private createQuery(withPagination: boolean = true){

		var query = {
			properties: this.properties,
			where: this.where,
			sort: this.sort,
			skip: null,
			limit: null,
			resolve: this.resolve
		};

		if (withPagination){
			query.skip = this.skip;
			query.limit = this.limit;
		}

		return query;

	}

	private fetchRecords(){

		this._rid++;
		var _rid = this._rid;

		this.loaded = false;

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

		var query = this.createQuery();
		var liveQuery = this.createQuery(false);

		this.client.call(this.service, this.endpoint, "query", query).then((res) => {

			if (_rid != this._rid) return;

			//Set counts
			if (this.clearRecords) {
				this.count = 0;
			}

			if (this.appendMode && this.records instanceof Array) {
				this.count += res.count;
			} else {
				this.count = res.count;
			}

			this.updateRecords(res.records, this.clearRecords);

			//Set count and update pagination
			this.total = res.total;
			this.clearRecords = false;

			this.pages = [];
			this.page = Math.ceil(this.skip / this.limit);

			for (var p = 0; p < Math.ceil(this.total / this.limit); p++)
				this.pages.push(p);

			this.loaded = true;

			this.emit("update");

			//Fetch live endpoint
			if(this.liveMode)
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

		this.removeAllListeners();

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

	public setLive(val: boolean) {

		this.liveMode = val;

	}

	public getById(id: string){

		return this.index[id] || null;

	}

	public getIndexById(id: string){

		var r = this.index[id];

		if (!r) return null;

		return this.records.indexOf(r);

	}

	public getRecordByIndex(index: number){

		return this.records[index] || null;

	}

}