const {fields} = foundry.data;

export default class SpatialOrientation extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: 'XCoord'}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: 'YCoord'}),
      elevation: new fields.NumberField({required: true, nullable: false, initial: 0}),
      rotation: new fields.AngleField(),
    };
  }
}
