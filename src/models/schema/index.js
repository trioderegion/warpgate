const fields = foundry.data.fields;

export class DocSchema extends fields.SchemaField {
  constructor(docCls, options, context) {
    const docSchema = docCls.schema.fields;
    const schema = {...docSchema};
    Object.values(docCls.metadata.embedded ?? {}).forEach( emb => delete schema[emb] );
    Object.keys(schema).filter(key => key.startsWith('_')).forEach( key => delete schema[key] );
    Object.keys(schema).forEach( key => delete schema[key].parent );
    super(schema, options, context);
  }
}

class KeyedShorthand extends fields.SchemaField {
  constructor(keys, valueFn, options = {}) {
    const schema = keys.reduce((acc, key) => {
            acc[key] = valueFn(key);
            return acc;
          }, {})
    super(schema, options);
  }
}

export class EmbeddedShorthand extends KeyedShorthand {
  constructor(owner, type, typeOptions = {}, options = {}) {
    const keys = Reflect.ownKeys(owner.metadata.embedded)
    super(keys, () => (new type(typeOptions)), options);
  }
}

export class MutationConfig extends fields.SchemaField{
  constructor(options = {}) {
    super({
      user: new fields.StringField({
        required: true,
        initial: () => game.user.id
      }),
      permanent: new fields.BooleanField({initial: false, nullable: false}),
      comparisonKeys: new EmbeddedShorthand(Actor.implementation, fields.StringField, {initial: 'name'}),
      name: new fields.StringField({
        blank: false,
        required: false,
        trim: true,
      }),
      updateOpts: new KeyedShorthand(['token','actor','embedded'], () => new fields.ObjectField()),
      overrides: new fields.ObjectField({
        required:false,
      }),
    }, options)
  }

  clean(data, options) {
    data = super.clean(data, options);

    /* if `id` is being used as the comparison key, 
     * change it to `_id` and set the option to `keepId=true`
     * if either are present
     */
    data.updateOpts ??= {};
    Object.keys(data.comparisonKeys ?? {}).forEach( embName => {

      /* switch to _id if needed */
      if(data.comparisonKeys[embName] == 'id') data.comparisonKeys[embName] = '_id'

      /* flag this update to preserve ids */
      if(data.comparisonKeys[embName] == '_id') {
        data.updateOpts = foundry.utils.mergeObject(data.updateOpts, {embedded: {[embName]: {keepId: true}}});
      }
    });

    return data;
  }
}

