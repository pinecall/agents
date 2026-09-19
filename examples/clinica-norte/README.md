# Clínica Norte

El tenant completo: una clase que se rinde a sí misma, la agenda de la clínica y los documentos que
el agente busca. Todo lo demás — la máquina de estados, el gate de confirmación, la memoria, el
retrieval, el log y la consola — lo pone la plataforma. Y lo que el agente se sabe de memoria, la
voz, el modelo, el saludo y las palabras no están en este repo: son del mundo, en Settings.

```
agents/clinica-norte/
  agent.tsx           la clase: el estado son campos, las tools son métodos con docstring, y
                      render() es el prompt como función del estado — lo último que lee el modelo
  agenda.ts, crm.ts   los sistemas de la clínica; aquí, dobles deterministas
docs/clinica-norte/   lo que el agente BUSCA por turno: se sube con `pinecall docs push`
test/clinica-norte/
  agent.test.ts       la clase como software
  goldens/            las conversaciones que `pinecall test` ejecuta; docs.json y memory.json,
                      los goldens del retrieval y de la memoria
  personas/           quienes llaman en `pinecall simulate`
  memory/             los casos de extracción de `pinecall remember`
```

## El tsconfig

```json
{ "extends": "pinecall/tsconfig.tenant.json" }
```

Eso es todo lo que el tenant escribe. El preset trae el runtime JSX del `render()` y
`experimentalDecorators`, que `@tool` y `@state` todavía necesitan porque el transform de vite 8
(oxc) solo implementa los decoradores legacy — medido, con versiones, en
`docs/decisions/agent.md`. El día que oxc traiga los del TC39, el flag desaparece del preset y
aquí no se toca nada.

## Probarlo

```bash
pnpm --filter @pinecall/example-clinica-norte test    # vitest, sin red y sin modelo
pnpm --filter @pinecall/example-clinica-norte lint    # tsc --noEmit
```

`test/clinica-norte/agent.test.ts` recorre las cuatro fases con la clase en la mano;
`walkthrough.test.ts` las recorre otra vez contra el `FakeGateway` del SDK, con los mismos
`tool.result` que vería un modelo, incluido el "no" de la hora de las 13:00, que la agenda rechaza
siempre.

## Ejecutarlo

```bash
pinecall link               # una vez: inicia sesión y escribe PINECALL_KEY en .env
pinecall start              # la app: registra el agente y responde sus tools
pinecall chat               # la app en ESTA terminal, y una llamada escrita contra ella
pinecall test               # los goldens de test/clinica-norte/goldens/, puntuados por el runtime
pinecall docs push          # docs/clinica-norte/ al gateway, como la base clinica-norte
pinecall docs attach clinica-norte --k 4      # el agente la busca por turno
pinecall simulate --persona apurado --judge   # una persona improvisada por un modelo, y su call.score
```

Lo que la recepción se sabe de memoria — horarios, precios, qué necesita autorización — se escribe
en la consola, Settings ▸ Knowledge (o `pinecall agent knowledge edit`), y el modelo lo lee entero
en cada llamada. La voz, el modelo y el saludo, en la misma pantalla, o `pinecall agent set`.

Los goldens viven en `test/clinica-norte/goldens/`: uno por fichero, `{state, input, expect}`. Las
personas viven en `test/clinica-norte/personas/`: un fichero por quien llama, con su objetivo, su
forma de hablar y los datos que sabe de sí misma — nunca un guion: un modelo la improvisa turno a
turno. `pinecall personas list` las enumera y `pinecall personas show apurado` la abre entera.

El paciente `Ana García`, teléfono `+34 600 000 001`, tiene ficha; cualquier hora de las 13:00 la
agenda la rechaza, así que el camino del "ese hueco acaba de ocuparse" se ve sin trucar nada.
