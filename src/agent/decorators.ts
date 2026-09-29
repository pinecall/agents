/** The `@tool({...})` method decorator and the `@render(Prompt)` class decorator. */

import { withAuthorAsync } from "./authors.js";
import { lowerStage } from "./stages.js";
import { DeclarationRefused, register, type ToolOptions } from "./tools.js";
import type { Child } from "../views/jsx-runtime.js";

/**
 * Declare a method as a tool. Its JSDoc is the description and its signature the schema;
 * `when(state)` controls visibility (`stage` is shorthand for one). State writes are authored by it.
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
    // Attribute every state write during the call, including after awaits, to this tool.
    descriptor.value = function running(this: object, ...args: unknown[]): unknown {
      return withAuthorAsync(name, () => method.apply(this, args) as unknown);
    };
    register(prototype, { name, options: lowerStage(options), method });
    return descriptor;
  };
}

/** A prompt component whose props are the agent instance itself. */
export type Prompt<T> = (agent: T) => Child;

/**
 * Use `prompt` as the class's `render()`: `@render(SupportPrompt)` equals
 * `render() { return SupportPrompt(this); }`. The instance is passed whole (a spread would drop getters).
 */
export function render<T extends object>(prompt: Prompt<T>) {
  return function decorate(ctor: new (...args: never[]) => T): void {
    // Refuse both spellings on one class: one of them would be silently dead.

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
