/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

export class EventEmitter {

	private _eventListeners = {};

	public on(eventName: string, handler: Function){

		if (!this._eventListeners[eventName])
			this._eventListeners[eventName] = [];

		this._eventListeners[eventName].push(handler);

	}

	public off(eventName: string, handler: Function){

		if (!this._eventListeners[eventName]) return;

		var i = this._eventListeners[eventName].indexOf(handler);

		if (i >= 0)
			this._eventListeners[eventName].splice(i, 1);

		if (this._eventListeners[eventName].length === 0)
			delete this._eventListeners[eventName];

	}

	public once(eventName: string, handler: Function){

		this.on(eventName, handler);

		this.on(eventName, () => {
			this.off(eventName, handler);
		});

	}

	public addEventListener(eventName: string, handler: Function){
		this.on(eventName, handler);
	}

	public removeEventListener(eventName: string, handler: Function){
		this.off(eventName, handler);
	}

	public removeAllListeners(){
		this._eventListeners = {};
	}

	public emit(eventName: string, ...args: any[]){

		if (!this._eventListeners[eventName]) return;

		for (var i in this._eventListeners[eventName])
			this._eventListeners[eventName][i].apply(null, args);

	}

}