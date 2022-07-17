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
import { RemoteMutator } from './remote-mutator.js'
import {queueUpdate} from './update-queue.js'

const ops = {
  DISMISS_SPAWN : "dismiss", //tokenId, sceneId, userId
  EVENT : "event", //name, ...payload
  REQUEST_MUTATE: "req-mutate", // ...payload
  REQUEST_REVERT: "req-revert" // ...payload
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

  static _receiveSocket(socketData) {
    logger.debug("Received socket data => ", socketData);


    queueUpdate( async () => {
      logger.debug("Routing operation: ",socketData.op);
      switch (socketData.op){
        case ops.DISMISS_SPAWN:
          /* let the first GM handle all dismissals */
          if (MODULE.isFirstGM()) await Gateway.dismissSpawn(socketData.payload.tokenId, socketData.payload.sceneId, socketData.payload.userId);
          break;
        case ops.EVENT:
          /* all users should respond to events */
          await Events.run(socketData.eventName, socketData.payload);
          break;
        case ops.REQUEST_MUTATE:
          /* First owner of this target token/actor should respond */
          await RemoteMutator.handleMutationRequest(socketData.payload);
          break;
        case ops.REQUEST_REVERT:
          /* First owner of this target token/actor should respond */
          await RemoteMutator.handleRevertRequest(socketData.payload);
          break;
        default:
          logger.error("Unrecognized socket request", socketData);
          break;
      }
    });

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
      payload : { tokenId, sceneId, userId: game.user.id }
    }
    
    return Comms._emit(data);
  }

  static notifyEvent(name, payload, onBehalf = game.user.id) {
    /** insert common fields */
    payload.sceneId = canvas.scene.id;
    payload.userId = onBehalf;

    /* craft the socket data */
    const data = {
      op : ops.EVENT,
      eventName: name,
      payload
    }

    return Comms._emit(data);
  }

  /*
   * payload = {userId, tokenId, sceneId, updates, options}
   * @param options
   *   * description - message to display to receiving user
   */
  static requestMutate(tokenId, sceneId, { updates = {}, options = {} } = {}, onBehalf = game.user.id ) {
    
    /* insert common fields */
    const payload = {
      userId: onBehalf,
      tokenId,
      sceneId,
      updates,
      options
    }

    /* craft the socket data */
    const data = {
      op: ops.REQUEST_MUTATE,
      payload
    }

    return Comms._emit(data);
  }

  static requestRevert(tokenId, sceneId, {mutationId = undefined, onBehalf = game.user.id}) {

    /* insert common fields */
    const payload = {
      userId: onBehalf,
      tokenId,
      sceneId,
      mutationId
    }

    /* craft the socket data */
    const data = {
      op: ops.REQUEST_REVERT,
      payload
    }

    return Comms._emit(data);
  }

  static packToken(tokenDoc) {
    const tokenData = tokenDoc.toObject();
    delete tokenData.actorData;

    let actorData = tokenDoc.actor?.toObject() ?? {};
    actorData.token = tokenData;
    return actorData;
  }

  static notifyEvent(name, payload, onBehalf = game.user.id) {
    /** insert common fields */
    payload.sceneId = canvas.scene.id;
    payload.userId = onBehalf;

    /* craft the socket data */
    const data = {
      op : ops.EVENT,
      eventName: name,
      payload
    }

    return Comms._emit(data);
  }

  static packToken(tokenDoc) {
    const tokenData = tokenDoc.toObject();
    delete tokenData.actorData;

    let actorData = tokenDoc.actor.toObject();
    actorData.token = tokenData;
    return actorData;
  }

}
