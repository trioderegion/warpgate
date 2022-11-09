export {}

// try to use a proper type
declare global {
  /**
   * @private
   */
  interface LenientGlobalVariableTypes {
    game: {};
    canvas: {};
  }

  /**
   */
  type Shorthand = {
    token?: object;
    actor?: object;
    embedded?: Record<string,any>;
  }


  /**
   *
   */
  type ComparisonKeys = Record<string,string>;

}


