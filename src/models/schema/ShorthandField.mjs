export default class ShorthandField extends foundry.data.fields.SchemaField {
  constructor(keys, valueFn, options = {}) {
    const schema = keys.reduce((acc, key) => {
      acc[key] = valueFn(key);
      return acc;
    }, {});
    super(schema, options);
  }
}
