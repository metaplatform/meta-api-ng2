/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */

/*
 * API reference
 */
export class ApiReference {

	constructor(public service: string, public endpoint: string){}

	toString(){
		
		return this.service + ":/" + this.endpoint;

	}

	splitPath(){

		return this.endpoint.split("/");

	}

}

/*
 * API Channel reference
 */
export class ChannelReference {

	constructor(public service: string, public endpoint: string, public id: string){};

	toString(){

		return this.service + ":/" + this.endpoint + "#" + this.id;

	}

}

/*
 * API Storage reference
 */
export class StorageReference {

	constructor(public bucket: string, public objectId: string){};

	toString(){
		
		return this.bucket + "/" + this.objectId;

	}

}