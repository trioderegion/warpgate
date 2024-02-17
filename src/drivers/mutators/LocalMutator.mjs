import {MODULE} from '../../scripts/module.js';
import BaseMutator from './BaseMutator.mjs';

export default class LocalMutator extends BaseMutator {

  async _setup(options) {
    if (!await super._setup(options)) return false;
    const neededPerms = MODULE.canMutate(game.user);
    if (neededPerms.length > 0) {
      logger.warn(MODULE.format('error.missingPerms', {permList: neededPerms.join(', ')}));
      return false;
    }

    return true;
  }

  async _updateStack(options) {
    /* Permanent changes are not tracked */
    if (!this.mutation.config.permanent) {
      const delta = new this.models.delta(this.mutation);

      /* Allow user to modify delta if needed */
      const cont = await options.callbacks?.delta(delta) ?? true;

      if (cont === false) return false;

      /* Update the mutation info with the final updates including mutate stack info */
      const stack = new this.models.stack(this.mutation.getActor()).push(delta);
      this.mutation.updateSource({actor: stack});
    }

    return true;
  }

  async _mutate(options) {
    if (options.notice && this.mutation.getScene() && this.mutation.getToken().object) {

      const placement = {
        scene: this.mutation.getScene(),
        ...this.mutation.getToken().object.center,
      };

      warpgate.plugin.notice(placement, options.notice);
    }

    return await super._mutate(options);

  }

  async _cleanup(options) {
    if (!this.mutation.config.noMoveWait && this.mutation.getToken().object) {
      await CanvasAnimation.getAnimation(this.mutation.getToken().object.animationName)?.promise;
    }

    /* Only need to do this if we have a post callback */
    if (options.post) await options.post(this);

    return await super._cleanup(options);
  }
}
