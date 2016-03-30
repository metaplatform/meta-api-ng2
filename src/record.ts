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

	public live: boolean = true;
	public autolock: boolean = true;

	public loaded = false;
	public deleted = false;
	public notFound = false;
	public modified = false;
	public locked: boolean = false;
	public lockData: any = null;
	
	private liveHandler = null;
	private locking: boolean = false;
	private subscribing: boolean = false;

	public lockTimeout = 1800;

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

		if (setModified){
			
			this.modified = true;

			var now = Math.round( (new Date()).getTime() / 1000 );

			if (this.autolock && this.id && !this.lockData)
				this.lock();

		}

	}

	private isLocked(){

		var now = Math.round((new Date()).getTime() / 1000);

		if (this.lockData && !this.isLockedByMe() && this.lockData.timestamp > now - this.lockTimeout)
			return true;
		else
			return false;

	}

	private isLockedByMe(){

		var ref = this.client.session._ref;

		if (this.lockData && this.lockData.user == ref.service + ":/" + ref.endpoint)
			return true;
		else
			return false;

	}

	private updateLock(lockData: any){

		var prevState = {
			locked: this.locked,
			user: (this.lockData ? this.lockData.user : null)
		};

		this.lockData = lockData;
		this.locked = this.isLocked();

		console.log("LOCK UPDATE", prevState, lockData);

		if(this.locked != prevState.locked || (this.lockData && this.lockData.user != prevState.user)){

			if (this.locked){
				console.log("EMIT LOCK");
				this.emit("lock", this.lockData);
			} else {
				console.log("EMIT UNLOCK");
				this.emit("unlock");
			}

		}

	}

	private applyUpdate(update: any){

		if (!this.loaded) return;

		console.log("REC UPDATE", update.op, update, this.locking);

		switch(update.op){

			case 'delete':
				this.deleted = true;
				this.emit("delete");
				break;

			case 'update':

				if (this.locking) return;

				this.updateLock(update.record._locked);

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

	public fetch(): Promise<any> {

		this.loaded = false;
		this.notFound = false;

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

		if (!this.id) return Promise.reject(new Error("Record has no ID set."));

		return new Promise((resolve, reject) => {

			this.client.call(this.service, this.endpoint + "/" + this.id, "get", { resolve: ["*"] }).then((data) => {

				this.setData(data, false);
				this.loaded = true;
				this.modified = false;

				this.deleted = ( data._deleted ? true : false );
				
				this.updateLock(data._locked);

				this.emit("fetch", this.data);

				resolve();

				//Unlock
				if (this.autolock && this.lockData && this.isLockedByMe())
					this.unlock();

				//Fetch live endpoint
				if (!this.live || this.subscribing) return;

				this.subscribing = true;

				return this.client.call(this.service, this.endpoint + "/" + this.id, "live").then((res) => {

					return this.client.subscribe(res.toString(), (update) => {

						this.applyUpdate(update);

					}).then((handler) => {

						this.liveHandler = handler;
						this.subscribing = false;
						return data;

					}, (err) => {
						console.error("Record LIVE subscription error:", err);
						this.subscribing = false;
					})

				}, (err) => {
					console.error("Record LIVE error:", err);
				})

			}, (err) => {

				if (err.code == 404)
					this.notFound = true;

				console.error("Record error:", err);

				reject();

			});

		});

	}

	public save(reload: boolean = false){

		var r;

		this.loaded = false;

		if(this.id){

			r = this.client.call(this.service, this.endpoint + "/" + this.id, "update", this.data).then((res) => {

				this.loaded = true;
				this.modified = false;
				this.emit("save", this.data);

				if (this.autolock) this.unlock();

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
		});

	}

	public lock(force: boolean = false, setModified: boolean = false){

		console.log("LOCK", this.locked, this.lockData);

		if (!this.id) return Promise.reject(new Error("Record has no ID set."));

		var now = Math.round((new Date()).getTime() / 1000);

		if (!force && this.lockData)
			return Promise.reject(new Error("Record already locked."));

		this.locking = true;

		return this.client.call(this.service, this.endpoint + "/" + this.id, "lock").then((lockData) => {

			this.updateLock(lockData);

			if (setModified)
				this.modified = true;

			this.endLocking();

		});

	}

	public unlock(){

		console.log("UNLOCK", this.locked, this.lockData, this.isLockedByMe());

		if (!this.id) return Promise.reject(new Error("Record has no ID set."));
		if (!this.lockData) return Promise.reject(new Error("Record is not locked."));

		if (this.lockData && !this.isLockedByMe())
			return Promise.reject(new Error("Record is locked by another user."));

		this.locking = true;

		return this.client.call(this.service, this.endpoint + "/" + this.id, "unlock").then(() => {
			this.updateLock(null);
			this.endLocking();
		});

	}

	private endLocking(){

		setTimeout(() => {
			this.locking = false;
		}, 250);
			
	}

	public destroy(){

		if (this.autolock && this.isLockedByMe()) this.unlock();

		this.id = null;

		if (this.liveHandler)
			this.liveHandler.unsubscribe();

		this.removeAllListeners();

	}

}