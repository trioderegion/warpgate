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
      spawn : api._spawn,
      dnd5e : {
        rollItem : Gateway._rollItemGetLevel
      },
      CONST : {
        DELETE : 'delete'
      }
    }
  }

  /** Main driver
   * @param {String} spawnName
   * @param {Actor} owner
   * @param {Object} updates
   * @param {Object} callbacks
   *   pre: async function(templateData, updates). Executed after placement has been decided, but before updates have been issued. Used for modifying the updates based on position of the placement
   *   post: async function(templateData, spawnedTokenDoc). Executed after token has be spawned and updated. Good for animation triggers or chat messages.
   */
  static _spawn(spawnName, owner, updates = {item: {}, actor: {}, token: {}}, callbacks = {pre: null, post: null}) {

    const callBack = (templateData) => {
      Gateway.queueUpdate( async () => {

        /** pre creation callback */
        if (callbacks.pre) await callbacks.pre(templateData, updates);

        const spawnedTokenDoc = (await Gateway._spawnActorAtLocation(spawnName, templateData))[0];
        if (updates) await Gateway._updateSummon(spawnedTokenDoc, updates);

        /** flag this user as its creator */
        await spawnedTokenDoc.setFlag(MODULE.data.name, 'owner', game.user.id);

        /** post creation callback */
        if (callbacks.post) await callsbacks.post(templateData, spawnedTokenDoc);

      });
    }

    //get prototoken data
    const protoData = game.actors.getName(spawnName).data.token;
    Gateway.drawCrosshairs(protoData, owner, callBack);
  }
}
