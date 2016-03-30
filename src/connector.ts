/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

import {EventEmitter} from './events';
import {Utils} from './utils';
import {PROTOCOL} from './protocol';
import {ApiReference, ChannelReference, StorageReference} from './types';

export class ApiError extends Error {

	constructor(public message: string, public code: number){
		super(message);
	}

}

export class ApiConnector extends EventEmitter {

	private activeSubscriptions = [];
	private commandQueue = [];

	private brokerUrl = null;
	private credentials = null;

	private ws = null;
	private active = false;
	private connected = false;
	private reconnectTimeout = 3000;
	private reconnect = true;
	private reconnectionTimer = null;

	private reqId = 0;
	private requests = {};

	constructor(private messageHandler: Function, private queueMessageHandler: Function){

		super();

	};

	/*
	 * CONNECTION HANDLING
	 */
	private createConnection() {

		if(this.ws)
			throw new Error("Already connected.");

		//Reconnect handler
		var reconnect = () => {

			if (this.reconnectionTimer) return;

			this.reconnectionTimer = setTimeout(() => {

				this.reconnectionTimer = null;
				this.createConnection();

			}, this.reconnectTimeout);

		};

		//Open connection
		this.ws = new WebSocket(this.brokerUrl);

		this.ws.onopen = () => {

			//Set active
			this.active = true;
			this.connected = true;

			this.sendRequest(PROTOCOL.commands.auth, this.credentials.call(), (err, session) => {

				if(err){
					this.close();
					this.emit("connectionError", err);
					return;
				}

				//Subscribe active channels					
				var tasks = [];

				for (var s in this.activeSubscriptions)
					tasks.push(this.subscribe(this.activeSubscriptions[s]));

				Promise.all(tasks).then(() => {

					//Flush command queue
					var msg = true;

					while (msg) {
						msg = this.commandQueue.shift();
						this.ws.send(msg);
					}

					//Ready
					this.emit("open", session);

				}, (err) => {

					this.emit("connectionError", err);

				});

			});

		};

		this.ws.onclose = (ev) => {

			this.connected = false;
			this.ws = null;

			this.emit("disconnect");

			if (ev.code == 1006 && this.reconnect) {

				this.emit("reconnect", new Error("Connection lost."));

				reconnect();

			} else {

				this.close();

			}

		};

		this.ws.onmessage = (msg) => {

			this.handleSocketMessage(msg.data);

		};

		this.ws.onerror = (err) => {

			if (err.code == 'ECONNREFUSED' && this.reconnect) {

				this.ws = null;
				this.emit("reconnect", new Error("Connection refused."));
				reconnect();

			} else {

				this.emit("connectionError", err);

			}

		};

	};

	/*
	 * Connects to remote broker
	 */
	public connect(brokerUrl: String, credentialsCb: any): Promise<{}> {

		this.brokerUrl = brokerUrl;
		this.credentials = credentialsCb;

		if (this.reconnect)
			this.active = true;

		return new Promise((resolve, reject) => {

			try {

				this.createConnection();

				this.once("open", (session) => {
					resolve(session);
				});

				this.once("connectionError", (err) => {
					reject(err);
				});

			} catch (e) {
				reject(e);
			}

		});

	};

	public forceReconnect(){

		if (!this.brokerUrl || !this.credentials)
			throw new Error("Connection not set up.");
		
		this.createConnection();

	}

	/*
	 * Closes connection
	 */
	public close() {

		if (this.ws)
			this.ws.close();

		this.ws = null;
		this.active = false;

		this.activeSubscriptions = [];
		this.commandQueue = [];

		this.emit("close");

	};

	/*
	 * Sends request over socket
	 */
	private sendRequest(command: number, params: Object = {}, cb: Function) {

		if (!this.active) throw new Error("Not connected.");

		this.reqId++;
		var rid = "c" + this.reqId;

		this.requests[rid] = cb;

		var msg = JSON.stringify({
			r: rid,
			c: command,
			p: params || {}
		});

		if (this.connected)
			this.ws.send(msg);
		else
			this.commandQueue.push(msg);

	};

	/*
	 * Sends response
	 */
	private sendResponse(rid: any, data: Object = null, command?: number) {

		if (!this.active) throw new Error("Not connected.");

		var res;

		if (data instanceof Error)
			res = { r: rid, c: PROTOCOL.commands.error, e: { code: 500, message: data.message } };
		else if (data instanceof ApiReference)
			res = { r: rid, c: command || PROTOCOL.commands.response, d: data, t: "ApiReference" };
		else if (data instanceof ChannelReference)
			res = { r: rid, c: command || PROTOCOL.commands.response, d: data, t: "ChannelReference" };
		else if (data instanceof StorageReference)
			res = { r: rid, c: command || PROTOCOL.commands.response, d: data, t: "StorageReference" };
		else
			res = { r: rid, c: command || PROTOCOL.commands.response, d: data };

		var msg = JSON.stringify(res);

		if (this.connected)
			this.ws.send(msg);
		else
			this.commandQueue.push(msg);

	};

