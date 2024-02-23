import BaseSpawner from './BaseSpawner.mjs';

export default class LocalSpawner extends BaseSpawner {
  async _setup(options) {
    /* Check permissions to create/update token */
    // TODO

    /* Show crosshairs to select position if this scene
     * is active */
    if (this.warpin.scene?.isView) {
      /* Get the lazily generated "warp actor" and its token */
      const token = await this.warpin.warpActor().getTokenDocument();
      const reticle = new this.models.crosshairs({
        distance: 2.5,
      }, {parent: canvas.scene});

      await reticle.show();
      const position = reticle.getOrientation();
      this.warpin.updateSource({position});
    }

    return super._setup(options);
  }
}
