/** The two decorators a class wears: `@tool({...})` on a method, and `@render(Prompt)` on the class. */

import { withAuthorAsync } from "./authors.js";
import { lowerStage } from "./stages.js";
import { DeclarationRefused, register, type ToolOptions } from "./tools.js";
import type { Child } from "../views/jsx-runtime.js";

/**
 * Declare a method as a tool. The docstring above it is the prompt; the signature is the schema;
 * `when(state)` is the only visibility there is, and `stage` is lowered to one here, at
 * declaration time. Every write the method makes is authored by it.
 */
export function tool<T extends object>(options: ToolOptions<T> = {}) {
  return function decorate(
    prototype: T,
    name: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const method = descriptor.value as (...args: unknown[]) => unknown;
    if (typeof method !== "function") {
      throw new TypeError(`@tool goes on a method; ${name} is not one`);
    }
    // The wrapper is what makes `this.patient = row` inside the method carry an author: the tool's
    // own name, for the whole time it runs, awaited included.
    descriptor.value = function running(this: object, ...args: unknown[]): unknown {
      return withAuthorAsync(name, () => method.apply(this, args) as unknown);
    };
    register(prototype, { name, options: lowerStage(options), method });
    return descriptor;
  };
}

/**
 * The prompt as a function of the agent: the props ARE the instance, so a prompt written for
 * `Support` destructures `{ stage, customer }` and stays typed with no generic machinery.
 */
export type Prompt<T> = (agent: T) => Child;

/**
 * The class's prompt, as a function beside it instead of a `render()` method — the spelling a
 * prompt that has grown deserves. `@render(SupportPrompt)` is exactly
 * `render() { return SupportPrompt(this); }`, byte for byte, and the instance is handed over
 * whole: a spread would leave the getters and `remembers()` behind.
 */
export function render<T extends object>(prompt: Prompt<T>) {
  return function decorate(ctor: new (...args: never[]) => T): void {
    // The class's own `render()` is on its prototype by the time a class decorator runs, so this
    // is the one moment both spellings are visible at once. Two ways to answer one question is
    // the bug: whichever the reader trusts, the other one is dead and says something else.
    if (Object.getOwnPropertyDescriptor(ctor.prototype, "render") !== undefined) {
      throw new DeclarationRefused(
        `${ctor.name} declares both @render(${prompt.name || "a prompt"}) and a render() method; ` +
          `two ways to answer one question — keep one`,
      );
    }
    Object.defineProperty(ctor.prototype, "render", {
      value: function render(this: T): Child {
        return prompt(this);
      },
      writable: true,
      configurable: true,
    });
  };
}
