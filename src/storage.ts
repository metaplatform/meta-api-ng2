/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

import {EventEmitter} from './events';
import {ApiClient} from './client';
import CryptoJS = require("crypto-js");

export interface ResponseInterface {
	content: string;
	mimetype: string;
}

export class ApiStorage {

	private serverUrl: string;
	private sessionId: string;

	setSession(serverUrl: string, sessionId: string){

		this.serverUrl = serverUrl;
		this.sessionId = sessionId;

	}

	private createAuthQuery(){

		var now = new Date();
		var timestr = now.getFullYear() + ":" + now.getMonth() + ":" + now.getDate() + ":" + now.getHours();

		var token = CryptoJS.SHA256(this.sessionId + timestr);

		return "?sessionid=" + this.sessionId + "&token=" + token;

	}

	private sendRequest(method, path, formData: FormData = null): Promise<ResponseInterface> {

		return new Promise((resolve, reject) => {

			try {

				var req = new XMLHttpRequest();

				req.addEventListener("load", () => {
					
					if (req.status !== 200)
						reject(req.responseText);
					else
						resolve({
							content: req.responseText,
							mimetype: req.getResponseHeader('content-type')
						})

				});

				req.addEventListener("error", (err) => {
					reject(err);
				});

				req.open(method, this.serverUrl + path + this.createAuthQuery());
				req.send(formData);

			} catch(e){
				reject(e);
			}

		});

	}

	private parseJsonBody(res){

		return new Promise(function(resolve, reject){

			try {

				var data = JSON.parse(res.content);
				resolve(data);

			} catch(e){
				reject(e);
			}

		});

	}

	write(bucket: string, objectId: string = null, files: FileList): Promise<{}> {

		var formData = new FormData();

		if(objectId){

			formData.append("object", files[0]);

		} else {

			for (var f = 0; f < files.length; f++)
				formData.append("object[]", files[f]);

		}

		return this.sendRequest("POST", "/" + bucket + ( objectId ? "/" + objectId : "" ), formData).then(this.parseJsonBody);

	}

	get(bucket: string, objectId: string, withType: boolean = false): Promise<{}> {

		return this.sendRequest("GET", "/" + bucket + "/" + objectId).then((res) => {

			if (withType)
				return res;
			else
				return res.content;

		});

	}

	getUrl(bucket: string, objectId: string): string {

		return this.serverUrl + "/" + bucket + "/" + objectId + this.createAuthQuery();

	}

	getMeta(bucket: string, objectId: string): Promise<{}> {

		return this.sendRequest("GET", "/" + bucket + "/" + objectId + "/meta").then(this.parseJsonBody);

	}

	delete(bucket: string, objectId: string): Promise<{}> {

		return this.sendRequest("DELETE", "/" + bucket + "/" + objectId).then(() => {
			return true;
		})

	}

	listObjects(bucket: string): Promise<{}> {

		return this.sendRequest("GET", "/" + bucket).then(this.parseJsonBody);

	}

	listBuckets(): Promise<{}> {

		return this.sendRequest("GET", "/").then(this.parseJsonBody);

	}

}