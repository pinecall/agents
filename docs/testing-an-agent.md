# Testing an agent

This page moved to [docs.pinecall.io](https://docs.pinecall.io), where it is written as short pages,
one idea each, checked against the code:

- [Overview](https://docs.pinecall.io/concepts/tests/) — Goldens and personas, what each one catches, and the rings a change goes through.
- [Goldens](https://docs.pinecall.io/concepts/goldens/) — A conversation written down, with what must be true at the end, run under every model you name.
- [Expectations reference](https://docs.pinecall.io/concepts/expectations/) — Every field of a golden's expect, what it checks, and the judge it is reported as.
- [Personas](https://docs.pinecall.io/concepts/personas/) — A caller a model plays: a goal, a manner, the facts it knows, and its own rule for hanging up satisfied.
- [Overview](https://docs.pinecall.io/concepts/judges/) — Every call judged at hang-up: by code where code can tell, by one model question where it cannot.
- [Built-in judges](https://docs.pinecall.io/concepts/built-in-judges/) — consent, grounded, promises, disclosed, identified, honoured_stop and persona: what each holds a call to.
- [Unit tests](https://docs.pinecall.io/guides/unit-tests/) — The class as software: tools, stages and the prompt, with no network, no key and no model.
- [Replaying a real call](https://docs.pinecall.io/guides/replaying-a-call/) — pinecall eval: one finished call checked again by code, with an exit code for a pipeline.
- [Testing in CI](https://docs.pinecall.io/guides/testing-in-ci/) — The goldens as the gate before a deploy, in GitHub Actions, and what to run nightly.