	/*
	 * Handles websocket response
	 */
	private handleResponse(rid: any, err: Error = null, data: any = {}, type: string = null) {

		if (!this.requests[rid])
			return;

		var cb = this.requests[rid];
		delete this.requests[rid];

		var res;

		if (type == "ApiReference")
			res = new ApiReference(data.service, data.endpoint);
		else if (type == "ChannelReference")
			res = new ChannelReference(data.service, data.endpoint, data.id);
		else if (type == "StorageReference")
			res = new StorageReference(data.bucket, data.objectId);
		else
			res = data;

		cb(err, res);

	};

	/*
	 * Handles websocket message
	 */
	private handleSocketMessage(msg: string) {

		try {

			var data = JSON.parse(msg);
			var req = null;

			if (!data.r || !data.c)
				return this.sendResponse(null, new Error("Invalid request."));
			
			switch (data.c) {

				case PROTOCOL.commands.hello:
					return;

				case PROTOCOL.commands.response:
					this.handleResponse(data.r, null, data.d, data.t);
					return;
				case PROTOCOL.commands.error:
					this.handleResponse(data.r, new ApiError(data.e.message, data.e.code));
					return;

				case PROTOCOL.commands.cliCall:
					if (!data.p.endpoint || !data.p.method) return this.sendResponse(new Error("Invalid request params."));
					req = this.receiveCall(data.p.endpoint, data.p.method, data.p.params || {});
					break;

				case PROTOCOL.commands.cliMessage:
					if (!data.p.channel || !data.p.message) return this.sendResponse(new Error("Invalid request params."));
					req = this.receiveMessage(data.p.channel, data.p.message);
					break;

				case PROTOCOL.commands.cliQueueMessage:
					if (!data.p.queue || !data.p.message) return this.sendResponse(new Error("Invalid request params."));
					req = this.receiveQueueMessage(data.p.queue, data.p.message);
					break;

				default:
					return this.sendResponse(data.r, new Error("Undefined command."));

			}

			req.then((res) => {

				this.sendResponse(data.r, res);

			}, (err) => {

				this.sendResponse(data.r, err);

			});

		} catch (e) {

			this.sendResponse(null, new Error("Invalid request format. Cannot parse JSON."));

		}

	};

	/*
	 * Request method call
	 */
	private receiveCall(endpoint: string, method: string, params?: Object): Promise<void> {

		return Promise.reject(new Error("Not supported."));

	};

	/*
	 * Request publish
	 */
	private receiveMessage(channel: string, message: any): Promise<void> {

		return this.messageHandler(channel, Utils.clone(message));

	};

	/*
	 * Request queue publish
	 */
	private receiveQueueMessage(queue: string, message: any): Promise<boolean> {

		return this.queueMessageHandler(queue, Utils.clone(message));

	};

	/*
	 * RPC call
	 */
	public call(service: string, endpoint: string, method: string, params?: Object): Promise<any> {

		return new Promise((resolve, reject) => {

			try {

				this.sendRequest(PROTOCOL.commands.srvCall, {
					service: service,
					endpoint: endpoint,
					method: method,
					params: params || {}
				}, (err, res) => {

					if (err)
						reject(err);
					else
						resolve(res);

				});

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Subscribe to channel
	 */
	public subscribe(channel: string): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				this.sendRequest(PROTOCOL.commands.srvSubscribe, {
					channel: channel
				}, (err, res) => {

					if (err) return reject(err);

					if (this.activeSubscriptions.indexOf(channel) < 0)
						this.activeSubscriptions.push(channel);

					resolve();

				});

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Unsubscribe from channel
	 */
	public unsubscribe(channel: string): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				this.sendRequest(PROTOCOL.commands.srvUnsubscribe, {
					channel: channel
				}, (err, res) => {

					if (err) return reject(err);

					var i = this.activeSubscriptions.indexOf(channel);

					if (i >= 0) this.activeSubscriptions.splice(i, 1);

					resolve();

				});

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Publish message
	 */
	public publish(channel: string, message: any): Promise<number> {

		return new Promise((resolve, reject) => {

			try {

				this.sendRequest(PROTOCOL.commands.srvPublish, {
					channel: channel,
					message: message
				}, (err, res) => {

					if (err)
						reject(err);
					else
						resolve(res);

				});

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

				this.sendRequest(PROTOCOL.commands.srvSubscribers, {
					channel: channel
				}, (err, res) => {

					if (err)
						reject(err);
					else
						resolve(res);

				});

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Subscribe to queue messages
	 */
	public subscribeQueue(queue: string): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				this.sendRequest(PROTOCOL.commands.srvSubscribeQueue, {
					queue: queue
				}, (err, res) => {

					if (err)
						reject(err);
					else
						resolve();

				});

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Unsubscribe from queue messages
	 */
	public unsubscribeQueue(queue: string): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				this.sendRequest(PROTOCOL.commands.srvUnsubscribeQueue, {
					queue: queue
				}, (err, res) => {

					if (err)
						reject(err);
					else
						resolve();

				});

			} catch (e) {
				reject(e);
			}

		});

	};

	/*
	 * Enqueue message
	 */
	public enqueue(queue: string, message: any, ttl?: number): Promise<{}> {

		return new Promise((resolve, reject) => {

			try {

				this.sendRequest(PROTOCOL.commands.srvEnqueue, {
					queue: queue,
					message: message
				}, (err, res) => {

					if (err)
						reject(err);
					else
						resolve();

				});

			} catch (e) {
				reject(e);
			}

		});

	};

}