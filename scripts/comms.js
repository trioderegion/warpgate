/* 
 * This file is part of the warpgate module (https://github.com/trioderegion/warpgate)
 * Copyright (c) 2021 Matthew Haentschke.
 * 
 * This program is free software: you can redistribute it and/or modify  
 * it under the terms of the GNU General Public License as published by  
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but 
 * WITHOUT ANY WARRANTY; without even the implied warranty of 
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License 
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { logger } from './logger.js'
import { MODULE } from './module.js'
import { Gateway } from './gateway.js' 
import { Events } from './events.js'

const ops = {
  DISMISS_SPAWN : "dismiss", //tokenId, sceneId, userId
  EVENT : "event" //name, ...payload
}

export class Comms {

  static register() {
    Comms.hooks();
  }

  static hooks() {
    Hooks.on("ready", Comms._ready); 
  }

  static _ready() {
    logger.info("Registering sockets");

    game.socket.on(`module.${MODULE.data.name}`, Comms._receiveSocket);
  }

  static async _receiveSocket(socketData) {
    logger.debug("Received socket data => ", socketData);


    switch (socketData.op){
      case ops.DISMISS_SPAWN:
        /* let the first GM handle all dismissals */
        if (MODULE.isFirstGM()) await Gateway.dismissSpawn(socketData.payload.tokenId, socketData.payload.sceneId);
        break;
      case ops.EVENT:
        /* all users should respond to events */
        await Events.run(socketData.name, socketData.payload);
        break;
      default:
        logger.error("Unrecognized socket request", socketData);
        break;
    }

    return;
  }

  static _emit(socketData) {
    socket.emit(`module.${MODULE.data.name}`, socketData);

    /* always send events to self as well */
    return Comms._receiveSocket(socketData);
  }

  static requestDismissSpawn(tokenId, sceneId) {
    /** craft the socket data */
    const data = {
      op : ops.DISMISS_SPAWN,
      tokenId,
      sceneId,
      userId : game.user.id
    }
    
    Comms._emit(data);
  }

  static notifyEvent(name, payload) {
    /* craft the socket data */
    const data = {
      op : ops.EVENT,
      name,
      payload
    }

    return Comms._emit(data);
  }

}
