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
    template.drawPreview();
  }

  /* returns promise of token creation */
  static _spawnActorAtLocation(actorName, spawnPoint) {
    let protoToken = duplicate(game.actors.getName(actorName).data.token);

    protoToken.x = spawnPoint.x;
    protoToken.y = spawnPoint.y;

    // Increase this offset for larger summons
    protoToken.x -= (canvas.scene.data.grid / 2 + (protoToken.width - 1) * canvas.scene.data.grid);
    protoToken.y -= (canvas.scene.data.grid / 2 + (protoToken.height - 1) * canvas.scene.data.grid);

    return canvas.scene.createEmbeddedDocuments("Token", [protoToken])
  }

  static _createItemUpdates(updateMap, actor) {

    let itemUpdates = [];
    for( const name in updateMap ) {
      itemUpdates.push({"_id": actor.items.getName(name).id, ...itemUpdates[name]});
    }

    return itemUpdates;
  }

  async _updateSummon(summonedDocument, itemUpdates, actorUpdates, tokenUpdates) {

    /** gather the user defined updates */
    //const itemsUpdate = itemUpdateGenerator(castingLevel, summonerActor, summonedDocument);
    //const summonUpdate = actorUpdateGenerator(castingLevel, summonerActor, summonedDocument);
    //const tokenUpdate = tokenUpdateGenerator(castingLevel, summonerActor, summonedDocument);

    /** perform the updates */
    await summonedDocument.update(tokenUpdates);
    await summonedDocument.actor.update(actorUpdates);
    return summonedDocument.actor.updateEmbeddedDocuments("Item", itemUpdates);
  }

  /** Factory function to generate a hook method to spawn a given actor name
   *  at a template's location */
  static deleteTemplatesAndSpawn(actorName, summonerActor, castingLevel) {
    return async (templateDocument) => {
      const summonedDoc = (await _spawnActorAtTemplate(actorName, templateDocument))[0];
      await templateDocument.delete();
      await _updateSummon(summonedDoc, summonerActor, castingLevel);
    }
  }
}
