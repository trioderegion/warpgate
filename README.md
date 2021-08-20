
# Warp Gate

**Reinforcements have arrived**

Warp Gate, in its current form, is a system-agnostic library module for Foundry VTT that provides a select few number of public API functions to make programmatically spawning tokens and modifying those tokens easier for players and GMs alike.

https://user-images.githubusercontent.com/14878515/127940403-40301919-8a12-42e0-b3c4-7711f6e64b3b.mp4

## Usage

Be sure to check out the [Warp Gate Wiki](https://github.com/trioderegion/warpgate/wiki) for specific examples and further discussion!

### `async warpgate.spawn(actorName, updates = {}, callbacks = {}, options = {})`
The primary function of Warp Gate. When executed, it will create a custom MeasuredTemplate that is used to place the spawned token and handle any customizations provided in the `updates` object. `warpgate#spawn` will return a Promise that can be awaited, which can be used in loops to spawn multiple tokens, one after another. The player spawning the token will also be given Owner permissions for that specific token actor. This means that players can spawn any creature available in the world.

Parameters:
* actorName {String}: Name of actor to spawn
* updates {Object} Updates to the spawned actor (optional). See "Update Shorthand".
* callbacks {Object} Callback functions (optional). See "Callback Functions".
* options {Object} Options (optional) 
	- `controllingActor` {Actor} will minimize this actor's open sheet (if any) for a clearer view of the canvas during placement. Also flags the created token with this actor's id. Default `null`.
	- `duplcates` {Number} will spawn multiple tokens from a single placement. See also `collision`. Default `1`.
	- `collision` {Boolean} controls whether the placement of a token collides with any other token or wall and finds a nearby unobstructed point (via a radial search) to place the token. If `duplicates` is greater than 1, default is `true`; otherwise `false`.

### `async warpgate.spawnAt(location, tokenData, updates, callbacks, options)`
An alternate, more module friendly spawning function. Will create a token from the provided token data and updates at the designated location. 
* location {Object} of the form {x: Number, y: Number} designating the token's _center point_
* tokenData {TokenData} the base token data from which to spawn a new token and apply updates to it.
* updates, callsbacks, options: See `warpgate.spawn`.

### `async warpgate.wait(timeMs)`
Helper function. Waits for a specified amount of time in milliseconds (be sure to await!). Useful for timings with animations in the pre/post callbacks.

### `async warpgate.dismiss(tokenId, sceneId)`
Deletes the specified token from the specified scene. This function allows anyone to delete any specified token unless this functionality is restricted to only owned tokens in Warp Gate's module settings. This is the same function called by the "Dismiss" header button on owned actor sheets.

### `async warpgate.buttonDialog(data, direction = 'row')`
Helper function for quickly creating a simple dialog with labeled buttons and associated data. Useful for allowing a choice of actors to spawn prior to `warpgate.spawn`.
* `data` {Array of Objects}: Contains two keys `label` and `value`. Label corresponds to the button's text. Value corresponds to the return value if this button is pressed. Ex. `const data = {buttons: [{label: 'First Choice', value: {token {name: 'First'}}, {label: 'Second Choice', value: {token: {name: 'Second'}}}]}`
* `direction` {String} (optional): `'column'` or `'row'` accepted. Controls layout direction of dialog.

### `async warpgate.dialog(data, title = 'Prompt', submitLabel = 'Ok')`
Helper function for creating a more advanced dialog prompt. Can contain many different types of inputs as well as headers and informational text.
`data` {Array of Objects}: Contains the dialog data. Each Object requires the following keys `{type, label, options}`.
* `type` {String} : See table below.
* `label` {String}: the displayed text for this input. Accepts HTML.
* `options` {Array of Strings} or {String}: See table below.

`return value` {Array of *}: Length and order mirrors the input `data` array. The type of the elements is shown on the table below.

| `type` | `options` | `ret val` | notes |
|--|--|--|--|
| button | none | undefined | Ignored entirely (use `buttonDialog`). |
| header | none | undefined | Shortcut for `info | <h2>text</h2>`. |
| info   | none | undefined | Inserts a line of text for display/informational purposes. |
| text | default value | {String} final value of text field | |
| password | (as `text`) | (as `text`) | Characters are obscured for security. |
| radio | group name | selected: {String} `label`. un-selected: {Boolean} `false` | For a given group name, only one radio button can be selected. |
| checkbox | none | {Boolean} `true`/`false` checked/unchecked | Can use options as `radio` type, which assigns the input's `name` property for external interfacing |
| number | (as `text`) | {Number} final value of text field converted to a number |
| select | array of option labels | {String} label of choice | | 

### `async warpgate.crosshairs.show(size = 1, icon = 'icons/svg/dice-target.svg', label = '')`
Creates a circular template attached to the cursor. Its size is in grid squares/hexes and can be scaled up and down via shift+mouse scroll. Resulting data indicates the final position and size of the template.
* @param {Number} gridUnits: How large to draw the circular template in grid squares
* @param {String} icon: Icon to display in the center of the template
* @param {String} label: Text to display under the template

`return value` {Customized TemplateData}: Contains all of the fields as MeasuredTemplateData with the following notes additions
* `width`: the final size of the template's diamater.
* `cancelled` {Boolean}: if the user cancelled creation via right click. 


## Update Shorthand
The `update` object can contain up to three keys: `token`, `actor`, and `item`. The `token` and `actor` key values are standard update objects as one would use in `actor.update({...data})`.
The `item` key uses a shorthand notation to make creating the updates easier. Notably, it does not require the `_id` field to be part of the update object for a given item.  There are three operations that this dict object controls -- adding, updating, deleting (in that order).

### Add
Given a dict key of a **non-existing** item, the value contains the data object for item creation compatible with `Item.create({...value})`. This object can be constructed in-place by hand, or gotten from a template item and modified using `"Item To Add": game.items.getName("Name of Item").data`. Note: the name contained in the dict key will override the `name` field in any provided creation data.

### Update
Given a dict key of an existing item, the value contains the data object compatible with `Item.update({...value})`

### Delete
Assigning the dict key to the special constant `warpgate.CONST.DELETE` will remove this item (if it exists) from the spawned actor.
`{"Item Name To Delete": warpgate.CONST.DELETE}`

## Callback Functions
The `callbacks` object has two expected keys: `pre` and `post` and provide a way to execute custom code during the spawning process. Both key values are type `async function`.

### `async pre(templateData, updates)`
Executed after placement has been decided, but before updates have been issued or tokens spawned. Used for modifying the updates based on position of the placement.
	* `templateData` {Object} Data of the template preview used for placement.
	* `updates` {Object} The update object passed into `warpgate#spawn`.

### `async post(templateData, spawnedTokenDoc, updates, iteration)`
Executed after the token has been spawned and any updates applied. Good for animation triggers, or chat messages. Additionally, when utilizing the `duplicates` option, the update object used to spawn the next token is passed in for modification for the indicated iteration. Note, the same update object is used throughout the spawning process, being modified as desired on each iteration.
 	* `templateData` {Object} Data of the template preview used for placement.
 	* `spawnedTokenDoc` {TokenDocument} The token spawned by this iteration.
	* `updates` {Object} The update object from the just spawned token. Will be applied to default prototoken data for next iteration
	* `iteration` {Number} The iteration index of the _next_ iteration. 0-indexed.

## Special Thanks
* siliconsaint for the inspiration to turn a set of absurd macros into something usable and constantly pushing the envelope.
* LorduFreeman for the pre and post callbacks and immediately using it for beautiful things.
