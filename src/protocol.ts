/*
 * META API
 *
 * @author META Platform <www.meta-platform.com>
 * @license See LICENSE file distributed with this source code
 */
 
export var PROTOCOL = {
	commands: {
	    hello:                  1,
	    response:               2,
	    error:                  5,
	    auth:                   6,
	    srvCall:                11,
	    srvSubscribe:           21,
	    srvUnsubscribe:         22,
	    srvPublish:             23,
	    srvSubscribers:         24,
	    srvSubscribeQueue:      31,
	    srvUnsubscribeQueue:    32,
	    srvEnqueue:             33,
	    cliCall:                41,
	    cliMessage:             42,
	    cliQueueMessage:        43
	}
};