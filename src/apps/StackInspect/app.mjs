export default class StackInspect extends Application {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      top: 100,
      template: 'modules/%config.id%/apps/StackInspect/template.hbs',
      classes: ['%config.id%', 'stack-inspect'],
      id: '%config.id%-stack',
      tabs: [{group: 'main', navSelector: 'nav', contentSelector: '.body', initial: 'summary'}],
      width: 400,
      height: 400,
      title: 'Inspecting Mutation Stack', // TODO localize
    });
  }

  actor;

  constructor(actor, options = {}) {
    options.id ??= `%config.id%-stack:${actor.id ?? 'temp'}`;
    super(options);
    this.actor = actor;
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
      default:
        ui.notifications.info('click!');
    }
  }

  getData(options = {}) {
    const context = super.getData(options);

    return context;
  }

  async close(options = {}) {
    return super.close(options);
  }
}
