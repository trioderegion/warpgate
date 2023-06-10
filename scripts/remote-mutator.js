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

import {MODULE, logger} from './module.js'
import {requestMutate, requestRevert} from './comms.js'
import {mutate, revertMutation} from './mutator.js'

const NAME = "RemoteMutator";

class RemoteMutator {

  static register() {
    RemoteMutator.settings();
  }

  static settings() {
    const config = true;
    const settingsData = {
      alwaysAccept: {
        scope: 'world', config, default: false, type: Boolean
      },
      suppressToast: {
        scope: 'world', config, default: false, type: Boolean
      },
      alwaysAcceptLocal: {
        scope: 'client', config, default: 0, type: Number,
        choices: {
          0: MODULE.localize('setting.option.useWorld'),
          1: MODULE.localize('setting.option.overrideTrue'),
          2: MODULE.localize('setting.option.overrideFalse'),
        }
      },
      suppressToastLocal: {
        scope: 'client', config, default: 0, type: Number,
        choices: {
          0: MODULE.localize('setting.option.useWorld'),
          1: MODULE.localize('setting.option.overrideTrue'),
          2: MODULE.localize('setting.option.overrideFalse'),
        }
      },
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
    const promise = new Promise( (resolve) => {
      const handleResponse = async (responseData) => {

        /* if accepted, run our post callback */
        const tokenDoc = game.scenes.get(responseData.sceneId).getEmbeddedDocument('Token', responseData.tokenId);
        if (responseData.accepted) {
          const info = MODULE.format('display.mutationAccepted', {mName: options.name, tName: tokenDoc.name});

          const {suppressToast} = MODULE.getFeedbackSettings(options.overrides);
          if(!suppressToast) ui.notifications.info(info);
        } else {
          const warn = MODULE.format('display.mutationRejected', {mName: options.name, tName: tokenDoc.name});
          if(!options.overrides?.suppressReject) ui.notifications.warn(warn);
        }

        /* only need to do this if we have a post callback */
        if (post) await post(tokenDoc, responseData.updates, responseData.accepted);
        resolve(responseData);
        return;
      }

      warpgate.event.trigger(warpgate.EVENT.MUTATE_RESPONSE, handleResponse, condition);
    });

    return promise;
  }

  static _createRevertTriggers( tokenDoc, mutationName = undefined, {callbacks={}, options = {}} ) {

    const condition = (responseData) => {
      return responseData.tokenId === tokenDoc.id && (responseData.mutationId === mutationName || !mutationName);
    }

    /* if no name provided, we are popping the last one */
    const mName = mutationName ? mutationName : warpgate.mutationStack(tokenDoc).last.name;

    /* craft the response handler
     * execute the post callback */
    const promise = new Promise(async (resolve) => {
      const handleResponse = async (responseData) => {
        const tokenDoc = game.scenes.get(responseData.sceneId).getEmbeddedDocument('Token', responseData.tokenId);

        /* if accepted, run our post callback */
        if (responseData.accepted) {
          const info = MODULE.format('display.revertAccepted', {mName , tName: tokenDoc.name});
          const {suppressToast} = MODULE.getFeedbackSettings(options.overrides);
          if(!suppressToast) ui.notifications.info(info);
        } else {
          const warn = MODULE.format('display.revertRejected', {mName , tName: tokenDoc.name});
          if(!options.overrides?.suppressReject) ui.notifications.warn(warn);
        }

        await callbacks.post?.(tokenDoc, responseData.updates, responseData.accepted);

        resolve(responseData);
        return;
      }

      warpgate.event.trigger(warpgate.EVENT.REVERT_RESPONSE, handleResponse, condition);
    });

    return promise;
  }

  static remoteMutate( tokenDoc, {updates, callbacks = {}, options = {}} ) {
    /* we need to make sure there is a user that can handle our resquest */
    if (!MODULE.firstOwner(tokenDoc)) {
      logger.error(MODULE.localize('error.noOwningUserMutate'));
      return false;
    }

    /* register our trigger for monitoring remote response.
     * This handles the post callback
     */
    const promise = RemoteMutator._createMutateTriggers( tokenDoc, callbacks, options );

    /* broadcast the request to mutate the token */
    requestMutate(tokenDoc.id, tokenDoc.parent.id, { updates, options });

    return promise;
  }

  /**
   *
   * @returns {Promise<Array<Object>>}
   */
  static async remoteBatchMutate( tokenDocs, {updates, callbacks = {}, options = {}} ) {
    /* follow normal protocol for initial requests.
     * if accepted, force accept and force suppress remaining token mutations
     * if rejected, bail on all further mutations for this owner */

    const firstToken = tokenDocs.shift();
    let results = [await warpgate.mutate(firstToken, updates, callbacks, options)];

    if (results[0].accepted) {

      const silentOptions = foundry.utils.mergeObject(options, { overrides: {alwaysAccept: true, suppressToast: true} }, {inplace: false});

      results = results.concat(tokenDocs.map( tokenDoc => {
        return warpgate.mutate(tokenDoc, updates, callbacks, silentOptions);
      }));

    } else {
      results = results.concat(tokenDocs.map( tokenDoc => ({sceneId: tokenDoc.parent.id, tokenId: tokenDoc.id, accepted: false})));
    }

    
    return results;
  }

  static remoteRevert( tokenDoc, {mutationId = null, callbacks={}, options = {}} = {} ) {
    /* we need to make sure there is a user that can handle our resquest */
    if (!MODULE.firstOwner(tokenDoc)) {
      logger.error(MODULE.format('error.noOwningUserRevert'));
      return false;
    }

    /* register our trigger for monitoring remote response.
     * This handles the post callback
     */
    const result = RemoteMutator._createRevertTriggers( tokenDoc, mutationId, {callbacks, options} );

    /* broadcast the request to mutate the token */
    requestRevert(tokenDoc.id, tokenDoc.parent.id, {mutationId, options});

    return result;
  }

  /**
   *
   * @returns {Promise<Array<Object>>}
   */
  static async remoteBatchRevert( tokenDocs, {mutationName = null, options = {}} = {} ) {

    /* follow normal protocol for initial requests.
     * if accepted, force accept and force suppress remaining token mutations
     * if rejected, bail on all further mutations for this owner */

    let firstToken = tokenDocs.shift();
    while( !!firstToken && warpgate.mutationStack(firstToken).stack.length == 0 ) firstToken = tokenDocs.shift();

    if(!firstToken) return [];

    const results = [await warpgate.revert(firstToken, mutationName, options)];

    if(results[0].accepted) {

      const silentOptions = foundry.utils.mergeObject(options, {
          overrides: {alwaysAccept: true, suppressToast: true}
        }, {inplace: false}
      );

      results.push(...(tokenDocs.map( tokenDoc => {
        return warpgate.revert(tokenDoc, mutationName, silentOptions);
      })))
    } else {
      results.push(...tokenDocs.map( tokenDoc => ({sceneId: tokenDoc.parent.id, tokenId: tokenDoc.id, accepted: false})));
    }

    return results;
  }

  static async handleMutationRequest(payload) {
    
    /* First, are we the first player owner? If not, stop, they will handle it */
    const tokenDoc = game.scenes.get(payload.sceneId).getEmbeddedDocument('Token', payload.tokenId);

    if (MODULE.isFirstOwner(tokenDoc.actor)) {

      let {alwaysAccept: accepted, suppressToast} = MODULE.getFeedbackSettings(payload.options.overrides);
      
      if(!accepted) {
        accepted = await RemoteMutator._queryRequest(tokenDoc, payload.userId, payload.options.description, payload.updates)

        /* if a dialog is shown, the user knows the outcome */
        suppressToast = true;
      }

      let responseData = {
        sceneId: payload.sceneId,
        userId: game.user.id,
        accepted,
        tokenId: payload.tokenId,
        mutationId: payload.options.name,
        options: payload.options,
      }

      await warpgate.event.notify(warpgate.EVENT.MUTATE_RESPONSE, responseData);

      if (accepted) {
        /* first owner accepts mutation -- apply it */
        /* requests will never have callbacks */
        await mutate(tokenDoc, payload.updates, {}, payload.options);
        const message = MODULE.format('display.mutationRequestTitle', {userName: game.users.get(payload.userId).name, tokenName: tokenDoc.name});
        
        if(!suppressToast) ui.notifications.info(message);
      }
    }
  }

  static async handleRevertRequest(payload) {

    /* First, are we the first player owner? If not, stop, they will handle it */
    const tokenDoc = game.scenes.get(payload.sceneId).getEmbeddedDocument('Token', payload.tokenId);

    if (MODULE.isFirstOwner(tokenDoc.actor)) {

      const stack = warpgate.mutationStack(tokenDoc);
      if( (stack.stack ?? []).length == 0 ) return;
      const details = payload.mutationId ? stack.getName(payload.mutationId) : stack.last;
      const description = MODULE.format('display.revertRequestDescription', {mName: details.name, tName: tokenDoc.name});

      let {alwaysAccept: accepted, suppressToast} = MODULE.getFeedbackSettings(payload.options.overrides);

      if(!accepted) {
        accepted = await RemoteMutator._queryRequest(tokenDoc, payload.userId, description, details );
        suppressToast = true;
      }

      let responseData = {
        sceneId: payload.sceneId,
        userId: game.user.id,
        accepted,
        tokenId: payload.tokenId,
        mutationId: payload.mutationId
      }

      await warpgate.event.notify(warpgate.EVENT.REVERT_RESPONSE, responseData);

      /* if the request is accepted, do the revert */
      if (accepted) {
        await revertMutation(tokenDoc, payload.mutationId, payload.options);

        if (!suppressToast) { 
          ui.notifications.info(description);
        }
      }

    }
  }

  static async _queryRequest(tokenDoc, requestingUserId, description = 'warpgate.display.emptyDescription', detailsObject) {

    /* if this is update data, dont include the mutate data please, its huge */
    let displayObject = duplicate(detailsObject);
    if (displayObject.actor?.flags?.warpgate) {
      displayObject.actor.flags.warpgate = {};
    }

    displayObject = MODULE.removeEmptyObjects(displayObject);

    const details = RemoteMutator._convertObjToHTML(displayObject)

    const modeSwitch = {
      description: {label: MODULE.localize('display.inspectLabel'), value: 'inspect', content: `<p>${game.i18n.localize(description)}</p>`},
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
          await canvas.animatePan({x: tokenDoc.object.x, y: tokenDoc.object.y});
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

export const register = RemoteMutator.register, handleMutationRequest = RemoteMutator.handleMutationRequest, handleRevertRequest = RemoteMutator.handleRevertRequest, remoteMutate = RemoteMutator.remoteMutate, remoteRevert = RemoteMutator.remoteRevert, remoteBatchMutate = RemoteMutator.remoteBatchMutate, remoteBatchRevert = RemoteMutator.remoteBatchRevert;


