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

import {logger} from './logger.js'
import {MODULE} from './module.js'
import {Comms} from './comms.js'
import {Mutator} from './mutator.js'

const NAME = "RemoteMutator";

export class RemoteMutator {

  static register() {
    RemoteMutator.settings();
  }

  static settings() {
    const config = true;
    const settingsData = {
      alwaysAccept: {
        scope: 'client', config, default: false, type: Boolean
      }
    };

    MODULE.applySettings(settingsData);
  }

  //responseData:
  //------
  //sceneId
  //userId
  //-------
  //accepted (bool)
  //tokenId
  //actorId
  //mutationId
  //updates (if mutate)

  /* create the needed trigger functions if there is a post callback to handle */
  static _createMutateTriggers( tokenDoc, {post = undefined}, options ) {

    const condition = (responseData) => {
      return responseData.tokenId === tokenDoc.id && responseData.mutationId === options.name;
    }

    /* craft the response handler
     * execute the post callback */
    const handleResponse = async (responseData) => {

      /* if accepted, run our post callback */
      if (responseData.accepted) {
        const tokenDoc = game.scenes.get(responseData.sceneId).getEmbeddedDocument('Token', responseData.tokenId);
        const info = MODULE.format('display.mutationAccepted', {mName: options.name, tName: tokenDoc.name});
        ui.notifications.info(info);

        /* only need to do this if we have a post callback */
        if (post) await post(tokenDoc, responseData.updates);
      } else {
        const warn = MODULE.format('display.mutationRejected', {mName: options.name, tName: tokenDoc.name});
        ui.notifications.warn(warn);
      }

      return;
    }

    warpgate.event.trigger(warpgate.EVENT.MUTATE_RESPONSE, handleResponse, condition);
  }

  static _createRevertTriggers( tokenDoc, mutationName = undefined ) {

    const condition = (responseData) => {
      return responseData.tokenId === tokenDoc.id && (responseData.mutationId === mutationName || !mutationName);
    }

    /* if no name provided, we are popping the last one */
    const mName = mutationName ? mutationName : warpgate.mutationStack(tokenDoc).last.name;

    /* craft the response handler
     * execute the post callback */
    const handleResponse = async (responseData) => {

      /* if accepted, run our post callback */
      if (responseData.accepted) {
        const tokenDoc = game.scenes.get(responseData.sceneId).getEmbeddedDocument('Token', responseData.tokenId);
        const info = MODULE.format('display.revertAccepted', {mName , tName: tokenDoc.name});
        ui.notifications.info(info);
      } else {
        const warn = MODULE.format('display.revertRejected', {mName , tName: tokenDoc.name});
        ui.notifications.warn(warn);
      }

      return;
    }

    warpgate.event.trigger(warpgate.EVENT.REVERT_RESPONSE, handleResponse, condition);

  }

  static remoteMutate( tokenDoc, {updates, callbacks = {}, options} ) {
    /* we need to make sure there is a user that can handle our resquest */
    if (!MODULE.firstOwner(tokenDoc)) {
      logger.error(MODULE.localize('error.noOwningUserMutate'));
      return false;
    }

    /* register our trigger for monitoring remote response.
     * This handles the post callback
     */
    RemoteMutator._createMutateTriggers( tokenDoc, callbacks, options );

    /* broadcast the request to mutate the token */
    return Comms.requestMutate(tokenDoc.id, tokenDoc.parent.id, { updates, options });
  }

  static remoteRevert( tokenDoc, mutationId = undefined ) {
    /* we need to make sure there is a user that can handle our resquest */
    if (!MODULE.firstOwner(tokenDoc)) {
      logger.error(MODULE.format('error.noOwningUserRevert'));
      return false;
    }

    /* register our trigger for monitoring remote response.
     * This handles the post callback
     */
    RemoteMutator._createRevertTriggers( tokenDoc, mutationId );

    /* broadcast the request to mutate the token */
    return Comms.requestRevert(tokenDoc.id, tokenDoc.parent.id, {mutationId});
  }

