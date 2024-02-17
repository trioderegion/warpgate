import EmbeddedShorthandField from './EmbeddedShorthandField.mjs';
import ShorthandField from './ShorthandField.mjs';

const {fields} = foundry.data;

export default class extends fields.SchemaField {
  constructor(options = {}) {
    super({
      user: new fields.StringField({
        required: true,
        initial: () => game.user.id
      }),
      permanent: new fields.BooleanField({initial: false, nullable: false}),
      comparisonKeys: new EmbeddedShorthandField(Actor.implementation, fields.StringField, {initial: 'name'}),
      name: new fields.StringField({
        blank: false,
        required: false,
        trim: true,
      }),
      updateOpts: new ShorthandField(['token', 'actor', 'embedded'], () => new fields.ObjectField()),
      overrides: new fields.ObjectField({
        required: false,
      }),
    }, options);
  }

  clean(data, options) {
    data = super.clean(data, options);

    /* If `id` is being used as the comparison key,
     * change it to `_id` and set the option to `keepId=true`
     * if either are present
     */
    data.updateOpts ??= {};
    Object.keys(data.comparisonKeys ?? {}).forEach( embName => {

      /* Switch to _id if needed */
      if (data.comparisonKeys[embName] == 'id') data.comparisonKeys[embName] = '_id';

      /* Flag this update to preserve ids */
      if (data.comparisonKeys[embName] == '_id') {
        data.updateOpts = foundry.utils.mergeObject(data.updateOpts, {embedded: {[embName]: {keepId: true}}});
      }
    });

    return data;
  }
}

