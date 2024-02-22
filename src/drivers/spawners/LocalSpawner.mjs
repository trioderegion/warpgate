import BaseSpawner from './BaseSpawner.mjs';

export default class LocalSpawner extends BaseSpawner {
  async _setup(options) {
    /* Check permissions to create/update token */
    // TODO

    /* Show crosshairs to select position */
    const reticle = new this.models.crosshairs({
      distance: 2.5,
    }, {parent: canvas.scene});

    await reticle.show();
    const position = reticle.getOrientation();
    this.warpin.updateSource({position});
    return super._setup(options);
  }
}