  static async handleMutationRequest(payload) {
    
    /* First, are we the first player owner? If not, stop, they will handle it */
    const tokenDoc = game.scenes.get(payload.sceneId).getEmbeddedDocument('Token', payload.tokenId);

    if (MODULE.isFirstOwner(tokenDoc.actor)) {

      const alwaysAccept = MODULE.setting('alwaysAccept');
      const accepted = alwaysAccept ? alwaysAccept : await RemoteMutator._queryRequest(tokenDoc, payload.userId, payload.options.description, payload.updates);

      let responseData = {
        sceneId: payload.sceneId,
        userId: game.user.id,
        accepted,
        tokenId: payload.tokenId,
        mutationId: payload.options.name,
        updates: payload.updates
      }

      if (accepted) {
        /* first owner accepts mutation -- apply it */
        /* requests will never have callbacks */
        await Mutator.mutate(tokenDoc, payload.updates, {}, payload.options);
        const message = MODULE.format('display.mutationRequestTitle', {userName: game.users.get(payload.userId).name, tokenName: tokenDoc.name});
        ui.notifications.info(message);
      }

      await warpgate.event.notify(warpgate.EVENT.MUTATE_RESPONSE, responseData);
    }
  }

  static async handleRevertRequest(payload) {
    /* First, are we the first player owner? If not, stop, they will handle it */
    const tokenDoc = game.scenes.get(payload.sceneId).getEmbeddedDocument('Token', payload.tokenId);

    const stack = warpgate.mutationStack(tokenDoc);
    const details = payload.mutationId ? stack.getName(payload.mutationId) : stack.last;
    const description = MODULE.format('display.revertRequestDescription', {mName: details.name, tName: tokenDoc.name});

    if (MODULE.isFirstOwner(tokenDoc.actor)) {

      const alwaysAccept = MODULE.setting('alwaysAccept');
      const accepted = alwaysAccept ? 
        alwaysAccept : 
        await RemoteMutator._queryRequest(tokenDoc, payload.userId, description, details );

      let responseData = {
        sceneId: payload.sceneId,
        userId: game.user.id,
        accepted,
        tokenId: payload.tokenId,
        mutationId: payload.mutationId
      }

      /* if the request is accepted, do the revert */
      if (accepted) {
        await Mutator.revertMutation(tokenDoc, payload.mutationId);
        if (alwaysAccept) { 
          ui.notifications.info(description);
        }
      }

      await warpgate.event.notify(warpgate.EVENT.REVERT_RESPONSE, responseData);
    }
  }

  static async _queryRequest(tokenDoc, requestingUserId, description, detailsObject) {

    /* if this is update data, dont include the mutate data please, its huge */
    const displayObject = duplicate(detailsObject);
    if (displayObject.actor?.flags?.warpgate) {
      delete displayObject.actor.flags.warpgate;
      if (isObjectEmpty(displayObject.actor.flags)) delete displayObject.actor.flags;
    }
    const details = RemoteMutator._convertObjToHTML(displayObject)

    const modeSwitch = {
      description: {label: MODULE.localize('display.inspectLabel'), value: 'inspect', content: `<p>${description}</p>`},
      inspect: {label: MODULE.localize('display.descriptionLabel'), value: 'description', content: details }
    }

    const title = MODULE.format('display.mutationRequestTitle', {userName: game.users.get(requestingUserId).name, tokenName: tokenDoc.name});

    let userResponse = false;
    let modeButton = modeSwitch.description;

    do {
      userResponse = await warpgate.buttonDialog({buttons: [{label: MODULE.localize('display.findTargetLabel'), value: 'select'}, {label: MODULE.localize('display.acceptLabel'), value: true}, {label: MODULE.localize('display.rejectLabel'), value: false}, modeButton], content: modeButton.content, title, options: {top: 100}});

      if (userResponse === 'select') {
        if (tokenDoc.object) {
          tokenDoc.object.control({releaseOthers: true});
          await canvas.animatePan({x: tokenDoc.data.x, y: tokenDoc.data.y});
        }
      } else if (userResponse !== false && userResponse !== true) {
        /* swap modes and re-render */
        modeButton = modeSwitch[userResponse];
      }

    } while (userResponse !== false && userResponse !== true)

    return userResponse;

  }

  static _convertObjToHTML(obj) {
    const stringified = JSON.stringify(obj, undefined, '$SPACING');
    return stringified.replaceAll('\n', '<br>').replaceAll('$SPACING', '&nbsp;&nbsp;&nbsp;&nbsp;');
  }

}

