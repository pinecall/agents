/** `@tool({...})`: the decorator that turns a method into a verb the model may call. */

import { withAuthorAsync } from "./agent.js";
import { lowerStage } from "./stages.js";
import { register, type ToolOptions } from "./tools.js";

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
