// The view beside the agent, which is where `viewFor` looks. No JSX: the loader must find and run
// a view before the package's jsx runtime has a dist to be imported from.

export default ({ identified, slots }: Record<string, any>) =>
  identified ? `Ofrece ${slots.length} horas y pregunta cuál prefiere.` : "Saluda y pide nombre y teléfono.";
