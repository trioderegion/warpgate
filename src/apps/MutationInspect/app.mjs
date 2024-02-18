export default class MutationInspect extends Application {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      top: 100,
      template: 'modules/%config.id%/apps/MutationInspect/template.hbs',
      classes: ['%config.id%', 'mutation-inspect'],
      id: '%config.id%-inspect:ERROR',
      tabs: [{group: 'main', navSelector: 'nav', contentSelector: '.body', initial: 'summary'}],
      width: 400,
      height: 400,
      title: 'Mutation Request', // TODO localize
    });
  }

  mutation;

  constructor(mutation, {callback = null, requestId = null, ...options} = {}) {
    options.id ??= `%config.id%-inspect:${requestId}`;
    super(options);
    this.mutation = mutation;
    this.callback = callback;
    this.requestId = requestId;
  }

  locate() {
    const token = this.mutation.getToken();
    if (token.object) {
      token.object.control({releaseOthers: true});
      return canvas.animatePan(token.object.center);
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    const handler = this._onClick.bind(this);
    for (const element of html) {
      if (element.tagName !== 'NAV') element.addEventListener('click', handler);
    }
  }

  _onClick(evt) {
    const target = evt.target.closest('button[data-action]');
    if (!target) return;
    evt.preventDefault();
    const action = target.dataset.action;
    switch (action) {
      case 'accept':
        return this.close({accepted: true});
      case 'reject':
        return this.close({accepted: false});
      case 'locate':
        return this.locate();
    }
  }

  getData(options = {}) {
    const context = super.getData(options);
    context.changes = {
      token: JSON.stringify(this.mutation.getDiff('token')),
      actor: JSON.stringify(this.mutation.getDiff('actor')),
      embedded: JSON.stringify(this.mutation.getDiff('embedded')),
    };

    return context;
  }

  async close({accepted = false, ...options} = {}) {
    this.callback?.(accepted);
    return super.close(options);
  }
}
