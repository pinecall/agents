# Writing an agent

This page moved to [docs.pinecall.io](https://docs.pinecall.io), where it is written as short pages,
one idea each, checked against the code:

- [Agent overview](https://docs.pinecall.io/concepts/agents/) — An agent is a class: its fields are the state, its tools are what the model may do, its docstrings are the prompt.
- [Project layout](https://docs.pinecall.io/concepts/project-layout/) — What pinecall new writes, where each file goes, and several agents in one repository.
- [Agent settings](https://docs.pinecall.io/concepts/agent-settings/) — Voice, models, language, greeting and knowledge: settings of the agent, changed without a deploy.
- [Tools](https://docs.pinecall.io/concepts/tools/) — A method the model may call: its docstring, its arguments, confirmation, masking and timeouts.
- [Stages](https://docs.pinecall.io/concepts/stages/) — Which tools the model sees, by where the conversation is.
- [State & visibility](https://docs.pinecall.io/concepts/state/) — Which fields are the state a call opens in, and who may see each one.
- [The prompt](https://docs.pinecall.io/concepts/prompt/) — The blocks the model reads, which are cached, and render(): the only part that changes between turns.
- [The call](https://docs.pinecall.io/concepts/the-call/) — this.call: who is on the line, on which channel, and what the agent can do to the call.
- [Hooks & events](https://docs.pinecall.io/concepts/hooks/) — What runs when a call opens and ends, and facts your backend sends in mid-call.
- [Overview](https://docs.pinecall.io/concepts/knowledge/) — What the agent knows by heart, what it looks up on every turn, and what it remembers about a caller.
- [Memory](https://docs.pinecall.io/concepts/memory/) — What the agent keeps about a contact between calls, and when it recalls it.
- [The side panel: @view](https://docs.pinecall.io/guides/side-panel/) — What a supervisor sees beside a conversation, drawn by the agent.
