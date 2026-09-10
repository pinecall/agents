# Tienda Sur

Una ferretería y droguería de barrio en la calle San Jacinto, en Triana, que coge pedidos por
teléfono, por WhatsApp y por la web, los reparte a pie por el barrio y tutea a todo el mundo. Es el
segundo tenant del repositorio: la misma forma que la Clínica Norte, otro negocio y otras palabras.

```
agent.tsx         la clase: el estado son campos, las tools son métodos con docstring, y
                  render() es el prompt como función del estado
knowledge/        tienda.md cacheado delante de todo · docs/ se sube con `pinecall knowledge push` y se recupera por turno
lib/catalog.ts    los doce artículos y cómo se busca uno hablando
lib/shop.ts       el mostrador: fichas, pedidos, almacén y lo que la tienda anota
test/             la clase como software, y los goldens que el runtime ejecuta
```

## Las cuatro fases

`browse` · `cart` · `confirm` · `done`, un campo del estado y nada más. Buscar deja los artículos
sobre el mostrador; meter algo en el carrito pasa a `cart`; `proposeOrder` es la lectura del pedido
en voz alta y pasa a `confirm`; `confirmOrder`, que es irreversible, solo existe ahí y solo después
del sí. Meter algo después de la lectura devuelve la fase a `cart`, que es lo que obliga a volver a
leer el pedido antes de cerrarlo.

La Clínica necesitó un campo `proposed` para distinguir el turno en que se lee la hora del turno en
que el paciente dice que sí. Aquí eso es una fase, así que el campo sobra: por qué, en
[docs/decisions/example-tienda-sur.md](../../docs/decisions/example-tienda-sur.md).

## Probarlo

```bash
pnpm --filter @pinecall/example-tienda-sur test    # vitest, sin red y sin modelo
pnpm --filter @pinecall/example-tienda-sur lint    # tsc --noEmit
```

`test/agent.test.ts` recorre las fases con la clase en la mano; `test/walkthrough.test.ts` las
recorre otra vez contra el `FakeGateway` del SDK, con los mismos `tool.result` que vería un modelo,
incluido el "no" del rodillo antigoteo, que el almacén rechaza siempre.

## Ejecutarlo

```bash
pinecall run                # la app: registra el agente y responde sus tools
pinecall chat               # la app en ESTA terminal, y una llamada escrita contra ella
pinecall test               # los goldens de test/goldens/, puntuados por el runtime
pinecall simulate --persona manitas --judge   # una persona improvisada por un modelo, y su call.score
```

Los goldens viven en `test/goldens/`: uno por fichero, `{state, input, expect}`. Las personas
viven en `test/personas/`: un fichero por quien llama, con su objetivo, su forma de hablar y los
datos que sabe de sí misma — nunca un guion: un modelo la improvisa turno a turno.
`pinecall personas list` las enumera.

`Rosa Medina`, teléfono `+34 600 000 011`, tiene ficha, así que llamando desde ahí no hay que
preguntarle nada. El rodillo antigoteo, `TS-203`, está en la pizarra y no en el almacén: cualquier
pedido que lo lleve se cae con "se ha agotado esta mañana", y el camino del "no" se ve sin trucar
nada. El pedido `TS-7781` existe desde antes de la primera llamada, para que preguntar por uno no
exija haber hecho otro.
