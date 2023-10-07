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

import { MODULE, logger } from "./module.js";
import { handleDismissSpawn } from "./gateway.js";
import { Events } from "./events.js";
import {
  handleMutationRequest,
  handleRevertRequest,
} from "./remote-mutator.js";
import { queueUpdate } from "./update-queue.js";

const ops = {
  DISMISS_SPAWN: "dismiss", //tokenId, sceneId, userId
  EVENT: "event", //name, ...payload
  REQUEST_MUTATE: "req-mutate", // ...payload
  REQUEST_REVERT: "req-revert", // ...payload
  NOTICE: "req-notice",
};

class Comms {
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

    /* all users should immediately respond to notices */
    if (socketData.op == ops.NOTICE) {
      MODULE.handleNotice(
        socketData.payload.location,
        socketData.payload.sceneId,
        socketData.payload.options
      );
      return socketData;
    }

    queueUpdate(async () => {
      logger.debug("Routing operation: ", socketData.op);
      switch (socketData.op) {
        case ops.DISMISS_SPAWN:
          await handleDismissSpawn(socketData.payload);
          break;
        case ops.EVENT:
          /* all users should respond to events */
          await Events.run(socketData.eventName, socketData.payload);
          break;
        case ops.REQUEST_MUTATE:
          /* First owner of this target token/actor should respond */
          await handleMutationRequest(socketData.payload);
          break;
        case ops.REQUEST_REVERT:
          /* First owner of this target token/actor should respond */
          await handleRevertRequest(socketData.payload);
          break;
        default:
          logger.error("Unrecognized socket request", socketData);
          break;
      }
    });

    return socketData;
  }

  static _emit(socketData) {
    game.socket.emit(`module.${MODULE.data.name}`, socketData);

    /* always send events to self as well */
    return Comms._receiveSocket(socketData);
  }

  static requestDismissSpawn(tokenId, sceneId) {
    /** craft the socket data */
    const data = {
      op: ops.DISMISS_SPAWN,
      payload: { tokenId, sceneId, userId: game.user.id },
    };

    return Comms._emit(data);
  }

  /*
   * payload = {userId, tokenId, sceneId, updates, options}
   */
  static requestMutate(
    tokenId,
    sceneId,
    { updates = {}, options = {} } = {},
    onBehalf = game.user.id
  ) {
    /* insert common fields */
    const payload = {
      userId: onBehalf,
      tokenId,
      sceneId,
      updates,
      options,
    };

    /* craft the socket data */
    const data = {
      op: ops.REQUEST_MUTATE,
      payload,
    };

    return Comms._emit(data);
  }

  static requestRevert(
    tokenId,
    sceneId,
    { mutationId = undefined, onBehalf = game.user.id, options = {} }
  ) {
    /* insert common fields */
    const payload = {
      userId: onBehalf,
      tokenId,
      sceneId,
      mutationId,
      options,
    };

    /* craft the socket data */
    const data = {
      op: ops.REQUEST_REVERT,
      payload,
    };

    return Comms._emit(data);
  }

  static requestNotice(location, sceneId = canvas.scene?.id, options = {}) {
    const data = {
      op: ops.NOTICE,
      payload: {
        sceneId,
        location,
        options,
      },
    };

    return Comms._emit(data);
  }

  static packToken(tokenDoc) {
    const tokenData = tokenDoc.toObject();
    delete tokenData.actorData;
    delete tokenData.delta;

    let actorData = tokenDoc.actor?.toObject() ?? {};
    actorData.token = tokenData;
    return actorData;
  }

  /**
   * Allow custom events to be fired using the Warp Gate event system. Is broadcast to all users, including the initiator.
   * Like Hooks, these functions cannot be awaited for a response, but all event functions executing on a given client
   * will be evaluated in order of initial registration and the processing of the event functions will respect
   * (and await) returned Promises.
   *
   * @param {string} name Name of this event. Watches and triggers use this name to register themselves.
   *  Like Hooks, any string can be used and it is dependent upon the watch or trigger registration to monitor the correct event name.
   * @param {object} [payload={sceneId: canvas.scene.id, userId: game.user.id}] eventData {Object} The data that will be
   *  provided to watches and triggers and their condition functions.
   * @param {string} [onBehalf=game.user.id] User ID that will be used in place of the current user in the
   *  cases of a relayed request to the GM (e.g. dismissal).
   *
   * @returns {Object} Data object containing the event's payload (execution details), and identifying metadata about
   *  this event, sent to all watching and triggering clients.
   */
  static notifyEvent(name, payload = {}, onBehalf = game.user?.id) {
    /** insert common fields */
    payload.sceneId = canvas.scene?.id;
    payload.userId = onBehalf;

    /* craft the socket data */
    const data = {
      op: ops.EVENT,
      eventName: name,
      payload,
    };

    return Comms._emit(data);
  }
}

export const register = Comms.register,
  requestMutate = Comms.requestMutate,
  requestRevert = Comms.requestRevert,
  packToken = Comms.packToken,
  requestDismissSpawn = Comms.requestDismissSpawn,
  notifyEvent = Comms.notifyEvent,
  requestNotice = Comms.requestNotice;
