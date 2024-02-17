import LocalMutator from './LocalMutator.mjs';
import BaseMutator from './BaseMutator.mjs';
import {MODULE} from '../../scripts/module.js';

class RequestMutator extends BaseMutator {

  async _setup(options) {
    /* Check if this mutation should be blindly accepted */
    const { alwaysAccept } = RemoteMutator.getFeedbackSettings(this.mutation.config.overrides);
    if (alwaysAccept) return true;

    /* Otherwise, show confirmation/inspection app */
    const promise = new Promise( resolve => {
      const app = new nexus.apps.MutationInspect(
        this.mutation,
        {
          callback: (accepted = false) => resolve(accepted),
          requestId: options.requestId,
        }
      );

      app.render(true);
    });

    return promise;
  }

  async _mutate(options) {
    await super._mutate(options);
    return true;
  }
}

export default class RemoteMutator extends LocalMutator {

  static EVENT = {
    REQUEST: '%config.id%.RemoteMutator.request',
    RESPONSE: id => `%config.id%.response:${id}`,
  };

  static getFeedbackSettings({alwaysAccept = false, suppressToast = false} = {}) {
    const acceptSetting =
      nexus.utils.config.get('alwaysAcceptLocal') === 0
        ? nexus.utils.config.get('alwaysAccept')
        : { 1: true, 2: false }[nexus.utils.config.get('alwaysAcceptLocal')];

    const accepted = alwaysAccept ? true : acceptSetting;

    const suppressSetting =
      nexus.utils.config.get('suppressToastLocal') === 0
        ? nexus.utils.config.get('suppressToast')
        : { 1: true, 2: false }[nexus.utils.config.get('suppressToastLocal')];

    const suppress = suppressToast ? true : suppressSetting;

    return { alwaysAccept: accepted, suppressToast: suppress };
  }

  static init(nexus) {
    this._registerSettings(nexus);
    this._registerSockets();
  }

  static _registerSettings(n) {
    const settingsData = {
      alwaysAccept: {
        scope: 'world', default: false, type: Boolean
      },
      suppressToast: {
        scope: 'world', default: false, type: Boolean
      },
      alwaysAcceptLocal: {
        scope: 'client', default: 0, type: Number,
        choices: {
          0: '%config.id%.setting.option.useWorld',
          1: '%config.id%.setting.option.overrideTrue',
          2: '%config.id%.setting.option.overrideFalse',
        }
      },
      suppressToastLocal: {
        scope: 'client', default: 0, type: Number,
        choices: {
          0: '%config.id%.setting.option.useWorld',
          1: '%config.id%.setting.option.overrideTrue',
          2: '%config.id%.setting.option.overrideFalse',
        }
      },
    };

    n.utils.config.register(settingsData);
  }

  static _registerSockets() {
    game.socket.on(this.EVENT.REQUEST, this.handleRequest);
  }

  static handleRequest({id, target, mutation}) {
    /* Create local mutation */
    const remoteMutation = new this.models.mutation(target);
    remoteMutation.updateSource(mutation);

    /* Create our specific local mutator and apply */
    const driver = new RequestMutator(remoteMutation);
    const accepted = driver.mutate({requestId: id});
    game.socket.emit(this.EVENT.RESPONSE(id), accepted);
  }


  #requestMutate(id = '**ERROR**') {
    game.socket.emit(this.constructor.EVENT.REQUEST, {id, mutation: this.mutation});
  }

  async _setup(options) {
    if (!MODULE.firstOwner(this.mutation.getActor())) {
      logger.error(MODULE.localize('error.noOwningUserMutate'));
      return false;
    }
  }

  async _mutate(options) {
    /* Purposefully not calling super as we want to defer
     * this update to a remote client */
    const requestId = foundry.utils.randomID();
    const promise = new Promise( (resolve, reject) => {
      game.socket.once(
        this.constructor.EVENT.RESPONSE(requestId),
        response => response.accepted ? resolve(response) : reject(response)
      );
    });

    this.#requestMutate(requestId);

    return promise;
  }

  async _cleanup(options) {

    if (this.results.accepted) {
      /* TODO feedback */
    } else {
      /* TODO feedback */
    }

    return await super._cleanup(options);
  }
}

/* Wait for announce and register socket listeners */
Hooks.on('%config.id%.init', RemoteMutator.init.bind(RemoteMutator));
