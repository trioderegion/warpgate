
# Warp Gate

<h3 align="center"> <img alt="GitHub release (latest by date)" src="https://img.shields.io/github/downloads/trioderegion/warpgate/latest/total?color=blue&label=latest%20downloads"> Reinforcements have arrived <img alt="GitHub all releases" src="https://img.shields.io/github/downloads/trioderegion/warpgate/total?color=blue&label=total%20downloads"> </h3>


Warp Gate, in its current form, is a system-agnostic library module for Foundry VTT that provides a growing number of API functions to make programmatically spawning tokens and modifying those tokens easier for players and GMs alike.

https://user-images.githubusercontent.com/14878515/127940403-40301919-8a12-42e0-b3c4-7711f6e64b3b.mp4


Be sure to check out the [Warp Gate Wiki](https://github.com/trioderegion/warpgate/wiki) for specific examples and further discussion!

## Table of Contents
<details>
<summary>
	Click to expand
</summary>
	
- [Spawning Commands](#spawning-commands)
  - [spawn](#spawn)
  - [spawnAt](#spawnat)
- [Spawn Callback Functions](#spawn-callback-functions)
  - [pre](#pre)
  - [post](#post)
- [Mutation Commands](#mutation-commands)
  - [mutate](#mutate)
  - [revert](#revert)
- [Mutation Callback Functions](#mutation-callback-functions)
  - [delta](#delta)
  - [post](#post)
- [Mutation Stack Utility](#mutation-stack-utility)
- [MutationStack Class Methods](#mutationstack-class-methods)
- [Crosshairs Commands](#crosshairs-commands)
  - [show](#show)
  - [getTag](#gettag)
  - [collect](#collect)
- [Crosshairs Config](#crosshairs-config)
- [Crosshairs Callback Functions](#crosshairs-callback-functions)
- [Helper Functions](#helper-functions)
  - [wait](#wait)
  - [dismiss](#dismiss)
  - [buttonDialog](#buttondialog)
  - [dialog](#dialog)
  - [menu](#menu)
- [Update Shorthand](#update-shorthand)
  - [Add](#add)
  - [Update](#update)
  - [Delete](#delete)
  - [embedded Structure](#embedded-structure)
- [Event System](#event-system)
  - [watch](#watch)
  - [trigger](#trigger)
  - [remove](#remove)
  - [notify](#notify)
  - [eventData](#eventdata)
    - [actorData](#actordata)
- [Special Thanks](#special-thanks)
	
</details>

## Special Thanks
* siliconsaint for the inspiration to turn a set of absurd macros into something usable and constantly pushing the envelope.
* LorduFreeman for the pre and post callbacks and immediately using it for beautiful things.
* Wasp for pushing me to make Crosshairs more full featured.
* Arbron for the initial v9+v10 conversion updates.
* Mr. Vaux for stretching warpgate's malleability to its limit.
