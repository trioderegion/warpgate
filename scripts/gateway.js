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
import {Propagator} from './propagator.js'

const NAME = "Gateway";

export class Gateway {

  static register() {
    this.settings();
  }

  static settings() {
    const config = true;
    const settingsData = {
      openDelete : {
        scope: "world", config, default: false, type: Boolean,
      },
    };

    MODULE.applySettings(settingsData);
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
    return template.drawPreview();
  }

  static async dismissSpawn(tokenId, sceneId) {

    /** @todo localize */
    if (!tokenId || !sceneId){
      logger.debug("Cannot dismiss null token or from a null scene.", tokenId, sceneId);
      return;
    }

    /* check for permission to delete freely */
    if (!MODULE.setting('openDelete')) {
      /* check permissions on token */
      const tokenData = game.scenes.get(sceneId)?.getEmbeddedDocument("Token",tokenId);
      if (!tokenData.isOwner) {
        logger.error(MODULE.localize('error.unownedDelete'));
        return;
      }
    }

    
    logger.debug("Deleting token =>", tokenId, "from scene =>", sceneId);

    /** GMs can always delete tokens */
    if (game.user.isGM) {
      await game.scenes.get(sceneId).deleteEmbeddedDocuments("Token",[tokenId]);
    } else {
      /** otherwise, we need to send a request for deletion */
      if (!MODULE.firstGM()){
        logger.error('error.noGm');
        return;
      }

      Comms.requestDismissSpawn(tokenId, sceneId);
    }
    
    return;
  }

  /* returns promise of token creation */
  static async _spawnActorAtLocation(protoToken, spawnPoint, collision) {

    // Increase this offset for larger summons
    spawnPoint.x -= (canvas.scene.data.grid  * (protoToken.width/2));
    spawnPoint.y -= (canvas.scene.data.grid  * (protoToken.height/2));
    
    /* call ripper's placement algorithm for collision checks
     * which will try to avoid tokens and walls
     */
    if (collision) {
      const openPosition = Propagator.getFreePosition(protoToken, spawnPoint);  
      if(!openPosition) {
        /** @todo localize */
        logger.info('Could not locate open locations near chosen location. Overlapping at chosen location:', spawnPoint);
      } else {
        spawnPoint = openPosition
      }
    }

    protoToken.x = spawnPoint.x;
    protoToken.y = spawnPoint.y;

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
    let parsedAdds = Object.keys(itemUpdates).map((key) => {

      /* ignore deletes */
      if (itemUpdates[key] === warpgate.CONST.DELETE) return false;

      /* ignore item updates for items that exist */
      if (actor.items.getName(key) != null) return false;

      return {
        ...itemUpdates[key],
        name: key
      }

    });
    parsedAdds = parsedAdds.filter( update => !!update);
    return parsedAdds;

  }

  static async _updateSummon(summonedDocument, updates = {}) {
    /* ensure creator owns this token */
    let permissions = { permission: duplicate(summonedDocument.actor.data.permission) };
    permissions.permission[game.user.id] = 3;

    updates.actor = mergeObject(updates.actor ?? {}, permissions);

    /** perform the updates */
    if (updates.actor) await summonedDocument.actor.update(updates.actor);

    /** split out the shorthand notation we've created */
    if (updates.item) {
      const parsedAdds = Gateway._parseAddShorthand(updates.item, summonedDocument.actor);
      const parsedUpdates = Gateway._parseUpdateShorthand(updates.item, summonedDocument.actor);
      const parsedDeletes = Gateway._parseDeleteShorthand(updates.item, summonedDocument.actor);

      try {
        if (parsedAdds.length > 0) await summonedDocument.actor.createEmbeddedDocuments("Item", parsedAdds);
      } catch (e) {
        logger.error(`${MODULE.localize('error.createItem')}: ${e}`)
      } 

      try {
        if (parsedUpdates.length > 0) await summonedDocument.actor.updateEmbeddedDocuments("Item", parsedUpdates);
      } catch (e) {
        logger.error(`${MODULE.localize('error.updateItem')}: ${e}`)
      }

      try {
        if (parsedDeletes.length > 0) await summonedDocument.actor.deleteEmbeddedDocuments("Item", parsedDeletes);
      } catch (e) {
        logger.error(`${MODULE.localize('error.deleteItem')}: ${e}`)
      }
    }

    return;
  }

}
