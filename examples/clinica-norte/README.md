# Clínica Norte

El tenant completo: una clase, una view, un fichero de conocimiento y la agenda de la clínica.
Todo lo demás — la máquina de estados, el gate de confirmación, la memoria, el retrieval, el log y
la consola — lo pone la plataforma.

```
agent.ts          la clase: el estado son campos, las tools son métodos con docstring
views/agent.tsx   el prompt como función del estado: la view, lo último que lee el modelo
views/availability.tsx   un bloque propio del prompt, `static prompt = { dynamic: ["availability"] }` en la clase
knowledge/        clinica.md cacheado delante de todo · docs/ indexado y recuperado por turno
lib/agenda.ts     el sistema de la clínica; aquí es un doble determinista
test/             la clase como software, y los goldens que `pinecall test` ejecuta
```

## El tsconfig

```json
{ "extends": "pinecall/tsconfig.tenant.json" }
```

Eso es todo lo que el tenant escribe. El preset trae el runtime JSX de las views y
`experimentalDecorators`, que `@tool` y `@state` todavía necesitan porque el transform de vite 8
(oxc) solo implementa los decoradores legacy — medido, con versiones, en
`docs/decisions/agent.md`. El día que oxc traiga los del TC39, el flag desaparece del preset y
aquí no se toca nada.

## Probarlo

```bash
pnpm --filter @pinecall/example-clinica-norte test    # vitest, sin red y sin modelo
pnpm --filter @pinecall/example-clinica-norte lint    # tsc --noEmit
```

`test/agent.test.ts` recorre las cuatro fases con la clase en la mano; `test/walkthrough.test.ts`
las recorre otra vez contra el `FakeGateway` del SDK, con los mismos `tool.result` que vería un
modelo, incluido el "no" de la hora de las 13:00, que la agenda rechaza siempre.

## Ejecutarlo

```bash
cp .env.example .env        # PINECALL_URL y PINECALL_API_KEY
pinecall run agent.ts       # la app: registra el agente y responde sus tools
pinecall chat               # la app en ESTA terminal, y una llamada escrita contra ella
pinecall test               # los goldens de test/goldens/, puntuados por el runtime
pinecall simulate --persona apurado --judge   # una persona improvisada por un modelo, y su call.score
```

Los goldens viven en `test/goldens/`: uno por fichero, `{state, input, expect}`. Las personas
viven en `test/personas/`: un fichero por quien llama, con su objetivo, su forma de hablar y los
datos que sabe de sí misma — nunca un guion: un modelo la improvisa turno a turno.
`pinecall personas list` las enumera y `pinecall personas show apurado` la abre entera.

El paciente `Ana García`, teléfono `+34 600 000 001`, tiene ficha; cualquier hora de las 13:00 la
agenda la rechaza, así que el camino del "ese hueco acaba de ocuparse" se ve sin trucar nada.
