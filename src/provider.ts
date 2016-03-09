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
import {ApiRecord} from './record';

@Injectable()
export class ApiProvider {

	public client: ApiClient;
	public storage: ApiStorage;
	public serverUrl: string;
	public session: Object;

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

	public getCollection(service: string, endpoint: string){

		return new ApiCollection(this.client, service, endpoint);

	}

	public getRecord(service: string, endpoint: string, id: string = null, initialData: Object = null) {

		return new ApiRecord(this.client, service, endpoint, id, initialData);

	}

}