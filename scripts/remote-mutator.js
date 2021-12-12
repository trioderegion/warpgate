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
  //updates

  /* create the needed trigger functions if there is a post callback to handle */
  static _createTriggerFuncs( tokenDoc, {post = undefined}, options ) {

    /* only need to do this if we have a post callback */
    if(post) {

      const condition = (responseData) => {
        return responseData.tokenId === tokenDoc.id && responseData.mutationId === options.name;
      }

      /* craft the response handler
       * execute the post callback */
      const handleResponse = async (responseData) => {

        /* if accepted, run our post callback */
        if (responseData.accepted) {
          const tokenDoc = game.scenes.get(responseData.sceneId).getEmbeddedDocument('Token', responseData.tokenId);

          await post(tokenDoc, responseData.updates);
        }

        return;
      }

      warpgate.event.trigger(warpgate.EVENT.MUTATE_RESPONSE, handleResponse, condition);

    }

    return;
  }

  static remoteMutate( tokenDoc, {updates, callbacks = {}, options} ) {
    /* we need to make sure there is a user that can handle our resquest */
    if (!MODULE.firstOwner(tokenDoc)) {
      logger.error("No owning user online. Mutation request cannot be fullfilled.");
      return false;
    }

    /* register our trigger for monitoring remote response.
     * This handles the post callback
     */
    RemoteMutator._createTriggerFuncs( tokenDoc, callbacks, options );

    /* broadcast the request to mutate the token */
    return Comms.requestMutate(tokenDoc.id, tokenDoc.parent.id, { updates, options });
  }

  static async handleMutationRequest(payload) {
    
    /* First, are we the first player owner? If not, stop, they will handle it */
    const tokenDoc = game.scenes.get(payload.sceneId).getEmbeddedDocument('Token', payload.tokenId);

    if (MODULE.isFirstOwner(tokenDoc.actor)) {

      const accepted = await RemoteMutator._queryRequest(tokenDoc, payload);

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
      }

      await warpgate.event.notify(warpgate.EVENT.MUTATE_RESPONSE, responseData);
    }
  }

  static async _queryRequest(tokenDoc, requestPayload) {

    let displayUpdate = duplicate(requestPayload.updates);
    if (displayUpdate.actor?.flags?.warpgate?.mutate) delete displayUpdate.actor.flags.warpgate.mutate;

    const modeSwitch = {
      description: {label: 'Inspect', value: 'inspect', content: `<p>${requestPayload.options.description}</p>`},
      inspect: {label: 'Description', value: 'description', content: RemoteMutator._convertObjToHTML(displayUpdate)}
    }

    const title = `${game.users.get(requestPayload.userId).name} is Mutating ${tokenDoc.name}`;

    let userResponse = false;
    let modeButton = modeSwitch.description;

    do {
      userResponse = await warpgate.buttonDialog({buttons: [{label: 'Find Target', value: 'select'}, {label: 'Accept', value: true}, {label: 'Reject', value: false}, modeButton], content: modeButton.content, title, options: {top: 100}});

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

