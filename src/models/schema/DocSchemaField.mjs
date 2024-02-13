const {fields} = foundry.data;

export default class extends fields.SchemaField {
  constructor(docCls, options, context) {
    const docSchema = docCls.schema.fields;
    const schema = {...docSchema};
    Object.values(docCls.metadata.embedded ?? {}).forEach( emb => delete schema[emb] );
    Object.keys(schema).filter(key => key.startsWith('_')).forEach( key => delete schema[key] );
    Object.keys(schema).forEach( key => delete schema[key].parent );
    super(schema, options, context);
  }

}
