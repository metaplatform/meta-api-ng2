/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

import {Injectable} from 'angular2/core';
import {ApiClient} from './client';
import {ApiStorage} from './storage';

import {ApiCollection} from './collection';
import {ApiCounter} from './counter';
import {ApiRecord} from './record';
import {ApiReferenceFromUri} from './types';

@Injectable()
export class ApiProvider {

	public client: ApiClient;
	public storage: ApiStorage;
	public serverUrl: string;
	public session: any;

	public connected: boolean = false;

	constructor() {

		this.client = new ApiClient();
		this.storage = new ApiStorage();

		this.client.on("open", (session) => {

			this.connected = true;
			this.session = session;
			this.storage.setSession("http://" + this.serverUrl + "/storage/v1", session.sessionId);

			console.log("Session", session);

		});

		this.client.on("error", (err) => {
			console.error("API error:", err);
		});

		this.client.on("reconnect", (err) => {
			console.error("API reconnecting:", err);
		});

		this.client.on("disconnect", () => {
			this.connected = false;
		});

	}

	public connect(serverUrl: string, credentials: Object){

		this.serverUrl = serverUrl;

		return this.client.connect("ws://" + this.serverUrl + "/meta/v1", credentials);

	}

	public disconnect() {

		this.connected = false;
		this.session = null;
		this.client.close();

	}

	public getCollection(service: string, endpoint: string){

		return new ApiCollection(this.client, service, endpoint);

	}

	public getCounter(service: string, endpoint: string){

		return new ApiCounter(this.client, service, endpoint);

	}

	public getRecord(service: string, endpoint: string, id: string = null, initialData: Object = null) {

		return new ApiRecord(this.client, service, endpoint, id, initialData);

	}

	public getRecordFromUri(uri: string, initalData: Object = null){

		var ref = ApiReferenceFromUri(uri);
		var path = ref.splitPath();
		var id = path.pop();

		return new ApiRecord(this.client, ref.service, path.join("/"), id, initalData);

	}

	public isRecordLocked(data: any){

		var now = Math.round((new Date()).getTime() / 1000);

		if (!data._locked) return;
		if (data._locked.timestamp < now - 1800) return false;

		var ref = this.client.session._ref;

		if (data._locked.user == ref.service + ":/" + ref.endpoint) return false;
		
		return true;

	}

	public forceReconnect(){

		this.client.forceReconnect();

	}

	public can(service: string, endpoint: string, method: string){

		return this.client.call("gate", "/acl", "test", {
			prefix: "cube:call",
			path: service + ":/" + endpoint,
			method: method,
			groups: this.session.groups
		});

	}

}