/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

import {EventEmitter} from './events';
import {Utils} from './utils';
import {ApiConnector} from './connector';
import CryptoJS = require("crypto-js");

export interface SubscriptionInterface {
	channel: string;
	unsubscribe: Function;
}

export class ApiClient extends EventEmitter {

	private subscriptions = {};
	private queueSubscriptions = {};

	private connection: ApiConnector;

	constructor(){
		
		super();

		this.connection = new ApiConnector((channel, message) => {

			return this.handleMessage(channel, message);

		}, (queue, message) => {

			return this.handleQueueMessage(queue, message);

		});

		this.connection.on("open", (session) => {
			this.emit("open", session);
		});

		this.connection.on("error", (err) => {
			this.emit("error", err);
		});

		this.connection.on("reconnect", (err) => {
			this.emit("reconnect", err);
		});

		this.connection.on("disconnect", (err) => {
			this.emit("disconnect", err);
		});

	}

	/*
	 * Incoming message handler
	 */
	public handleMessage(channel: string, message: any) {

		if (!this.subscriptions[channel])
			return;

		for (var i in this.subscriptions[channel])
			this.subscriptions[channel][i].call(null, message, channel);

	};

	/*
	 * Incoming queue message handler
	 */
	public handleQueueMessage(queue: string, message: any): Promise<any> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.queueSubscriptions[queue])
					return reject(new Error("Not subscribed."));

				this.queueSubscriptions[queue].call(null, message, queue).then(resolve, reject);

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Connects to remote broker
	 */
	public connect(brokerUrl: string, credentials: Object): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				this.connection.connect(brokerUrl, credentials).then(resolve, reject);

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Closes socket connection to broker - removes all subscriptions
	 */
	public close(): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				this.connection.close();
				this.subscriptions = {};
				this.queueSubscriptions = {};

				resolve();

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * RPC call
	 */
	public call(service: string, endpoint: string, method: string, params: Object = {}): Promise<any> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				this.connection.call(service, endpoint, method, Utils.clone(params)).then(resolve, reject);

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Subscribe to channel
	 */
	public subscribe(channel: string, cb: Function): Promise<SubscriptionInterface> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				if (!this.subscriptions[channel])
					this.subscriptions[channel] = [];

				this.subscriptions[channel].push(cb);

				this.connection.subscribe(channel).then(() => {

					if (this.subscriptions[channel].indexOf(cb) < 0)
						return reject("Already unsubscribed.");

					resolve({
						channel: channel,
						unsubscribe: () => {
							return this.unsubscribe(channel, cb);
						}
					});

				}, reject);

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Unsubscribes from channel
	 */
	public unsubscribe(channel: string, cb: Function): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				if (!this.subscriptions[channel] || this.subscriptions[channel]  instanceof Promise)
					return resolve();

				var i = this.subscriptions[channel].indexOf(cb);

				if (i < 0)
					return resolve();

				//Remove from subscription table
				this.subscriptions[channel].splice(i, 1);

				//Remove element if empty
				if (this.subscriptions[channel].length === 0) {

					delete this.subscriptions[channel];

					//Also unsubscribe from connection
					this.connection.unsubscribe(channel).then(() => {

						return resolve();

					}, reject);

				} else {

					return resolve();

				}

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Publish message
	 */
	public publish(channel: string, message: any): Promise<Number> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				this.connection.publish(channel, Utils.clone(message)).then(resolve, reject);

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Get subscriber count
	 */
	public subscribers(channel: string): Promise<number> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				this.connection.subscribers(channel).then(resolve, reject);

			} catch (e) {
				reject(e);
			}

		});

	};


	/*
	 * Subscribes to queue messages
	 */
	public subscribeQueue(queue: string, cb: Function): Promise<SubscriptionInterface> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				if (this.queueSubscriptions[queue])
					return reject(new Error("Already subscribed to queue '" + queue + "'."));

				this.connection.subscribeQueue(queue).then(() => {

					this.queueSubscriptions[queue] = cb;

					return resolve({
						unsubscribe: () => {
							return this.unsubscribeQueue(queue);
						}
					});

				}, reject);

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Unsubscribes from queue messages
	 */
	public unsubscribeQueue(queue: string): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				if (!this.queueSubscriptions[queue])
					return resolve(false);

				//Unsubscribe from connection
				this.connection.unsubscribeQueue(queue).then(() => {

					delete this.queueSubscriptions[queue];

					return resolve(true);

				}, reject);

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Enqueue message
	 */
	public enqueue(queue: string, message: any): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				if (!this.connection)
					return reject(new Error("API client not connected."));

				this.connection.enqueue(queue, Utils.clone(message)).then(resolve, reject);

			} catch (e) {
				reject(e);
			}

		});

	};

}

/*
 * Creates credentials data for secret auth type
 */
export function createSecretCredentials(serviceName: string, secret: string){

	var now = new Date();
	var timestr = now.getFullYear() + ":" + now.getMonth() + ":" + now.getDate() + ":" + now.getHours();
	var token = CryptoJS.SHA256(serviceName + secret + timestr);

	return {
		serviceName: serviceName,
		token: token.toString()
	};

}

/*
 * Creates credentials data for username and password auth type
 */
export function createBasicCredentials(username: string, password: string) {

	var now = new Date();
	var timestr = now.getFullYear() + ":" + now.getMonth() + ":" + now.getDate() + ":" + now.getHours();
	var hash = CryptoJS.SHA256(username + ":" + password).toString();
	var token = CryptoJS.SHA256(username + hash + timestr);

	return {
		username: username,
		token: token.toString()
	};

}

export function createBasicCredentialsHash(username: string, password: string){

	return CryptoJS.SHA256(username + ":" + password).toString();

}

export function createBasicCredentialsFromHash(username: string, hash: string) {

	var now = new Date();
	var timestr = now.getFullYear() + ":" + now.getMonth() + ":" + now.getDate() + ":" + now.getHours();
	var token = CryptoJS.SHA256(username + hash + timestr);

	return {
		username: username,
		token: token.toString()
	};

}