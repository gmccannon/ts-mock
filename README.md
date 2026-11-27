# ts-mockgen

`ts-mockgen` is a TypeScript utility that lets you create partial mock objects of complex types for unit testing. 
It helps speed up development by letting you specify only the fields that are relevant to a test case, while safely filling in the rest. 
It also ensures objects made for unit tests stay consistent with evolving type definitions.
It easily integrates with testing frameworks like **Vitest** and **Jest**.

## Installation

```sh
npm install -D ts-mockgen
```

## Example

Suppose you have the following type:
```ts
enum OrderStatus {
  Pending,
  Shipped,
  Delivered,
  Cancelled,
}

interface LineItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

interface Order {
  id: string;
  customer: {
    name: string;
    email: string;
    shippingAddress: {
      city: string;
      zip: string;
    };
  };
  items: LineItem[];
  status: OrderStatus;
  discountCode?: string;
  placedAt: Date;
}
```

With the following functions to test:
```ts
function calculateOrderTotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function markAsShipped(order: Order): Order {
  return { ...order, status: OrderStatus.Shipped };
}
```

You only have to specify the fields each test cares about:
```ts
import { generateMock } from 'ts-mockgen';

it('calculates the order total from line items', () => {
  const order = generateMock<Order>({
    items: [
      { sku: "WIDGET-1", quantity: 2, unitPrice: 9.99 },
      { sku: "GADGET-9", quantity: 1, unitPrice: 24.5 },
    ],
  });

  expect(calculateOrderTotal(order)).toBeCloseTo(44.48);
});

it('marks an order as shipped without touching other fields', () => {
  const order = generateMock<Order>({
    customer: { email: "jane@example.com" },
  });

  const shipped = markAsShipped(order);

  expect(shipped.status).toBe(OrderStatus.Shipped);
  expect(shipped.customer.email).toBe("jane@example.com");
  expect(shipped.customer.name).toBeTypeOf("string");
});
```

## Supported types

`generateMock<T>()` walks the shape of `T` and fills in a reasonable default per field:

| Type                               | Mock value                                    |
| ----------------------------------- | ---------------------------------------------- |
| `string`                            | `"example"`                                    |
| `number`                            | `42`                                            |
| `boolean`                           | `true`                                          |
| `bigint`                            | `42n`                                           |
| `Date`                              | `new Date()`                                    |
| `RegExp`                            | `/example/`                                     |
| nested object / interface           | recursively mocked object                       |
| intersection (`A & B`)              | object with properties from every member mocked |
| literal union (`'A' \| 'B'`)        | first member (e.g. `'A'`)                       |
| `enum`                              | first member's value                            |
| optional / nullable (`T \| undefined \| null`) | mocked as `T` — the `undefined`/`null` branch is dropped |
| `T[]` / `ReadonlyArray<T>` / tuple (`[A, B]`) | array/tuple with each element mocked  |
| `Map<K, V>` / `Set<T>` / `ReadonlyMap<K, V>` / `ReadonlySet<T>` | empty `Map`/`Set` instance |
| `Promise<T>`                        | `Promise.resolve(mockOfT)`                      |
| `Record<K, V>` / index signature    | `{}` by default |
| function (`() => void`)             | a callable no-op                                |
| self-referential / circular type    | bottoms out instead of recursing forever        |
