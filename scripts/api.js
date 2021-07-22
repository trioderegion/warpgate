import { logger } from './logger.js'
import { Gateway } from './gateway.js'
import { MODULE } from './module.js'

export class api {

  static register() {
    api.globals();
  }

  static settings() {

  }

  static globals() {
    window[MODULE.data.name] = {
      simpleSpawn : api._simpleSpawn
    }
  }

  static _simpleSpawn(spawnName, owner) {
    /*
    *Hooks.once("createMeasuredTemplate", (templateDocument) => {
    *  Gateway.queueUpdate( async () => {
    *    const spawnedTokenDoc = (await Gateway._spawnActorAtTemplate(spawnName, templateDocument))[0];
    *    await templateDocument.delete();
    *  });
    *});
    */

    const callBack = (templateData) => {
      Gateway.queueUpdate( async () => {
        const spawnedTokenDoc = (await Gateway._spawnActorAtLocation(spawnName, templateData))[0];
      });
    }

    //get prototoken data
    const protoData = game.actors.getName(spawnName).data.token;
    Gateway.drawCrosshairs(protoData, owner, callBack);
  }

}
