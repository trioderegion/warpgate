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
      const delta = new this.models.delta({}, {parent: this.mutation});

      /* Allow user to modify delta if needed */
      const cont = await options.callbacks?.delta(delta) ?? true;

      if (cont === false) return false;

      /* Update the mutation info with the final updates including mutate stack info */
      const stack = new this.models.stack(null, {parent: this.mutation.getActor()}).push(delta);
      this.mutation.updateSource({actor: stack});
    }

    return true;
  }

  async _mutate(options) {

    if (options.notice && this.mutation.getTokens().length > 0) {

      const active = this.mutation.getTokens().filter( t => !!t.object );

      active.forEach( t => warpgate.plugin.notice({
        scene: t.parent,
        ...t.object.center
      }, options.notice ));

    }

    return await super._mutate(options);

  }

  async _cleanup(options) {
    if (!this.mutation.config.noMoveWait && this.mutation.getTokens().length > 0) {
      await Promise.all(this.mutation.getTokens().map(
        t => CanvasAnimation.getAnimation(t.object?.animationName)?.promise)
      );
    }

    /* Only need to do this if we have a post callback */
    if (options.post) await options.post(this);

    return await super._cleanup(options);
  }
}
