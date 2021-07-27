import {logger} from './logger.js'
import {MODULE} from './module.js'
import {queueEntityUpdate} from './update-queue.js'
import {Crosshairs} from './crosshairs.js'

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
  async _rollItemGetLevel(item) {
    const result = await item.roll();
    // extract the level at which the spell was cast
    if (!result) return 0;
    const content = result.data.content;
    const level = content.charAt(content.indexOf("data-spell-level") + 18);
    return parseInt(level);
  }

  static drawCrosshairs(protoToken, owningActor, callBack) {
    const template = Crosshairs.fromToken(protoToken);
    template.actorSheet = owningActor.sheet;
    template.callBack = callBack;
    template.protoToken = protoToken;
    template.drawPreview();
  }

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
    /** perform the updates */
    if (updates.actor) await summonedDocument.actor.update(updates.actor);

    /** split out the shorthand notation we've created */
    if (updates.item) {
      const parsedUpdates = Gateway._parseUpdateShorthand(updates.item, summonedDocument.actor);
      const parsedDeletes = Gateway._parseDeleteShorthand(updates.item, summonedDocument.actor);

      if (parsedUpdates.length > 0) await summonedDocument.actor.updateEmbeddedDocuments("Item", parsedUpdates);
      if (parsedDeletes.length > 0) return summonedDocument.actor.deleteEmbeddedDocuments("Item", parsedDeletes);
    }
  }

}
