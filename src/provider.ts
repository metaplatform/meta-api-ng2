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

@Injectable()
export class ApiProvider {

	public client: ApiClient;
	public storage: ApiStorage;
	public serverUrl: string;
	public session: Object;

	constructor() {

		this.client = new ApiClient();
		this.storage = new ApiStorage();

	}

	public connect(serverUrl: string, credentials: Object){

		this.serverUrl = serverUrl;

		this.client.connect("ws://" + this.serverUrl + "/cube/v1", credentials).then((session) => {
			this.session = session;
			console.log("Connected.");
		}, (err) => {
			console.error("Error connecting to API:", err);
		})

		this.client.on("open", (session) => {
			
			this.storage.setSession("http://" + this.serverUrl + "/cube/storage", session.sessionId);

			console.log("Session", session);

		});

		this.client.on("error", (err) => {
			console.error("API error:", err);
		});

		this.client.on("reconnect", (err) => {
			console.error("API reconnecting:", err);
		});

	}

	public getCollection(service: string, endpoint: string){

		return new ApiCollection(this.client, service, endpoint);

	}

}