import LocalMutator from './LocalMutator.mjs';

export default class LocalReverter extends LocalMutator {

  async _setup(options) {
    this.mutation.updateSource({'config.permanent': true});
    return await super._setup(options);
  }

  async _updateStack(options) {

    const stack = new this.models.stack(this.mutation.getActor());

    const delta = stack.pop();

    this.mutation.updateSource(delta.delta);

    this.mutation.updateSource({actor: stack.toFlag()});

    return true;
  }
}
