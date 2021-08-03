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
import {queueEntityUpdate} from './update-queue.js'
import {Crosshairs} from './crosshairs.js'
import { Comms } from './comms.js'

const NAME = "Gateway";

export class Gateway {

  static register() {

  }

  static settings() {

  }

  static defaults() {
    MODULE[NAME] = {
    }
  }

  static queueUpdate(fn) {
    queueEntityUpdate("gateway", fn);
  }


  /** dnd5e helper function
   * @param { Item5e } item
   * @todo abstract further out of core code
   */
  static async _rollItemGetLevel(item) {
    const result = await item.roll();
    // extract the level at which the spell was cast
    if (!result) return 0;
    const content = result.data.content;
    const level = content.charAt(content.indexOf("data-spell-level") + 18);
    return parseInt(level);
  }

  static drawCrosshairs(protoToken, callback) {
    const template = Crosshairs.fromToken(protoToken);
    template.callback = callback;
    template.protoToken = protoToken;
    template.drawPreview();
  }

  static dismissSpawn(tokenId, sceneId) {

    /** @todo localize */
    if (!tokenId || !sceneId){
      logger.error("Cannot dismiss null token or from a null scene.");
      return;
    }

    Gateway.queueUpdate( async () => {
      logger.debug("Deleting token =>", tokenId, "from scene =>", sceneId);

      /** GMs can always delete tokens */
      if (game.user.isGM) {
        await game.scenes.get(sceneId).deleteEmbeddedDocuments("Token",[tokenId]);
      } else {
        /** otherwise, we need to send a request for deletion */
        if (!MODULE.firstGM()){
          logger.error("No GM available for dismiss request.");
          return;
        }

        Comms.requestDismissSpawn(tokenId, sceneId);
      }

    })}

  /* returns promise of token creation */
  static _spawnActorAtLocation(protoToken, spawnPoint) {
    protoToken.x = spawnPoint.x;
    protoToken.y = spawnPoint.y;

    // Increase this offset for larger summons
    protoToken.x -= (canvas.scene.data.grid / 2 * (protoToken.width));
    protoToken.y -= (canvas.scene.data.grid / 2 * (protoToken.height));

    return canvas.scene.createEmbeddedDocuments("Token", [protoToken])
  }

  static _parseUpdateShorthand(itemUpdates, actor) {
    let parsedUpdates = Object.keys(itemUpdates).map((key) => {
      if (itemUpdates[key] === warpgate.CONST.DELETE) return { _id: null };
      return {
        _id: actor.items.getName(key)?.id ?? null,
        ...itemUpdates[key]
      }
    });
    parsedUpdates = parsedUpdates.filter( update => !!update._id);
    return parsedUpdates;
  }

  static _parseDeleteShorthand(itemUpdates, actor) {
    let parsedUpdates = Object.keys(itemUpdates).map((key) => {
      if (itemUpdates[key] !== warpgate.CONST.DELETE) return null;
      return actor.items.getName(key)?.id ?? null;
    });

    parsedUpdates = parsedUpdates.filter( update => !!update);
    return parsedUpdates;
  }

  /** @todo */
  static _parseAddShorthand(itemUpdates, actor){

  }

  static async _updateSummon(summonedDocument, updates = {item: {}, actor: {}, token: {}}) {
    /* ensure creator owns this token */
    let permissions = { permission: duplicate(summonedDocument.actor.data.permission) };
    permissions.permission[game.user.id] = 3;

    updates.actor = mergeObject(updates.actor ?? {}, permissions);

    /** perform the updates */
    if (updates.actor) await summonedDocument.actor.update(updates.actor);

    /** split out the shorthand notation we've created */
    if (updates.item) {
      const parsedUpdates = Gateway._parseUpdateShorthand(updates.item, summonedDocument.actor);
      const parsedDeletes = Gateway._parseDeleteShorthand(updates.item, summonedDocument.actor);

      if (parsedUpdates.length > 0) await summonedDocument.actor.updateEmbeddedDocuments("Item", parsedUpdates);
      if (parsedDeletes.length > 0) await summonedDocument.actor.deleteEmbeddedDocuments("Item", parsedDeletes);
    }

    return;
  }

}
