# ts-mockgen

`ts-mockgen` is a TypeScript utility that lets you create partial mock objects of complex types for unit testing. 
It helps speed up development by letting you specify only the fields that are relevant to a test case, while safely filling in the rest. 
It also ensures objects made for unit tests stay consistent with evolving type definitions.
It easily integrates with testing frameworks like **Vitest** and **Jest**.

## Installation

```sh
npm install -D ts-mockgen
```

It's a test-time tool — install it as a dev dependency. It needs a reachable `tsconfig.json` (it walks up from `process.cwd()` to find one) describing the project whose types you want to mock.

## Example

Suppose you have the type:
```ts
type UserProfile = {
  id: number;
  name: string;
  address: {
    city: string;
    zip: string;
  };
  preferences: {
    theme: string;
    notifications: boolean;
  };
  createdAt: Date;
};
```

With the following function to test
```ts
function updateTheme(user: UserProfile, newTheme: string): UserProfile {
  return {
    ...user
    preferences: { theme: newTheme};
  }
}
```

You can use `generateMock` like this
```ts
import { generateMock } from 'ts-mockgen';

it('should update the user theme', () => {
  const mockUser: UserProfile = generateMock("UserProfile", {
    preferences: { theme: "light" },
  });
  
  const updatedMockUser = updateTheme(mockUser, 'dark');
  
  expect(updatedMockUser.preferences.theme).toBe('dark');
});
```

## Supported types

`generateMock` walks the shape of the named type and fills in a reasonable default per field:

| Type                               | Mock value                                    |
| ----------------------------------- | ---------------------------------------------- |
| `string`                            | `"example"`                                    |
| `number`                            | `42`                                            |
| `boolean`                           | `true`                                          |
| `Date`                              | `new Date()`                                    |
| nested object / interface           | recursively mocked object                       |
| literal union (`'A' \| 'B'`)        | first member (e.g. `'A'`)                       |
| `enum`                              | first member's value                            |
| optional / nullable (`T \| undefined \| null`) | mocked as `T` — the `undefined`/`null` branch is dropped |
| `T[]` / tuple (`[A, B]`)            | array/tuple with each element mocked            |
| `Map<K, V>` / `Set<T>`              | empty `Map`/`Set` instance                      |
| `Record<K, V>` / index signature    | `{}`                                            |
| function (`() => void`)             | a callable no-op                                |
| self-referential / circular type    | bottoms out instead of recursing forever        |
