import CrosshairsPlaceable from './CrosshairsPlaceable.mjs';
const { fields } = foundry.data;

export default class BaseCrosshairs extends MeasuredTemplateDocument {
  static defineSchema() {
    return foundry.utils.mergeObject(super.defineSchema(), {
      borderDisplay: new fields.BooleanField(),
      icon: new fields.SchemaField({
        display: new fields.BooleanField(),
        texture: new fields.FilePathField({categories: ['IMAGE', 'VIDEO']}),
      }),
      snap: new fields.SchemaField({
        position: new fields.NumberField({initial: CONST.GRID_SNAPPING_MODES.VERTEX}),
        size: new fields.NumberField({initial:
          CONST.GRID_SNAPPING_MODES.VERTEX
          | CONST.GRID_SNAPPING_MODES.CENTER
          | CONST.GRID_SNAPPING_MODES.EDGE_MIDPOINT,
        }),
      }),
      label: new fields.SchemaField({
        display: new fields.BooleanField(),
        text: new fields.StringField(),
        dx: new fields.NumberField(),
        dy: new fields.NumberField(),
      }),
      textureTile: new fields.NumberField(),
    });
  }

  static get placeableClass() {
    return CrosshairsPlaceable;
  }

  getOrientation() {
    return {
      x: this.x,
      y: this.y,
      elevation: 0, // TODO
      rotation: this.rotation,
    };
  }

  get documentName() {
    return 'Crosshairs';
  }
}
