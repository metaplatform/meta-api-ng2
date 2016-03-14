/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

import {ApiClient} from './client';
import {EventEmitter} from './events';

export class ApiRecord extends EventEmitter {

	public uri: string = null;
	public data: any = {};

	public loaded = false;
	public deleted = false;
	public notFound = false;
	public modified = false;
	private liveHandler = null;

	constructor(private client: ApiClient, private service: string, private endpoint: string, private id: string = null, initialData: Object = null){

		super();

		this.client.on("open", () => {
			
			this.fetch();

		})

		if (initialData)
			this.setData(initialData, false);

		this.updateUri();

	}

	private updateUri(){

		this.uri = this.service + ":/" + this.endpoint + "/" + this.id;

	}

	public setId(id: string, reload: boolean = false){

		this.id = id;

		this.updateUri();

		if (reload)
			this.fetch();

	}

	public getId(){
		
		return this.id;

	}

	public setData(data: Object, setModified: boolean = true){

		for (var i in data)
			if (!this.data[i] || this.data[i] != data[i]) this.data[i] = data[i];

		if (setModified)
			this.modified = true;

	}

	private applyUpdate(update: any){

		if (!this.loaded) return;

		console.log("REC UPDATE", update);

		switch(update.op){

			case 'delete':
				this.deleted = true;
				this.emit("delete");
				break;

			case 'update':

				if(update.record._deleted){
					this.deleted = true;
					this.emit("delete");
					break;	
				}

				if(this.modified){
					this.emit("externalUpdate", update.record);
				} else {
					this.setData(update.record, false);
					this.emit("update", this.data);
				}
				break;

		}

	}

	public fetch(){

		this.loaded = false;
		this.notFound = false;

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

		if (!this.id) return Promise.reject(new Error("Record has no ID set."));

		return this.client.call(this.service, this.endpoint + "/" + this.id, "get").then((data) => {

			this.setData(data, false);
			this.loaded = true;
			this.modified = false;

			this.emit("fetch", this.data);

			//Fetch live endpoint
			return this.client.call(this.service, this.endpoint + "/" + this.id, "live").then((res) => {

				return this.client.subscribe(res.toString(), (update) => {

					this.applyUpdate(update);

				}).then((handler) => {

					this.liveHandler = handler;
					return data;

				}, (err) => {
					console.error("Record LIVE subscription error:", err);	
				})

			}, (err) => {
				console.error("Record LIVE error:", err);	
			})

		}, (err) => {

			if (err.code == 404)
				this.notFound = true;

			console.error("Record error:", err);

		})

	}

	public save(reload: boolean = false){

		var r;

		this.loaded = false;

		if(this.id){

			r = this.client.call(this.service, this.endpoint + "/" + this.id, "update", this.data).then((res) => {

				this.loaded = true;
				this.modified = false;
				this.emit("save", this.data);

			}, (err) => {
				this.loaded = true;
				throw err;
			});

		} else {

			r = this.client.call(this.service, this.endpoint, "create", this.data).then((res) => {

				this.id = res.splitPath().pop();

				this.updateUri();

				this.loaded = true;
				this.modified = false;
				this.emit("save", this.data);

				if (reload) this.fetch();

			}, (err) => {
				this.loaded = true;
				throw err;
			});

		}

		return r;

	}

	public delete(){

		if (!this.id) return Promise.reject(new Error("Record has no ID set."));

		return this.client.call(this.service, this.endpoint + "/" + this.id, "delete").then(() => {
			this.deleted = true;
		})

	}

	public destroy(){

		this.id = null;

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

	}

}