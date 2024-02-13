import warpdata from '../../models';
import {MODULE} from '../../scripts/module.js';

/**
 *
 *
 * @export
 * @class BaseMutator
 */
export default class BaseMutator {
  
  models = {
      delta: warpdata.RollbackDelta,
      stack: warpdata.RollbackStack,
  };

  constructor(mutation, models = {}) {
    this.mutation = mutation;
    Object.assign(this.models, models);
  }

  async mutate(options = {}) {
    if (!await this._setup(options)) return;
    if (!await this._updateStack(options)) return;
    const results = await this._mutate(options);
    await this._cleanup(options);
    return results;
  }

  async _setup(options = {}) {
    const neededPerms = MODULE.canMutate(game.user)
    if (neededPerms.length > 0) {
      logger.warn(MODULE.format('error.missingPerms', {permList: neededPerms.join(', ')}));
      return false;
    }

    return true;
  }

  async _updateStack(options = {}) {
    /* Permanent changes are not tracked */
    if (!this.mutation.config.permanent) {

      const delta = new this.models.delta(this.mutation);

      /* Allow user to modify delta if needed */
      const cont = await options.callbacks?.delta(delta) ?? true;

      if (cont === false) return false;

      /* Update the mutation info with the final updates including mutate stack info */
      const stack = new this.models.stack(this.mutation.parent.actor).push(delta);
      this.mutation.updateSource({actor: stack});
    }

    return true;
  }

  async _mutate(options = {}) {

    if(options.notice && this.mutation.getScene() && this.mutation.getToken().object) {

      const placement = {
        scene: this.mutation.getScene(),
        ...this.mutation.getToken().object.center,
      };

      warpgate.plugin.notice(placement, options.notice);
    }

    await this.#apply(options);
  }
  async _cleanup(options = {}) {
    if(!this.mutation.config.noMoveWait && !!this.mutation.getToken().object) {
      await CanvasAnimation.getAnimation(this.mutation.getToken().object.animationName)?.promise
    }
  }


  async #apply(options = {}) {

    const promises = []

    /* update the token, actor, and actor-embeds */
    promises.push(this.mutation.applyToken());
    promises.push(this.mutation.applyActor());
    promises.push(...this.mutation.applyEmbedded());

    const results = await Promise.all(promises);

    

    return results;
  }

}
