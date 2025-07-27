# ts-mockgen

`ts-mockgen` is a TypeScript utility that lets you create partial mock objects of complex types for unit testing. 
It helps keep tests independent and focused by letting you specify only the fields that are relevant to a test case, while safely filling in the rest. 
It easily integrates with testing frameworks like **Vitest** and **Jest**.

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
function updateTheme(user: UserProfile, newTheme: string): void {
  user.preferences.theme = newTheme;
}
```

You can use `generateMock` like this
```ts
import { generateMock } from 'ts-mockgen';

it('should update the user theme', () => {
  const mockUser: UserProfile = generateMock("UserProfile", {
    preferences: { theme: "light" },
  });
  
  updateTheme(mockUser, 'dark');
  
  expect(mockUser.preferences.theme).toBe('dark');
});
```
