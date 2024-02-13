const { fields, } = foundry.data;

/**
 *
 *
 * @export
 * @class BaseCrosshairs
 * @extends {MeasuredTemplateDocument}
 */
export default class BaseCrosshairs extends MeasuredTemplateDocument {
  static defineSchema() {
    return foundry.utils.mergeObject(super.defineSchema(), {
      borderDisplay: new fields.BooleanField(),
      icon: new fields.SchemaField({
        display: new fields.BooleanField(),
        texture: new fields.FilePathField({categories: ['IMAGE', 'VIDEO',],}),
      }),
      snap: new fields.SchemaField({
        position: new fields.NumberField({initial: CONST.GRID_SNAPPING_MODES.VERTEX,}),
        size: new fields.NumberField({initial:
          CONST.GRID_SNAPPING_MODES.VERTEX
          | CONST.GRID_SNAPPING_MODES.CENTER
          | CONST.GRID_SNAPPING_MODES.EDGE_MIDPOINT,
        }),
      }),
      fillAlpha: new fields.AlphaField(),
      label: new fields.SchemaField({
        display: new fields.BooleanField(),
        text: new fields.StringField(),
        dx: new fields.NumberField(),
        dy: new fields.NumberField(),
      }),
      textureTile: new fields.NumberField(),
    });
  }
}
